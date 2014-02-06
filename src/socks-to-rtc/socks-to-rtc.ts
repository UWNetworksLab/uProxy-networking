/*
  SocksToRTC.Peer passes socks requests over WebRTC datachannels.
  TODO: Cleanups and typescripting.
*/
/// <reference path='socks.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
declare var freedom:any;
console.log('SOCKS5 client: ' + self.location.href);


// TODO: Change into SocksToRTC and RTCtoNet module way of doing things.
module SocksToRTC {

  var FCore = freedom.core();

  /**
   * SocksToRTC.Peer
   *
   * Acts as a local SOCKS server which passes requests remotely through
   * WebRTC peer connections.
   */
  export class Peer {

    private socksServer:Socks.Server = null;  // Local SOCKS server.
    private signallingChannel:any = null;     // NAT piercing route.
    private sctpPc:any = null;                // SCTP Peer Connection for actual data.

    // Active TCP connections by sctp channel id.
    // private tcpConns:{[label:number]:TCP.Connection} = {};
    private sessions:{[label:number]:Socks.Session} = {};
    private messageQueue_:any[] = [];
    private peerId:string = null;

    /** Start the Peer. */
    public start = (options) => {
      console.log('Client: on(start)... ' + JSON.stringify(options));
      // Bind peerID to scope so promise can work.
      var peerId = this.peerId = options.peerId;
      if (!peerId) {
        console.error('SocksToRTC.Peer: No Peer ID provided! Cannot connect.');
        return false;
      }
      this.shutdown();  // Reset everything.

      // Create SOCKS server and start listening.
      this.socksServer = new Socks.Server(
          options.host, options.port,
          this.onConnection_);
      this.socksServer.listen();

      // Create sctp connection to a peer.
      this.sctpPc = this.createSCTPPeerConnection_();

      // Create a freedom-channel to act as the signaling channel.
      FCore.createChannel().done((chan) => {
        // chan.identifier is a freedom-socksServer (not a socks socksServer) for the
        // signalling channel used for signalling.
        console.log('Preparing SCTP peer connection. peerId: ' + peerId);
        this.sctpPc.setup(chan.identifier, 'client-to-' + peerId, true);
        // when the channel is complete, setup handlers.
        chan.channel.done((signallingChannel) => {
          console.log('Client channel to sctpPc created');
          // when the signalling channel gets a message, send that message to the
          // freedom 'fromClient' handlers.
          signallingChannel.on('message', function(msg) {
            freedom.emit('sendSignalToPeer', {
                peerId: peerId,
                data: msg
            });
          });

          // When the signalling channel is ready, set the global variable.
          signallingChannel.on('ready', () => {
            this.signallingChannel = signallingChannel;
            console.log('Client channel to sctpPc ready.');
            while(0 < this.messageQueue_.length) {
              signallingChannel.emit('message', this.messageQueue_.shift());
            }
          });  // signallingCHannel.on('ready')
        });  // chan.channel
      });  // FCore.createChannel
    }

    /** Stop SOCKS server and close data channels and peer connections. */
    public shutdown = () => {
      console.log('Shutting down SocksToRTC.Peer...');
      if (this.socksServer) {
        this.socksServer.disconnect();  // Disconnects internal TCP server.
        this.socksServer = null;
      }
      for (var channelLabel in this.sessions) {
        this.closeConnection_(channelLabel);
      }
      this.sessions = {};
      if(this.sctpPc) {
        this.sctpPc.close();
        this.sctpPc = null;
      }
      if (this.signallingChannel) {  // TODO: is this actually right?
        this.signallingChannel.emit('close');
      }
      this.signallingChannel = null;
      this.peerId = null;
    }

