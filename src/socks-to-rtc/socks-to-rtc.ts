/*
  SocksToRTC.Peer passes socks requests over WebRTC datachannels.
*/
/// <reference path='socks.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/transport.d.ts' />
/// <reference path='../../node_modules/uproxy-build-tools/src/util/arraybuffers.d.ts' />
/// <reference path='../interfaces/communications.d.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
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

    private socksServer_:Socks.Server = null;  // Local SOCKS server.
    private signallingChannel_:any = null;     // NAT piercing route.
    private transport_:freedom.Transport = null;     // For actual proxying.

    /**
     * Currently open data channels, indexed by data channel tag name.
     */
    private channels_:{[tag:string]:Channel.EndpointInfo} = {};
    private peerId_:string = null;         // Of the remote rtc-to-net peer.

    // Private state kept for ping-pong (heartbeat and ack).
    private pingPongSendIntervalId_ :number = null;
    private pingPongCheckIntervalId_ :number = null;
    private lastPingPongReceiveDate_ :Date = null;

    // Connection callbacks, by datachannel tag name.
    // TODO: figure out a more elegant way to store these callbacks
    private static connectCallbacks:{[tag:string]:(response:Channel.NetConnectResponse) => void} = {};

    /**
     * Start the Peer, based on the remote peer's info.
     * This will emit a socksToRtcSuccess signal when the peer connection is esablished,
     * or a socksToRtcFailure signal if there is an error openeing the peer connection.
     * TODO: update this to return a promise that fulfills/rejects, after freedom v0.5
     * is ready.
     */
    public start = (remotePeer:PeerInfo) => {
      this.reset_();  // Begin with fresh components.
      dbg('starting - target peer: ' + JSON.stringify(remotePeer));
      // Bind peerID to scope so promise can work.
      var peerId = this.peerId_ = remotePeer.peerId;
      if (!peerId) {
        dbgErr('no Peer ID provided! cannot connect.');
        return false;
      }
      // SOCKS sessions biject to peerconnection datachannels.
      this.transport_ = freedom['transport']();
      this.transport_.on('onData', this.onDataFromPeer_);
      this.transport_.on('onClose', this.onCloseHandler_);
      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP)
      fCore.createChannel().then((chan) => {
        this.transport_.setup('SocksToRtc-' + peerId, chan.identifier).then(
          () => {
            dbg('SocksToRtc transport_.setup succeeded');
            freedom.emit('socksToRtcSuccess', remotePeer);
            this.startPingPong_();
          }
        ).catch(
          (e) => {
            dbgErr('SocksToRtc transport_.setup failed ' + e);
            freedom.emit('socksToRtcFailure', remotePeer);
          }
        );
        this.signallingChannel_ = chan.channel;
        this.signallingChannel_.on('message', function(msg) {
          freedom.emit('sendSignalToPeer', {
              peerId: peerId,
              data: msg
          });
        });
        dbg('signalling channel to SCTP peer connection ready.');
        // Send hello command to initiate communication, which will cause
        // the promise returned this.transport_.setup to fulfill.
        // TODO: remove hello command once freedom.transport.setup
        // is changed to automatically negotiate the connection.
        dbg('sending hello command.');
        var command :Channel.Command = {type: Channel.COMMANDS.HELLO};
        this.transport_.send('control', ArrayBuffers.stringToArrayBuffer(
            JSON.stringify(command)));
      });  // fCore.createChannel

      // Create SOCKS server and start listening.
      this.socksServer_ = new Socks.Server(remotePeer.host, remotePeer.port,
                                          this.createChannel_);
      this.socksServer_.listen();
    }

    public close = () => {
      if (this.transport_) {
        // Close transport, then onCloseHandler_ will take care of resetting
        // state.
        this.transport_.close();
      } else {
        // Transport already closed, just call reset.
        this.reset_();
      }
    }

    private onCloseHandler_ = () => {
      dbg('onCloseHandler_ invoked for transport.')
      // Set this.transport to null so reset_ doesn't attempt to close it again.
      this.transport_ = null;
      this.reset_();
    }

    /**
     * Stop SOCKS server and close data channels and peer connections.
     */
    private reset_ = () => {
      dbg('resetting peer...');
      this.stopPingPong_();
      if (this.socksServer_) {
        this.socksServer_.disconnect();  // Disconnects internal TCP server.
        this.socksServer_ = null;
      }
      for (var tag in this.channels_) {
        this.closeConnectionToPeer(tag);
      }
      this.channels_ = {};
      if (this.transport_) {
        this.transport_.close();
        this.transport_ = null;
      }
      if (this.signallingChannel_) {  // TODO: is this actually right?
        this.signallingChannel_.emit('close');
      }
      this.signallingChannel_ = null;
      this.peerId_ = null;
    }

    /**
     * Setup a new data channel.
     */
    private createChannel_ = (params:Channel.EndpointInfo) : Promise<Channel.EndpointInfo> => {
      if (!this.transport_) {
        dbgWarn('transport not ready');
        return;
      }

      // Generate a name for this connection and associate it with the SOCKS session.
      var tag = obtainTag();
      this.channels_[tag] = params;

      // This gets a little funky: ask the peer to establish a connection to
      // the remote host and register a callback for when it gets back to us
      // on the control channel.
      // TODO: how to add a timeout, in case the remote end never replies?
      return new Promise((F,R) => {
        Peer.connectCallbacks[tag] = (response:Channel.NetConnectResponse) => {
          if (response.address) {
            var endpointInfo:Channel.EndpointInfo = {
              protocol: params.protocol,
              address: response.address,
              port: response.port,
              send: (buf:ArrayBuffer) => { this.sendToPeer_(tag, buf); },
              terminate: () => { this.terminate_(tag); }
            };
            F(endpointInfo);
          } else {
            R(new Error('could not create datachannel'));
          }
        };
        var request:Channel.NetConnectRequest = {
          protocol: params.protocol,
          address: params.address,
          port: params.port
        };
        var command:Channel.Command = {
          type: Channel.COMMANDS.NET_CONNECT_REQUEST,
          tag: tag,
          data: JSON.stringify(request)
        };
        this.transport_.send('control', ArrayBuffers.stringToArrayBuffer(
            JSON.stringify(command)));
      });
    }

    /**
     * Signals to the remote side that it should forget about this datachannel
     * and discards our referece to the datachannel. Intended for use by the
     * SOCKS server when the SOCKS client disconnects.
     */
    private terminate_ = (tag:string) => {
      if (!(tag in this.channels_)) {
        dbgWarn('tried to terminate unknown datachannel ' + tag);
        return;
      }
      dbg('terminating datachannel ' + tag);
      var command:Channel.Command = {
          type: Channel.COMMANDS.SOCKS_DISCONNECTED,
          tag: tag
      };
      this.transport_.send('control', ArrayBuffers.stringToArrayBuffer(
          JSON.stringify(command)));
      delete this.channels_[tag];
    }

    /**
     * Receive replies proxied back from the remote RtcToNet.Peer and pass them
     * back across underlying SOCKS session / TCP socket.
     */
    private onDataFromPeer_ = (msg:freedom.Transport.IncomingMessage) => {
      dbg(msg.tag + ' <--- received ' + msg.data.byteLength);
      if (!msg.tag) {
        dbgErr('received message without datachannel tag!: ' + JSON.stringify(msg));
        return;
      }

      if (msg.tag == 'control') {
        var command:Channel.Command = JSON.parse(
            ArrayBuffers.arrayBufferToString(msg.data));

        if (command.type === Channel.COMMANDS.NET_CONNECT_RESPONSE) {
          // Call the associated callback and forget about it.
          // The callback should fulfill or reject the promise on
          // which the client is waiting, completing the connection flow.
          var response:Channel.NetConnectResponse = JSON.parse(command.data);
          if (command.tag in Peer.connectCallbacks) {
            var callback = Peer.connectCallbacks[command.tag];
            callback(response);
            Peer.connectCallbacks[command.tag] = undefined;
          } else {
            dbgWarn('received connect callback for unknown datachannel: ' +
                command.tag);
          }
        } else if (command.type === Channel.COMMANDS.NET_DISCONNECTED) {
          // Receiving a disconnect on the remote peer should close SOCKS.
          dbg(command.tag + ' <--- received NET-DISCONNECTED');
          this.closeConnectionToPeer(command.tag);
        } else if (command.type === Channel.COMMANDS.PONG) {
          this.lastPingPongReceiveDate_ = new Date(); 
        } else {
          dbgWarn('unsupported control command: ' + command.type);
        }
      } else {
        if (!(msg.tag in this.channels_)) {
          dbgErr('unknown datachannel ' + msg.tag);
          return;
        }
        var session = this.channels_[msg.tag];
        session.send(msg.data);
      }
    }

    /**
     * Calls the endpoint's terminate() method and discards our reference
     * to the channel. Intended for use when the remote side has been
     * disconnected.
     */
    private closeConnectionToPeer = (tag:string) => {
      if (!(tag in this.channels_)) {
        dbgWarn('unknown datachannel ' + tag + ' has closed');
        return;
      }
      dbg('datachannel ' + tag + ' has closed. ending SOCKS session for channel.');
      this.channels_[tag].terminate();
      delete this.channels_[tag];
    }

    /**
     * Send data over SCTP to peer, via data channel |tag|.
     *
     * Side note: When transport_ encounters a 'new' |tag|, it
     * implicitly creates a new data channel.
     */
    private sendToPeer_ = (tag:string, buffer:ArrayBuffer) => {
      if (!this.transport_) {
        dbgWarn('transport_ not ready');
        return;
      }
      dbg('send ' + buffer.byteLength + ' bytes on datachannel ' + tag);
      this.transport_.send(tag, buffer);
    }

    /**
     * Pass any messages coming from remote peer through the signalling channel
     * handled by freedom, which goes to the signalling channel input of the
     * peer connection.
     */
    public handlePeerSignal = (msg:PeerSignal) => {
      // dbg('client handleSignalFromPeer: ' + JSON.stringify(msg) +
                  // ' with state ' + this.toString());
      if (!this.signallingChannel_) {
        dbgErr('signalling channel missing!');
        return;
      }
      this.signallingChannel_.emit('message', msg.data);
    }

    public toString = () => {
      var ret ='<SocksToRTC.Peer: failed toString()>';
      try {
        ret = JSON.stringify({ socksServer: this.socksServer_,
                               transport: this.transport_,
                               peerId: this.peerId_,
                               signallingChannel: this.signallingChannel_,
                               channels: this.channels_ });
      } catch (e) {}
      return ret;
    }

    /**
     * Sets up ping-pong (heartbearts and acks) with socks-to-rtc client.
     * This is necessary to detect disconnects from the other peer, since
     * WebRtc does not yet notify us if the peer disconnects (to be fixed
     * Chrome version 37), at which point we should be able to remove this code.
     */
    private startPingPong_ = () => {
      this.pingPongSendIntervalId_ = setInterval(() => {
        var command :Channel.Command = {type: Channel.COMMANDS.PING};
        this.transport_.send('control', ArrayBuffers.stringToArrayBuffer(
            JSON.stringify(command)));
      }, 1000);

      var PING_PONG_CHECK_INTERVAL_MS :number = 10000;
      this.pingPongCheckIntervalId_ = setInterval(() => {
        var nowDate = new Date();
        if (!this.lastPingPongReceiveDate_ ||
            (nowDate.getTime() - this.lastPingPongReceiveDate_.getTime()) >
             PING_PONG_CHECK_INTERVAL_MS) {
          dbgWarn('no ping-pong detected, closing peer');
          this.close();
        }
      }, PING_PONG_CHECK_INTERVAL_MS);
    }

    private stopPingPong_ = () => {
      // Stop setInterval functions.
      if (this.pingPongSendIntervalId_ !== null) {
        clearInterval(this.pingPongSendIntervalId_);
        this.pingPongSendIntervalId_ = null;
      }
      if (this.pingPongCheckIntervalId_ !== null) {
        clearInterval(this.pingPongCheckIntervalId_);
        this.pingPongCheckIntervalId_ = null;
      }
      this.lastPingPongReceiveDate_ = null;
    }

  }  // SocksToRTC.Peer

  // TODO: reuse tag names from a pool.
  function obtainTag() {
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
  freedom.on('stop', peer.close);
  freedom.emit('ready', {});
}


initClient();
