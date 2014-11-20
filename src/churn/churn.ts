/// <reference path='../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../churn-pipe/churn-pipe.d.ts' />
/// <reference path='../crypto/random.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../logging/logging.d.ts' />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

// TODO: https://github.com/uProxy/uproxy-obfuscators/issues/35
var regex2dfa :any;

module Churn {
  var log :Logging.Log = new Logging.Log('churn');

  export interface ChurnSignallingMessage {
    webrtcMessage ?:WebRtc.SignallingMessage;
    publicEndpoint ?:WebRtc.Endpoint;
  }

  export var filterCandidatesFromSdp = (sdp:string) : string => {
    return sdp.split('\n').filter((s) => {
      return s.indexOf('a=candidate') != 0;
    }).join('\n');
  }

  var splitHostCandidateLine_ = (candidate:string) : string[] => {
    var lines = candidate.split(' ');
    if (lines.length < 8 || lines[6] != 'typ') {
      throw new Error('cannot parse candidate line: ' + candidate);
    }
    var typ = lines[7];
    if (typ != 'host') {
      throw new Error('not a host candidate line: ' + candidate);
    }
    return lines;
  }

  export var extractEndpointFromCandidateLine = (
      candidate:string) : freedom_ChurnPipe.Endpoint => {
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
      candidate:string, endpoint:freedom_ChurnPipe.Endpoint) : string => {
    var lines = splitHostCandidateLine_(candidate);
    lines[4] = endpoint.address;
    lines[5] = endpoint.port.toString();
    return lines.join(' ');
  }

  export interface NatPair {
    internal: freedom_ChurnPipe.Endpoint;
    external: freedom_ChurnPipe.Endpoint;
  }

