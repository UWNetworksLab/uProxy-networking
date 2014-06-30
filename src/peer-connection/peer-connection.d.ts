/// <reference path="../arraybuffers/arraybuffers.d.ts" />
/// <reference path="../handler/queue.d.ts" />
/// <reference path="../third_party/promise/promise.d.ts" />
/// <reference path="../third_party/typings/webrtc/RTCPeerConnection.d.ts" />
/// <reference path="../third_party/typings/webcrypto/WebCrypto.d.ts" />

declare module WebRtc {
  interface SignallingMessage {
    candidate?: RTCIceCandidate;
    sdp?: RTCSessionDescription;
  }
  enum State {
    WAITING = 0,
    CONNECTING = 1,
    CONNECTED = 2,
    DISCONNECTED = 3,
  }

  var randomUint32: () => number;
  var stringHash: (s: string, bytes: number) => string;

  class PeerConnection {
    constructor(peerName: string, createOffer: boolean, stunServers: string[]);
    public peerName: string;
    public pcState: State;
    public onceConnected: Promise<void>;
    public onceDisconnected: Promise<void>;
    public peerCreatedChannelQueue: Handler.Queue<DataChannel, void>;
    public toPeerSignalQueue: Handler.Queue<SignallingMessage, void>;
    public fromPeerSignalQueue: Handler.Queue<SignallingMessage, void>;
    public toString: () => string;
    public close: () => void;
    public handlerSignalMessage: (signal: SignallingMessage) => Promise<void>;
    public openDataChannel: (channelLabel: string, options?: RTCDataChannelInit) => DataChannel;
  }
}
