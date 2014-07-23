/*
  SocksToRtc.Peer passes socks requests over WebRTC datachannels.
*/
/// <reference path='../freedom-typescript-api/interfaces/peer-connection.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />
/// <reference path='../handler/queue.ts' />
/// <reference path='../interfaces/communications.d.ts' />

console.log('WEBWORKER SocksToRtc: ' + self.location.href);

// This is what is avauilable to Freedom.
function initClient() {
  // Create local socks-to-rtc class instance and attach freedom message
  // handlers, then emit |ready|.  TODO: in freedom v0.5, we can/should use an
  // interface and drop this explicit module-to-class linking.
  freedom.on('handleSignalFromPeer', socksToRtc.handlePeerSignal.handle);
  freedom.on('start', socksToRtc.start);
  freedom.on('stop', socksToRtc.stop);
  freedom.emit('ready', {});
}

module SocksToRtc {

  export class FreedomSocksClass {
    // Freedom channel to use for sending signalling messages to .
    private signallingChannelSpecifier_ :freedom.ChannelSpecifier<string,string> = null;
    private onceSignallingChannelReady_
        :Promise<freedom.ChannelSpecifier<string,string>>;

    private socksToRtc_ :SocksToRtc;

    constructor() {
      this.socksToRtc_ = new SocksToRtc.SocksToRtc();
    }

    public start() {
      onceSignallingChannelReady_ = prepareSignallingChannel_()
      onceSignallingChannelReady_.then(() => {

        });

      ready = Promise.all([]);
      ready.then(() => {
        this.signalsToPeer_.setHandler(this.sendSignalToPeer_); });

    }

    public stop() {
      if (this.signallingChannel_) {
        this.signallingChannel_.channel.close();
        this.signallingChannel_ = null;
      }
    }

    // Starts preparing the signalling channel
    private prepareSignallingChannel_ =
        () : Promise<freedom.ChannelSpecifier> => {
      return new Promise((F,R) => {
        fCore.createChannel().then((chan) => {
            chan.on('message', this.signalsFromPeer_.handle);
            this.signallingChannelSpecifier_ = chan;
            F();
            return this.signallingChannelSpecifier_.identifier;
          });  // fCore.createChannel
        });
    }

    private sendSignalToPeer_ = (message:string) : void => {
      chan.emit('message', message);
    }

    // Signalling channel messages are batched and dispatched each second.
    // TODO: kill this loop!
    // TODO: size limit on batched message
    // TODO: this code is completely common to rtc-to-net (growing need for
    //       shared lib)
    private startSendingQueuedMessages_ = () : void => {
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

  }


  // The |SocksToRtc| class runs a SOCKS5 proxy server which passes requests
  // remotely through WebRTC peer connections.
  export class SocksToRtc {

    // TODO: these should be parameterized/editable from the uProxy UI/consumer
    // of this class.
    private stunServers_ : string[] =
      [ "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302" ];

    // Message handler queues to/from the peer.
    private signalsToPeer_   :Handler.Queue<string, void> =
        new Handler.Queue<string,void>();
    private signalsFromPeer_ :Handler.Queue<string, void> =
        new Handler.Queue<string,void>();

    // Tcp server that is listening for SOCKS connections.
    private tcpServer_       :Tcp.Server = null;
    // The connection to the peer that is acting as the endpoint for the proxy
    // connection.
    private peerConnection_  :freedom.PeerConnection = null;

    // From data channel labels to their TCP connections. Most of the wiring
    // here happens via promises.
    private pcTcpSessions_ :{ [dataChannelLabel:string] : TcpConnection }

    constructor() {}

    // Start the SocksToRtc Peer, based on the the local host and port to
    // listen on.
    // This will emit a socksToRtcSuccess signal when the peer connection is esablished,
    // or a socksToRtcFailure signal if there is an error openeing the peer connection.
    // TODO: update this to return a promise that fulfills/rejects, after freedom v0.5
    // is ready.
    public start = (endpoint:Net.Endpoint) : Promise<void> => {
      var onceTcpServerReady :Promise<void>;
      var oncePeerConnectionReady :Promise<void>;

      this.reset_();  // Begin with fresh components.
      dbg('SocksToRtc.star(' + JSON.stringify(endpoint) + ')');

      // Create SOCKS server and start listening.
      // CONSIDER: do we get a sync guarentee that the TCP server is running
      // from the constructor?
      this.tcpServer_ = new Tcp.Server(endpoint, this.makeTcpToRtcSession_);
      onceTcpServerReady = this.tcpServer_.listen();

      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP). This is
      // the Freedom channel object to sends signalling messages to the peer.
      oncePeerConnectionReady = this.setupPeerConnection_();