    // Setup data channel and tie to corresponding SOCKS5 session.
    private onConnection_ = (session:Socks.Session, address, port,
                             connectedCallback) => {
      if (!this.sctpPc) {
        console.error('SocksToRTC.Peer: onConnection called without SCTP peer connection.');
        return;
      }
      var channelLabel = obtainChannelLabel();
      this.sessions[channelLabel] = session;
      // When the TCP-connection receives data, send to sctp peer.
      // When it disconnects, clear the |channelLabel|.
      session.onRecv((buf) => { this.sendToPeer_(channelLabel, buf); });
      session.onDisconnect(() => { this.closeConnection_(channelLabel); });
      this.sctpPc.send({
          'channelLabel': channelLabel,
          'text': JSON.stringify({ host: address, port: port })
      });

      // TODO: we are not connected yet... should we have some message passing
      // back from the other end of the data channel to tell us when it has
      // happened, instead of just pretended?

      // Allow SOCKs headers
      // TODO: determine if these need to be accurate.
      connectedCallback({ ipAddrString: '127.0.0.1', port: 0 });
    }

    // Close a particular tcp-connection and data channel pair.
    private closeConnection_ = (channelLabel:string) => {
      if (this.sessions[channelLabel]) {
        this.sessions[channelLabel].disconnect();
        delete this.sessions[channelLabel];
      }
      if (this.sctpPc) {
        // Further closeConnection_ calls may occur after shutdown (from TCP
        // disconnections).
        this.sctpPc.closeDataChannel(channelLabel);
      }
    }

    private createSCTPPeerConnection_ = () => {
      // Create an instance of freedom's data peer.
      var pc = freedom['core.sctp-peerconnection']();

      // Handler for receiving data back from the remote RtcToNet.Peer.
      pc.on('onReceived', (msg) => {
        if (!msg.channelLabel) {
          console.error('Message received but missing channelLabel. Msg: ' +
              JSON.stringify(msg));
          return;
        }
        var session = this.sessions[msg.channelLabel];
        if (msg.buffer) {
          session.sendData(msg.buffer);  // Back across underlying TCP socket.
        } else if (msg.text) {
          // TODO: we should use text as a signalling/control channel, e.g. to
          // give back the actual address that was connected to as per socks
          // official spec.
          session.sendData(msg.text);
        } else {
          console.error('Message type isn\'t specified properly. Msg: ' +
              JSON.stringify(msg));
        }
      });
      // When WebRTC data-channel transport is closed, shut everything down.
      pc.on('onCloseDataChannel', this.closeConnection_);
      return pc;
    }

    // A simple wrapper function to send data to the peer.
    private sendToPeer_ = (channelLabel, buffer) => {
      // console.log('sendToPeer_ (buffer) to channelLabel: ' + channelLabel);
      this.sctpPc.send({ 'channelLabel': channelLabel, 'buffer': buffer });
    }

    // Pass any messages coming from remote peer through the signalling channel
    // handled by freedom, which goes to the signalling channel input of the
    // peer connection.
    // msg : {peerId : string, data : json-string}
    public handlePeerSignal = (msg) => {
      console.log('client handleSignalFromPeer: ' + JSON.stringify(msg) +
                  ' with state ' + this.toString());
      if (this.signallingChannel) {
        this.signallingChannel.emit('message', msg.data);
      } else {
        this.messageQueue_.push(msg.data);
      }
    }

    public toString = () => {
      var ret ='<SocksToRTC.Peer: failed toString()>';
      try {
        ret = JSON.stringify({ socksServer: this.socksServer,
                               sctpPc: this.sctpPc,
                               peerId: this.peerId,
                               signallingChannel: this.signallingChannel,
                               sessions: this.sessions });
      } catch (e) {}
      return ret;
    }

  }  // SocksToRTC.Peer


  // TODO: reuse channelLabels from a pool.
  function obtainChannelLabel() {
    return 'c' + Math.random();
  }


}  // module SocksToRTC


function initClient() {

  // Create local peer and attach freedom message handlers, then emit |ready|.
  var peer = new SocksToRTC.Peer();
  freedom.on('handleSignalFromPeer', peer.handlePeerSignal);
  freedom.on('start', peer.start);
  freedom.on('stop', peer.shutdown);
  console.log('SOCKs to RTC peer created.');
  freedom.emit('ready', {});
}


initClient();
