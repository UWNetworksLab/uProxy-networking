/*
  SocksToRtc.Peer passes socks requests over WebRTC datachannels.
*/
/// <reference path='../freedom-typescript-api/interfaces/peer-connection.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />
/// <reference path='../handler/handler-queue.ts' />
/// <reference path='../interfaces/communications.d.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
console.log('WEBWORKER SocksToRtc: ' + self.location.href);

// Wraps all possible interactions with the parent Freedom module; the events
// that this module may need to handle, and the messages it is responsible for
// sending.
//
// Providing a typescript interface minimizes the use of string-literals,
// allows typechecking of those interactions, and provides a single place to
// swap out that functionality. This should match the file |freedom-
// module.d.ts|: on-handlers here will be emit functions there and visa versa.
declare module freedom {
  // Once the socks-rtc module is ready, it emits 'ready'.
  function emit(t:'ready') : void;

  // Start is expected to start a SOCKS5 proxy listening at the given endpoint.
  // It is expected to result in signalling messages being sent and received,
  // and eventually either the
  function on(t:'start', f:(endpoint:Net.Endpoint) => void) : void;

  // Signalling messages are used by WebRTC to send/receive data needed to setup
  // the P2P connection. e.g. public facing port and IP. It is assumed that
  // signalling messages go to the peer that is acting as the end-point of the
  // socks5 proxy server.
  function on(t:'handleSignalFromPeer', f:(signal:string) => void) : void;
  function emit(t:'sendSignalToPeer', s:string);

  // Once a connection to the peer has successfully been established, socks-to-
  // rtc emits a |socksToRtcSuccess| message.
  function emit(t:'socksToRtcSuccess');
  // If the connection to the peer failed, socks-to-rtc emits a
  // |socksToRtcFailure| message.
  function emit(t:'socksToRtcFailure');

  // socks-to-rtc is expected to send a |socksToRtcTimeout| if the connection to
  // the peer is lost for more than a given time , e.g. the peer's computer
  // lost connectivity.
  function emit(t:'socksToRtcTimeout');

  // TODO: add an emit for when the remote side closes down the peer-connection,
  // or rename |socksToRtcTimeout| to capture that case too.

  // When stop is called, it is expected that socks-to-rtc stops listening on
  // the endpoint given to start and that it closes to the peer.
  function on(t:'stop', f:() => void) : void;
}

//
interface SignallingChannel extends freedom.OnAndEmit {
  on(t:'', handler:Function) : void;
  emit(eventType:string, handler:Function) : void;
}

// This is what is avauilable to Freedom.
function initClient() {
  // Create local socks-to-rtc class instance and attach freedom message
  // handlers, then emit |ready|.  TODO: in freedom v0.5, we can/should use an
  // interface and drop this explicit module-to-class linking.
  var socksToRtc = new SocksToRtc.SocksToRtc(ParentModule);
  freedom.on('handleSignalFromPeer', socksToRtc.handlePeerSignal);
  freedom.on('start', socksToRtc.start);
  freedom.on('stop', socksToRtc.stop);
  freedom.emit('ready', {});
}

module SocksToRtc {

  var fCore = freedom.core();

  // The |SocksToRtc| class runs a SOCKS5 proxy server which passes requests
  // remotely through WebRTC peer connections.
  export class SocksToRtc {

    // TODO: these should be parameterized/editable from the uProxy UI/consumer
    // of this class.
    private stunServers_ : stringp[] =
      [ "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302" ];

    // Freedom channel to use for sending signalling messages to .
    private signallingChannelSpecifier_ :freedom.ChannelSpecifier = null;
    private onceSignallingChannelReady_ :Promise<freedom.ChannelSpecifier>;

    // Message handler queues to/from the peer.
    private signalsToPeerQueue_   :Handler.Queue<string, void> =
        new Handler.Queue<string,void>();
    private signalsFromPeerQueue_ :Handler.Queue<string, void> =
        new Handler.Queue<string,void>();

    // Tcp server that is listening for SOCKS connections.
    private tcpServer_       :Tcp.Server = null;
    // The connection to the peer that is acting as the endpoint for the proxy
    // connection.
    private peerConnection_  :freedom.PeerConnection = null;

    constructor() {}