      return Promise.all<void>([onceTcpServerReady, oncePeerConnectionReady])
        .then(() => {
            dbg('SocksToRtc:socksToRtcSuccess');
            freedom.emit('socksToRtcSuccess');
            // this.startPingPong_();
          })
        .catch((e) => {
            dbgErr('SocksToRtc:socksToRtcFailure: ' + e);
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

      this.signalsToPeer_.clear();
      this.signalsFromPeer_.clear();

      this.tcpServer_.shutdown();
    }

    private sendHelloToPeer_ = () : void => {
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

    private setupPeerConnection_ =
        (channelIdentifier :ChannelEndpointIdentifier<string,string>) : Promise<void> => {
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

    private onDataChannelClosed_ =
        (channelInfo:freedom.PeerConnection.DataChannelInfo) : {
      pcTcpSessions_[channelInfo.channelLabel].close();
    }

    // TODO: reuse tag names from a pool.
    private static obtainTag_() {
      var array = new Uint32Array(1);
      return 'c' + array[0];
    }

    // Setup a SOCKS5 TCP-to-rtc session from a tcp connection.
    private makeTcpToRtcSession_ = (tcpConnection:Tcp.Connection) : void => {
      // The first TCP packet is the socks-request
      tcpConnection.dataFromSocketQueue.receive()
        .then(Socks.interpretRequestBuffer)
        .then(this.makeNetRequestOnRtc_)
        .then(this.sendSocksEndpointResponse.bind(null, tcpConnection))
        .catch((e) => {
            dbgWarn('TCP connection failed establish a SOCKS session: ' + e +
                '; ' + tcpConnection.toString());
            tcpConnection.close();
          });

      tcpConnection.onceDisconnected(() => {
        delete pcTcpSessions_[channelInfo.channelLabel];
      });

      tcpConnection.onceConnected.then((endpoint:Net.Endpoint) =>  {
        tcpConnection.
      });
    }

    private sendSocksEndpointResponse = (endpoint:Net.Endpoint)

    //
    private makeNetRequestOnRtc_ = (request:Socks.Request)
        : Promise<Channel.EndpointInfo> => {
      if (!this.transport_) {
        dbgWarn('transport not ready');
        return;
      }

      // Generate a name for this connection and associate it with the SOCKS
      // session.
      var tag = SocksToRtc.obtainTag_();

      // This gets a little funky: ask the peer to establish a connection to
      // the remote host and register a callback for when it gets back to us
      // on the control channel.
      // TODO: how to add a timeout, in case the remote end never replies?
      return new Promise<Endpoint>((F,R) => {
        this.connectCallbacks_[tag] = (response:Channel.NetConnectResponse) => {
          if (response.address) {
            var endpointInfo:Channel.EndpointInfo = {
              protocol: params.protocol,
              address: response.address,
              port: response.port,
              send: (buf:ArrayBuffer) => { this.peerConnection_.send(tag, buf); },
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
    private terminate_ = (tag:string) : void => {
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
    private onDataFromPeer_ =
        (msg:freedom.Transport.IncomingMessage) : void => {
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
    private closeConnectionToPeer = (tag:string) : void => {
      if (!(tag in this.dataChannels_)) {
        dbgErr('unknown datachannel ' + tag + ' has closed');
        return;
      }
      dbg('datachannel ' + tag + ' has closed. ending SOCKS session for channel.');
      this.dataChannels_[tag].terminate();
      delete this.dataChannels_[tag];
    }

    /**
     * Pass any messages coming from remote peer through the signalling channel
     * handled by freedom, which goes to the signalling channel input of the
     * peer connection.
     */
    public handlePeerSignal = (msg:string) : void => {
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

    public toString = () : string => {
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
    private startPingPong_ = () : void => {
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

    private stopPingPong_ = () : void => {
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
