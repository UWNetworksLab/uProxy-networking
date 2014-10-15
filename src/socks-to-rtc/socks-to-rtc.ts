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

    // Fulfills once the TCP socket is listening for connections and a
    // peerconnection has been successfully established. Rejects if either
    // socket or peerconnection setup fails. On rejection, stop() will be
    // called.
    private onceStarted_ :Promise<void>;
    public onceStarted = () : Promise<void> => { return this.onceStarted_; }

    // As onceStarted(), but reports the address on which the server
    // is listening for connections.
    // TODO: Remove this public field in favour of onceStarted() and a
    //       getEndpoint()-type method
    public onceReady :Promise<Net.Endpoint>;

    // Fulfills once the TCP socket has closed or the peerconnection
    // has terminated *and* there is subsequently no error closing the
    // socket or the peerconnection (if an error is encountered at this
    // stage, this rejects).
    // Behaviour is undefined if onceStarted() has rejected so do not
    // rely on this promise unless startup has succeeded.
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

    // Creates a new SOCKS server running on the specified address.
    // A TCP server and peerconnection, configured with the supplied endpoint
    // and config, are constructed.
    // If the endpoint is undefined, the caller must manually configure the
    // server; this is only intended for unit tests.
    // TODO: Replace this with a static constructor.
    constructor(
        endpoint?:Net.Endpoint,
        pcConfig?:WebRtc.PeerConnectionConfig,
        obfuscate?:boolean) {
      if (endpoint) {
        this.setResources(
            new Tcp.Server(endpoint, this.makeTcpToRtcSession),
            obfuscate ?
              freedom.churn(pcConfig) :
              freedom['core.uproxypeerconnection'](pcConfig));
        this.configure();
      }
    }

    // Sets the TCP server and peerconnection to be used by this SOCKS server.
    // After setting these, configure() should be called.
    // This method is intended for use by unit tests.
    public setResources(
        tcpServer:Tcp.Server,
        peerconnection:freedom_UproxyPeerConnection.Pc)
        : void {
      if (this.tcpServer_) {
        throw new Error('resources already set');
      }
      this.tcpServer_ = tcpServer;
      this.peerConnection_ = peerconnection;
    }

    // Configures the SOCKS server to use the TCP server and peerconnection.
    // setResources() should have been called first.
    // This method is intended for use by unit tests.
    public configure() : void {
      if (this.tcpServer_ === undefined) {
        throw new Error('must set resources before configuring');
      }
      this.setResources(this.tcpServer_, this.peerConnection_);

      this.peerConnection_.on('dataFromPeer', this.onDataFromPeer_);
      this.peerConnection_.on('signalForPeer', this.signalsForPeer.handle);

      // TODO: Integration tests for these objects' startup behaviours.
      this.makeOnceStarted(
          this.tcpServer_.listen(),
          this.peerConnection_.negotiateConnection());

      // TODO: Integration tests for these objects' termination behaviours.
      this.makeOnceStopped(
          // TCP server has no onceDisconnected()-type method!
          // So, supply a dummy promise that neither resolves nor rejects.
          new Promise((F, R) => {}),
          this.peerConnection_.onceDisconnected());

      this.onceReady = this.onceStarted_.then(() => {
        return {
          address: this.tcpServer_.endpoint.address,
          port: this.tcpServer_.endpoint.port
        };
      });
    }

    // Configures onceStarted_, given two other promises:
    //  - serverReady must fulfill once the server is ready to accept
    //    connections and must reject if it fails to start listening
    //  - peerconnectionReady must fulfill once it has successfully connected
    //    with the remote peer and must reject if a connection cannot be
    //    established
    //
    // Public for unit tests, so that startup failures can be easily simulated.
    public makeOnceStarted(
        serverReady:Promise<any>,
        peerconnectionReady:Promise<any>)
        : void {
      if (this.onceStarted_) {
        throw new Error('onceStarted_ already set');
      }
      this.onceStarted_ = Promise.all([
          serverReady,
          peerconnectionReady])
        .then((answers:any[]) => {
          return Promise.resolve<void>();
        });
      this.onceStarted_.catch(this.stop);
    }

    // Configures onceStopped_, given two other promises:
    //  - serverTerminated must fulfill if the server dies for any
    //    reason, its socket's network interface disappears
    //  - peerconnectionTerminated must fulfill if the peerconnection
    //    is terminated for any reason
    //
    // Public for unit tests, so that termination failures can be easily
    // simulated.
    public makeOnceStopped(
        serverTerminated:Promise<any>,
        peerconnectionTerminated:Promise<any>)
        : void {
      if (this.onceStopped_) {
        throw new Error('onceStopped_ already set');
      }
      this.onceStopped_ = Promise.race([
          serverTerminated,
          peerconnectionTerminated])
        .then(this.stop);
    }

    // Stops accepting TCP connections and closes the peerconnection.
    // Fulfills if both TCP server and peerconnection terminate normally,
    // otherwise rejects.
    // The SOCKS server cannot be used once this method has been invoked.
    public stop = () : Promise<void> => {
      // TODO: Integration tests for these objects' stop()-like methods.
      return Promise.all([
          this.tcpServer_.shutdown(),
          this.peerConnection_.close()])
        .then((answers:any[]) => {
          return Promise.resolve();
        }, (e:Error) => {
          return Promise.reject(e);
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

    constructor(public tcpConnection:Tcp.Connection,
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
      this.tcpConnection.onceClosed.then(this.close);

      this.onceClosed = Promise.all<any>(
          [this.tcpConnection.onceClosed, onceChannelClosed]).then(() => {});

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
      if(this.tcpConnection) {
        tcp = this.tcpConnection.connectionId + (this.tcpConnection.isClosed() ? '.c' : '.o');
      }
      return tcp + '-' + this.channelLabel_ +
          (this.dataChannelIsClosed_ ? '.c' : '.o') ;
    }

    // Close the session.
    public close = () : Promise<void> => {
      log.debug(this.longId() + ': close');
      if(!this.tcpConnection.isClosed()) {
        this.tcpConnection.close();
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
        tcpConnection: this.tcpConnection.toString()
      });
    }

    // Receive a socks connection and send the initial Auth messages.
    // Assumes: no packet fragmentation.
    // TODO: handle packet fragmentation:
    //   https://github.com/uProxy/uproxy/issues/323
    private doAuthHandshake_ = ()
        : Promise<void> => {
      return this.tcpConnection.receiveNext()
        .then(Socks.interpretAuthHandshakeBuffer)
        .then((auths:Socks.Auth[]) => {
          this.tcpConnection.send(
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
      return this.tcpConnection.receiveNext()
        .then(Socks.interpretRequestBuffer)
        .then((request:Socks.Request) => {
          this.peerConnection_.send(this.channelLabel_,
                                    { str: JSON.stringify(request) });
          return this.receiveEndpointFromPeer_();
        })
        .then((endpoint:Net.Endpoint) => {
          // TODO: test and close: https://github.com/uProxy/uproxy/issues/324
          this.tcpConnection.send(Socks.composeRequestResponse(endpoint));
          return endpoint;
        });
    }

    // Assumes that |doRequestHandshake_| has completed (and in particular,
    // that tcpConnection is defined.)
    private linkTcpAndPeerConnectionData_ = () : void => {
      // Any further data just goes to the target site.
      this.tcpConnection.dataFromSocketQueue.setSyncHandler(
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
        this.tcpConnection.send(data.buffer);
      });
    }
  }  // Session

}  // module SocksToRtc