  export var selectPublicAddress =
      (candidates:freedom_RTCPeerConnection.RTCIceCandidate[])
      : NatPair => {
    var address :string;
    var port :number;
    for (var i = 0; i < candidates.length; ++i) {
      var line = candidates[i].candidate.trim();
      var tokens = line.split(' ');
      if (tokens[2].toLowerCase() != 'udp') {
        // Skip non-UDP candidates
        continue;
      }
      if (tokens[6] != 'typ') {
        throw new Error('no typ in candidate line: ' + line);
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
  export class Connection implements WebRtc.PeerConnectionInterface<ChurnSignallingMessage> {

    public pcState :WebRtc.State;
    public dataChannels :{[channelLabel:string] : WebRtc.DataChannel};
    public peerOpenedChannelQueue :Handler.Queue<WebRtc.DataChannel, void>;
    public signalForPeerQueue :Handler.Queue<Churn.ChurnSignallingMessage, void>;
    public peerName :string;

    public onceConnecting :Promise<void>;
    public onceConnected :Promise<WebRtc.ConnectionAddresses>;
    public onceDisconnected :Promise<void>;

    // A short-lived connection used to determine network addresses on which
    // we might be able to communicate with the remote host.
    private probeConnection_ :WebRtc.PeerConnection;

    // The list of all candidates returned by the probe connection.
    private probeCandidates_ :freedom_RTCPeerConnection.RTCIceCandidate[] = [];

    // Fulfills once we have collected all candidates from the probe connection.
    private probingComplete_ :(endpoints:NatPair) => void;
    private onceProbingComplete_ = new Promise((F, R) => {
      this.probingComplete_ = F;
    });

    // The obfuscated connection.
    private obfuscatedConnection_ :WebRtc.PeerConnection;

    // Fulfills once we know on which port the local obfuscated RTCPeerConnection
    // is listening.
    private haveWebRtcEndpoint_ :(endpoint:freedom_ChurnPipe.Endpoint) => void;
    private onceHaveWebRtcEndpoint_ = new Promise((F, R) => {
      this.haveWebRtcEndpoint_ = F;
    });

    // Fulfills once we know on which port the remote CHURN pipe is listening.
    private haveRemoteEndpoint_ :(endpoint:freedom_ChurnPipe.Endpoint) => void;
    private onceHaveRemoteEndpoint_ = new Promise((F, R) => {
      this.haveRemoteEndpoint_ = F;
    });

    // Fulfills once we've successfully allocated the forwarding socket.
    // At that point, we can inject its address into candidate messages destined
    // for the local RTCPeerConnection.
    private haveForwardingSocketEndpoint_ :(endpoint:freedom_ChurnPipe.Endpoint) => void;
    private onceHaveForwardingSocketEndpoint_ = new Promise((F, R) => {
      this.haveForwardingSocketEndpoint_ = F;
    });

    constructor(config:WebRtc.PeerConnectionConfig) {
      // TODO: Remove when objects-for-constructors is fixed in Freedom:
      //         https://github.com/freedomjs/freedom/issues/87
      if (Array.isArray(config)) {
        // Extract the first element of this single element array.
        config = (<WebRtc.PeerConnectionConfig[]><any> config)[0];
      }

      this.peerName = config.peerName ||
          'churn-connection-' + crypto.randomUint32();

      this.signalForPeerQueue = new Handler.Queue<Churn.ChurnSignallingMessage,void>();

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
      // the information we need in order to configure the pipes required to
      // establish the obfuscated connection.
      this.configureProbeConnection_(config);
      Promise.all([this.onceHaveWebRtcEndpoint_,
                   this.onceHaveRemoteEndpoint_,
                   this.onceProbingComplete_]).then((answers:any[]) => {
        this.configurePipes_(answers[0], answers[1], answers[2]);
      });

      // Handle |pcState| and related promises.
      this.pcState = WebRtc.State.WAITING;
      this.onceConnecting = this.obfuscatedConnection_.onceConnecting.then(
          () => {
        this.pcState = WebRtc.State.CONNECTING;
      });
      this.onceConnected = this.obfuscatedConnection_.onceConnected.then(
          (addresses:WebRtc.ConnectionAddresses) => {
        this.pcState = WebRtc.State.CONNECTED;
        return addresses;
      });
      this.onceDisconnected = this.obfuscatedConnection_.onceDisconnected.then(
          () => { this.pcState = WebRtc.State.DISCONNECTED; });
    }

    private configureProbeConnection_ = (
        config:WebRtc.PeerConnectionConfig) => {
      var probeConfig :WebRtc.PeerConnectionConfig = {
        webrtcPcConfig: config.webrtcPcConfig,
        peerName: this.peerName + '-probe',
        initiateConnection: true
      };
      this.probeConnection_ = new WebRtc.PeerConnection(probeConfig);
      this.probeConnection_.signalForPeerQueue.setSyncHandler(
          (signal:WebRtc.SignallingMessage) => {
        if (signal.type === WebRtc.SignalType.CANDIDATE) {
          this.probeCandidates_.push(signal.candidate);
        } else if (signal.type === WebRtc.SignalType.NO_MORE_CANDIDATES) {
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
        webRtcEndpoint:freedom_ChurnPipe.Endpoint,
        remoteEndpoint:freedom_ChurnPipe.Endpoint,
        natEndpoints:NatPair) : void => {
      log.debug('configuring pipes...');
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
      .then((forwardingSocketEndpoint:freedom_ChurnPipe.Endpoint) => {
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
              // TFTP read request for file with name "abc", by netascii.
              // By default, Wireshark only looks for TFTP traffic if the packet's destination
              // port is 69; you can change this in Preferences.
              'ciphertext_dfa': regex2dfa('^\x00\x01\x61\x62\x63\x00netascii.*$'),
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
        (config:WebRtc.PeerConnectionConfig) => {
      // We use an empty configuration to ensure that no STUN servers are pinged.
      var obfConfig :WebRtc.PeerConnectionConfig = {
        webrtcPcConfig: {
          iceServers: []
        },
        peerName: this.peerName + '-obfuscated',
        initiateConnection: config.initiateConnection
      };
      this.obfuscatedConnection_ = new WebRtc.PeerConnection(obfConfig);
      this.obfuscatedConnection_.signalForPeerQueue.setSyncHandler(
          (signal:WebRtc.SignallingMessage) => {
        // Super-paranoid check: remove candidates from SDP messages.
        // This can happen if a connection is re-negotiated.
        // TODO: We can safely remove this once we can reliably interrogate
        //       peerconnection endpoints.
        if (signal.type === WebRtc.SignalType.OFFER ||
            signal.type === WebRtc.SignalType.ANSWER) {
          signal.description.sdp =
              filterCandidatesFromSdp(signal.description.sdp);
        }
        if (signal.type === WebRtc.SignalType.CANDIDATE) {
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
        var churnSignal :Churn.ChurnSignallingMessage = {
          webrtcMessage: signal
        };
        this.signalForPeerQueue.handle(churnSignal);
      });
      // NOTE: Replacing |this.dataChannels| in this way breaks recursive nesting.
      // If the caller or |obfuscatedConnection_| applies the same approach,
      // the code will break in hard-to-debug fashion.  This could be
      // addressed by using a javascript "getter", or by changing the
      // WebRtc.PeerConnection API.
      this.dataChannels = this.obfuscatedConnection_.dataChannels;
      this.peerOpenedChannelQueue =
          this.obfuscatedConnection_.peerOpenedChannelQueue;
    }

    public negotiateConnection = () : Promise<WebRtc.ConnectionAddresses> => {
      // TODO: propagate errors.
      log.debug('negotiating initial connection...');
      this.probeConnection_.negotiateConnection();
      return this.obfuscatedConnection_.negotiateConnection();
    }

    // Forward the message to the relevant stage: churn-pipe or obfuscated.
    // In the case of obfuscated signalling channel messages, we inject our
    // local forwarding socket's endpoint.
    public handleSignalMessage = (
        message:Churn.ChurnSignallingMessage) : void => {
      if (message.publicEndpoint !== undefined) {
        this.haveRemoteEndpoint_(message.publicEndpoint);
      }
      if (message.webrtcMessage) {
        var signal = message.webrtcMessage;
        if (signal.type === WebRtc.SignalType.CANDIDATE) {
          this.onceHaveForwardingSocketEndpoint_.then(
              (forwardingSocketEndpoint:freedom_ChurnPipe.Endpoint) => {
            signal.candidate.candidate =
                setCandidateLineEndpoint(
                    signal.candidate.candidate, forwardingSocketEndpoint);
            this.obfuscatedConnection_.handleSignalMessage(signal);
          });
        } else if (signal.type == WebRtc.SignalType.OFFER ||
                   signal.type == WebRtc.SignalType.ANSWER) {
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
        : Promise<WebRtc.DataChannel> => {
      return this.obfuscatedConnection_.openDataChannel(channelLabel);
    }

    public close = () : void => {
      this.obfuscatedConnection_.close();
    }

    public toString = () : string => {
      return this.obfuscatedConnection_.toString();
    };
  }
}
