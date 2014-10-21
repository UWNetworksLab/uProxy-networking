// SocksToRtc.Peer passes socks requests over WebRTC datachannels.

/// <reference path='../socks-common/socks-headers.d.ts' />
/// <reference path='../freedom/coreproviders/uproxylogging.d.ts' />
/// <reference path='../freedom/coreproviders/uproxypeerconnection.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../handler/queue.d.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path="../churn/churn.d.ts" />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

console.log('WEBWORKER - SocksToRtc: ' + self.location.href);

module SocksToRtc {
  var log :Freedom_UproxyLogging.Log = freedom['core.log']('SocksToRtc');

  var tagNumber_ = 0;
  function obtainTag() {
    return 'c' + (tagNumber_++);
  }

  // The |SocksToRtc| class runs a SOCKS5 proxy server which passes requests
  // remotely through WebRTC peer connections.
  // TODO: rename this 'Server'.
  export class SocksToRtc {

    // Fulfills with the address on which the SOCKS server is listening
    // Rejects if either socket or peerconnection startup fails.
    public onceReady :Promise<Net.Endpoint>;

    // Call this to initiate shutdown.
    private initiateShutdown_ :() => void;
    private onceStopping_ = new Promise((F, R) => {
      this.initiateShutdown_ = F;
    });

    // Fulfills once the SOCKS server has terminated.
    // This can happen in response to:
    //  - startup failure
    //  - TCP server or peerconnection failure
    //  - manual invocation of stop()
    // Rejects if there was any error shutting down the TCP server or
    // peerconnection.
    private onceStopped_ :Promise<void>;
    public onceStopped = () : Promise<void> => { return this.onceStopped_; }

    // Message handler queues to/from the peer.
    public signalsForPeer :Handler.Queue<WebRtc.SignallingMessage, void> =
        new Handler.Queue<WebRtc.SignallingMessage,void>();

    // The two Queues below only count bytes transferred between the SOCKS
    // client and the remote host(s) the client wants to connect to. WebRTC
    // overhead (DTLS headers, ICE initiation, etc.) is not included (because
    // WebRTC does not provide easy access to that data) nor is SOCKS
    // protocol-related data (because it's sent via string messages).
    // All Sessions created in one instance of SocksToRtc will share and
    // push numbers to the same queues (belonging to that instance of SocksToRtc).
    // Queue of the number of bytes received from the peer. Handler is typically
    // defined in the class that creates an instance of SocksToRtc.
    public bytesReceivedFromPeer :Handler.Queue<number, void> =
        new Handler.Queue<number, void>();

    // Queue of the number of bytes sent to the peer. Handler is typically
    // defined in the class that creates an instance of SocktsToRtc.
    public bytesSentToPeer :Handler.Queue<number,void> =
        new Handler.Queue<number, void>();

    // Tcp server that is listening for SOCKS connections.
    private tcpServer_       :Tcp.Server = null;

    // The connection to the peer that is acting as the endpoint for the proxy
    // connection.
    private peerConnection_  :freedom_UproxyPeerConnection.Pc = null;

    // From WebRTC data-channel labels to their TCP connections. Most of the
    // wiring to manage this relationship happens via promises of the
    // TcpConnection. We need this only for data being received from a peer-
    // connection data channel get raised with data channel label.  TODO:
    // https://github.com/uProxy/uproxy/issues/315 when closed allows
    // DataChannel and PeerConnection to be used directly and not via a freedom
    // interface. Then all work can be done by promise binding and this can be
    // removed.
    private sessions_ :{ [channelLabel:string] : Session } = {};

    // As configure() but handles creation of a TCP server and peerconnection.
    constructor(
        endpoint?:Net.Endpoint,
        pcConfig?:WebRtc.PeerConnectionConfig,
        obfuscate?:boolean) {
      if (endpoint) {
        this.start(
            new Tcp.Server(endpoint, this.makeTcpToRtcSession),
            obfuscate ?
              freedom.churn(pcConfig) :
              freedom['core.uproxypeerconnection'](pcConfig));
      }
    }