    // Start the SocksToRtc Peer, based on the the local host and port to
    // listen on.
    // This will emit a socksToRtcSuccess signal when the peer connection is esablished,
    // or a socksToRtcFailure signal if there is an error openeing the peer connection.
    // TODO: update this to return a promise that fulfills/rejects, after freedom v0.5
    // is ready.
    public start = (endpoint:Net.Endpoint) => {
      this.reset_();  // Begin with fresh components.
      dbg('starting SocksToRtc: ' + JSON.stringify(endpoint));

      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP). This is
      // the Freedom channel object to sends signalling messages to the peer.
      this.onceSignallingChannelReady_ =

      this.onceSignallingChannelReady_ = prepareSignallingChannel_()
        .then(this.setupPeerConnection_)
        .then(() => {
            dbg('SocksToRtc transport_.setup succeeded');
            freedom.emit('socksToRtcSuccess');
            // this.startPingPong_();
          })
        .then(this.startSendingQueuedMessages_)
        .then(this.sendHelloToPeer_)
        .then(() => {
            // Create SOCKS server and start listening.
            this.socksServer_ = new Socks.Server(endpoint, this.makeNetRequestOnRtc_);
            this.socksServer_.listen();
          })
        .catch((e) => {
            dbgErr('SocksToRtc transport_.setup failed ' + e);
            freedom.emit('socksToRtcFailure');
          });
    }

    public stop = () => {
      this.reset_();
    }

    // Stop SOCKS server and close peer-connection (and hence all data
    // channels).
    private reset_ = () => {
      dbg('resetting peer...');

      this.signalsToPeerQueue_.clear();
      this.signalsFromPeerQueue_.clear();

      this.tcpServer_.shutdown();

      if (this.signallingChannel_) {
        this.signallingChannel_.channel.close();
        this.signallingChannel_ = null;
      }
    }


    private this.sendHelloToPeer_ = () : void {
      dbg('signalling channel to SCTP peer connection ready.');
      // Send hello command to initiate communication, which will cause
      // the promise returned this.transport_.setup to fulfill.
      // TODO: remove hello command once freedom.transport.setup
      // is changed to automatically negotiate the connection.
      dbg('sending hello command.');
      var command :Channel.Command = {type: Channel.COMMANDS.HELLO};
      this.peerConnection_.send('control', ArrayBuffers.stringToArrayBuffer(
          JSON.stringify(command)));
    }

