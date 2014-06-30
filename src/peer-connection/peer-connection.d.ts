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
        public peerName: string;
        private pc_;
        private pcDataChannels_;
        private fulfillConnected_;
        private rejectConnected_;
        private fulfillDisconnected_;
        public pcState: State;
        public onceConnected: Promise<void>;
        public onceDisconnected: Promise<void>;
        public peerCreatedChannelQueue: Handler.Queue<DataChannel, void>;
        public toPeerSignalQueue: Handler.Queue<SignallingMessage, void>;
        public fromPeerSignalQueue: Handler.Queue<SignallingMessage, void>;
        constructor(peerName: string, createOffer: boolean, stunServers: string[]);
        private createOffer_;
        private createAnswer_;
        private setLocalDescription_;
        private setRemoteDescription_;
        public toString: () => string;
        public close: () => void;
        private onSignallingStateChange_;
        private negotiateConnection_;
        public handlerSignalMessage: (signal: SignallingMessage) => Promise<void>;
        private signalMessageHandler_;
        public openDataChannel: (channelLabel: string, options?: RTCDataChannelInit) => DataChannel;
        private onPeerStartedDataChannel_;
        private addRtcDataChannel_;
    }
}