    // Starts the SOCKS server with the supplied TCP server and peerconnection.
    // Returns this.onceReady.
    public start = (
        tcpServer:Tcp.Server,
        peerconnection:freedom_UproxyPeerConnection.Pc)
        : Promise<Net.Endpoint> => {
      if (this.tcpServer_) {
        throw new Error('already configured');
      }
      this.tcpServer_ = tcpServer;
      this.peerConnection_ = peerconnection;

      this.peerConnection_.on('dataFromPeer', this.onDataFromPeer_);
      this.peerConnection_.on('signalForPeer', this.signalsForPeer.handle);

      // Start and listen for notifications.
      // TODO: Use tcpServer.onceConnected once it's available.
      peerconnection.negotiateConnection();
      this.onceReady = Promise.all<any>([
          tcpServer.listen(),
          peerconnection.onceConnected()
        ])
        .then((answers:any[]) => {
          return tcpServer.endpoint;
        });

      // Shutdown if startup fails, or peerconnection terminates.
      // TODO: Shutdown on TCP server termination:
      //         https://github.com/uProxy/uproxy/issues/485
      this.onceReady.catch(this.initiateShutdown_);
      peerconnection.onceDisconnected().then(this.initiateShutdown_, this.initiateShutdown_);
      this.onceStopped_ = this.onceStopping_.then(this.shutdown_);

      return this.onceReady;
    }

    // Shuts down the TCP server and peerconnection.
    // Returns onceStopped.
    public stop = () : Promise<void> => {
      this.initiateShutdown_();
      return this.onceStopped_;
    }

    // Actually shuts down the TCP server and peerconnection.
    // Gating this on the stop promise helps avoid multiple attempts
    // to shutdown.
    private shutdown_ = () : Promise<void> => {
      return Promise.all([
          this.tcpServer_.shutdown(),
          this.peerConnection_.close()])
        .then((answers:any[]) => {
          return Promise.resolve<void>();
        });
    }

    // Invoked when a SOCKS client establishes a connection with our
    // server socket.
    public makeTcpToRtcSession = (tcpConnection:Tcp.Connection) : void => {
      var session = new Session(tcpConnection, this.peerConnection_,
        this.bytesReceivedFromPeer, this.bytesSentToPeer);
      this.sessions_[session.channelLabel()] = session;
      session.onceClosed.then(() => {
        delete this.sessions_[session.channelLabel()];
      });
    }

    public handleSignalFromPeer = (signal:WebRtc.SignallingMessage)
        : void => {
      this.peerConnection_.handleSignalMessage(signal);
    }

    // Data from the remote peer over WebRtc gets sent to the
    // socket that corresponds to the channel label.
    private onDataFromPeer_ = (
        rtcData:freedom_UproxyPeerConnection.LabelledDataChannelMessage)
        : void => {
      log.debug('onDataFromPeer_: ' + JSON.stringify(rtcData));

      if(rtcData.channelLabel === '_control_') {
        log.debug('onDataFromPeer_: to _control_: ' + rtcData.message.str);
        return;
      }
      if(rtcData.message.buffer) {
        // We only count bytes sent in .buffer, not .str.
        this.bytesReceivedFromPeer.handle(rtcData.message.buffer.byteLength);
      }
      if(!(rtcData.channelLabel in this.sessions_)) {
        log.error('onDataFromPeer_: no such channel: ' + rtcData.channelLabel);
        return;
      }
      this.sessions_[rtcData.channelLabel].handleDataFromPeer(rtcData.message);
    }

