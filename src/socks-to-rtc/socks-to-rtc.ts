/*
  SocksToRtc.Peer passes socks requests over WebRTC datachannels.
*/
/// <reference path='socks.ts' />
/// <reference path='../freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../freedom-typescript-api/interfaces/transport.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />
/// <reference path='../interfaces/communications.d.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
console.log('WEBWORKER SocksToRtc: ' + self.location.href);

module SocksToRtc {

  var fCore = freedom.core();

  /**
   * SocksToRtc.Peer
   *
   * Contains a local SOCKS server which passes requests remotely through
   * WebRTC peer connections.
   */
  export class SocksToRtc {

    private socksServer_:Socks.Server = null;     // Local SOCKS server.
    // TODO: give proper typing to `sinallingChannel_`
    private signallingChannel_:any = null;        // NAT piercing route.
    private transport_:freedom.Transport = null;  // For actual proxying.

    /**
     * Currently open data channels, indexed by data channel tag name.
     */

    // Private state kept for ping-pong (heartbeat and ack).
    private pingPongSendIntervalId_ :number = null;
    private pingPongCheckIntervalId_ :number = null;
    private lastPingPongReceiveDate_ :Date = null;
    private dataChannels_:{[tag:string]:Channel.EndpointInfo} = {};

    // Connection callbacks, by datachannel tag name.
    // TODO: figure out a more elegant way to store these callbacks
    private connectCallbacks_ :
      {[tag:string] : (response:Channel.NetConnectResponse) => void} = {};


    constructor() {}

    /**
     * Start the SocksToRtc Peer, based on the the local host and port to
     * listen on.
     * This will emit a socksToRtcSuccess signal when the peer connection is esablished,
     * or a socksToRtcFailure signal if there is an error openeing the peer connection.
     * TODO: update this to return a promise that fulfills/rejects, after freedom v0.5
     * is ready.
     */
    public start = (endpoint:Net.Endpoint) => {
      this.reset_();  // Begin with fresh components.
      dbg('starting SocksToRtc: ' + JSON.stringify(endpoint));
      // SOCKS sessions biject to peerconnection datachannels.
      this.transport_ = freedom['transport']();
      this.transport_.on('onData', this.onDataFromPeer_);
      this.transport_.on('onClose', this.onTransportCloseHandler_);
      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP). This is
      // the Freedom channel object to send messages to the peer.
      fCore.createChannel().then((chan) => {
        this.transport_.setup('SocksToRtc', chan.identifier).then(
          () => {
            dbg('SocksToRtc transport_.setup succeeded');
            freedom.emit('socksToRtcSuccess', endpoint);
            // this.startPingPong_();
          }
        ).catch(
          (e) => {
            dbgErr('SocksToRtc transport_.setup failed ' + e);
            freedom.emit('socksToRtcFailure', endpoint);
          }
        );

        // Signalling channel messages are batched and dispatched each second.
        // TODO: kill this loop!
        // TODO: size limit on batched message
        // TODO: this code is completely common to rtc-to-net (growing need for shared lib)
        var queuedMessages = [];
        setInterval(() => {
          if (queuedMessages.length > 0) {
            dbg('dispatching signalling channel messages...');
            freedom.emit('sendSignalToPeer', {
              peerId: peerId,
              data: JSON.stringify({
                version: 1,
                messages: queuedMessages
              })
            });
            queuedMessages = [];
          }
        }, 1000);

        this.signallingChannel_ = chan.channel;
        this.signallingChannel_.on('message', function(msg) {
          dbg('signalling channel message: ' + msg);
          queuedMessages.push(msg);
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
      this.socksServer_ = new Socks.Server(endpoint, this.createDataChannel_);
      this.socksServer_.listen();
    }

    public stop = () => {
      this.reset_();
    }

    private onTransportCloseHandler_ = () => {
      dbg('onTransportCloseHandler_ invoked for transport.')
      // Set this.transport to null so reset_ doesn't attempt to close it again.
      this.transport_ = null;
      this.reset_();
    }

    // Stop SOCKS server and close peer-connection (and hence all data
    // channels).
    private reset_ = () => {
      dbg('resetting peer...');
      this.stopPingPong_();
      if (this.socksServer_) {
        this.socksServer_.disconnect();  // Disconnects internal TCP server.
        this.socksServer_ = null;
      }
      for (var tag in this.dataChannels_) {
        this.closeConnectionToPeer(tag);
      }
      this.dataChannels_ = {};
      if(this.transport_) {
        this.transport_.close();
        this.transport_ = null;
      }
      if (this.signallingChannel_) {  // TODO: is this actually right?
        this.signallingChannel_.emit('close');
      }
      this.signallingChannel_ = null;
    }

    // TODO: reuse tag names from a pool.
    private static obtainTag_() {
      return 'c' + Math.random();
    }

    /**
     * Setup a new data channel.
     */
    private createDataChannel_ = (params:Channel.EndpointInfo)
        : Promise<Channel.EndpointInfo> => {
      if (!this.transport_) {
        dbgWarn('transport not ready');
        return;
      }

      // Generate a name for this connection and associate it with the SOCKS session.
      var tag = SocksToRtc.obtainTag_();
      this.dataChannels_[tag] = params;

      // This gets a little funky: ask the peer to establish a connection to
      // the remote host and register a callback for when it gets back to us
      // on the control channel.
      // TODO: how to add a timeout, in case the remote end never replies?
      return new Promise((F,R) => {
        this.connectCallbacks_[tag] = (response:Channel.NetConnectResponse) => {
          if (response.address) {
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
          dbgWarn('unsupported control command: ' + command.type);
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
        var batchedMessages :any = JSON.parse(msg.data);
        if (batchedMessages.version != 1) {
          throw new Error('only version 1 batched messages supported');
        }
        for (var i = 0; i < batchedMessages.messages.length; i++) {
          var message = batchedMessages.messages[i];
          dbg('received signalling channel message: ' + message);
          this.signallingChannel_.emit('message', message);
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
                               signallingChannel: this.signallingChannel_,
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
          freedom.emit('socksToRtcTimeout', '');
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

// This is what is avauilable to Freedom.
function initClient() {
  // Create local peer and attach freedom message handlers, then emit |ready|.
  var socksToRtc = new SocksToRtc.SocksToRtc();
  freedom.on('handleSignalFromPeer', socksToRtc.handlePeerSignal);
  freedom.on('start', socksToRtc.start);
  freedom.on('stop', socksToRtc.stop);
  freedom.emit('ready', {});
}

initClient();
