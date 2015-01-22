// Server which handles SOCKS connections over WebRTC datachannels.

/// <reference path='../socks-common/socks-headers.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../handler/queue.d.ts' />
/// <reference path='../logging/logging.d.ts' />
/// <reference path='../ipaddrjs/ipaddrjs.d.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path="../churn/churn.d.ts" />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

module RtcToNet {

  var log :Logging.Log = new Logging.Log('RtcToNet');

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
    public signalsForPeer :Handler.Queue<WebRtc.SignallingMessage, void>;

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
    private peerConnection_  :WebRtc.PeerConnection = null;

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
                new Churn.Connection(pcConfig) :
                new WebRtc.PeerConnection(pcConfig));
      }
    }

    // Starts with the supplied peerconnection.
    // Returns this.onceReady.
    public start = (
        proxyConfig:ProxyConfig,
        peerconnection:WebRtc.PeerConnection)
        : Promise<void> => {
      if (this.peerConnection_) {
        throw new Error('already configured');
      }
      this.proxyConfig = proxyConfig;
      this.peerConnection_ = peerconnection;

      this.signalsForPeer = this.peerConnection_.signalForPeerQueue;
      this.peerConnection_.peerOpenedChannelQueue.setSyncHandler(
          this.onPeerOpenedChannel_);

      // TODO: this.onceReady should reject if |this.onceStopping_|
      // fulfills first.  https://github.com/uProxy/uproxy/issues/760
      this.onceReady = this.peerConnection_.onceConnected.then(() => {});
      this.onceReady.catch(this.fulfillStopping_);
      this.peerConnection_.onceDisconnected
          .then(this.fulfillStopping_, this.fulfillStopping_);
      this.onceClosed = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    private onPeerOpenedChannel_ = (channel:WebRtc.DataChannel) => {
      var channelLabel = channel.getLabel();
      log.debug('creating new session for channel ' + channelLabel);

      var session = new Session(
          channel,
          this.proxyConfig,
          this.bytesReceivedFromPeer,
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

    // Shuts down the peerconnection, fulfilling once it has terminated.
    // Since its close() method should never throw, this should never reject.
    // TODO: close all sessions before fulfilling
    private stopResources_ = () : Promise<void> => {
      return new Promise<void>((F, R) => { this.peerConnection_.close(); F(); });
    }

    public handleSignalFromPeer = (signal:WebRtc.SignallingMessage) : void => {
      this.peerConnection_.handleSignalMessage(signal);
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

    // Getters.
    public channelLabel = () : string => { return this.dataChannel_.getLabel(); }

    // The supplied datachannel must already be successfully established.
    constructor(
        private dataChannel_:WebRtc.DataChannel,
        private proxyConfig_:ProxyConfig,
        private bytesReceivedFromPeer_:Handler.Queue<number,void>,
        private bytesSentToPeer_:Handler.Queue<number,void>) {}

    // Returns onceReady.
    public start = () : Promise<void> => {
      this.onceReady = this.receiveEndpointFromPeer_()
        .then(this.getTcpConnection_,
            (e:Error) => {
          this.replyToPeer_(Socks.Reply.UNSUPPORTED_COMMAND);
          throw e;
        }).then((tcpConnection:Tcp.Connection) => {
          this.tcpConnection_ = tcpConnection;
          // Shutdown once the TCP connection terminates.
          this.tcpConnection_.onceClosed.then(this.fulfillStopping_);
          return this.tcpConnection_.onceConnected;
        })
        .then(this.reportSuccessToPeer_, this.reportFailureToPeer_);
      this.onceReady.then(this.linkTcpAndPeerConnectionData_);

      this.onceReady.catch(this.fulfillStopping_);
      this.dataChannel_.onceClosed.then(this.fulfillStopping_);
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
    // closed, fulfilling once both have closed. Since neither object's
    // close() methods should ever reject, this should never reject.
    private stopResources_ = () : Promise<void> => {
      // DataChannel.close() returns void, implying that the shutdown is
      // effectively immediate.  However, we wrap it in a promise to ensure
      // that any exception is sent to the Promise.catch, rather than
      // propagating synchronously up the stack.
      var shutdownPromises :Promise<any>[] = [
        new Promise((F, R) => { this.dataChannel_.close(); F(); })
      ];
      if (this.tcpConnection_) {
        shutdownPromises.push(this.tcpConnection_.close());
      }
      return Promise.all(shutdownPromises).then((discard:any) => {});
    }

    // Fulfills with the endpoint requested by the SOCKS client.
    // Rejects if the received message is not for an endpoint
    // or if the received endpoint cannot be parsed.
    // TODO: needs tests (mocked by several tests)
    private receiveEndpointFromPeer_ = () : Promise<Net.Endpoint> => {
      return new Promise((F,R) => {
        this.dataChannel_.dataFromPeerQueue.setSyncNextHandler((data:WebRtc.Data) => {
          if (!data.str) {
            R(new Error('endpoint message must be a str'));
            return;
          }
          try {
            var r :any = JSON.parse(data.str);
            if (!Socks.isValidRequest(r)) {
              R(new Error('invalid request: ' + data.str));
              return;
            }
            var request :Socks.Request = r;
            if (request.command != Socks.Command.TCP_CONNECT) {
              R(new Error('unexpected type for endpoint message'));
              return;
            }
            F(request.endpoint);
            return;
          } catch (e) {
            R(new Error('could not parse requested endpoint: ' + e.message));
            return;
          }
        });
      });
    }

    private getTcpConnection_ = (endpoint:Net.Endpoint) : Tcp.Connection => {
      if (ipaddr.isValid(endpoint.address) &&
          !this.isAllowedAddress_(endpoint.address)) {
        this.replyToPeer_(Socks.Reply.NOT_ALLOWED);
        throw new Error('Tried to connect to disallowed address: ' +
                        endpoint.address);
      }
      return new Tcp.Connection({endpoint: endpoint});
    }

    // Fulfills once the connected endpoint has been returned to the SOCKS client.
    // Rejects if the endpoint cannot be sent to the SOCKS client.
    private replyToPeer_ = (reply:Socks.Reply, info?:Tcp.ConnectionInfo)
        : Promise<void> => {
      var fakeBoundAddress :Net.Endpoint = {
        address: '0.0.0.0',
        port: 0
      };
      var boundAddress = info ? info.bound : fakeBoundAddress;
      var response :Socks.Response = {
        reply: reply,
        endpoint: boundAddress
      };
      return this.dataChannel_.send({
        str: JSON.stringify(response)
      }).then(() => {
        if (reply != Socks.Reply.SUCCEEDED) {
          this.stop();
        }
      });
    }

    private reportSuccessToPeer_ = (info:Tcp.ConnectionInfo)
        : Promise<void> => {
      // TODO: This code should really return Socks.Reply.NOT_ALLOWED,
      // but due to port-scanning concerns we return a generic error instead.
      // See https://github.com/uProxy/uproxy/issues/809
      var reply :Socks.Reply = this.isAllowedAddress_(info.remote.address) ?
          Socks.Reply.SUCCEEDED : Socks.Reply.FAILURE;
      return this.replyToPeer_(reply, info);
    }

    private reportFailureToPeer_ = (e:any) : Promise<void> => {
      var reply :Socks.Reply = Socks.Reply.FAILURE;
      if (e.errcode == 'TIMED_OUT') {
        reply = Socks.Reply.TTL_EXPIRED;
      } else if (e.errcode == 'NETWORK_CHANGED') {
        reply = Socks.Reply.NETWORK_UNREACHABLE;
      } else if (e.errcode == 'CONNECTION_RESET' ||
                 e.errcode == 'CONNECTION_REFUSED') {
        // Due to port-scanning concerns, we return a generic error if the user
        // has blocked local network access and we are not sure if the requested
        // address might be on the local network.
        // See https://github.com/uProxy/uproxy/issues/809
        if (this.proxyConfig_.allowNonUnicast) {
          reply = Socks.Reply.CONNECTION_REFUSED;
        }
      }
      // TODO: report ConnectionInfo in cases where a port was bound.
      // Blocked by https://github.com/uProxy/uproxy/issues/803
      return this.replyToPeer_(reply);
    }

    // Assumes that |receiveEndpointFromPeer| and |getTcpConnection_|
    // have completed.
    private linkTcpAndPeerConnectionData_ = () : void => {
      // Data from the TCP socket goes to the data channel.
      this.tcpConnection_.dataFromSocketQueue.setSyncHandler((buffer) => {
        log.debug(this.longId() + ': passing on data from tcp connection to pc (' +
            buffer.byteLength + ' bytes)');
        this.dataChannel_.send({buffer: buffer})
          .catch((e:Error) => {
            log.error('error forwarding received TCP data to peerconnection: ' + e.message);
          });
        this.bytesSentToPeer_.handle(buffer.byteLength);
      });
      // Data from the datachannel goes to the TCP socket.
      this.dataChannel_.dataFromPeerQueue.setSyncHandler((data:WebRtc.Data) => {
        if (!data.buffer) {
          log.error(this.longId() + ': dataFromPeer: ' +
              'got non-buffer data: ' + JSON.stringify(data));
          return;
        }
        log.debug(this.longId() + ': dataFromPeer: ' + data.buffer.byteLength + ' bytes.');
        this.bytesReceivedFromPeer_.handle(data.buffer.byteLength);
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
      return 'session ' + this.channelLabel() + ' (TCP connection ' +
          (this.tcpConnection_.isClosed() ? 'closed' : 'open') + ') ';
    }

    // For logging/debugging.
    public toString = () : string => {
      var tcpString = 'undefined';
      if (this.tcpConnection_) {
        tcpString = this.tcpConnection_.toString();
      }
      return JSON.stringify({
        channelLabel_: this.channelLabel(),
        tcpConnection: tcpString
      });
    }
  }  // Session

}  // module RtcToNet
