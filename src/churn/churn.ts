/// <reference path='churn.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../pipe/pipe.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../freedom/coreproviders/uproxylogging.d.ts' />
/// <reference path='../freedom/coreproviders/uproxypeerconnection.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

// TODO: https://github.com/uProxy/uproxy-obfuscators/issues/35
var regex2dfa :any;

module Churn {

  var log :Freedom_UproxyLogging.Log = freedom['core.log']('churn');

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
  export class Provider {

    // A short-lived connection used to determine network addresses on which
    // we can communicate with the remote host.
    private surrogateConnection_ :freedom_UproxyPeerConnection.Pc;

    // The obfuscated connection.
    private obfuscatedConnection_ :freedom_UproxyPeerConnection.Pc;

    // Fulfills once obfuscatedConnection_ has been configured.
    // At that point, the negotiator can safely attempt to
    // negotiate the obfuscated peerconnection.
    private pc2Setup_ :() => void;
    private oncePc2Setup_ = new Promise((F, R) => {
      this.pc2Setup_ = F;
    });

    // Fulfills once we know on which port the RTCPeerConnection used to
    // establish the obfuscated peerconnection is listening.
    private haveWebRtcEndpoint_ :(endpoint:freedom_Pipe.Endpoint) => void;
    private onceHaveWebRtcEndpoint_ = new Promise((F, R) => {
      this.haveWebRtcEndpoint_ = F;
    });

    // Fulfills once we've successfully started an obfuscated peerconnection.
    private churnSetup_ :() => void;
    private onceChurnSetup_ = new Promise((F, R) => {
      this.churnSetup_ = F;
    });

    // Fulfills once we've successfully allocated the forwarding socket.
    // At that point, we can inject its address into candidate messages destined
    // for the local RTCPeerConnection.
    private haveForwardingSocketEndpoint_ :(endpoint:freedom_Pipe.Endpoint) => void;
    private onceHaveForwardingSocketEndpoint_ = new Promise((F, R) => {
      this.haveForwardingSocketEndpoint_ = F;
    });

    constructor(
        private dispatchEvent_:(name:string, args:any) => void,
        config:WebRtc.PeerConnectionConfig) {
      // TODO: Remove when objects-for-constructors is fixed in Freedom:
      //         https://github.com/freedomjs/freedom/issues/87
      if (Array.isArray(config)) {
        // Extract the first element of this single element array.
        config = (<WebRtc.PeerConnectionConfig[]><any> config)[0];
      }

      // Configure the surrogate connection. Once it's been successfully
      // established *and* we know on which port WebRTC is listening we have all
      // the information we need in order to configure the pipes required to
      // establish the obfuscated connection.
      this.configureSurrogateConnection_(config);
      Promise.all([this.onceHaveWebRtcEndpoint_,
          this.surrogateConnection_.onceConnected()]).then((answers:any[]) => {
        this.configurePipes_(answers[0], answers[1]);
      });
    }

    private configureSurrogateConnection_ = (
        config:WebRtc.PeerConnectionConfig) => {
      log.debug('configuring surrogate connection...');
      this.surrogateConnection_ = freedom['core.uproxypeerconnection'](config);
      this.surrogateConnection_.on('signalForPeer',
          (signal:WebRtc.SignallingMessage) => {
        var churnSignal :Churn.ChurnSignallingMessage =
            <Churn.ChurnSignallingMessage>signal;
        churnSignal.churnStage = 1;
        this.dispatchEvent_('signalForPeer', churnSignal);
      });
      // Once the surrogate connection has been successfully established,
      // we want to tear it down and setup the obfuscated connection.
      this.surrogateConnection_.onceConnected().then(
          (endpoints:WebRtc.ConnectionAddresses) => {
        this.surrogateConnection_.close().then(() => {
          this.configureObfuscatedConnection_(endpoints);
        });
      });
    }

