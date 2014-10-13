/// <reference path="../socks-common/socks-headers.d.ts" />
/// <reference path="../freedom/coreproviders/uproxylogging.d.ts" />
/// <reference path="../freedom/coreproviders/uproxypeerconnection.d.ts" />
/// <reference path="../freedom/typings/freedom.d.ts" />
/// <reference path="../handler/queue.d.ts" />
/// <reference path="../networking-typings/communications.d.ts" />
/// <reference path="../churn/churn.d.ts" />
/// <reference path="../webrtc/datachannel.d.ts" />
/// <reference path="../webrtc/peerconnection.d.ts" />
/// <reference path="../tcp/tcp.d.ts" />
/// <reference path="../third_party/typings/es6-promise/es6-promise.d.ts" />
declare module SocksToRtc {
    import WebrtcLib = freedom_UproxyPeerConnection;
    class SocksToRtc {
        onceReady: Promise<Net.Endpoint>;
        private onceStarted_;
        onceStarted: () => Promise<void>;
        private onceStopped_;
        onceStopped: () => Promise<void>;
        signalsForPeer: Handler.Queue<WebRtc.SignallingMessage, void>;
        bytesReceivedFromPeer: Handler.Queue<number, void>;
        bytesSentToPeer: Handler.Queue<number, void>;
        private tcpServer_;
        private peerConnection_;
        private sessions_;
        constructor(endpoint?: Net.Endpoint, pcConfig?: WebRtc.PeerConnectionConfig, obfuscate?: boolean);
        setResources(tcpServer: Tcp.Server, peerconnection: WebrtcLib.Pc): void;
        makeDefaultOnceStarted(): void;
        makeOnceStarted(socketReady: Promise<any>, pcReady: Promise<any>): void;
        makeDefaultOnceStopped(): void;
        makeOnceStopped(socketStopped: Promise<any>, pcStopped: Promise<any>): void;
        stop: () => void;
        private cleanup_;
        public makeTcpToRtcSession(tcpConnection:Tcp.Connection): void;
        handleSignalFromPeer: (signal: WebRtc.SignallingMessage) => void;
        private onDataFromPeer_;
        toString: () => string;
    }
    class Session {
        tcpConnection: Tcp.Connection;
        private peerConnection_;
        private bytesReceivedFromPeer;
        private bytesSentToPeer;
        private channelLabel_;
        onceReady: Promise<Net.Endpoint>;
        onceClosed: Promise<void>;
        private dataChannelIsClosed_;
        private dataFromPeer_;
        constructor(tcpConnection: Tcp.Connection, peerConnection_: WebrtcLib.Pc, bytesReceivedFromPeer: Handler.Queue<number, void>, bytesSentToPeer: Handler.Queue<number, void>);
        longId: () => string;
        close: () => Promise<void>;
        handleDataFromPeer: (data: WebRtc.Data) => void;
        channelLabel: () => string;
        toString: () => string;
        private doAuthHandshake_;
        private receiveEndpointFromPeer_;
        private doRequestHandshake_;
        private linkTcpAndPeerConnectionData_;
    }
}
