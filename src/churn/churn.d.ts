/// <reference path='../freedom/typings/rtcpeerconnection.d.ts' />
/// <reference path='../churn-pipe/churn-pipe.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

declare module Churn {
  // Adds the notion of a stage (first or second) to signalling messages.
  interface ChurnSignallingMessage {
    webrtcMessage ?:WebRtc.SignallingMessage;
    publicEndpoint ?:WebRtc.Endpoint;
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
  var filterCandidatesFromSdp : (sdp:string) => string;

  // Extracts the endpoint from an SDP candidate line.
  // Raises an exception if the supplied string is not a candidate line of
  // type host or the endpoint cannot be parsed.
  //
  // ICE candidate lines look something like this:
  //   a=candidate:1297 1 udp 2122 192.168.1.5 4533 typ host generation 0
  //
  // For more information on candidate lines, see section 15.1 of the RFC:
  //   http://tools.ietf.org/html/rfc5245#section-15.1
  var extractEndpointFromCandidateLine : (candidate:string)
      => freedom_ChurnPipe.Endpoint;

  // Extracts the endpoint from an SDP candidate line.
  // Raises an exception if the supplied string is not a candidate line of
  // type host.
  //
  // See #extractEndpointFromCandidateLine.
  var setCandidateLineEndpoint : (
      candidate:string, endpoint:freedom_ChurnPipe.Endpoint) => string;

  // Represents a UDP NAT mapping "five-tuple": protocol (UDP), internal
  // address and port, and external address and port.
  interface NatPair {
    internal: freedom_ChurnPipe.Endpoint;
    external: freedom_ChurnPipe.Endpoint;
  }

  // Given the list of candidates, selects a NAT mapping to use.
  // This is designed to use mappings produced by a STUN server, but falls
  // back to local ports ("host" candidates) if there is no STUN candidate.
  // Raises an exception if the list contains invalid candidates, or if it
  // does not contain any "srflx" or "host" candidates.
  var selectPublicAddress : (
      candidates:freedom_RTCPeerConnection.RTCIceCandidate[]) => NatPair;

  // Churn.Connection is an implemention of the PeerConnectionInterface that
  // transparently obfuscates the actual traffic.
  class Connection implements
      WebRtc.PeerConnectionInterface<ChurnSignallingMessage> {
      // This peer connection must be "fresh".  It is used for probing,
      // not for communication.
      constructor(probeRtcPc:freedom_RTCPeerConnection.RTCPeerConnection,
                  peerName?:string);

    // The state of this peer connection.
    public pcState :WebRtc.State;

    // All open data channels.
    // NOTE: There exists a bug in Chrome prior to version 37 which causes
    //       entries in this object to continue to exist even after
    //       the remote peer has closed a data channel.
    public dataChannels     :{[channelLabel:string] : WebRtc.DataChannel};

    // The |onceConnecting| promise is fulfilled when |pcState === CONNECTING|.
    // i.e. when either |handleSignalMessage| is called with an offer message,
    // or when |negotiateConnection| is called. The promise is never be rejected
    // and is guarenteed to fulfilled before |onceConnected|.
    public onceConnecting  :Promise<void>;
    // The |onceConnected| promise is fulfilled when pcState === CONNECTED
    public onceConnected :Promise<void>;
    // The |onceDisconnected| promise is fulfilled when pcState === DISCONNECTED
    public onceDisconnected :Promise<void>;

    // Try to connect to the peer. Will change state from |WAITING| to
    // |CONNECTING|. If there was an error, promise is rejected. Otherwise
    // returned promise === |onceConnected|.
    public negotiateConnection :() => Promise<void>;

    // A peer connection can either open a data channel to the peer (will
    // change from |WAITING| state to |CONNECTING|)
    public openDataChannel :(channelLabel: string,
        options?: freedom_RTCPeerConnection.RTCDataChannelInit)
        => Promise<WebRtc.DataChannel>;
    // Or handle data channels opened by the peer (these events will )
    public peerOpenedChannelQueue :Handler.Queue<WebRtc.DataChannel, void>;

    // The |handleSignalMessage| function should be called with signalling
    // messages from the remote peer.
    public handleSignalMessage :(signal:ChurnSignallingMessage) => void;
    // The underlying handler that holds/handles signals intended to go to the
    // remote peer. A handler should be set that sends messages to the remote
    // peer.
    public signalForPeerQueue :Handler.Queue<ChurnSignallingMessage, void>;

    // Closing the peer connection will close all associated data channels
    // and set |pcState| to |DISCONNECTED| (and hence fulfills
    // |onceDisconnected|)
    public close: () => void;

    // Helpful for debugging
    public toString: () => string;
    public peerName :string;
  }
}
