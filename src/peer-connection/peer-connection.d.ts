/// <reference path="../handler/queue.d.ts" />
/// <reference path="../third_party/promise/promise.d.ts" />
/// <reference path="../third_party/typings/webrtc/RTCPeerConnection.d.ts" />
/// <reference path="../third_party/typings/webcrypto/WebCrypto.d.ts" />

declare module WebRtc {

  interface PeerConnectionConfig {
    initiateConnection     :boolean;
    webrtcPcConfig         :RTCPeerConnectionConfig;
    webrtcMediaConstraints :RTCMediaConstraints;
    peerName               ?:string;
  }

  interface SignallingMessage {
    // Should be exactly one of the below
    candidate ?:RTCIceCandidate;
    sdp       ?:RTCSessionDescription;
  }

  enum State {
    WAITING,      // Can move to CONNECTING.
    CONNECTING,   // Can move to CONNECTED or DISCONNECTED.
    CONNECTED,    // Can move to DISCONNECTED.
    DISCONNECTED  // End-state, cannot change.
  };

  class PeerConnection {
    constructor(private config_ :PeerConnectionConfig);

    // The state of this peer connection.
    public pcState :State;

    // The |onceConnected| promise is fulfilled when pcState === CONNECTED
    public onceConnected :Promise<void>;
    // The |onceDisconnected| promise is fulfilled when pcState === DISCONNECTED
    public onceDisconnected :Promise<void>;

    // A peer connection can either open a data channel to the peer (will
    // change from |WAITING| state to |CONNECTING|)
    public openDataChannel :(channelLabel: string,
                             options?: RTCDataChannelInit) => DataChannel;
    // Or handle data channels opened by the peer (these events will )
    public peerCreatedChannels :Handler.Queue<DataChannel, void>;

    // Called with signalling messages from the peer: helpful abbreviation for
    // |fromPeerSignalQueue.handle|
    public handleSignalMessage :(signal:SignallingMessage) => Promise<void>;

    // The underlying handler queues for signals to and from the peer.
    public toPeerSignalQueue :Handler.Queue<SignallingMessage, void>;
    public fromPeerSignalQueue :Handler.Queue<SignallingMessage, void>;

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
