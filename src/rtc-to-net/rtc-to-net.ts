// Server which handles SOCKS connections over WebRTC datachannels.

/// <reference path='../socks-common/socks-headers.d.ts' />
/// <reference path='../freedom/coreproviders/uproxylogging.d.ts' />
/// <reference path='../freedom/coreproviders/uproxypeerconnection.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../handler/queue.d.ts' />
/// <reference path='../ipaddrjs/ipaddrjs.d.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path="../churn/churn.d.ts" />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

console.log('WEBWORKER - RtcToNet: ' + self.location.href);

module RtcToNet {
  import WebrtcLib = freedom_UproxyPeerConnection;

  var log :Freedom_UproxyLogging.Log = freedom['core.log']('RtcToNet');

  export interface ProxyConfig {
    // If |allowNonUnicast === false| then any proxy attempt that results
    // in a non-unicast (e.g. local network) address will fail.
    allowNonUnicast :boolean;
  }

  // The |RtcToNet| class holds a peer-connection and all its associated
  // proxied connections.
  export class RtcToNet {
    // Configuration for the proxy endpoint. Note: all sessions share the same
    // (externally provided) proxyconfig.
    public proxyConfig :ProxyConfig;

    // Message handler queues to/from the peer.
    public signalsForPeer :Handler.Queue<WebRtc.SignallingMessage, void> =
        new Handler.Queue<WebRtc.SignallingMessage,void>();

    // The two Queues below only count bytes transferred between the SOCKS
    // client and the remote host(s) the client wants to connect to. WebRTC
    // overhead (DTLS headers, ICE initiation, etc.) is not included (because
    // WebRTC does not provide easy access to that data) nor is SOCKS
    // protocol-related data (because it's sent via string messages).
    // All Sessions created in one instance of RtcToNet will share and
    // push numbers to the same queues (belonging to that instance of RtcToNet).
    // Queue of the number of bytes received from the peer. Handler is typically
    // defined in the class that creates an instance of RtcToNet.
    public bytesReceivedFromPeer :Handler.Queue<number, void> =
        new Handler.Queue<number, void>();
    // Queue of the number of bytes sent to the peer. Handler is typically
    // defined in the class that creates an instance of RtcToNet.
    public bytesSentToPeer :Handler.Queue<number, void> =
        new Handler.Queue<number, void>();
    // This promise is fulfilled once the peer connection is stablished and
    // this module is ready to start making tcp connections.
    public onceReady :Promise<void>;
    // Fulfilled when the peer connection is closed. Once closed fulfills
    // implies that every tcp-connection is closed, or closing. This is handled
    // by the session (by handling each data channels close event).
    public onceClosed :Promise<void>;

    // The connection to the peer that is acting as a proxy client.
    private peerConnection_  :WebrtcLib.Pc = null;
    // The |sessions_| map goes from WebRTC data-channel labels to the Session.
    // Most of the wiring to manage this relationship happens via promises. We
    // need this only for data being received from a peer-connection data
    // channel get raised with data channel label. TODO:
    // https://github.com/uProxy/uproxy/issues/315 when closed allows
    // DataChannel and PeerConnection to be used directly and not via a freedom
    // interface. Then all work can be done by promise binding and this can be
    // removed.
    private sessions_ :{ [channelLabel:string] : Session }

    // SocsToRtc server is given a localhost transport address (endpoint) to
    // start a socks server listening to, and a config for setting up a peer-
    // connection. If the given port is zero, platform chooses a port and this
    // listening port is returned by the promise.
    //
    // TODO: add checking of fingerprints.
    constructor(
        pcConfig:WebRtc.PeerConnectionConfig,
        proxyConfig:ProxyConfig,
        obfuscate?:boolean) {
      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP). This is
      // the Freedom channel object to sends signalling messages to the peer.
      // SOCKS sessions biject to peerconnection datachannels.
      this.sessions_ = {};
      this.proxyConfig = proxyConfig;
      this.peerConnection_ = obfuscate ?
          freedom.churn(pcConfig) :
          freedom['core.uproxypeerconnection'](pcConfig);
      this.peerConnection_.on('dataFromPeer', this.onDataFromPeer_);
      this.peerConnection_.on('peerOpenedChannel', (channelLabel:string) => {
        if(channelLabel === '_control_') {
          log.debug('control channel openned.');
          return;
        }
        // TODO: This can be removed once https://github.com/uProxy/uproxy/issues/347 is fixed.
        if(channelLabel === '') {
          log.debug('dummy init channel.');
          return;
        }
        var session = new Session(this.peerConnection_, channelLabel,
          proxyConfig, this.bytesReceivedFromPeer, this.bytesSentToPeer);
        this.sessions_[channelLabel] = session;
        session.onceClosed.then(() => {
          delete this.sessions_[channelLabel];
        });
      });
      this.peerConnection_.on('signalForPeer', this.signalsForPeer.handle);
      this.onceReady = this.peerConnection_.onceConnected().then(() => {});
      this.onceClosed = this.peerConnection_.onceDisconnected();
      // TODO: add checking that the peer's fingerprint matches the provided
      // fingerprint.
    }