    // Starts preparing the signalling channel
    private prepareSignallingChannel_ = () : Promise<freedom.ChannelSpecifier> {
      return new Promise((F,R) => {
        fCore.createChannel().then((chan) => {
          chan.on('message', this.signalsFromPeerQueue_.handle);
          this.signalsToPeerQueue_.setHandler();
          this.signallingChannelSpecifier_ = chan;
          F();
          return this.signallingChannelSpecifier_.identifier;
      });  // fCore.createChannel
    }

    private onTransportCloseHandler_ = () => {
      dbg('onTransportCloseHandler_ invoked for transport.')
      // Set this.transport to null so reset_ doesn't attempt to close it again.
      this.transport_ = null;
      this.reset_();
    }

    private setupPeerConnection_(channelIdentifier :ChannelEndpointIdentifier)
        : Promise<void> {
      // SOCKS sessions biject to peerconnection datachannels.
      this.peerConnection_ = freedom['core.peer-connection']();

      this.peerConnection_.on('onReceived', this.onDataFromPeer_);
      this.peerConnection_.on('onClose', this.onPeerClosed_);
      this.peerConnection_.on('onOpenDataChannel', (channelInfo) => {
        dbgErr('unexpected onOpenDataChannel event: ' +
            JSON.stringify(channelInfo));
      });
      this.peerConnection_.on('onCloseDataChannel', this.onDataChannelClosed_);
      return this.peerConnection_.setup(channelIdentifier, 'SocksToRtc',
          this.stunServers_);
    }

    // Signalling channel messages are batched and dispatched each second.
    // TODO: kill this loop!
    // TODO: size limit on batched message
    // TODO: this code is completely common to rtc-to-net (growing need for
    //       shared lib)
    private startSendingQueuedMessages_() {
      this.queuedMessages_ = [];
      setInterval(() => {
        if (this.queuedMessages_.length > 0) {
          dbg('dispatching signalling channel messages...');
          freedom.emit('sendSignalToPeer',
            JSON.stringify({
              version: 1,
              messages: this.queuedMessages_
            }));
          this.queuedMessages_ = [];
        }
      }, 1000);
    }

    // TODO: reuse tag names from a pool.
    private static obtainTag_() {
      return 'c' + Math.random();
    }

    /**
     * Setup a new data channel.
     */
    private makeNetRequestOnRtc_ = (
        socksChannelKind:Channel.Kind, endpoint:Channel.Endpoint)
        : Promise<Channel.EndpointInfo> => {
      if (!this.transport_) {
        dbgWarn('transport not ready');
        return;
      }

      // Generate a name for this connection and associate it with the SOCKS session.
      var tag = SocksToRtc.obtainTag_();
      this.connections_[tag] = ;

      // This gets a little funky: ask the peer to establish a connection to
      // the remote host and register a callback for when it gets back to us
      // on the control channel.
      // TODO: how to add a timeout, in case the remote end never replies?
      return new Promise<Endpoint>((F,R) => {
        this.connectCallbacks_[tag] = (response:Channel.NetConnectResponse) => {
          if (response.address) {

            // CONSIDER: maybe set a timeout for automatic rejection? Although
            // Chrome should probably be doing that itself.

            // TODO: This is not right! send and terminate get overwritten in
            // bad ways. There is a followup CL to pull request coming to fix
            // this.
            var endpointInfo:Channel.EndpointInfo = {
              protocol: params.protocol,
              address: response.address,
              port: response.port,
              send: (buf:ArrayBuffer) => { this.sendDataToPeer_(tag, buf); },
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
      if (!(tag in this.dataChannels_)) {
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
      delete this.dataChannels_[tag];
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
        dbg('onDataFromPeer_: control command: ' + command.type);

        if (command.type === Channel.COMMANDS.NET_CONNECT_RESPONSE) {
          // Call the associated callback and forget about it.
          // The callback should fulfill or reject the promise on
          // which the client is waiting, completing the connection flow.
          var response:Channel.NetConnectResponse = JSON.parse(command.data);
          if (command.tag in this.connectCallbacks_) {
            var callback = this.connectCallbacks_[command.tag];
            callback(response);
            delete this.connectCallbacks_[command.tag];
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
          dbgErr('unsupported control command: ' + command.type);
        }
      } else {
        if (!(msg.tag in this.dataChannels_)) {
          dbgErr('unknown datachannel ' + msg.tag);
          return;
        }
        var session = this.dataChannels_[msg.tag];
        session.send(msg.data);
      }
    }

    /**
     * Calls the endpoint's terminate() method and discards our reference
     * to the channel. Intended for use when the remote side has been
     * disconnected.
     */
    private closeConnectionToPeer = (tag:string) => {
      if (!(tag in this.dataChannels_)) {
        dbgErr('unknown datachannel ' + tag + ' has closed');
        return;
      }
      dbg('datachannel ' + tag + ' has closed. ending SOCKS session for channel.');
      this.dataChannels_[tag].terminate();
      delete this.dataChannels_[tag];
    }

    /**
     * Send data over SCTP to peer, via data channel |tag|.
     *
     * Side note: When transport_ encounters a 'new' |tag|, it
     * implicitly creates a new data channel.
     */
    private sendDataToPeer_ = (tag:string, buffer:ArrayBuffer) => {
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
    public handlePeerSignal = (msg:string) => {
      // dbg('client handleSignalFromPeer: ' + JSON.stringify(msg) +
                  // ' with state ' + this.toString());
      if (!this.signallingChannel_) {
        dbgErr('signalling channel missing!');
        return;
      }
      // TODO: this code is completely common to rtc-to-net (growing need for
      // shared lib) TODO: Move to being done by the social-network
      // implementation/uproxy's use of it as this is dependent on the social
      // networks throtteling.
      try {
        var batchedMessages :Channel.BatchedMessages = JSON.parse(msg);
        if (batchedMessages.version != 1) {
          throw new Error('only version 1 batched messages supported');
        }
        for (var i = 0; i < batchedMessages.messages.length; i++) {
          var message = batchedMessages.messages[i];
          dbg('received signalling channel message: ' + message);
          this.signallingChannel_.channel.emit('message', message);
        }
      } catch (e) {
        dbgErr('could not parse batched messages: ' + e.message);
      }
    }

    public toString = () => {
      var ret ='<SocksToRtc: failed toString()>';
      try {
        ret = JSON.stringify({ socksServer: this.socksServer_,
                               transport: this.transport_,
                               signallingChannel: this.signallingChannel_.identifier,
                               channels: this.dataChannels_ });
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
          // Save remotePeer before closing because it will be reset.
          this.stop();
          freedom.emit('socksToRtcTimeout');
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

  }  // SocksToRTC.SocksToRTC


  var modulePrefix_ = '[SocksToRtc] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module SocksToRtc



initClient();