    public toString = () : string => {
      var ret :string;
      var sessionsAsStrings :string[] = [];
      var label :string;
      for (label in this.sessions_) {
        sessionsAsStrings.push(this.sessions_[label].toString());
      }
      ret = JSON.stringify({ tcpServer_: this.tcpServer_.toString(),
                             sessions_: sessionsAsStrings });
      return ret;
    }
  }  // class SocksToRtc


  // A Socks sesson links a Tcp connection to a particular data channel on the
  // peer connection. CONSIDER: when we have a lightweight webrtc provider, we
  // can use the DataChannel class directly here instead of the awkward pairing
  // of peerConnection with chanelLabel.
  export class Session {
    // The channel Label is a unique id for this data channel and session.
    private channelLabel_ :string;

    // The |onceReady| promise is fulfilled when the peer sends back the
    // destination reached, and this endpoint is the fulfill value.
    public onceReady :Promise<Net.Endpoint>;
    public onceClosed :Promise<void>;

    // These are used to avoid double-closure of data channels. We don't need
    // this for tcp connections because that class already holds the open/
    // closed state.
    private dataChannelIsClosed_ :boolean;

    // We push data from the peer into this queue so that we can write the
    // receive function to get just the next bit of data from the peer. This
    // makes protocol writing much simpler. ArrayBuffers are used for data
    // being proxied, and strings are used for control information.
    private dataFromPeer_ :Handler.Queue<WebRtc.Data,void>;

    // TODO: Rather than passing a reference to the whole peerconnection, we
    //       should only pass a reference to the datachannel. We only do this
    //       because uproxypeerconnection doesn't have a dedicated datachannel
    //       object.
    constructor(private tcpConnection_:Tcp.Connection,
                private peerConnection_:freedom_UproxyPeerConnection.Pc,
                private bytesReceivedFromPeer:Handler.Queue<number,void>,
                private bytesSentToPeer:Handler.Queue<number,void>) {
      this.channelLabel_ = obtainTag();
      this.dataChannelIsClosed_ = false;
      var onceChannelOpenned :Promise<void>;
      var onceChannelClosed :Promise<void>;
      this.dataFromPeer_ = new Handler.Queue<WebRtc.Data,void>();

      // Open a data channel to the peer.
      onceChannelOpenned = this.peerConnection_.openDataChannel(
          this.channelLabel_);

      // Make sure that closing down a peer connection or a tcp connection
      // results in the session being closed down appropriately.
      onceChannelClosed = this.peerConnection_
          .onceDataChannelClosed(this.channelLabel_);
      onceChannelClosed.then(this.close);
      this.tcpConnection_.onceClosed.then(this.close);

      this.onceClosed = Promise.all<any>(
          [this.tcpConnection_.onceClosed, onceChannelClosed]).then(() => {});

      // The session is ready after: 1. the auth handskhape, 2. after the peer-
      // to-peer data channel is open, and 3. after we have done the request
      // handshape with the peer (and the peer has completed the TCP connection
      // to the remote site).
      this.onceReady = this.doAuthHandshake_()
          .then(() => { return onceChannelOpenned; })
          .then(this.doRequestHandshake_);
      // Only after all that can we simply pass data back and forth.
      this.onceReady.then(() => { this.linkTcpAndPeerConnectionData_(); });
    }

    public longId = () : string => {
      var tcp :string = '?';
      if(this.tcpConnection_) {
        tcp = this.tcpConnection_.connectionId + (this.tcpConnection_.isClosed() ? '.c' : '.o');
      }
      return tcp + '-' + this.channelLabel_ +
          (this.dataChannelIsClosed_ ? '.c' : '.o') ;
    }

    // Close the session.
    public close = () : Promise<void> => {
      log.debug(this.longId() + ': close');
      if(!this.tcpConnection_.isClosed()) {
        this.tcpConnection_.close();
      }
      // Note: closing the tcp connection should raise an event to close the
      // data channel. But we can start closing it down now anyway (faster,
      // more readable code).
      if(!this.dataChannelIsClosed_) {
        this.peerConnection_.closeDataChannel(this.channelLabel_);
        this.dataChannelIsClosed_ = true;
      }
      return this.onceClosed;
    }

