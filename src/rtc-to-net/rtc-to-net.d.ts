/// <reference path="../freedom/coreproviders/uproxypeerconnection.d.ts" />
/// <reference path="../handler/queue.d.ts" />
/// <reference path="../webrtc/datachannel.d.ts" />
/// <reference path="../webrtc/peerconnection.d.ts" />
/// <reference path="../tcp/tcp.d.ts" />
/// <reference path="../third_party/typings/es6-promise/es6-promise.d.ts" />

declare module RtcToNet {
  interface ProxyConfig {
    allowNonUnicast :boolean;
  }
  class RtcToNet {
    constructor(pcConfig?:WebRtc.PeerConnectionConfig,
                proxyConfig?:ProxyConfig,
                obfuscate?:boolean);
    public start :(
        proxyConfig:ProxyConfig,
        peerconnection:freedom_UproxyPeerConnection.Pc) => Promise<void>;
    public proxyConfig :ProxyConfig;
    public signalsForPeer :Handler.Queue<WebRtc.SignallingMessage, void>;
    public bytesReceivedFromPeer :Handler.Queue<number, void>;
    public bytesSentToPeer :Handler.Queue<number, void>;
    public onceReady :Promise<void>;
    public onceClosed :Promise<void>;
    public close :() => void;
    public handleSignalFromPeer :(signal:WebRtc.SignallingMessage) => void;
    public toString :() => string;
  }
  class Session {
    constructor(channelLabel_:string,
                peerConnection_:freedom_UproxyPeerConnection.Pc,
                proxyConfig:ProxyConfig);

    public start :() => Promise<void>;
    public onceReady :Promise<void>;

    public stop :() => void;
    public onceStopped :() => Promise<void>;
    public isStopped :() => boolean;

    public proxyConfig :ProxyConfig;
    public tcpConnection :Tcp.Connection;
    public channelLabel :() => string;
    public longId :() => string;
    public handleWebRtcDataFromPeer :(webrtcData: WebRtc.Data) => void;
    public toString :() => string;
  }
}
