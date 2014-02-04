/*
  Client which passes socks requests over WebRTC datachannels.
  TODO: Cleanups and typescripting.
*/
/// <reference path='socks.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
declare var freedom:any;
console.log('SOCKS To RTC: ' + self.location.href);


// TODO: Change into SocksToRTC and RTCtoNet module way of doing things.
module SocksToRTC {

  var FCore = freedom.core();

  // TODO: Actually implement this. Without this, you cannot stop & restart.
  function onClose(label, connection) {
    console.warn('onClose not implemented.');
    return false;
  }

  /**
   * SocksToRTC.Peer
   *
   * Acts as a local SOCKS server which passes requests remotely through
   * WebRTC peer connections.
   */
  export class Peer {

    socksServer:Socks.Server = null;  // Local SOCKS server.
    signallingChannel:any = null;     // NAT piercing route.
    sctpPc:any = null;                // SCTP Peer Connection for actual data.

    // Active TCP connections by sctp channel id.
    tcpConns:{[label:number]:TCP.Connection;} = {};
    messageQueue_:any[] = [];
    peerId:string = null;

    constructor() {}

    /** Start the Peer. */
    public start = (options) => {
      console.log('Client: on(start)... ' + JSON.stringify(options));
      // Bind peerID to scope so promise can work.
      var peerId = options.peerId;
      if (!peerId) {
        console.error('SocksToRTC.Peer: No Peer ID provided! Cannot connect.');
        return false;
      }
      this.shutdown();  // Reset everything.
      this.peerId = peerId;

      // Create SOCKS server and start listening.
      this.socksServer = new Socks.Server(
          options.host, options.port,
          this.onConnection_);
      this.socksServer.listen();

      // Create sctp connection to a peer.
      this.sctpPc = this.createSCTPPeerConnection_();

      // Create a freedom-channel to act as the signaling channel.
      FCore.createChannel().done((cinfo) => {
        // chan.identifier is freedom, used for the signalling channel.
        console.log('Preparing SCTP peer connection. peerId: ' + peerId);
        this.sctpPc.setup(cinfo.identifier, 'client-to-' + peerId, true);

        // Signalling channel is immediately ready. (freedom > 0.2.0)
        // var sC = cinfo.channel;
        this.signallingChannel = cinfo.channel; //= sC;

        // Pass signalling channel messages to peer via 'fromClient' handlers.
        this.signallingChannel.on('message', (msg) => {
          console.log('SocksToRTC.Peer[' + this.peerId + '] sig channel message: ' + msg);
          freedom.emit('sendSignalToPeer', {
              peerId: this.peerId,
              data: msg
          });
        });
        // When the signalling channel is ready, set the global variable.
        // sC.on('ready', () => {
        console.log('Client channel to sctpPc ready.');
        // while (0 < this.messageQueue_.length) {
          // sC.emit('message', this.messageQueue_.shift());
        // }
        // });
      });  // FCore.createChannel
    }

    /** Stop SOCKS server and close data channels and peer connections. */
    public shutdown = () => {
      console.log('Shutting down SocksToRTC.Peer...');
      if (this.socksServer) {
        this.socksServer.disconnect();  // Disconnects internal TCP server.
        this.socksServer = null;
      }
      for (var channelLabel in this.tcpConns) {
        onClose(channelLabel, this.tcpConns[channelLabel]);
      }
      this.tcpConns = {};
      if(this.sctpPc) {
        this.sctpPc.close();
        this.sctpPc = null;
      }
      this.signallingChannel = null;
      this.peerId = null;
    }

    // Callback to be fired once receiving a SOCKS5 connection.
    // Setup the data channel and pass the corresponding tcp-connection to the data channel.
    private onConnection_ = (conn:Socks.Session, address, port, connectedCallback) => {
      if (!this.sctpPc) {
        console.error('SocksToRTC.Peer: onConnection called without SCTP peer connection.');
        return;
      }
      var channelLabel = obtainChannelLabel();
      this.tcpConns[channelLabel] = conn.tcpConnection;

      // When the TCP-connection receives data, send to sctp peer.
      // When it disconnects, clear the |channelLabel|.
      conn.tcpConnection.on('recv', (buf) => {
        this.sendToPeer_(channelLabel, buf);
      });
      conn.tcpConnection.on('disconnect', () => {
        this.closeConnection_(channelLabel);
      });

      this.sctpPc.send({
          'channelLabel': channelLabel,
          'text': JSON.stringify({ host: address, port: port })
      });

      // TODO: we are not connected yet... should we have some message passing
      // back from the other end of the data channel to tell us when it has
      // happened, instead of just pretended?
      // TODO: determine if these need to be accurate.
      connectedCallback({ ipAddrString: '127.0.0.1', port: 0 });
    }

    // Close a particular tcp-connection and data channel pair.
    private closeConnection_ = (channelLabel) => {
      if (this.tcpConns[channelLabel]) {
        this.tcpConns[channelLabel].disconnect();
        delete this.tcpConns[channelLabel];
      }
      if (this.sctpPc) {
        // Further closeConnection_ calls may occur after shutdown (from TCP
        // disconnections).
        this.sctpPc.closeDataChannel(channelLabel);
      }
    }

    private createSCTPPeerConnection_ = () => {
      // Create an instance of freedom's data peer.
      var pc = freedom['core.peerconnection']();
      pc.on('onReceived', (msg) => {
        if (msg.channelLabel) {
          var tcpConnection = this.tcpConns[msg.channelLabel];
          if (msg.buffer) {
            tcpConnection.sendRaw(msg.buffer);
          } else if (msg.text) {
            // TODO: we should use text as a signalling/control channel, e.g. to
            // give back the actaul address that was connected to as per socks
            // official spec.
            tcpConnection.sendRaw(msg.text);
          } else {
            console.error('Message type isn\'t specified properly. Msg: ' +
                JSON.stringify(msg));
          }
        } else {
          console.error('Message received but missing channelLabel. Msg: ' +
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
      // console.log('client handleSignalFromPeer: ' + JSON.stringify(msg) +
                  // ' with state ' + this.toString());
      console.log(this);
      console.log('SOCKStoRTC.Peer[' + this.peerId + ']: handleSignalFromPeer ' + msg);
                  // ' peerId: ' + this.peerId');
      if (!this.signallingChannel) {
        console.error('SOCKStoRTC.Peer[' + this.peerId + ']: signal sent before channel ready.');
      }
      this.signallingChannel.emit('message', msg.data);
      // } else {
        // this.messageQueue_.push(msg.data);
      // }
    }

    public toString = () => {
      var ret ='<SocksToRTC.Peer: failed toString()>';
      try {
        ret = JSON.stringify({ socksServer: this.socksServer,
                               sctpPc: this.sctpPc,
                               peerId: this.peerId,
                               signallingChannel: this.signallingChannel,
                               tcpConns: this.tcpConns});
      } catch (e) {}
      return ret;
    }

  }  // SocksToRTC.Proxy


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
