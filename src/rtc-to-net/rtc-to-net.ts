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

    // Fulfills once the module is ready to allocate sockets.
    // Rejects if a peerconnection could not be made for any reason.
    public onceReady :Promise<void>;

    // Call this to initiate shutdown.
    private fulfillStopping_ :() => void;
    private onceStopping_ = new Promise((F, R) => {
      this.fulfillStopping_ = F;
    });

    // Fulfills once the module has terminated and the peerconnection has
    // been shutdown.
    // This can happen in response to:
    //  - startup failure
    //  - peerconnection termination
    //  - manual invocation of close()
    // Should never reject.
    // TODO: rename onceStopped, ala SocksToRtc (API breakage).
    public onceClosed :Promise<void>;

    // The connection to the peer that is acting as a proxy client.
    private peerConnection_  :freedom_UproxyPeerConnection.Pc = null;

    // The |sessions_| map goes from WebRTC data-channel labels to the Session.
    // Most of the wiring to manage this relationship happens via promises. We
    // need this only for data being received from a peer-connection data
    // channel get raised with data channel label. TODO:
    // https://github.com/uProxy/uproxy/issues/315 when closed allows
    // DataChannel and PeerConnection to be used directly and not via a freedom
    // interface. Then all work can be done by promise binding and this can be
    // removed.
    private sessions_ :{ [channelLabel:string] : Session } = {};

    // As configure() but handles creation of peerconnection.
    constructor(
        pcConfig?:WebRtc.PeerConnectionConfig,
        proxyConfig?:ProxyConfig,
        obfuscate?:boolean) {
      if (pcConfig) {
        this.start(
            proxyConfig,
            obfuscate ?
              freedom.churn(pcConfig) :
              freedom['core.uproxypeerconnection'](pcConfig));
      }
    }

    // Starts with the supplied peerconnection.
    // Returns this.onceReady.
    public start = (
        proxyConfig:ProxyConfig,
        peerconnection:freedom_UproxyPeerConnection.Pc)
        : Promise<void> => {
      if (this.peerConnection_) {
        throw new Error('already configured');
      }
      this.proxyConfig = proxyConfig;
      this.peerConnection_ = peerconnection;

      this.peerConnection_.on('dataFromPeer', this.onDataFromPeer_);
      this.peerConnection_.on('signalForPeer', this.signalsForPeer.handle);
      this.peerConnection_.on('peerOpenedChannel', this.onPeerOpenedChannel_);

      this.onceReady = this.peerConnection_.onceConnected().then(() => {});
      this.onceReady.catch(this.fulfillStopping_);
      this.peerConnection_.onceDisconnected()
          .then(this.fulfillStopping_, this.fulfillStopping_);
      this.onceClosed = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    private onPeerOpenedChannel_ = (channelLabel:string) : void => {
      log.debug('creating new session for channel ' + channelLabel);

      var session = new Session(
          channelLabel,
          this.peerConnection_,
          this.proxyConfig,
          this.bytesSentToPeer);
      this.sessions_[channelLabel] = session;
      session.start();

      var discard = () => {
        delete this.sessions_[channelLabel];
        log.debug('discarded session ' + channelLabel + ' (' +
            Object.keys(this.sessions_).length + ' sessions remaining)');
      };
      session.onceStopped().then(discard, (e:Error) => {
        log.error('session ' + channelLabel + ' closed with error: ' + e.message);
        discard();
      });
    }

    // Initiates shutdown of the peerconnection.
    // Returns onceClosed.
    // TODO: rename stop, ala SocksToRtc (API breakage).
    public close = () : Promise<void> => {
      this.fulfillStopping_();
      return this.onceClosed;
    }

    // Shuts down the peerconnection, fulfilling it has terminated.
    // Since its close() method should ever reject, this should never reject.
    // TODO: close all sessions before fulfilling
    public stopResources_ = () : Promise<void> => {
      // uproxypeerconnection doesn't allow us query whether the
      // peerconnection has shut down but the call is explicitly idempodent.
      return this.peerConnection_.close();
    }

    public handleSignalFromPeer = (signal:WebRtc.SignallingMessage)
        : void => {
      this.peerConnection_.handleSignalMessage(signal);
    }

    // Data from the remote peer over WebRtc gets sent to the socket that
    // corresponds to the channel label, or used to make a new TCP connection.
    private onDataFromPeer_ = (
        rtcData:freedom_UproxyPeerConnection.LabelledDataChannelMessage)
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
    private tcpConnection_ :Tcp.Connection;

    // Fulfills once a connection has been established with the remote peer.
    // Rejects if a connection cannot be made for any reason.
    public onceReady :Promise<void>;

    // Call this to initiate shutdown.
    private fulfillStopping_ :() => void;
    private onceStopping_ = new Promise((F, R) => {
      this.fulfillStopping_ = F;
    });

    // Fulfills once the session has terminated and the TCP connection
    // and datachannel have been shutdown.
    // This can happen in response to:
    //  - startup failure
    //  - TCP connection or datachannel termination
    //  - manual invocation of close()
    // Should never reject.
    private onceStopped_ :Promise<void>;
    public onceStopped = () : Promise<void> => { return this.onceStopped_; }

    // TODO: This will be much cleaner once we move off uproxypeerconnection.
    private dataFromPeer_ :Handler.Queue<WebRtc.Data,void> =
        new Handler.Queue<WebRtc.Data,void>();

    // The supplied datachannel must already be successfully established.
    // TODO: Rather than passing a reference to the whole peerconnection, we
    //       should only pass a reference to the datachannel.
    constructor(
        private channelLabel_:string,
        private peerConnection_:freedom_UproxyPeerConnection.Pc,
        private proxyConfig_:ProxyConfig,
        private bytesSentToPeer_:Handler.Queue<number,void>) {}

    // Returns onceReady.
    public start = () : Promise<void> => {
      this.onceReady = this.receiveEndpointFromPeer_()
        .then(this.getTcpConnection_)
        .then((tcpConnection:Tcp.Connection) => {
          this.tcpConnection_ = tcpConnection;
          // Shutdown once the TCP connection terminates.
          this.tcpConnection_.onceClosed.then(this.fulfillStopping_);
          return this.tcpConnection_.onceConnected;
        })
        .then(this.returnEndpointToPeer_);
      this.onceReady.then(this.linkTcpAndPeerConnectionData_);

      this.onceReady.catch(this.fulfillStopping_);
      this.peerConnection_.onceDataChannelClosed(this.channelLabel_)
        .then(this.fulfillStopping_);
      this.onceStopped_ = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    // Initiates shutdown of the TCP connection and peerconnection.
    // Returns onceStopped.
    public stop = () : Promise<void> => {
      this.fulfillStopping_();
      return this.onceStopped_;
    }

    // Closes the TCP connection and datachannel if they haven't already
    // closed, fulfilling once both have closed. Since neither objects'
    // close() methods should ever reject, this should never reject.
    private stopResources_ = () : Promise<void> => {
      var shutdownPromises :Promise<any>[] = [];
      if (this.tcpConnection_ && (!this.tcpConnection_.isClosed())) {
        shutdownPromises.push(this.tcpConnection_.close());
      }
      // uproxypeerconnection doesn't allow us query whether a
      // datachannel has closed but the call should be idempodent:
      //   http://w3c.github.io/webrtc-pc/#dom-datachannel-close
      shutdownPromises.push(
          this.peerConnection_.closeDataChannel(this.channelLabel_));
      return Promise.all(shutdownPromises).then((answers:any[]) => {
        return Promise.resolve<void>();
      });
    }

    public handleWebRtcDataFromPeer = (webrtcData:WebRtc.Data) : void => {
      this.dataFromPeer_.handle(webrtcData);
    }

    // Returns a promise for the next message received from the peer.
    private receiveNext_ = () : Promise<WebRtc.Data> => {
      return new Promise((F,R) => {
        this.dataFromPeer_.setSyncNextHandler(F).catch(R);
      });
    }

    // Fulfills with the endpoint requested by the SOCKS client.
    // Rejects if the received message is not for an endpoint
    // or if the received endpoint cannot be parsed.
    // TODO: needs tests (mocked by several tests)
    private receiveEndpointFromPeer_ = () : Promise<Net.Endpoint> => {
      return this.receiveNext_().then((data:WebRtc.Data) => {
        if (!data.str) {
          throw new Error('endpoint message must be a str');
        }
        try {
          var request :Socks.Request = JSON.parse(data.str);
          if (request.command != Socks.Command.TCP_CONNECT) {
            throw new Error('unexpected type for endpoint message');
          }
          var endpoint = request.destination.endpoint;
          log.debug('received endpoint from SOCKS client: ' +
              endpoint.address + ':' + endpoint.port);
          return endpoint;
        } catch (e) {
          throw new Error('could not parse requested endpoint: ' + e.message);
        }
      });
    }

    private getTcpConnection_ = (endpoint:Net.Endpoint) : Tcp.Connection => {
      return new Tcp.Connection({endpoint: endpoint});
    }

    // Fulfills once the connected endpoint has been returned to the SOCKS client.
    // Rejects if the endpoint cannot be sent to the SOCKS client.
    private returnEndpointToPeer_ = (endpoint:Net.Endpoint) : Promise<void> => {
      return this.peerConnection_.send(this.channelLabel_, {
        str: JSON.stringify(endpoint)
      });
    }

    // Assumes that |receiveEndpointFromPeer| and |getTcpConnection_|
    // have completed.
    private linkTcpAndPeerConnectionData_ = () : void => {
      // Data from the TCP socket goes to the data channel.
      this.tcpConnection_.dataFromSocketQueue.setSyncHandler((buffer) => {
        log.debug(this.longId() + ': passing on data from tcp connection to pc (' +
            buffer.byteLength + ' bytes)');
        this.peerConnection_.send(this.channelLabel_, {buffer: buffer});
        this.bytesSentToPeer_.handle(buffer.byteLength);
      });
      // Data from the datachannel goes to the TCP socket.
      this.dataFromPeer_.setSyncHandler((data:WebRtc.Data) => {
        if (!data.buffer) {
          log.error(this.longId() + ': dataFromPeer: ' +
              'got non-buffer data: ' + JSON.stringify(data));
          return;
        }
        log.debug(this.longId() + ': dataFromPeer: ' + data.buffer.byteLength + ' bytes.');
        this.tcpConnection_.send(data.buffer);
      });
    }

    private isAllowedAddress_ = (addressString:string) : boolean => {
      // default is to disallow non-unicast addresses; i.e. only proxy for
      // public internet addresses.
      if (this.proxyConfig_.allowNonUnicast) {
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

    public longId = () : string => {
      return 'session ' + this.channelLabel_ + ' (TCP connection ' +
          (this.tcpConnection_.isClosed() ? 'closed' : 'open') + ') ';
    }

    // For logging/debugging.
    public toString = () : string => {
      var tcpString = 'undefined';
      if (this.tcpConnection_) {
        tcpString = this.tcpConnection_.toString();
      }
      return JSON.stringify({
        channelLabel_: this.channelLabel_,
        tcpConnection: tcpString
      });
    }
  }  // Session

}  // module RtcToNet
