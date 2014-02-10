/*
  SocksToRTC.Peer passes socks requests over WebRTC datachannels.
  TODO: Cleanups and typescripting.
*/
/// <reference path='socks.ts' />
/// <reference path='../interfaces/peerconnection.d.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
declare var freedom:any;
console.log('SOCKS5 client: ' + self.location.href);


// TODO: Change into SocksToRTC and RTCtoNet module way of doing things.
module SocksToRTC {

  var fCore = freedom.core();

  /**
   * SocksToRTC.Peer
   *
   * Contains a local SOCKS server which passes requests remotely through
   * WebRTC peer connections.
   */
  export class Peer {

    private socksServer:Socks.Server = null;  // Local SOCKS server.
    private signallingChannel:any = null;     // NAT piercing route.
    private sctpPc:PeerConnection = null;     // For actual proxying.

    // Active SOCKS sessions by corresponding SCTP channel id.
    private socksSessions:{[label:number]:Socks.Session} = {};
    private messageQueue_:any[] = [];
    private peerId:string = null;

    /**
     * Start the Peer.
     */
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
      this.socksServer = new Socks.Server(options.host, options.port,
                                          this.onConnection_);
      this.socksServer.listen();

      // Create sctp connection to a peer.
      this.sctpPc = this.createSCTPPeerConnection_();

      // Create a freedom-channel to act as the signaling channel.
      fCore.createChannel().done((chan) => {
        console.log('Preparing SCTP peer connection. peerId: ' + peerId);
        this.sctpPc.setup(chan.identifier, 'client-to-' + peerId, true);
        // when the channel is complete, setup handlers.
        chan.channel.done((signallingChannel) => {
          console.log('Client channel to sctpPc created');
          // Pass messages received via signalling channel to the local
          // local client, which needs to take care of sending the data through
          // alternate means.
          signallingChannel.on('message', function(msg) {
            freedom.emit('sendSignalToPeer', {
                peerId: peerId,
                data: msg
            });
          });

          // TODO: remove once we're using freedom 0.2.0, where signalling
          // channels will automatically be ready.
          signallingChannel.on('ready', () => {
            this.signallingChannel = signallingChannel;
            console.log('Client channel to sctpPc ready.');
            while(0 < this.messageQueue_.length) {
              signallingChannel.emit('message', this.messageQueue_.shift());
            }
          });
        });  // chan.channel
      });  // fCore.createChannel
    }

    /**
     * Stop SOCKS server and close data channels and peer connections.
     */
    public shutdown = () => {
      console.log('Shutting down SocksToRTC.Peer...');
      if (this.socksServer) {
        this.socksServer.disconnect();  // Disconnects internal TCP server.
        this.socksServer = null;
      }
      for (var channelLabel in this.socksSessions) {
        this.closeConnection_(channelLabel);
      }
      this.socksSessions = {};
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

    /**
     * Setup data channel and tie to corresponding SOCKS5 session.
     * Returns: IP and port of destination.
     */
    private onConnection_ = (session:Socks.Session, address, port) => {
      if (!this.sctpPc) {
        console.error('SocksToRTC.Peer: onConnection called without ' +
                      'SCTP peer connection.');
        return;
      }
      var channelLabel = obtainChannelLabel();
      this.socksSessions[channelLabel] = session;
      // When the TCP-connection receives data, send to sctp peer.
      // When it disconnects, clear the |channelLabel|.
      session.onRecv((buf) => { this.sendToPeer_(channelLabel, buf); });
      session.oncenDisconnected()
          .then(() => {
            this.closeConnection_(channelLabel);
          });

      this.sctpPc.send({
          'channelLabel': channelLabel,
          'text': JSON.stringify({ host: address, port: port })
      });

      // TODO: we are not connected yet... should we have some message passing
      // back from the other end of the data channel to tell us when it has
      // happened, instead of just pretended?
      // Allow SOCKs headers
      // TODO: determine if these need to be accurate.
      return { ipAddrString: '127.0.0.1', port: 0 };
    }

    /**
     * Close a particular tcp-connection and data channel pair.
     */
    private closeConnection_ = (channelLabel:string) => {
      console.log('CLOSE CHANNEL ' + channelLabel);
      if (this.socksSessions[channelLabel]) {
        this.socksServer.endSession(this.socksSessions[channelLabel]);
        delete this.socksSessions[channelLabel];
      }
      if (this.sctpPc) {
        // Further closeConnection_ calls may occur after shutdown (from TCP
        // disconnections).
        this.sctpPc.closeDataChannel(channelLabel);
      }
    }

    /**
     * Prepare and attach handlers to a PeerConnection.
     */
    private createSCTPPeerConnection_ = ():PeerConnection => {
      // Create an instance of freedom's data peer.
      var pc:PeerConnection = freedom['core.sctp-peerconnection']();

      // Handler for receiving data back from the remote RtcToNet.Peer.
      pc.on('onReceived', (msg) => {
        if (!msg.channelLabel) {
          console.error('Message received but missing channelLabel. Msg: ' +
              JSON.stringify(msg));
          return;
        }
        var session = this.socksSessions[msg.channelLabel];
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

    /**
     * Send data over SCTP to peer, via data channel |channelLabel|.
     *
     * Side note: When PeerConnection encounters a 'new' |channelLabel|, it
     * implicitly creates a new data channel.
     */
    private sendToPeer_ = (channelLabel:string, buffer) => {
      if (!this.sctpPc) {
        console.warn('SocksToRtc.Peer: SCTP peer connection not ready!');
        return;
      }
      this.sctpPc.send({ 'channelLabel': channelLabel, 'buffer': buffer });
    }

    /**
     * Pass any messages coming from remote peer through the signalling channel
     * handled by freedom, which goes to the signalling channel input of the
     * peer connection.
     * msg : {peerId : string, data : json-string}
     */
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
                               socksSessions: this.socksSessions });
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
