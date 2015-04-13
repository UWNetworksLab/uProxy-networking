/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../third_party/freedom-typings/udp-socket.d.ts' />
/// <reference path='../../../third_party/ipaddrjs/ipaddrjs.d.ts' />

// TODO(ldixon): reorganize the utransformers and rename uproxy-obfuscators.
// Ideal:
//  import Transformer = require('uproxy-obfuscators/transformer');
// Current:
/// <reference path='../../../third_party/uTransformers/utransformers.d.ts' />


// TODO(ldixon): re-enable FTE and regex2dfa. But this time, start with a pre-
// computed set of DFAs because the regex2dfa.js library is 4MB in size. Also
// experiment with uglify and zip to see if that size drops significantly.
//
// import regex2dfa = require('regex2dfa');

import arraybuffers = require('../../../third_party/uproxy-lib/arraybuffers/arraybuffers');
import peerconnection = require('../../../third_party/uproxy-lib/webrtc/peerconnection');
import handler = require('../../../third_party/uproxy-lib/handler/queue');
import random = require('../../../third_party/uproxy-lib/crypto/random');

import net = require('../net/net.types');

import churn_types = require('./churn.types');
import ChurnSignallingMessage = churn_types.ChurnSignallingMessage;

import ipaddr = require('ipaddr.js');

import PassThrough = require('../simple-transformers/passthrough');
import CaesarCipher = require('../simple-transformers/caesar');

