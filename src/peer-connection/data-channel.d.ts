/// <reference path="../third_party/promise/promise.d.ts" />
/// <reference path="../third_party/typings/webrtc/RTCPeerConnection.d.ts" />

/// <reference path="../handler/queue.ts" />

declare module WebRtc {

  interface Data {
    // Only one of these should be specified.
    // TODO: use union type once it is supported in TypeScript.
    str    ?:string;
    buffer ?:Uint8Array;
  }

  class DataChannel {
    constructor(rtcDataChannel: RTCDataChannel);

    // Guarenteed to be invarient for the life of the data channel.
    public getLabel :() => string;
    public getState :() => string;  // 'connecting', 'open', 'closed'

    // Promise for when the data channel has been openned.
    public onceOpenned :Promise<void>;
    // Promise for when the data channel has been closed (only fulfilled after
    // the data channel has been openned).
    public onceClosed :Promise<void>;

    // Data from the peer. No data will be added to the queue after |onceClosed|
    // is fulfilled.
    public fromPeerDataQueue :Handler.Queue<Data, void>;

    // Send data; promise returns when all the data has been passed on to the
    // undertlying network layer for ending.
    public send :(data:Data) => Promise<void>;
  }
}
