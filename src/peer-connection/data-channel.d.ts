/// <reference path="../handler/queue.d.ts" />
/// <reference path="../third_party/promise/promise.d.ts" />
/// <reference path="../third_party/typings/webrtc/RTCPeerConnection.d.ts" />

declare module WebRtc {
  interface Data {
    str?: string;
    buffer?: Uint8Array;
  }
  class DataChannel {
    constructor(rtcDataChannel: RTCDataChannel);
    public label: string;
    public fromPeerDataQueue: Handler.Queue<Data, void>;
    public toPeerDataQueue: Handler.Queue<Data, void>;
    public onceOpenned: Promise<void>;
    public onceClosed: Promise<void>;
  }
}
