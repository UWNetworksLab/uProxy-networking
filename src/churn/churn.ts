/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../build/third_party/freedom-typings/freedom-module-env.d.ts' />
/// <reference path='../../build/third_party/freedom-typings/udp-socket.d.ts' />
//// <reference path='../../build/third_party/freedom-typings/tcp-socket.d.ts' />

import Transformer = require('../../build/third_party/uproxy-obfuscators/utransformer');
import Rabbit = require('../../build/third_party/uproxy-obfuscators/utransformers.rabbit');
import Fte = require('../../build/third_party/uproxy-obfuscators/utransformers.fte');

import peerconnection = require('../../build/dev/webrtc/peerconnection');
import handler = require('../../build/dev/handler/queue');
import random = require('../../build/dev/crypto/random');

import net = require('../networking-typings/net.types');

import logging = require('../../build/dev/logging/logging');
var log :logging.Log = new logging.Log('churn');

// TODO: https://github.com/uProxy/uproxy-obfuscators/issues/35
var regex2dfa :any;

// Adds the notion of a stage (first or second) to signalling messages.
export interface ChurnSignallingMessage {
  webrtcMessage ?:peerconnection.SignallingMessage;
  publicEndpoint ?:net.Endpoint;
}

// Strips candidate lines from an SDP.
// In general, an SDP is a newline-delimited series of lines of the form:
//   x=yyy
// where x is a single character and yyy arbitrary text.
//
// ICE candidate lines look like this:
//   a=candidate:1297 1 udp 2122 192.168.1.5 4533 typ host generation 0
//
// For more information on SDP, see section 6 of the RFC:
//   http://tools.ietf.org/html/rfc2327
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

// Extracts the endpoint from an SDP candidate line.
// Raises an exception if the supplied string is not a candidate line of
// type host or the endpoint cannot be parsed.
//
// ICE candidate lines look something like this:
//   a=candidate:1297 1 udp 2122 192.168.1.5 4533 typ host generation 0
//
// For more information on candidate lines, see section 15.1 of the RFC:
//   http://tools.ietf.org/html/rfc5245#section-15.1
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

// Extracts the endpoint from an SDP candidate line.
// Raises an exception if the supplied string is not a candidate line of
// type host.
//
// See #extractEndpointFromCandidateLine.
export var setCandidateLineEndpoint = (
    candidate:string, endpoint:net.Endpoint) : string => {
  var lines = splitHostCandidateLine_(candidate);
  lines[4] = endpoint.address;
  lines[5] = endpoint.port.toString();
  return lines.join(' ');
}

// Represents a UDP NAT mapping "five-tuple": protocol (UDP), internal
// address and port, and external address and port.
export interface NatPair {
  internal: net.Endpoint;
  external: net.Endpoint;
}

