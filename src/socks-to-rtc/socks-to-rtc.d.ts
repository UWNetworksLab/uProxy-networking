/// <reference path="../freedom/coreproviders/uproxypeerconnection.d.ts" />
/// <reference path="../handler/queue.d.ts" />
/// <reference path="../networking-typings/communications.d.ts" />
/// <reference path="../webrtc/datachannel.d.ts" />
/// <reference path="../webrtc/peerconnection.d.ts" />
/// <reference path="../tcp/tcp.d.ts" />
/// <reference path="../third_party/typings/es6-promise/es6-promise.d.ts" />
declare module SocksToRtc {
  class SocksToRtc {
    constructor(endpoint?:Net.Endpoint,
                pcConfig?:WebRtc.PeerConnectionConfig,
                obfuscate?:boolean);
    public stop :() => Promise<void>;
    public onceReady :Promise<Net.Endpoint>;
    public isStopped :() => boolean;
    public onceStopped :() => Promise<void>;
    public signalsForPeer :Handler.Queue<WebRtc.SignallingMessage, void>;
    public bytesReceivedFromPeer :Handler.Queue<number, void>;
    public bytesSentToPeer :Handler.Queue<number, void>;
    public handleSignalFromPeer :(signal: WebRtc.SignallingMessage) => void;
    public toString :() => string;
    public start :(
        tcpServer:Tcp.Server,
        peerconnection:freedom_UproxyPeerConnection.Pc)
        => Promise<Net.Endpoint>;
    public makeTcpToRtcSession :(tcpConnection:Tcp.Connection) => void;
  }
  class Session {
    constructor(tcpConnection:Tcp.Connection,
                peerConnection_:freedom_UproxyPeerConnection.Pc);
    public tcpConnection :Tcp.Connection;
    public onceReady :Promise<Net.Endpoint>;
    public onceClosed :Promise<void>;
    public longId :() => string;
    public close :() => Promise<void>;
    public handleDataFromPeer :(data:WebRtc.Data) => void;
    public channelLabel :() => string;
    public toString :() => string;
  }
}
