/// <reference path="../interfaces/communications.d.ts" />
/// <reference path="../third_party/typings/webrtc/RTCPeerConnection.d.ts" />
/// <reference path="../third_party/typings/webcrypto/WebCrypto.d.ts" />
/// <reference path="../third_party/promise/promise.d.ts" />

/// <reference path="../handler/queue.ts" />

declare module WebRtc {

  interface PeerConnectionConfig {
    webrtcPcConfig         :RTCPeerConnectionConfig;
    webrtcMediaConstraints :RTCMediaConstraints;
    peerName               ?:string;
    initiateConnection     ?:boolean;
  }

  interface SignallingMessage {
    // Should be exactly one of the below
    candidate ?:RTCIceCandidate;
    sdp       ?:RTCSessionDescription;
  }

  // Once you are connected to the peer, you know the local/remote addresses.
  interface ConnectionAddresses {
    local  :Net.Endpoint;  // the local transport address/port
    remote :Net.Endpoint;  // the remote peer's transport address/port
  }

  enum State {
    WAITING,      // Can move to CONNECTING.
    CONNECTING,   // Can move to CONNECTED or DISCONNECTED.
    CONNECTED,    // Can move to DISCONNECTED.
    DISCONNECTED  // End-state, cannot change.
  }

  class PeerConnection {
    constructor(config:PeerConnectionConfig);

    // The state of this peer connection.
    public pcState :State;

    // The |onceConnected| promise is fulfilled when pcState === CONNECTED
    public onceConnected :Promise<ConnectionAddresses>;
    // The |onceDisconnected| promise is fulfilled when pcState === DISCONNECTED
    public onceDisconnected :Promise<void>;

    // Try to connect to the peer. Will change state from |WAITING| to
    // |CONNECTING|. If there was an error, promise is rejected. Otherwise
    // returned promise === |onceConnected|.
    public negotiateConnection :() => Promise<ConnectionAddresses>;

    // A peer connection can either open a data channel to the peer (will
    // change from |WAITING| state to |CONNECTING|)
    public openDataChannel :(channelLabel: string,
                             options?: RTCDataChannelInit) => DataChannel;
    // Or handle data channels opened by the peer (these events will )
    public peerCreatedChannels :Handler.Queue<DataChannel, void>;

    // The |handleSignalMessage| function should be called with signalling
    // messages from the remote peer.
    public handleSignalMessage :(signal:SignallingMessage) => Promise<void>;
    // The underlying handler that holds/handles signals intended to go to the
    // remote peer. A handler should be set that sends messages to the remote
    // peer.
    public toPeerSignalQueue :Handler.Queue<SignallingMessage, void>;

    // Closing the peer connection will close all associated data channels
    // and set |pcState| to |DISCONNECTED| (and hence fulfills
    // |onceDisconnected|)
    public close: () => void;

    // Helpful for debugging
    public toString: () => string;
    public peerName :string;
  }

  // Generic helper functions useful for debugging.
  var randomUint32 :() => number;
  var stringHash :(s: string, bytes: number) => string;
}
