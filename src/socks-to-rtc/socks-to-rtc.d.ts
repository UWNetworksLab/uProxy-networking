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
    class SocksToRtc {
        onceStarted: () => Promise<void>;
        onceReady: Promise<Net.Endpoint>;
        onceStopped: () => Promise<void>;
        signalsForPeer: Handler.Queue<WebRtc.SignallingMessage, void>;
        bytesReceivedFromPeer: Handler.Queue<number, void>;
        bytesSentToPeer: Handler.Queue<number, void>;
        constructor(endpoint?: Net.Endpoint, pcConfig?: WebRtc.PeerConnectionConfig, obfuscate?: boolean);
        configure(tcpServer: Tcp.Server, peerconnection: freedom_UproxyPeerConnection.Pc): void;
        makeOnceStarted(serverReady: Promise<any>, peerconnectionReady: Promise<any>): void;
        makeOnceStopped(serverTerminated: Promise<any>, peerconnectionTerminated: Promise<any>): void;
        stop: () => Promise<void>;
        makeTcpToRtcSession: (tcpConnection: Tcp.Connection) => void;
        handleSignalFromPeer: (signal: WebRtc.SignallingMessage) => void;
        toString: () => string;
    }
    class Session {
        onceReady: Promise<Net.Endpoint>;
        onceClosed: Promise<void>;
        constructor(tcpConnection: Tcp.Connection, peerConnection_: freedom_UproxyPeerConnection.Pc, bytesReceivedFromPeer: Handler.Queue<number, void>, bytesSentToPeer: Handler.Queue<number, void>);
        longId: () => string;
        close: () => Promise<void>;
        handleDataFromPeer: (data: WebRtc.Data) => void;
        channelLabel: () => string;
        toString: () => string;
    }
}