// Given the list of candidates, selects a NAT mapping to use.
// This is designed to use mappings produced by a STUN server, but falls
// back to local ports ("host" candidates) if there is no STUN candidate.
// Raises an exception if the list contains invalid candidates, or if it
// does not contain any "srflx" or "host" candidates.
export var selectPublicAddress =
    (candidates:freedom_RTCPeerConnection.RTCIceCandidate[])
    : NatPair => {
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
      port = parseInt(tokens[5]);
      if (tokens[8] != 'raddr') {
        throw new Error('no raddr in candidate line: ' + line);
      }
      var raddr = tokens[9];
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
      address = tokens[4];
      port = parseInt(tokens[5]);
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

// Connection is an implemention of the PeerConnection interface that
// transparently obfuscates the actual traffic.
/**
 * A peerconnection-like Freedom module which establishes obfuscated
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

  // The state of this peer connection.
  public pcState :peerconnection.State;

  public dataChannels :{[channelLabel:string] : peerconnection.DataChannel};
  public peerOpenedChannelQueue :handler.Queue<peerconnection.DataChannel, void>;
  public signalForPeerQueue :handler.Queue<ChurnSignallingMessage, void>;

  // The |onceConnecting| promise is fulfilled when |pcState === CONNECTING|.
  // i.e. when either |handleSignalMessage| is called with an offer message,
  // or when |negotiateConnection| is called. The promise is never be rejected
  // and is guarenteed to fulfilled before |onceConnected|.
  public onceConnecting :Promise<void>;
  public onceConnected :Promise<void>;
  public onceDisconnected :Promise<void>;

  // Access to this is only for debugging.
  public peerName_ :string;

  // A short-lived connection used to determine network addresses on which
  // we might be able to communicate with the remote host.
  private probeConnection_ :peerconnection.PeerConnection<ChurnSignallingMessage>;

  // The list of all candidates returned by the probe connection.
  private probeCandidates_ :freedom_RTCPeerConnection.RTCIceCandidate[] = [];

  // Fulfills once we have collected all candidates from the probe connection.
  private probingComplete_ :(endpoints:NatPair) => void;
  private onceProbingComplete_ = new Promise((F, R) => {
    this.probingComplete_ = F;
  });

  // The obfuscated connection.
  private obfuscatedConnection_ :peerconnection.PeerConnection<ChurnSignallingMessage>;

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

  // Fulfills once we've successfully allocated the forwarding socket.
  // At that point, we can inject its address into candidate messages destined
  // for the local RTCPeerConnection.
  private haveForwardingSocketEndpoint_ :(endpoint:net.Endpoint) => void;
  private onceHaveForwardingSocketEndpoint_ = new Promise((F, R) => {
    this.haveForwardingSocketEndpoint_ = F;
  });

  constructor(config:freedom_RTCPeerConnection.RTCConfiguration) {
    this.signalForPeerQueue = new handler.Queue<ChurnSignallingMessage,void>();

    // Configure the probe connection.  Once it completes, inform the remote
    // peer which public endpoint we will be using.
    this.onceProbingComplete_.then((endpoints:NatPair) => {
      this.signalForPeerQueue.handle({
        publicEndpoint: endpoints.external
      });
    });

    // Start the obfuscated connection.
    this.configureObfuscatedConnection_(config);

    // Once the obfuscated connection's local endpoint is known, the remote
    // peer has sent us its public endpoint, and probing is complete, we can
    // configure the obfuscating pipe and allow traffic to flow.
    this.configureProbeConnection_(config);
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
  }

  private configureProbeConnection_ = (
      config:freedom_RTCPeerConnection.RTCConfiguration) => {
    var probeConfig :freedom_RTCPeerConnection.RTCConfiguration = {
      webrtcPcConfig: config.webrtcPcConfig,
      peerName: this.peerName + '-probe',
      initiateConnection: true
    };
    this.probeConnection_ = new peerconnection.PeerConnection(probeConfig);
    this.probeConnection_.signalForPeerQueue.setSyncHandler(
        (signal:peerconnection.SignallingMessage) => {
      log.debug("probe connection emitted: " + JSON.stringify(signal));
      if (signal.type === peerconnection.SignalType.CANDIDATE) {
        this.probeCandidates_.push(signal.candidate);
      } else if (signal.type === peerconnection.SignalType.NO_MORE_CANDIDATES) {
        this.probeConnection_.close();
        this.probingComplete_(selectPublicAddress(this.probeCandidates_));
      }
    });
  }

  // Establishes the two pipes required to sustain the obfuscated
  // connection:
  //  - a non-obfuscated, local only, between WebRTC and a new,
  //    automatically allocated, port
  //  - remote, obfuscated, port
  private configurePipes_ = (
      webRtcEndpoint:net.Endpoint,
      remoteEndpoint:net.Endpoint,
      natEndpoints:NatPair) : void => {
    log.debug('configuring pipes...');
    // TODO: close the pipe?
    var localPipe = freedom['churnPipe']();
    localPipe.bind(
        '127.0.0.1',
        0,
        webRtcEndpoint.address,
        webRtcEndpoint.port,
        'none', // no need to obfuscate local-only traffic.
        undefined,
        undefined)
    .catch((e:Error) => {
      log.error('error setting up local pipe: ' + e.message);
    })
    .then(localPipe.getLocalEndpoint)
    .then((forwardingSocketEndpoint:net.Endpoint) => {
      this.haveForwardingSocketEndpoint_(forwardingSocketEndpoint);
      log.info('configured local pipe between forwarding socket at ' +
          forwardingSocketEndpoint.address + ':' +
          forwardingSocketEndpoint.port + ' and webrtc at ' +
          webRtcEndpoint.address + ':' + webRtcEndpoint.port);

      var publicPipe = freedom['churnPipe']();
      publicPipe.bind(
          natEndpoints.internal.address,
          natEndpoints.internal.port,
          remoteEndpoint.address,
          remoteEndpoint.port,
          'fte',
          ArrayBuffers.stringToArrayBuffer('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'),
          JSON.stringify({
            'plaintext_dfa': regex2dfa('^.*$'),
            'plaintext_max_len': 1400,
            // This is equivalent to Rabbit cipher.
            'ciphertext_dfa': regex2dfa('^.*$'),
            'ciphertext_max_len': 1450
          }))
      .then(() => {
        log.info('configured obfuscating pipe: ' +
            natEndpoints.internal.address + ':' +
            natEndpoints.internal.port + ' <-> ' +
            remoteEndpoint.address + ':' +
            remoteEndpoint.port);

        // Connect the local pipe to the remote, obfuscating, pipe.
        localPipe.on('message', (m:freedom_ChurnPipe.Message) => {
          publicPipe.send(m.data);
        });
        publicPipe.on('message', (m:freedom_ChurnPipe.Message) => {
          localPipe.send(m.data);
        });
      })
      .catch((e:Error) => {
        log.error('error setting up obfuscated pipe: ' + e.message);
      });
    });
  }

  private configureObfuscatedConnection_ =
      (config:freedom_RTCPeerConnection.RTCConfiguration) => {
    // We use an empty configuration to ensure that no STUN servers are pinged.
    var obfConfig :freedom_RTCPeerConnection.RTCConfiguration = {
      webrtcPcConfig: {
        iceServers: []
      },
      peerName: this.peerName + '-obfuscated',
      initiateConnection: config.initiateConnection
    };
    this.obfuscatedConnection_ = new peerconnection.PeerConnection(obfConfig);
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
        if (!signal.candidate || !signal.candidate.candidate) {
          log.error('null candidate!');
          return;
        }
        // This will tell us on which port webrtc is operating.
        // Record it and inject a fake endpoint, to be sure the remote
        // side never knows the real address (can be an issue when both
        // hosts are on the same network).
        this.haveWebRtcEndpoint_(
          extractEndpointFromCandidateLine(
            signal.candidate.candidate));
        signal.candidate.candidate =
          setCandidateLineEndpoint(
            signal.candidate.candidate, {
              address: '0.0.0.0',
              port: 0
            });
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
    // TODO: propagate errors.
    log.debug('negotiating obfuscated connection...');
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
        this.onceHaveForwardingSocketEndpoint_.then(
            (forwardingSocketEndpoint:net.Endpoint) => {
          signal.candidate.candidate =
              setCandidateLineEndpoint(
                  signal.candidate.candidate, forwardingSocketEndpoint);
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

  public close = () : void => {
    this.obfuscatedConnection_.close();
  }

  public toString = () : string => {
    return this.obfuscatedConnection_.toString();
  };
}
