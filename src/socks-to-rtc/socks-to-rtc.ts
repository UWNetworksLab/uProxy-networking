// SocksToRtc.Peer passes socks requests over WebRTC datachannels.

/// <reference path='../socks-common/socks-headers.d.ts' />
/// <reference path='../logging/logging.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../handler/queue.d.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path="../churn/churn.d.ts" />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

module SocksToRtc {
  var log :Logging.Log = new Logging.Log('SocksToRtc');

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
    public signalsForPeer :Handler.Queue<WebRtc.SignallingMessage, void>;

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
    private tcpServer_       :Tcp.Server;

    // The connection to the peer that is acting as the endpoint for the proxy
    // connection.
    private peerConnection_  :WebRtc.PeerConnection;

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
            new Tcp.Server(endpoint),
            obfuscate ?
              new Churn.Connection(pcConfig) :
              new WebRtc.PeerConnection(pcConfig));
      }
    }

    // Starts the SOCKS server with the supplied TCP server and peerconnection.
    // Returns this.onceReady.
    public start = (
        tcpServer:Tcp.Server,
        peerconnection:WebRtc.PeerConnectionInterface)
        : Promise<Net.Endpoint> => {
      if (this.tcpServer_) {
        throw new Error('already configured');
      }
      this.tcpServer_ = tcpServer;
      this.tcpServer_.connectionsQueue
          .setSyncHandler(this.makeTcpToRtcSession);
      this.peerConnection_ = peerconnection;

      this.signalsForPeer = this.peerConnection_.signalForPeerQueue;

      // Start and listen for notifications.
      peerconnection.negotiateConnection();
      this.onceReady =
        Promise.all<any>([
          tcpServer.listen(),
          peerconnection.onceConnected
        ])
        .then((answers:any[]) => {
          return tcpServer.onceListening();
        });

      // Shutdown if startup fails or when the server socket or
      // peerconnection terminates.
      this.onceReady.catch(this.fulfillStopping_);
      this.tcpServer_.onceShutdown()
        .then(() => {
          log.debug('server socket closed');
        }, (e:Error) => {
          log.error('server socket closed with error: %1', [e.message]);
        })
        .then(this.fulfillStopping_);
      this.peerConnection_.onceDisconnected
        .then(() => {
          log.debug('peerconnection terminated');
        }, (e:Error) => {
          log.error('peerconnection terminated with error: %1', [e.message]);
        })
        .then(this.fulfillStopping_);
      this.onceStopped_ = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    // Initiates shutdown of the TCP server and peerconnection.
    // Returns onceStopped.
    public stop = () : Promise<void> => {
      log.debug('stop requested');
      this.fulfillStopping_();
      return this.onceStopped_;
    }

    // Shuts down the TCP server and peerconnection if they haven't already
    // shut down, fulfilling once both have terminated. Since neither
    // object's close() methods should ever reject, this should never reject.
    // TODO: close all sessions before fulfilling
    private stopResources_ = () : Promise<void> => {
      log.debug('freeing resources');
      // PeerConnection.close() returns void, implying that the shutdown is
      // effectively immediate.  However, we wrap it in a promise to ensure
      // that any exception is sent to the Promise.catch, rather than
      // propagating synchronously up the stack.
      return Promise.all(<Promise<any>[]>[
        new Promise((F, R) => { this.peerConnection_.close(); F(); }),
        this.tcpServer_.shutdown()
      ]).then((discard:any) => {});
    }

    // Invoked when a SOCKS client establishes a connection with the TCP server.
    // Note that Session closes the TCP connection and datachannel on any error.
    public makeTcpToRtcSession = (tcpConnection:Tcp.Connection) : void => {
      var tag = obtainTag();
      log.info('created new session %1', [tag]);

	    this.peerConnection_.openDataChannel(tag).then((channel:WebRtc.DataChannel) => {
        log.debug('opened datachannel for session %1', [tag]);
        var session = new Session();
        session.start(
            tcpConnection,
            channel,
            this.bytesSentToPeer,
            this.bytesReceivedFromPeer)
        .then((endpoint:Net.Endpoint) => {
          log.debug('session %1 connected to remote endpoint %2', [
              tag, JSON.stringify(endpoint)]);
          this.sessions_[tag] = session;
        }, (e:Error) => {
          log.warn('session %1 failed to connect to remote endpoint: %2', [
              tag, e.message]);
        });

        var discard = () => {
          delete this.sessions_[tag];
          log.info('discarded session %1 (%2 remaining)', [
              tag, Object.keys(this.sessions_).length]);
        };
        session.onceStopped.then(discard, (e:Error) => {
          log.error('session %1 terminated with error: %2', [
              tag, e.message]);
          discard();
        });
      }, (e:Error) => {
        log.error('failed to open datachannel for session %1: %2 ', [tag, e.message]);
      });
    }

    public handleSignalFromPeer = (signal:WebRtc.SignallingMessage)
        : void => {
      this.peerConnection_.handleSignalMessage(signal);
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
    private tcpConnection_ :Tcp.Connection;
    private dataChannel_ :WebRtc.DataChannel;
    private bytesSentToPeer_ :Handler.Queue<number,void>;
    private bytesReceivedFromPeer_ :Handler.Queue<number,void>;

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

    // The supplied TCP connection and datachannel must already be
    // successfully established.
    // Returns onceReady.
    public start = (
        tcpConnection:Tcp.Connection,
        dataChannel:WebRtc.DataChannel,
        bytesSentToPeer:Handler.Queue<number,void>,
        bytesReceivedFromPeer:Handler.Queue<number,void>)
        : Promise<Net.Endpoint> => {
      this.tcpConnection_ = tcpConnection;
      this.dataChannel_ = dataChannel;
      this.bytesSentToPeer_ = bytesSentToPeer;
      this.bytesReceivedFromPeer_ = bytesReceivedFromPeer;

      // Startup notifications.
      this.onceReady = this.doAuthHandshake_().then(this.doRequestHandshake_);
      this.onceReady.then(this.linkTcpAndPeerConnectionData_);

      // Shutdown once TCP connection or datachannel terminate.
      this.onceReady.catch(this.fulfillStopping_);
      Promise.race<any>([
          tcpConnection.onceClosed.then((kind:Tcp.SocketCloseKind) => {
            log.debug('%1: client socket closed (%2)', [
                this.longId(), Tcp.SocketCloseKind[kind] || 'unknown reason']);
          }),
          dataChannel.onceClosed.then(() => {
            log.debug('%1: datachannel closed', [this.longId()]);
          })])
        .then(this.fulfillStopping_);
      this.onceStopped = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    public longId = () : string => {
      return 'session ' + this.channelLabel() + ' (TCP '
          + (this.tcpConnection_.isClosed() ? 'closed' : 'open') + ')';
    }

    // Initiates shutdown of the TCP server and peerconnection.
    // Returns onceStopped.
    public stop = () : Promise<void> => {
      log.debug('%1: stop requested', [this.longId()]);
      this.fulfillStopping_();
      return this.onceStopped;
    }

    // Closes the TCP connection and datachannel if they haven't already
    // closed, fulfilling once both have closed. Since neither object's
    // close() methods should ever reject, this should never reject.
    private stopResources_ = () : Promise<void> => {
      log.debug('%1: freeing resources', [this.longId()]);
      // DataChannel.close() returns void, implying that it is
      // effectively immediate.  However, we wrap it in a promise to ensure
      // that any exception is sent to the Promise.catch, rather than
      // propagating synchronously up the stack.
      return Promise.all(<Promise<any>[]>[
        new Promise((F, R) => { this.dataChannel_.close(); F(); }),
        this.tcpConnection_.close()
      ]).then((discard:any) => {});
    }

    public channelLabel = () : string => {
      return this.dataChannel_.getLabel();
    }

    public toString = () : string => {
      return JSON.stringify({
        channelLabel_: this.channelLabel(),
        tcpConnection: this.tcpConnection_.toString()
      });
    }

    // Receive a socks connection and send the initial Auth messages.
    // Assumes: no packet fragmentation.
    // TODO: handle packet fragmentation:
    //   https://github.com/uProxy/uproxy/issues/323
    // TODO: Needs unit tests badly since it's mocked by several other tests.
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
    // TODO: Needs unit tests badly since it's mocked by several other tests.
    private receiveEndpointFromPeer_ = () : Promise<Net.Endpoint> => {
      return new Promise((F,R) => {
        this.dataChannel_.dataFromPeerQueue.setSyncNextHandler((data:WebRtc.Data) => {
          if (!data.str) {
            R(new Error('received non-string data during handshake: ' +
                JSON.stringify(data)));
            return;
          }
          var endpoint :Net.Endpoint;
          try { endpoint = JSON.parse(data.str); }
          catch(e) {
            R(new Error('received malformed endpoint during handshake: ' +
                data.str));
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
          this.dataChannel_.send({ str: JSON.stringify(request) });
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
        log.debug('%1: client socket received %2 bytes', [
            this.longId(), data.byteLength]);
        this.dataChannel_.send({ buffer: data })
        .catch((e:Error) => {
          log.error('%1: failed to send data on datachannel: %2', [
              this.longId(), e.message]);
        });
        this.bytesSentToPeer_.handle(data.byteLength);
      });
      // Any data from the peer goes to the TCP connection
      this.dataChannel_.dataFromPeerQueue.setSyncHandler((data:WebRtc.Data) => {
        if (!data.buffer) {
          log.error('%1: received non-buffer data from datachannel', [
              this.longId()]);
          return;
        }
        log.debug('%1: datachannel received %2 bytes', [
            this.longId(), data.buffer.byteLength]);
        this.bytesReceivedFromPeer_.handle(data.buffer.byteLength);
        this.tcpConnection_.send(data.buffer)
        .catch((e:Error) => {
          log.error('%1: failed to send data on client socket: %2', [
              this.longId(), e.message]);
        });
      });
    }
  }  // Session

}  // module SocksToRtc
