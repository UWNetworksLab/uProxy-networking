/*
  SocksToRTC.Peer passes socks requests over WebRTC datachannels.
  TODO: Cleanups and typescripting.
*/
/// <reference path='socks.ts' />
/// <reference path='../interfaces/peerconnection.d.ts' />
/// <reference path='../interfaces/communications.d.ts' />

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
    private messageQueue_:string[] = [];  // Remove with freedom 0.2.0
    private peerId:string = null;         // Of the remote rtc-to-net peer.

    /**
     * Start the Peer, based on the remote peer's info.
     */
    public start = (remotePeer:PeerInfo) => {
      console.log('Client: on(start)... ' + JSON.stringify(remotePeer));
      // Bind peerID to scope so promise can work.
      var peerId = remotePeer.peerId;
      if (!peerId) {
        console.error('SocksToRTC.Peer: No Peer ID provided! Cannot connect.');
        return false;
      }
      this.reset();  // Reset everything.
      this.peerId = peerId;

      // Create SOCKS server and start listening.
      this.socksServer = new Socks.Server(remotePeer.host, remotePeer.port,
                                          this.onConnection_);
      this.socksServer.listen();

      // Create sctp connection to a peer.
      this.sctpPc = this.createSCTPPeerConnection_();

      // Create a freedom-channel to act as the signaling channel.
      fCore.createChannel().done((chan) => {
        console.log('Preparing SCTP peer connection. peerId: ' + peerId +
            ' chan id: ' + chan.identifier);
        var stunServers = [];  // TODO: actually pass stun servers in
        this.sctpPc.setup(chan.identifier, 'SocksToRtc-' + peerId, stunServers);
        this.signallingChannel = chan.channel;
        console.log('Client channel to sctpPc created');
        // Pass messages received via signalling channel to the local
        // client, which needs to take care of sending the data through
        // alternate means.
        this.signallingChannel.on('message', function(msg) {
          freedom.emit('sendSignalToPeer', {
              peerId: peerId,
              data: msg
          });
        });
        console.log('Client channel to sctpPc ready.');
      });  // fCore.createChannel
    }

    /**
     * Stop SOCKS server and close data channels and peer connections.
     */
    public reset = () => {
      console.log('Resetting SocksToRTC.Peer...');
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
     * Setup new data channel and tie to corresponding SOCKS5 session.
     * Returns: IP and port of destination.
     */
    private onConnection_ = (session:Socks.Session, address, port)
        :Promise<Channel.EndpointInfo> => {
      if (!this.sctpPc) {
        console.error('[SocksToRtc] onConnection called without ' +
                      'SCTP peer connection.');
        return;
      }

      var channelLabel = obtainChannelLabel();
      return this.createDataChannel_(channelLabel)
          .then(() => {
            console.log('[SocksToRtc] created datachannel ' + channelLabel);
            this.tieSessionToChannel_(session, channelLabel);
          })
          // Send initial request header over the data channel.
          .then(() => {
            var newRequest = {
                channelLabel: channelLabel,
                'text': JSON.stringify({ host: address, port: port })
            };
            this.sctpPc.send(newRequest);
            console.log('[SocksToRtc] new request -----> ' + channelLabel +
                        ' \n ' + JSON.stringify(newRequest));
      // TODO: we are not connected yet... should we have some message passing
      // back from the other end of the data channel to tell us when it has
      // happened, instead of just pretended?
      // Allow SOCKs headers
          })
          .then(() => {
            // TODO: determine if these need to be accurate.
            return { ipAddrString: '127.0.0.1', port: 0 };
          });
    }

    private createDataChannel_ = (label:string):Promise<void> => {
      return new Promise<void>((F, R) => {
        this.sctpPc.openDataChannel(label).done(F).fail(R);
      });
    }

    /**
     * Create one-to-one relationship between a SOCKS session and
     * peer-connection data channel.
     */
    private tieSessionToChannel_ = (session:Socks.Session, label:string) => {
      this.socksSessions[label] = session;
      // When the TCP-connection receives data, send to sctp peer.
      // When it disconnects, clear the |channelLabel|.
      session.onRecv((buf) => { this.sendToPeer_(label, buf); });
      session.onceDisconnected()
          .then(() => { this.closeConnection_(label); });

    }

    /**
     * Close a particular tcp-connection and data channel pair.
     */
    private closeConnection_ = (channelLabel:string) => {
      console.log('CLOSE CHANNEL ' + channelLabel);
      if (!(channelLabel in this.socksSessions)) {
        throw Error('Unexpected missing SOCKs session to close for ' +
                    channelLabel);
      }
      this.sctpPc.closeDataChannel(channelLabel);
      console.log('socks-to-rtc: CLOSE DATA CHANNEL ' + channelLabel);
      this.socksServer.endSession(this.socksSessions[channelLabel]);
      delete this.socksSessions[channelLabel];
      // Further closeConnection_ calls may occur after reset (from TCP
      // disconnections).
    }

    /**
     * Prepare and attach handlers to a PeerConnection.
     */
    private createSCTPPeerConnection_ = ():PeerConnection => {
      var pc:PeerConnection = freedom['core.peerconnection']();

      // Handler for receiving data back from the remote RtcToNet.Peer.
      pc.on('onReceived', (msg:Channel.Message) => {
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
          // TODO: send socket close when the remote closes.
        } else {
          console.error('Message type isn\'t specified properly. Msg: ' +
              JSON.stringify(msg));
        }
      });
      // When WebRTC data-channel transport is closed, shut everything down.
      // pc.on('onCloseDataChannel', this.closeConnection_);
      pc.on('onCloseDataChannel', this.closeConnection_);
      // pc.onCloseDataChannel(this.closeConnection_);
      console.log('created sctp peer connection.');
      return pc;
    }

    /**
     * Send data over SCTP to peer, via data channel |channelLabel|.
     *
     * Side note: When PeerConnection encounters a 'new' |channelLabel|, it
     * implicitly creates a new data channel.
     */
    private sendToPeer_ = (channelLabel:string, buffer:ArrayBuffer) => {
      if (!this.sctpPc) {
        console.warn('SocksToRtc.Peer: SCTP peer connection not ready!');
        return;
      }
      var payload = { channelLabel: channelLabel, 'buffer': buffer };
      console.log('[SocksToRtc] send ' + buffer.byteLength + ' bytes ' +
                  '-----> ' + channelLabel + ' \n ' + JSON.stringify(payload));
      this.sctpPc.send(payload);
    }

    /**
     * Pass any messages coming from remote peer through the signalling channel
     * handled by freedom, which goes to the signalling channel input of the
     * peer connection.
     * msg : {peerId : string, data : json-string}
     */
    public handlePeerSignal = (msg:PeerSignal) => {
      // console.log('client handleSignalFromPeer: ' + JSON.stringify(msg) +
                  // ' with state ' + this.toString());
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
  freedom.on('stop', peer.reset);
  console.log('SOCKs to RTC peer created.');
  freedom.emit('ready', {});
}


initClient();
