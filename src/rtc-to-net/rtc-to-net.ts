// Server which handles SOCKS connections over WebRTC datachannels and send them
// out to the internet and sending back over WebRTC the responses.

/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../build/third_party/freedom-typings/freedom-module-env.d.ts' />
/// <reference path='../../build/third_party/ipaddrjs/ipaddrjs.d.ts' />

import ipaddr = require('ipaddr');

import freedomTypes = require('freedom.types');

import arraybuffers = require('../../build/dev/arraybuffers/arraybuffers');
import peerconnection = require('../../build/dev/webrtc/peerconnection');
import handler = require('../../build/dev/handler/queue');

import churn = require('../churn/churn');
import net = require('../net/net.types');
import tcp = require('../net/tcp');
import socks = require('../socks-common/socks-headers');

import logging = require('../../build/dev/logging/logging');

module RtcToNet {

  var log :logging.Log = new logging.Log('RtcToNet');

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
    public signalsForPeer :handler.QueueHandler<peerconnection.SignallingMessage, void>;

    // The two Queues below only count bytes transferred between the SOCKS
    // client and the remote host(s) the client wants to connect to. WebRTC
    // overhead (DTLS headers, ICE initiation, etc.) is not included (because
    // WebRTC does not provide easy access to that data) nor is SOCKS
    // protocol-related data (because it's sent via string messages).
    // All Sessions created in one instance of RtcToNet will share and
    // push numbers to the same queues (belonging to that instance of RtcToNet).
    // Queue of the number of bytes received from the peer. Handler is typically
    // defined in the class that creates an instance of RtcToNet.
    public bytesReceivedFromPeer :handler.Queue<number, void> =
        new handler.Queue<number, void>();