    // Establishes the two pipes required to sustain the obfuscated
    // connection:
    //  - a non-obfuscated, local only, between WebRTC and a new,
    //    automatically allocated, port
    //  - remote, obfuscated, port
    private configurePipes_ = (
        webRtcEndpoint:freedom_Pipe.Endpoint,
        publicEndpoints:WebRtc.ConnectionAddresses) : void => {
      log.debug('configuring pipes...');
      var localPipe = freedom.pipe();
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
      .then((forwardingSocketEndpoint:freedom_Pipe.Endpoint) => {
        this.haveForwardingSocketEndpoint_(forwardingSocketEndpoint);
        log.info('configured local pipe between forwarding socket at ' +
            forwardingSocketEndpoint.address + ':' +
            forwardingSocketEndpoint.port + ' and webrtc at ' +
            webRtcEndpoint.address + ':' + webRtcEndpoint.port);

        var publicPipe = freedom.pipe();
        publicPipe.bind(
            publicEndpoints.local.address,
            publicEndpoints.local.port,
            publicEndpoints.remote.address,
            publicEndpoints.remote.port,
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
              publicEndpoints.local.address + ':' +
              publicEndpoints.local.port + ' <-> ' +
              publicEndpoints.remote.address + ':' +
              publicEndpoints.remote.port);

          // Connect the local pipe to the remote, obfuscating, pipe.
          localPipe.on('message', (m:freedom_Pipe.Message) => {
            publicPipe.send(m.data);
          });
          publicPipe.on('message', (m:freedom_Pipe.Message) => {
            localPipe.send(m.data);
          });
        })
        .catch((e:Error) => {
          log.error('error setting up obfuscated pipe: ' + e.message);
        });
      });
    }

    private configureObfuscatedConnection_ = (
        endpoints:WebRtc.ConnectionAddresses) => {
      log.debug('configuring obfuscated connection...');
      // TODO: It may be safe to re-use the config supplied to the constructor.
      var config :WebRtc.PeerConnectionConfig = {
        webrtcPcConfig: {
          iceServers: []
        },
        webrtcMediaConstraints: {
          optional: [{DtlsSrtpKeyAgreement: true}]
        }
      };
      this.obfuscatedConnection_ = freedom['core.uproxypeerconnection'](config);
      this.obfuscatedConnection_.on('signalForPeer',
          (signal:WebRtc.SignallingMessage) => {
        // Super-paranoid check: remove candidates from SDP messages.
        // This can happen if a connection is re-negotiated.
        // TODO: We can safely remove this once we can reliably interrogate
        //       peerconnection endpoints.
        if (signal.type === WebRtc.SignalType.OFFER ||
            signal.type === WebRtc.SignalType.ANSWER) {
          signal.description.sdp =
              Provider.filterCandidatesFromSdp(signal.description.sdp);
        }
        if (signal.type === WebRtc.SignalType.CANDIDATE) {
          // This will tell us on which port webrtc is operating.
          // Record it and inject a fake endpoint, to be sure the remote
          // side never knows the real address (can be an issue when both
          // hosts are on the same network).
          this.haveWebRtcEndpoint_(
            Churn.Provider.extractEndpointFromCandidateLine(
              signal.candidate.candidate));
          signal.candidate.candidate =
            Churn.Provider.setCandidateLineEndpoint(
              signal.candidate.candidate, {
                address: '0.0.0.0',
                port: 0
              });
        }
        var churnSignal :Churn.ChurnSignallingMessage =
            <Churn.ChurnSignallingMessage>signal;
        churnSignal.churnStage = 2;
        this.dispatchEvent_('signalForPeer', churnSignal);
      });
      this.obfuscatedConnection_.onceConnected().then(
          (endpoints:WebRtc.ConnectionAddresses) => {
        this.obfuscatedConnection_.on('dataFromPeer',
            this.dispatchEvent_.bind(null, 'dataFromPeer'));
        this.obfuscatedConnection_.on('peerOpenedChannel',
            this.dispatchEvent_.bind(null, 'peerOpenedChannel'));
        this.churnSetup_();
      });
      this.pc2Setup_();
    }

    public negotiateConnection = () : Promise<WebRtc.ConnectionAddresses> => {
      // TODO: propagate errors.
      log.debug('negotiating initial connection...');
      this.surrogateConnection_.negotiateConnection();
      return this.oncePc2Setup_.then(() => {
        log.debug('negotiating obfuscated connection...');
        return this.obfuscatedConnection_.negotiateConnection();
      });
    }

    // Forward the message to the relevant stage: surrogate or obfuscated.
    // In the case of obfuscated signalling channel messages, we inject our
    // local forwarding socket's endpoint.
    public handleSignalMessage = (
        signal:Churn.ChurnSignallingMessage) : Promise<void> => {
      if (signal.churnStage == 1) {
        return this.surrogateConnection_.handleSignalMessage(signal);
      } else if (signal.churnStage == 2) {
        if (signal.type === WebRtc.SignalType.CANDIDATE) {
          return this.onceHaveForwardingSocketEndpoint_.then(
              (forwardingSocketEndpoint:freedom_Pipe.Endpoint) => {
            signal.candidate.candidate =
              Churn.Provider.setCandidateLineEndpoint(
                signal.candidate.candidate, forwardingSocketEndpoint);
            return this.obfuscatedConnection_.handleSignalMessage(signal);
          });
        } else {
          return this.obfuscatedConnection_.handleSignalMessage(signal);
        }
      } else {
        // Should never happen. Incompatible remote version?
        return Promise.reject(new Error(
          'unknown churn stage in signalling channel message: ' +
          signal.churnStage));
      }
    }

    public openDataChannel = (channelLabel:string) : Promise<void> => {
      return this.obfuscatedConnection_.openDataChannel(channelLabel);
    }

    public closeDataChannel = (channelLabel:string) : Promise<void> => {
      return this.obfuscatedConnection_.closeDataChannel(channelLabel);
    }

    public onceDataChannelOpened = (channelLabel:string) : Promise<void> => {
      return this.obfuscatedConnection_.onceDataChannelOpened(channelLabel);
    }

    public onceDataChannelClosed = (channelLabel:string) : Promise<void> => {
      return this.obfuscatedConnection_.onceDataChannelClosed(channelLabel);
    }

    public send = (channelLabel:string, data:WebRtc.Data) : Promise<void> => {
      return this.obfuscatedConnection_.send(channelLabel, data);
    }

    public close = () : Promise<void> => {
      return this.obfuscatedConnection_.close();
    }

    public onceConnected = () : Promise<WebRtc.ConnectionAddresses> => {
      // obfuscatedConnection_ doesn't exist until onceChurnSetup_ fulfills.
      return this.onceChurnSetup_.then(() => {
        return this.obfuscatedConnection_.onceConnected();
      });
    }

    public onceConnecting = () : Promise<void> => {
      return this.surrogateConnection_.onceConnecting();
    }

    public onceDisconnected = () : Promise<void> => {
      // obfuscatedConnection_ doesn't exist until onceChurnSetup_ fulfills.
      return this.onceChurnSetup_.then(() => {
        return this.obfuscatedConnection_.onceDisconnected();
      });
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
    public static filterCandidatesFromSdp = (sdp:string) : string => {
      return sdp.split('\n').filter((s) => {
        return s.indexOf('a=candidate') != 0;
      }).join('\n');
    }

    private static isHostCandidateLine_ = (candidate:string) : string[] => {
      var lines = candidate.split(' ');
      if (lines.length != 10 || lines[6] != 'typ') {
        throw new Error('cannot parse candidate line: ' + candidate);
      }
      var typ = lines[7];
      if (typ != 'host') {
        throw new Error('cannot parse candidate line: ' + candidate);
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
    public static extractEndpointFromCandidateLine = (
        candidate:string) : freedom_Pipe.Endpoint => {
      var lines = Churn.Provider.isHostCandidateLine_(candidate);
      var address = lines[4];
      var port = parseInt(lines[5]);
      if (port != port) {
        // Check for NaN.
        throw new Error('invalid port in candidate line: ' + candidate);
      }
      return {
        address: address,
        port: port
      }
    }

    // Extracts the endpoint from an SDP candidate line.
    // Raises an exception if the supplied string is not a candidate line of
    // type host.
    //
    // See #extractEndpointFromCandidateLine.
    public static setCandidateLineEndpoint = (
        candidate:string, endpoint:freedom_Pipe.Endpoint) : string => {
      var lines = Churn.Provider.isHostCandidateLine_(candidate);
      lines[4] = endpoint.address;
      lines[5] = endpoint.port.toString();
      return lines.join(' ');
    }
  }

  if (typeof freedom !== 'undefined') {
    freedom.churn().providePromises(Churn.Provider);
  }
}