import logging = require('../../../third_party/uproxy-lib/logging/logging');
var log :logging.Log = new logging.Log('churn');

  export var filterCandidatesFromSdp = (sdp:string) : string => {
    return sdp.split('\n').filter((s) => {
      return s.indexOf('a=candidate') != 0;
    }).join('\n');
  }

  var splitCandidateLine_ = (candidate:string) : string[] => {
    var lines = candidate.split(' ');
    if (lines.length < 8 || lines[6] != 'typ') {
      throw new Error('cannot parse candidate line: ' + candidate);
    }
    return lines;
  }

  var splitHostCandidateLine_ = (candidate:string) : string[] => {
    var lines = splitCandidateLine_(candidate)
    var typ = lines[7];
    if (typ != 'host') {
      throw new Error('not a host candidate line: ' + candidate);
    }
    return lines;
  }

  export var extractEndpointFromCandidateLine = (
      candidate:string) : net.Endpoint => {
    var lines = splitHostCandidateLine_(candidate);
    var address = lines[4];
    var port = parseInt(lines[5]);
    if (port != port) {
      // Check for NaN.
      throw new Error('invalid port in candidate line: ' + candidate);
    }
    return {
      address: address,
      port: port
    };
  }

  export var setCandidateLineEndpoint = (
      candidate:string, endpoint:net.Endpoint) : string => {
    var lines = splitHostCandidateLine_(candidate);
    lines[4] = endpoint.address;
    lines[5] = endpoint.port.toString();
    return lines.join(' ');
  }

  export interface NatPair {
    internal: net.Endpoint;
    external: net.Endpoint;
  }

  export var selectPublicAddress =
      (candidates:freedom_RTCPeerConnection.RTCIceCandidate[])
      : NatPair => {
    // TODO: Note that we cannot currently support IPv6 addresses:
    //         https://github.com/uProxy/uproxy/issues/1107
    var address :string;
    var port :number;
    for (var i = 0; i < candidates.length; ++i) {
      var line = candidates[i].candidate;
      var tokens = splitCandidateLine_(line);
      if (tokens[2].toLowerCase() != 'udp') {
        // Skip non-UDP candidates
        continue;
      }
      var typ = tokens[7];
      if (typ === 'srflx') {
        address = tokens[4];
        if (ipaddr.process(address).kind() === 'ipv6') {
          continue;
        }
        port = parseInt(tokens[5]);
        if (tokens[8] != 'raddr') {
          throw new Error('no raddr in candidate line: ' + line);
        }
        var raddr = tokens[9];
        if (ipaddr.process(raddr).kind() === 'ipv6') {
          continue;
        }
        if (tokens[10] != 'rport') {
          throw new Error('no rport in candidate line: ' + line);
        }
        var rport = parseInt(tokens[11]);
        // TODO: Return the most preferred srflx candidate, not
        // just the first.
        return {
          external: {
            address: address,
            port: port
          },
          internal: {
            address: raddr,
            port: rport
          }
        };
      } else if (typ === 'host') {
        // Store the host address in case no srflx candidates are found.
        if (ipaddr.process(tokens[4]).kind() !== 'ipv6') {
          address = tokens[4];
          port = parseInt(tokens[5]);
        }
      }
    }
    // No 'srflx' candidate found.
    if (address) {
      // A host candidate must have been found.  Let's hope it's routable.
      var endpoint = {
        address: address,
        port: port
      };
      return {
        internal: endpoint,
        external: endpoint
      };
    }
    throw new Error('no srflx or host candidate found');
  };

  /**
   * A uproxypeerconnection-like Freedom module which establishes obfuscated
   * connections.
   *
   * DTLS packets are intercepted by pointing WebRTC at a local "forwarding"
   * port; connectivity to the remote host is achieved with the help of
   * another preceding, short-lived, peer-to-peer connection.
   *
   * This is mostly a thin wrapper over uproxypeerconnection except for the
   * magic required during setup.
   *
   * TODO: Give the uproxypeerconnections name, to help debugging.
   * TODO: Allow obfuscation parameters be configured.
   */
  export class Connection implements peerconnection.PeerConnection<ChurnSignallingMessage> {

    public pcState :peerconnection.State;
    public dataChannels :{[channelLabel:string] : peerconnection.DataChannel};
    public peerOpenedChannelQueue :handler.QueueHandler<peerconnection.DataChannel, void>;
    public signalForPeerQueue :handler.Queue<ChurnSignallingMessage, void>;
    public peerName :string;

    public onceConnecting :Promise<void>;
    public onceConnected :Promise<void>;
    public onceDisconnected :Promise<void>;

    // A short-lived connection used to determine network addresses on which
    // we might be able to communicate with the remote host.
    private probeConnection_
        :peerconnection.PeerConnection<peerconnection.SignallingMessage>;

    // The list of all candidates returned by the probe connection.
    private probeCandidates_ :freedom_RTCPeerConnection.RTCIceCandidate[] = [];

    // Fulfills once we have collected all candidates from the probe connection.
    private probingComplete_ :(endpoints:NatPair) => void;
    private onceProbingComplete_ = new Promise((F, R) => {
      this.probingComplete_ = F;
    });

    // The obfuscated connection.
    private obfuscatedConnection_
        :peerconnection.PeerConnection<peerconnection.SignallingMessage>;

    // Fulfills once we know on which port the local obfuscated RTCPeerConnection
    // is listening.
    private haveWebRtcEndpoint_ :(endpoint:net.Endpoint) => void;
    private onceHaveWebRtcEndpoint_ = new Promise((F, R) => {
      this.haveWebRtcEndpoint_ = F;
    });

    // Fulfills once we know on which port the remote CHURN pipe is listening.
    private haveRemoteEndpoint_ :(endpoint:net.Endpoint) => void;
    private onceHaveRemoteEndpoint_ = new Promise((F, R) => {
      this.haveRemoteEndpoint_ = F;
    });

    private static internalConnectionId_ = 0;

    constructor(probeRtcPc:freedom_RTCPeerConnection.RTCPeerConnection,
                peerName?:string) {
      this.peerName = peerName || 'churn-connection-' +
          (++Connection.internalConnectionId_);

      this.signalForPeerQueue = new handler.Queue<ChurnSignallingMessage,void>();

      // Configure the probe connection.  Once it completes, inform the remote
      // peer which public endpoint we will be using.
      this.onceProbingComplete_.then((endpoints:NatPair) => {
        this.signalForPeerQueue.handle({
          publicEndpoint: endpoints.external
        });
      });

      // Start the obfuscated connection.
      this.configureObfuscatedConnection_();

      // Once the obfuscated connection's local endpoint is known, the remote
      // peer has sent us its public endpoint, and probing is complete, we can
      // configure the obfuscating pipe and allow traffic to flow.
      this.configureProbeConnection_(probeRtcPc);
      Promise.all([this.onceHaveWebRtcEndpoint_,
                   this.onceHaveRemoteEndpoint_,
                   this.onceProbingComplete_]).then((answers:any[]) => {
        this.configurePipes_(answers[0], answers[1], answers[2]);
      });

      // Handle |pcState| and related promises.
      this.pcState = peerconnection.State.WAITING;
      this.onceConnecting = this.obfuscatedConnection_.onceConnecting.then(
          () => {
        this.pcState = peerconnection.State.CONNECTING;
      });
      this.onceConnected = this.obfuscatedConnection_.onceConnected.then(() => {
        this.pcState = peerconnection.State.CONNECTED;
      });
      this.onceDisconnected = this.obfuscatedConnection_.onceDisconnected.then(
          () => { this.pcState = peerconnection.State.DISCONNECTED; });

      // Debugging.
      this.onceProbingComplete_.then((endpoint:NatPair) => {
        log.debug('%1: NAT endpoints of probe connection are %2',
            this.peerName,
            JSON.stringify(endpoint));
      });
      this.onceHaveWebRtcEndpoint_.then((endpoint:net.Endpoint) => {
        log.debug('%1: obfuscated connection is bound to %2',
            this.peerName,
            JSON.stringify(endpoint));
      });
      this.onceHaveRemoteEndpoint_.then((endpoint:net.Endpoint) => {
        log.debug('%1: remote peer is contactable at %2',
            this.peerName,
            JSON.stringify(endpoint));
      });
    }

    private configureProbeConnection_ = (
        freedomPc:freedom_RTCPeerConnection.RTCPeerConnection) => {
      var probePeerName = this.peerName + '-probe';
      this.probeConnection_ = new peerconnection.PeerConnectionClass(
          freedomPc, probePeerName);
      this.probeConnection_.signalForPeerQueue.setSyncHandler(
          (signal:peerconnection.SignallingMessage) => {
        if (signal.type === peerconnection.SignalType.CANDIDATE) {
          this.probeCandidates_.push(signal.candidate);
        } else if (signal.type === peerconnection.SignalType.NO_MORE_CANDIDATES) {
          this.probeConnection_.close();
          this.probingComplete_(selectPublicAddress(this.probeCandidates_));
        }
      });
      this.probeConnection_.negotiateConnection();
    }

    private configurePipes_ = (
        webRtcEndpoint:net.Endpoint,
        remoteEndpoint:net.Endpoint,
        natEndpoints:NatPair) : void => {
      // TODO: This throwaway socket helps avoid a timing condition by
      //       which the probe connection isn't *quite* ready immediately.
      //       We didn't encounter this before because we used to bind two
      //       ports, this one second.
      freedom['core.udpsocket']().bind('127.0.0.1', 0).then((unused:any) => {
        // Bind to the internal side of the NAT mapping.
        // We need to be bound to this port in order to send and
        // receive packets from the remote peer.
        var socket = freedom['core.udpsocket']();
        socket.bind(natEndpoints.internal.address,
            natEndpoints.internal.port).then((resultCode:number) => {
          log.info('%1: churn is bound to %2, mediating between local ' +
              'webrtc on %3 and remote churn at %4',
              this.peerName,
              JSON.stringify(natEndpoints.internal),
              JSON.stringify(webRtcEndpoint),
              JSON.stringify(remoteEndpoint));
        }).then(() => {
          // Make our transformer.
          // This is a Caesar Cipher with a key of 13, which is
          // equivalent to ROT13.
          var transformer = new CaesarCipher();
          transformer.setKey(new Uint8Array([13]).buffer);

          // Configure packet forwarding.
          socket.on('onData', (recvFromInfo:freedom_UdpSocket.RecvFromInfo) => {
            if (recvFromInfo.address === webRtcEndpoint.address &&
                recvFromInfo.port === webRtcEndpoint.port) {
              // Forward packets from WebRTC to the remote side,
              // first obfuscating.
              var transformedBuffer = transformer.transform(recvFromInfo.data);
              socket.sendTo(
                  transformedBuffer,
                  remoteEndpoint.address,
                  remoteEndpoint.port).catch((e:Error) => {
                log.info('%1: failed to forward packet to remote webrtc: %2',
                    this.peerName,
                    e.message);
              });
            } else if (recvFromInfo.address === remoteEndpoint.address &&
                recvFromInfo.port === remoteEndpoint.port) {
              // Forward packets from the remote side to WebRTC,
              // first deobfuscating.
              var buffer = transformer.restore(recvFromInfo.data);
              socket.sendTo(
                  buffer,
                  webRtcEndpoint.address,
                  webRtcEndpoint.port).catch((e:Error) => {
                log.info('%1: failed to forward packet to local webrtc: %2',
                    this.peerName,
                    e.message);
              });
            } else {
              log.warn('%1: ignoring packet from unknown origin: %2',
                  this.peerName,
                  JSON.stringify(recvFromInfo));
            }
          });
        }).catch((e:Error) => {
          log.error('%1: failed to configure churn piping on %2: %3',
            this.peerName,
            JSON.stringify(natEndpoints.internal),
            e.message);
        });
      });
    }

    private configureObfuscatedConnection_ = () => {
      // We use an empty configuration to ensure that no STUN servers are pinged.
      var obfConfig :freedom_RTCPeerConnection.RTCConfiguration = {
        iceServers: []
      };
      var obfPeerName = this.peerName + '-obfuscated';
      var freedomPc = freedom['core.rtcpeerconnection'](obfConfig);
      this.obfuscatedConnection_ = new peerconnection.PeerConnectionClass(
          freedomPc, obfPeerName);
      this.obfuscatedConnection_.signalForPeerQueue.setSyncHandler(
          (signal:peerconnection.SignallingMessage) => {
        // Super-paranoid check: remove candidates from SDP messages.
        // This can happen if a connection is re-negotiated.
        // TODO: We can safely remove this once we can reliably interrogate
        //       peerconnection endpoints.
        if (signal.type === peerconnection.SignalType.OFFER ||
            signal.type === peerconnection.SignalType.ANSWER) {
          signal.description.sdp =
              filterCandidatesFromSdp(signal.description.sdp);
        }
        if (signal.type === peerconnection.SignalType.CANDIDATE) {
          // This will tell us on which port webrtc is operating.
          // Record it and inject a fake endpoint, to be sure the remote
          // side never knows the real address (can be an issue when both
          // hosts are on the same network).
          try {
            if (!signal.candidate || !signal.candidate.candidate) {
              throw new Error('no candidate line');
            }
            var address = extractEndpointFromCandidateLine(
                signal.candidate.candidate);
            // TODO: We cannot currently support IPv6 addresses:
            //         https://github.com/uProxy/uproxy/issues/1107
            if (ipaddr.process(address.address).kind() === 'ipv6') {
              throw new Error('ipv6 unsupported');
            }
            this.haveWebRtcEndpoint_(address);
            signal.candidate.candidate =
              setCandidateLineEndpoint(
                signal.candidate.candidate, {
                  address: '0.0.0.0',
                  port: 0
                });
          } catch (e) {
            log.debug('%1: ignoring candidate line %2: %3',
                this.peerName,
                JSON.stringify(signal),
                e.message);
          }
        }
        var churnSignal :ChurnSignallingMessage = {
          webrtcMessage: signal
        };
        this.signalForPeerQueue.handle(churnSignal);
      });
      // NOTE: Replacing |this.dataChannels| in this way breaks recursive nesting.
      // If the caller or |obfuscatedConnection_| applies the same approach,
      // the code will break in hard-to-debug fashion.  This could be
      // addressed by using a javascript "getter", or by changing the
      // peerconnection.PeerConnection API.
      this.dataChannels = this.obfuscatedConnection_.dataChannels;
      this.peerOpenedChannelQueue =
          this.obfuscatedConnection_.peerOpenedChannelQueue;
    }

    public negotiateConnection = () : Promise<void> => {
      return this.obfuscatedConnection_.negotiateConnection();
    }

    // Forward the message to the relevant stage: churn-pipe or obfuscated.
    // In the case of obfuscated signalling channel messages, we inject our
    // local forwarding socket's endpoint.
    public handleSignalMessage = (
        message:ChurnSignallingMessage) : void => {
      if (message.publicEndpoint !== undefined) {
        this.haveRemoteEndpoint_(message.publicEndpoint);
      }
      if (message.webrtcMessage) {
        var signal = message.webrtcMessage;
        if (signal.type === peerconnection.SignalType.CANDIDATE) {
          this.onceProbingComplete_.then((natEndpoints:NatPair) => {
            signal.candidate.candidate =
                setCandidateLineEndpoint(
                    signal.candidate.candidate, natEndpoints.internal);
            this.obfuscatedConnection_.handleSignalMessage(signal);
          });
        } else if (signal.type == peerconnection.SignalType.OFFER ||
                   signal.type == peerconnection.SignalType.ANSWER) {
          // Remove candidates from the SDP.  This is redundant, but ensures
          // that a bug in the remote client won't cause us to send
          // unobfuscated traffic.
          signal.description.sdp =
              filterCandidatesFromSdp(signal.description.sdp);
          this.obfuscatedConnection_.handleSignalMessage(signal);
        }
      }
    }

    public openDataChannel = (channelLabel:string,
        options?:freedom_RTCPeerConnection.RTCDataChannelInit)
        : Promise<peerconnection.DataChannel> => {
      return this.obfuscatedConnection_.openDataChannel(channelLabel);
    }

    public close = () : Promise<void> => {
      return this.obfuscatedConnection_.close();
    }

    public toString = () : string => {
      return this.obfuscatedConnection_.toString();
    };
  }