    // Queue of the number of bytes sent to the peer. Handler is typically
    // defined in the class that creates an instance of RtcToNet.
    public bytesSentToPeer :handler.Queue<number, void> =
        new handler.Queue<number, void>();

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
    private peerConnection_
        :peerconnection.PeerConnection<peerconnection.SignallingMessage> = null;

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
        pcConfig?:freedom_RTCPeerConnection.RTCConfiguration,
        proxyConfig?:ProxyConfig,
        obfuscate?:boolean) {
      if (pcConfig) {
        var pc :freedom_RTCPeerConnection.RTCPeerConnection =
            freedom['core.rtcpeerconnection'](pcConfig);
        this.start(
            proxyConfig,
            obfuscate ?
                new churn.Connection(pc) :
                new peerconnection.PeerConnectionClass(pc));
      }
    }

    // Starts with the supplied peerconnection.
    // Returns this.onceReady.
    public start = (
        proxyConfig:ProxyConfig,
        peerconnection:peerconnection.PeerConnection<
          peerconnection.SignallingMessage>)
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
        .then(() => {
          log.debug('peerconnection terminated');
        }, (e:Error) => {
          log.error('peerconnection terminated with error: %1', [e.message]);
        })
        .then(this.fulfillStopping_, this.fulfillStopping_);
      this.onceClosed = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    private onPeerOpenedChannel_ = (channel:peerconnection.DataChannel) => {
      var channelLabel = channel.getLabel();
      log.info('associating session %1 with new datachannel', [channelLabel]);

      var session = new Session(
          channel,
          this.proxyConfig,
          this.bytesReceivedFromPeer,
          this.bytesSentToPeer);
      this.sessions_[channelLabel] = session;
      session.start().catch((e:Error) => {
        log.warn('session %1 failed to connect to remote endpoint: %2', [
            channelLabel, e.message]);
      });

      var discard = () => {
        delete this.sessions_[channelLabel];
        log.info('discarded session %1 (%2 remaining)', [
            channelLabel, Object.keys(this.sessions_).length]);
        };
      session.onceStopped().then(discard, (e:Error) => {
        log.info('discarded session %1 (%2 remaining)', [
            channelLabel, Object.keys(this.sessions_).length]);
        discard();
      });
    }

    // Initiates shutdown of the peerconnection.
    // Returns onceClosed.
    // TODO: rename stop, ala SocksToRtc (API breakage).
    public close = () : Promise<void> => {
      log.debug('stop requested');
      this.fulfillStopping_();
      return this.onceClosed;
    }

    // Shuts down the peerconnection, fulfilling once it has terminated.
    // Since its close() method should never throw, this should never reject.
    // TODO: close all sessions before fulfilling
    private stopResources_ = () : Promise<void> => {
      log.debug('freeing resources');
      return new Promise<void>((F, R) => { this.peerConnection_.close(); F(); });
    }

    public handleSignalFromPeer = (signal:peerconnection.SignallingMessage) : void => {
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
    private tcpConnection_ :tcp.Connection;

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
        private dataChannel_:peerconnection.DataChannel,
        private proxyConfig_:ProxyConfig,
        private bytesReceivedFromPeer_:handler.Queue<number,void>,
        private bytesSentToPeer_:handler.Queue<number,void>) {}

    // Returns onceReady.
    public start = () : Promise<void> => {
      this.onceReady = this.receiveEndpointFromPeer_()
        .then(this.getTcpConnection_, (e:Error) => {
          // TODO: Add a unit test for this case.
          this.replyToPeer_(socks.Reply.UNSUPPORTED_COMMAND);
          throw e;
        })
        .then((tcpConnection) => {
          this.tcpConnection_ = tcpConnection;
          // Shutdown once the TCP connection terminates.
          this.tcpConnection_.onceClosed.then((kind:Tcp.SocketCloseKind) => {
            log.info('%1: socket closed (%2)', [
                this.longId(),
                Tcp.SocketCloseKind[kind]]);
          })
          .then(this.fulfillStopping_);
          return this.tcpConnection_.onceConnected;
        })
        .then((info:tcp.ConnectionInfo) => {
          log.info('%1: connected to remote endpoint', [this.longId()]);
          log.debug('%1: bound address: %2', [this.longId(),
              JSON.stringify(info.bound)]);
          var reply = this.getReplyFromInfo_(info);
          this.replyToPeer_(reply, info);
        }, (e:any) => {
          // TODO: e is actually a freedom.Error (uproxy-lib 20+)
          // If this.tcpConnection_ is not defined, then getTcpConnection_
          // failed and we've already replied with UNSUPPORTED_COMMAND.
          if (this.tcpConnection_) {
            var reply = this.getReplyFromError_(e);
            this.replyToPeer_(reply);
          }
          throw e;
        });

      this.onceReady.then(this.linkTcpAndPeerConnectionData_);

      this.onceReady.catch(this.fulfillStopping_);

      this.dataChannel_.onceClosed
      .then(() => {
        log.info('%1: datachannel closed', [this.longId()]);
      })
      .then(this.fulfillStopping_);

      this.onceStopped_ = this.onceStopping_.then(this.stopResources_);

      return this.onceReady;
    }

    // Initiates shutdown of the TCP connection and peerconnection.
    // Returns onceStopped.
    public stop = () : Promise<void> => {
      log.debug('%1: stop requested', [this.longId()]);
      this.fulfillStopping_();
      return this.onceStopped_;
    }

    // Closes the TCP connection and datachannel if they haven't already
    // closed, fulfilling once both have closed. Since neither object's
    // close() methods should ever reject, this should never reject.
    private stopResources_ = () : Promise<void> => {
      log.debug('%1: freeing resources', [this.longId()]);
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
    private receiveEndpointFromPeer_ = () : Promise<net.Endpoint> => {
      return new Promise((F,R) => {
        this.dataChannel_.dataFromPeerQueue.setSyncNextHandler((data:peerconnection.Data) => {
          if (!data.str) {
            R(new Error('received non-string data from peer: ' +
                JSON.stringify(data)));
            return;
          }
          try {
            var r :any = JSON.parse(data.str);
            if (!socks.isValidRequest(r)) {
              R(new Error('received invalid request from peer: ' +
                  JSON.stringify(data.str)));
              return;
            }
            var request :socks.Request = r;
            if (request.command != socks.Command.TCP_CONNECT) {
              R(new Error('unexpected type for endpoint message'));
              return;
            }
            log.info('%1: received endpoint from peer: %2', [
                this.longId(), JSON.stringify(request.endpoint)]);
            F(request.endpoint);
            return;
          } catch (e) {
            R(new Error('received malformed message during handshake: ' +
                data.str));
            return;
          }
        });
      });
    }

    private getTcpConnection_ = (endpoint:net.Endpoint) : tcp.Connection => {
      if (ipaddr.isValid(endpoint.address) &&
          !this.isAllowedAddress_(endpoint.address)) {
        this.replyToPeer_(socks.Reply.NOT_ALLOWED);
        throw new Error('tried to connect to disallowed address: ' +
                        endpoint.address);
      }
      return new tcp.Connection({endpoint: endpoint});
    }

    // Fulfills once the connected endpoint has been returned to the SOCKS client.
    // Rejects if the endpoint cannot be sent to the SOCKS client.
    private replyToPeer_ = (reply:socks.Reply, info?:tcp.ConnectionInfo)
        : Promise<void> => {
      var response :socks.Response = {
        reply: reply,
        endpoint: info ? info.bound : undefined
      };
      return this.dataChannel_.send({
        str: JSON.stringify(response)
      }).then(() => {
        if (reply != socks.Reply.SUCCEEDED) {
          this.stop();
        }
      });
    }

    private getReplyFromInfo_ = (info:tcp.ConnectionInfo) : socks.Reply => {
      // TODO: This code should really return socks.Reply.NOT_ALLOWED,
      // but due to port-scanning concerns we return a generic error instead.
      // See https://github.com/uProxy/uproxy/issues/809
      return this.isAllowedAddress_(info.remote.address) ?
          socks.Reply.SUCCEEDED : socks.Reply.FAILURE;
    }

    private getReplyFromError_ = (e:freedom.Error) : socks.Reply => {
      var reply :socks.Reply = socks.Reply.FAILURE;
      if (e.errcode == 'TIMED_OUT') {
        reply = socks.Reply.TTL_EXPIRED;
      } else if (e.errcode == 'NETWORK_CHANGED') {
        reply = socks.Reply.NETWORK_UNREACHABLE;
      } else if (e.errcode == 'CONNECTION_RESET' ||
                 e.errcode == 'CONNECTION_REFUSED') {
        // Due to port-scanning concerns, we return a generic error if the user
        // has blocked local network access and we are not sure if the requested
        // address might be on the local network.
        // See https://github.com/uProxy/uproxy/issues/809
        if (this.proxyConfig_.allowNonUnicast) {
          reply = socks.Reply.CONNECTION_REFUSED;
        }
      }
      // TODO: report ConnectionInfo in cases where a port was bound.
      // Blocked by https://github.com/uProxy/uproxy/issues/803
      return reply;
    }

    // Assumes that |receiveEndpointFromPeer| and |getTcpConnection_|
    // have completed.
    private linkTcpAndPeerConnectionData_ = () : void => {
      // Data from the TCP socket goes to the data channel.
      this.tcpConnection_.dataFromSocketQueue.setSyncHandler((data) => {
        log.debug('%1: socket received %2 bytes', [
            this.longId(), data.byteLength]);
        this.dataChannel_.send({buffer: data})
        .catch((e:Error) => {
          log.error('%1: failed to send data on datachannel: %2', [
              this.longId(), e.message]);
        });
        this.bytesSentToPeer_.handle(data.byteLength);
      });
      // Data from the datachannel goes to the TCP socket.
      this.dataChannel_.dataFromPeerQueue.setSyncHandler((data:peerconnection.Data) => {
        if (!data.buffer) {
          log.error('%1: received non-buffer data from datachannel', [
              this.longId()]);
          return;
        }
        log.debug('%1: datachannel received %2 bytes', [
            this.longId(), data.buffer.byteLength]);
        this.bytesReceivedFromPeer_.handle(data.buffer.byteLength);
        this.tcpConnection_.send(data.buffer)
        .catch((e:any) => {
          // TODO: e is actually a freedom.Error (uproxy-lib 20+)
          // errcode values are defined here:
          //   https://github.com/freedomjs/freedom/blob/master/interface/core.tcpsocket.json
          if (e.errcode === 'NOT_CONNECTED') {
            // This can happen if, for example, there was still data to be
            // read on the datachannel's queue when the socket closed.
            log.warn('%1: tried to send data on closed socket: %2', [
                this.longId(), e.errcode]);
          } else {
            log.error('%1: failed to send data on socket: %2', [
                this.longId(), e.errcode]);
          }
        });
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
      var s = 'session ' + this.channelLabel();
      if (this.tcpConnection_) {
        s += ' (TCP ' + (this.tcpConnection_.isClosed() ?
            'closed' : 'open') + ')';
      }
      return s;
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
export = RtcToNet;
