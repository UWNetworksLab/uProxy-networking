/*
  SocksToRTC.Peer passes socks requests over WebRTC datachannels.
*/
/// <reference path='socks.ts' />
/// <reference path='../interfaces/peerconnection.d.ts' />
/// <reference path='../interfaces/communications.d.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
declare var freedom:any;
console.log('WEBWORKER SocksToRtc: ' + self.location.href);

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
    private peerId:string = null;         // Of the remote rtc-to-net peer.

    /**
     * Start the Peer, based on the remote peer's info.
     */
    public start = (remotePeer:PeerInfo) => {
      this.reset();  // Begin with fresh components.
      dbg('starting - target peer: ' + JSON.stringify(remotePeer));
      // Bind peerID to scope so promise can work.
      var peerId = this.peerId = remotePeer.peerId;
      if (!peerId) {
        dbgErr('no Peer ID provided! cannot connect.');
        return false;
      }
      // SOCKS sessions biject to peerconnection datachannels.
      this.sctpPc = freedom['core.peerconnection']();
      this.sctpPc.on('onReceived', this.replyToSOCKS_);
      this.sctpPc.on('onCloseDataChannel', this.closeConnection_);
      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP)
      fCore.createChannel().done((chan) => {
        var stunServers = [];  // TODO: actually pass stun servers.
        this.sctpPc.setup(chan.identifier, 'SocksToRtc-' + peerId, stunServers);
        this.signallingChannel = chan.channel;
        this.signallingChannel.on('message', function(msg) {
          freedom.emit('sendSignalToPeer', {
              peerId: peerId,
              data: msg
          });
        });
        dbg('signalling channel to SCTP peer connection ready.');
      });  // fCore.createChannel

      // Create SOCKS server and start listening.
      this.socksServer = new Socks.Server(remotePeer.host, remotePeer.port,
                                          this.onConnection_);
      this.socksServer.listen();
    }

    /**
     * Stop SOCKS server and close data channels and peer connections.
     */
    public reset = () => {
      dbg('resetting peer...');
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
        dbgErr('onConnection called without SCTP peer connection.');
        return;
      }

      var channelLabel = obtainChannelLabel();
      return this.createDataChannel_(channelLabel)
          .then(() => {
            dbg('created datachannel ' + channelLabel);
            this.tieSessionToChannel_(session, channelLabel);
          })
          // Send initial request header to remote peer over the data channel.
          .then(() => {
            var newRequest = {
                channelLabel: channelLabel,
                'text': JSON.stringify({ host: address, port: port })
            };
            this.sctpPc.send(newRequest);
            dbg('new request -----> ' + channelLabel +
                ' \n' + JSON.stringify(newRequest));
      // TODO: we are not connected yet... should we have some message passing
      // back from the other end of the data channel to tell us when it has
      // happened, instead of just pretended?
      // TODO: Allow SOCKs headers
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
     * Receive replies proxied back from the remote RtcToNet.Peer and pass them
     * back across underlying SOCKS session / TCP socket.
     */
    private replyToSOCKS_ = (msg:Channel.Message) => {
      var label = msg.channelLabel;
      if (!label) {
        dbgErr('received message without channelLabel! msg: ' +
            JSON.stringify(msg));
        return;
      }
      if (!(label in this.socksSessions)) {
        dbgErr(label + ' not associated with SOCKS session!');
        return;
      }
      var session = this.socksSessions[label];
      if (msg.buffer) {
        dbg(msg.channelLabel + ' <--- received ' + msg.buffer.byteLength);
        session.sendData(msg.buffer);
      } else if (msg.text) {
        // TODO: we should use text as a signalling/control channel, e.g. to
        // give back the actual address that was connected to as per socks
        // official spec.
        dbg(msg.channelLabel + ' <--- received TEXT: ' + msg.text);
        session.sendData(msg.text);
        // TODO: send socket close when the remote closes. Right now *something*
        // isn't being closed/cleaned up properly.
      } else {
        dbgErr('message type isn\'t specified properly. Msg: ' +
            JSON.stringify(msg));
      }
    }

    /**
     * Close a particular tcp-connection and data channel pair.
     */
    private closeConnection_ = (channelLabel:string) => {
      if (!(channelLabel in this.socksSessions)) {
        throw Error('Unexpected missing SOCKs session to close for ' +
                    channelLabel);
      }
      this.sctpPc.closeDataChannel(channelLabel);
      dbg('closed data channel ' + channelLabel);
      this.socksServer.endSession(this.socksSessions[channelLabel]);
      delete this.socksSessions[channelLabel];
      // Further closeConnection_ calls may occur after reset (from TCP
      // disconnections).
    }

    /**
     * Send data over SCTP to peer, via data channel |channelLabel|.
     *
     * Side note: When PeerConnection encounters a 'new' |channelLabel|, it
     * implicitly creates a new data channel.
     */
    private sendToPeer_ = (channelLabel:string, buffer:ArrayBuffer) => {
      if (!this.sctpPc) {
        dbgWarn('SCTP peer connection not ready.');
        return;
      }
      var payload = { channelLabel: channelLabel, 'buffer': buffer };
      dbg('send ' + buffer.byteLength + ' bytes ' +
          '-----> ' + channelLabel + ' \n ' + JSON.stringify(payload));
      this.sctpPc.send(payload);
    }

    /**
     * Pass any messages coming from remote peer through the signalling channel
     * handled by freedom, which goes to the signalling channel input of the
     * peer connection.
     */
    public handlePeerSignal = (msg:PeerSignal) => {
      // dbg('client handleSignalFromPeer: ' + JSON.stringify(msg) +
                  // ' with state ' + this.toString());
      if (!this.signallingChannel) {
        dbgErr('signalling channel missing!');
        return;
      }
      this.signallingChannel.emit('message', msg.data);
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

  var modulePrefix_ = '[SocksToRtc] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module SocksToRTC


function initClient() {

  // Create local peer and attach freedom message handlers, then emit |ready|.
  var peer = new SocksToRTC.Peer();
  freedom.on('handleSignalFromPeer', peer.handlePeerSignal);
  freedom.on('start', peer.start);
  freedom.on('stop', peer.reset);
  freedom.emit('ready', {});
}


initClient();