    // Close the peer-connection (and hence all data channels) and all
    // associated TCP connections. Note: once closed, cannot be openned again.
    public close = () => {
      this.peerConnection_.close();
      // CONSIDER: will peerConnection's closing of channels make this un-
      // needed? is it better to include this anyway?
      var channelLabel :string;
      for (channelLabel in this.sessions_) {
        this.sessions_[channelLabel].close();
        delete this.sessions_[channelLabel];
      }
    }

    public handleSignalFromPeer = (signal:WebRtc.SignallingMessage)
        : void => {
      this.peerConnection_.handleSignalMessage(signal);
    }

    // Data from the remote peer over WebRtc gets sent to the socket that
    // corresponds to the channel label, or used to make a new TCP connection.
    private onDataFromPeer_ = (rtcData:WebrtcLib.LabelledDataChannelMessage)
        : void => {
      if(rtcData.channelLabel === '_control_') {
        this.handleControlMessage_(rtcData.message.str);
        return;
      }
      log.debug('onDataFromPeer_: ' + JSON.stringify(rtcData));
      if(rtcData.message.buffer) {
        // We only count bytes sent in .buffer, not .str.
        this.bytesReceivedFromPeer.handle(rtcData.message.buffer.byteLength);
      }
      if(!(rtcData.channelLabel in this.sessions_)) {
        log.error('onDataFromPeer_: no such channel to send data to: ' +
            rtcData.channelLabel);
        return;
      }
      this.sessions_[rtcData.channelLabel].handleWebRtcDataFromPeer(
          rtcData.message);
    }

    private handleControlMessage_ = (controlMessage:string) : void => {
      log.debug('handleControlMessage: ' + controlMessage);
    }

