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
    private fulfillStopping_ :() => void;
    private onceStopping_ = new Promise((F, R) => {
      this.fulfillStopping_ = F;
    });

    // Fulfills once the SOCKS server has terminated and the TCP server
    // and peerconnection have been shutdown.
    // This can happen in response to:
    //  - startup failure
    //  - TCP server or peerconnection failure
    //  - manual invocation of stop()
    // Should never reject.
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
      this.onceReady.catch(this.fulfillStopping_);
      peerconnection.onceDisconnected().then(this.fulfillStopping_, this.fulfillStopping_);
      this.onceStopped_ = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    // Initiates shutdown of the TCP server and peerconnection.
    // Returns onceStopped.
    public stop = () : Promise<void> => {
      this.fulfillStopping_();
      return this.onceStopped_;
    }

    // Shuts down the TCP server and peerconnection, fulfilling once both
    // have terminated. Since neither objects' close() methods should ever
    // reject, this should never reject.
    private stopResources_ = () : Promise<void> => {
      return Promise.all([
          // This call isn't explicitly idempodent but TCP server currently
          // has no way to query whether it's been shutdown (and we only
          // attempt to call this once).
          this.tcpServer_.shutdown(),
          // This call is explicitly idempodent.
          this.peerConnection_.close()])
        .then((answers:any[]) => {
          return Promise.resolve<void>();
        });
    }

    // Invoked when a SOCKS client establishes a connection with the TCP server.
    // Note that Session closes the TCP connection and datachannel on any error.
    public makeTcpToRtcSession = (tcpConnection:Tcp.Connection) : void => {
      var tag = obtainTag();
      log.debug('allocated tag ' + tag + ' for new SOCKS session');

      this.peerConnection_.openDataChannel(tag).then(() => {
        log.debug('opened datachannel for SOCKS session ' + tag);
        var session = new Session();
        this.sessions_[tag] = session;

        session.start(
            tag,
            tcpConnection,
            this.peerConnection_,
            this.bytesSentToPeer).then((endpoint:Net.Endpoint) => {
          log.debug('negotiated SOCKS session ' + tag);
        }, (e:Error) => {
          log.warn('could not negotiate SOCKS session ' + tag + ': ' + e.message);
        });

        var discard = () => {
          delete this.sessions_[tag];
          log.debug('discarded SOCKS session ' + tag + ' (' +
              Object.keys(this.sessions_).length + ' sessions remaining)');
        };
        session.onceStopped.then(discard, (e:Error) => {
          log.warn('SOCKS session ' + tag + ' closed with error: ' + e.message);
          discard();
        });
      }, (e:Error) => {
        log.error('could not open datachannel for SOCKS session ' + tag +
            ': ' + e.message);
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
    private channelLabel_ :string;
    private tcpConnection_ :Tcp.Connection;
    private peerConnection_ :freedom_UproxyPeerConnection.Pc;
    private bytesSentToPeer_ :Handler.Queue<number,void>;

    // Fulfills with the address on which RtcToNet is connecting to the
    // remote host. Rejects if RtcToNet could not connect to the remote host
    // or if there is some error negotiating the SOCKS session.
    public onceReady :Promise<Net.Endpoint>;

    // Call this to initiate shutdown.
    private fulfillStopping_ :() => void;
    private onceStopping_ = new Promise((F, R) => {
      this.fulfillStopping_ = F;
    });

    // Fulfills once the SOCKS session has terminated and the TCP connection
    // and datachannel have been shutdown.
    // This can happen in response to:
    //  - startup (negotiation) failure
    //  - TCP connection or datachannel termination
    //  - manual invocation of stop()
    // Should never reject.
    public onceStopped :Promise<void>;

    // We push data from the peer into this queue so that we can write the
    // receive function to get just the next bit of data from the peer. This
    // makes protocol writing much simpler. ArrayBuffers are used for data
    // being proxied, and strings are used for control information.
    private dataFromPeer_ :Handler.Queue<WebRtc.Data,void> =
        new Handler.Queue<WebRtc.Data,void>();

    // The supplied TCP connection and datachannel must already be
    // successfully established.
    // Returns onceReady.
    // TODO: Rather than passing a reference to the whole peerconnection, we
    //       should only pass a reference to the datachannel.
    public start = (
        channelLabel:string,
        tcpConnection:Tcp.Connection,
        peerConnection:freedom_UproxyPeerConnection.Pc,
        bytesSentToPeer:Handler.Queue<number,void>)
        : Promise<Net.Endpoint> => {
      this.channelLabel_ = channelLabel;
      this.tcpConnection_ = tcpConnection;
      this.peerConnection_ = peerConnection;
      this.bytesSentToPeer_ = bytesSentToPeer;

      // Startup notifications.
      this.onceReady = this.doAuthHandshake_().then(this.doRequestHandshake_);
      this.onceReady.then(this.linkTcpAndPeerConnectionData_);

      // Shutdown once TCP connection or datachannel terminate.
      this.onceReady.catch(this.fulfillStopping_);
      Promise.race<any>([
          tcpConnection.onceClosed,
          peerConnection.onceDataChannelClosed(channelLabel)])
        .then(this.fulfillStopping_);
      this.onceStopped = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    public longId = () : string => {
      return 'session ' + this.channelLabel_ + ' (TCP connection ' +
          (this.tcpConnection_.isClosed() ? 'closed' : 'open') + ') ';
    }

    // Initiates shutdown of the TCP server and peerconnection.
    // Returns onceStopped.
    public stop = () : Promise<void> => {
      this.fulfillStopping_();
      return this.onceStopped;
    }

    // Closes the TCP connection and datachannel, fulfilling once both
    // have closed. Since neither objects' close() methods should ever
    // reject, this should never reject.
    private stopResources_ = () : Promise<void> => {
      var shutdownPromises :Promise<any>[] = [];
      // TCP connection closure is logically idempodent but prints
      // a warning if close is called when the connection has already
      // closed.
      if (!this.tcpConnection_.isClosed()) {
        shutdownPromises.push(this.tcpConnection_.close());
      }
      // Under the hood, datachannel closure is idempodent (and synchronous,
      // it's uproxypeerconnection pretends it's async):
      //   http://w3c.github.io/webrtc-pc/#dom-datachannel-close
      shutdownPromises.push(
          this.peerConnection_.closeDataChannel(this.channelLabel_));
      return Promise.all(shutdownPromises).then((answers:any[]) => {
        return Promise.resolve<void>();
      });
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

    // Assumes that |doRequestHandshake_| has completed.
    private linkTcpAndPeerConnectionData_ = () : void => {
      // Any further data just goes to the target site.
      this.tcpConnection_.dataFromSocketQueue.setSyncHandler(
          (data:ArrayBuffer) => {
        log.debug(this.longId() + ': dataFromSocketQueue: ' + data.byteLength + ' bytes.');
        this.peerConnection_.send(this.channelLabel_, { buffer: data });
        this.bytesSentToPeer_.handle(data.byteLength);
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