    public handleDataFromPeer = (data:WebRtc.Data) : void => {
      this.dataFromPeer_.handle(data);
    }

    public channelLabel = () : string => {
      return this.channelLabel_;
    }

    public toString = () : string => {
      return JSON.stringify({
        channelLabel_: this.channelLabel_,
        dataChannelIsClosed_: this.dataChannelIsClosed_,
        tcpConnection: this.tcpConnection_.toString()
      });
    }

    // Receive a socks connection and send the initial Auth messages.
    // Assumes: no packet fragmentation.
    // TODO: handle packet fragmentation:
    //   https://github.com/uProxy/uproxy/issues/323
    private doAuthHandshake_ = ()
        : Promise<void> => {
      return this.tcpConnection_.receiveNext()
        .then(Socks.interpretAuthHandshakeBuffer)
        .then((auths:Socks.Auth[]) => {
          this.tcpConnection_.send(
              Socks.composeAuthResponse(Socks.Auth.NOAUTH));
        });
    }

    // Sets the next data hanlder to get next data from peer, assuming it's
    // stringified version of the destination.
    private receiveEndpointFromPeer_ = () : Promise<Net.Endpoint> => {
      return new Promise((F,R) => {
        this.dataFromPeer_.setSyncNextHandler((data:WebRtc.Data) => {
          if (!data.str) {
            R(new Error(this.longId() + ': receiveEndpointFromPeer_: ' +
                'got non-string data: ' + JSON.stringify(data)));
            return;
          }
          var endpoint :Net.Endpoint;
          try { endpoint = JSON.parse(data.str); }
          catch(e) {
            R(new Error(this.longId() + ': receiveEndpointFromPeer_: ' +
                ') passDataToTcp: got bad JSON data: ' + data.str));
            return;
          }
          // CONSIDER: do more sanitization of the data passed back?
          F(endpoint);
          return;
        });
      });
    }

    // Assumes that |doAuthHandshake_| has completed and that a peer-conneciton
    // has been established. Promise returns the destination site connected to.
    private doRequestHandshake_ = ()
        : Promise<Net.Endpoint> => {
      return this.tcpConnection_.receiveNext()
        .then(Socks.interpretRequestBuffer)
        .then((request:Socks.Request) => {
          this.peerConnection_.send(this.channelLabel_,
                                    { str: JSON.stringify(request) });
          return this.receiveEndpointFromPeer_();
        })
        .then((endpoint:Net.Endpoint) => {
          // TODO: test and close: https://github.com/uProxy/uproxy/issues/324
          this.tcpConnection_.send(Socks.composeRequestResponse(endpoint));
          return endpoint;
        });
    }

    // Assumes that |doRequestHandshake_| has completed (and in particular,
    // that tcpConnection is defined.)
    private linkTcpAndPeerConnectionData_ = () : void => {
      // Any further data just goes to the target site.
      this.tcpConnection_.dataFromSocketQueue.setSyncHandler(
          (data:ArrayBuffer) => {
        log.debug(this.longId() + ': dataFromSocketQueue: ' + data.byteLength + ' bytes.');
        this.peerConnection_.send(this.channelLabel_, { buffer: data });
        this.bytesSentToPeer.handle(data.byteLength);
      });
      // Any data from the peer goes to the TCP connection
      this.dataFromPeer_.setSyncHandler((data:WebRtc.Data) => {
        if (!data.buffer) {
          log.error(this.longId() + ': dataFromPeer: ' +
              'got non-buffer data: ' + JSON.stringify(data));
          return;
        }
        log.debug(this.longId() + ': dataFromPeer: ' + data.buffer.byteLength +
            ' bytes.');
        this.tcpConnection_.send(data.buffer);
      });
    }
  }  // Session

}  // module SocksToRtc