    public toString = () : string => {
      var ret :string;
      var sessionsAsStrings :string[] = [];
      var label :string;
      for (label in this.sessions_) {
        sessionsAsStrings.push(this.sessions_[label].longId());
      }
      ret = JSON.stringify({ sessions_: sessionsAsStrings });
      return ret;
    }

  }  // class RtcToNet


  // A Tcp connection and its data-channel on the peer connection.
  //
  // CONSIDER: when we have a lightweight webrtc provider, we can use the
  // DataChannel class directly here instead of the awkward pairing of
  // peerConnection with chanelLabel.
  //
  // CONSIDER: this and the socks-rtc session are similar: maybe abstract
  // common parts into a super-class this inherits from?
  export class Session {
    public tcpConnection:Tcp.Connection;

    public onceReady :Promise<void>;
    public onceClosed :Promise<void>;

    // These are used to avoid double-closure of data channels. We don't need
    // this for tcp connections because that class already holds the open/
    // closed state. TODO: once we have a real DataChannel object (e.g. done by
    // low-level WebRtc provider), then refer to dataChannel.isClosed directly.
    private isClosed_ :boolean;

    // This variable starts false, and becomes true after the socket to the
    // remote endpoint is open (and the endpoint is confirmed to be at an
    // allowed address).
    private hasConnectedToEndpoint_ :boolean;

    // Getters.
    public channelLabel = () : string => { return this.channelLabel_; }
    public isClosed = () : boolean => { return this.isClosed_; }

    constructor(
        private peerConnection_:WebrtcLib.Pc,
        // The channel Label is a unique id for this data channel and session.
        private channelLabel_:string,
        public proxyConfig :ProxyConfig,
        private bytesReceivedFromPeer:Handler.Queue<number,void>,
        private bytesSentToPeer:Handler.Queue<number,void>) {
      this.proxyConfig = proxyConfig;
      this.isClosed_ = false;
      this.hasConnectedToEndpoint_ = false;
      // Open a data channel to the peer. The session is ready when the channel
      // is open.
      this.onceReady = this.peerConnection_.onceDataChannelOpened(
          this.channelLabel_);
      // Note: A TCP connection may or may not exist. If a TCP connection does,
      // exist, then onceDataChannelClosed will then close it (bound by
      // setTcpConnection). When a TCP stream closes, it also closes the data
      // channel, so it does suffice to consider a session closed when the data
      // channel is closed.
      this.onceClosed = this.peerConnection_
          .onceDataChannelClosed(this.channelLabel_);
      this.onceClosed.then(() => {
        this.isClosed_ = true;
        log.debug(this.longId() + ': onceClosed.');
      });
    }

    public longId = () : string => {
      var tcp :string = '?';
      if(this.tcpConnection) {
        tcp = this.tcpConnection.connectionId + (this.tcpConnection.isClosed() ? '.c' : '.o');
      }
      return this.channelLabel_ + (this.isClosed_ ? '.c' : '.o') + '-' + tcp;
    }

    public close = () : void => {
      if(!this.isClosed_) {
        this.peerConnection_.closeDataChannel(this.channelLabel_);
        this.isClosed_ = true;
      }
    }

    public handleWebRtcDataFromPeer = (webrtcData:WebRtc.Data) : void => {
      // Control messages are sent as strings.
      if(webrtcData.str) {
        this.handleWebRtcControlMessage_(webrtcData.str);
      } else if (webrtcData.buffer && this.tcpConnection) {
        if (!this.hasConnectedToEndpoint_) {
          log.error(this.longId() + ': Client attempted to send data to ' +
              'tcp connection before it was opened');
          return;
        }
        log.debug(this.longId() + ': passing on data from pc connection to tcp (' +
            webrtcData.buffer.byteLength + ' bytes)');
        // Note: tcpConnection is smart: it buffers and only sends when it is
        // ready.
        this.tcpConnection.dataToSocketQueue.handle(webrtcData.buffer);
      } else {
        log.error(this.longId() + ': handleWebRtcDataFromPeer: Bad rtcData: ' +
            JSON.stringify(webrtcData));
      }
    }

    private handleWebRtcControlMessage_ = (controlMessage:string) : void => {
      // TODO: rather than doing checks like this, we should use a handler
      // queue and receieve exactly what we want.
      if(this.tcpConnection) {
        log.error(this.longId() + ': Unsupported control message: ' +
            controlMessage + '; after tcp connection is established; state: ' +
            this.toString());
        return;
      }

      var request :Socks.Request;
      try {
        request = JSON.parse(controlMessage);
      } catch (e) {
        log.error(this.longId() + ': Unsupported control message: ' +
            controlMessage + '; in state: ' +
            this.toString());
        return;
      }

      if(request.command === Socks.Command.TCP_CONNECT) {
        this.startTcpConnection_(request.destination.endpoint)
          .then((connectedToEndpoint:Net.Endpoint) => {
            if (!this.isAllowedAddress_(connectedToEndpoint.address)) {
              log.error(this.longId() + ': Blocked attempt to access ' +
                  connectedToEndpoint.address + ', not an allowed address');
              // TODO: handle failure properly: tell the requester an
              // appropriate SOCKS error.
              // TODO: close the TCP connection and the peer-connection.
              this.close();
              return;
            }
            this.hasConnectedToEndpoint_ = true;
            // TODO: send back to peer.
            this.peerConnection_.send(
              this.channelLabel_, {str: JSON.stringify(connectedToEndpoint)});
            log.info(this.longId() + ': Connected to ' + JSON.stringify(connectedToEndpoint));
          });
      } else {
        log.error(this.longId() + ': Unsupported control message: ' +
            controlMessage + '; in state: ' +
            this.toString());
        return;
      }
    }

    private startTcpConnection_ = (endpoint:Net.Endpoint)
        : Promise<Net.Endpoint> => {
      this.tcpConnection = new Tcp.Connection({endpoint: endpoint});
      // All data from the tcp-connection should go to the peer connection.
      this.tcpConnection.dataFromSocketQueue.setSyncHandler((buffer) => {
        log.debug(this.longId() + ': passing on data from tcp connection to pc (' +
            buffer.byteLength + ' bytes)');
        this.peerConnection_.send(this.channelLabel_, {buffer: buffer});
        this.bytesSentToPeer.handle(buffer.byteLength);
      });
      // Make sure that closing the TCP connection closes the peer connection
      // and visa-versa. CONSIDER: should we send a message on the data channel
      // to say it should be closed? (For Chrome < 37, where close messages
      // don't propegate properly).
      this.tcpConnection.onceClosed.then(this.close);
      // Note: onceClosed is fulfilled once the data channel is closed.
      this.onceClosed.then(() => {
        if(this.tcpConnection && !this.tcpConnection.isClosed()) {
          this.tcpConnection.close();
        }
      });
      return this.tcpConnection.onceConnected;
    }

    private isAllowedAddress_ = (addressString:string) : boolean => {
      // default is to disallow non-unicast addresses; i.e. only proxy for
      // public internet addresses.
      if (this.proxyConfig.allowNonUnicast) {
        return true
      }

      // ipaddr.process automatically converts IPv4-mapped IPv6 addresses into
      // IPv4 Address objects.  This ensure that an attacker cannot reach a
      // restricted IPv4 endpoint that is identified by its IPv6-mapped address.
      try {
        var address = ipaddr.process(addressString);
        return address.range() == 'unicast';
      } catch (e) {
        // This likely indicates a malformed IP address, which will be logged by
        // the caller.
        return false;
      }
    }

    // For logging/debugging.
    public toString = () : string => {
      var tcpString = 'undefined';
      if (this.tcpConnection) {
        tcpString = this.tcpConnection.toString();
      }
      return JSON.stringify({
        channelLabel_: this.channelLabel_,
        isClosed_: this.isClosed_,
        tcpConnection: tcpString
      });
    }
  }  // Session

}  // module RtcToNet
