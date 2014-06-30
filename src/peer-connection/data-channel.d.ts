/// <reference path="../handler/queue.d.ts" />
/// <reference path="../third_party/promise/promise.d.ts" />
/// <reference path="../third_party/typings/webrtc/RTCPeerConnection.d.ts" />
declare module WebRtc {
    interface Data {
        str?: string;
        buffer?: Uint8Array;
    }
    interface StringData {
        str: string;
    }
    interface BufferData {
        buffer: Uint8Array;
    }
    class DataChannel {
        private rtcDataChannel_;
        public label: string;
        public fromPeerDataQueue: Handler.Queue<Data, void>;
        public toPeerDataQueue: Handler.Queue<Data, void>;
        public onceOpenned: Promise<void>;
        public onceClosed: Promise<void>;
        private wasOpenned_;
        private rejectOpenned_;
        constructor(rtcDataChannel_: RTCDataChannel);
        private onDataFromPeer_;
        private send;
        private chunkStringOntoQueue_;
        private chunkBufferOntoQueue_;
        private handleSendDataToPeer_;
        private conjestionControlSendHandler;
    }
}
