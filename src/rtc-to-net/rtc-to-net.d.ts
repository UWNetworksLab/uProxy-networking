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
    constructor(pcConfig:WebRtc.PeerConnectionConfig,
                proxyConfig:ProxyConfig,
                obfuscate?:boolean);
    public proxyConfig :ProxyConfig;
    public signalsForPeer :Handler.Queue<WebRtc.SignallingMessage, void>;
    public onceReady :Promise<void>;
    public onceClosed :Promise<void>;
    public close :() => void;
    public handleSignalFromPeer :(signal:WebRtc.SignallingMessage) => void;
    public toString :() => string;
  }
  class Session {
    constructor(peerConnection_:freedom_UproxyPeerConnection.Pc,
                channelLabel_:string,
                proxyConfig:ProxyConfig);
    public close :() => void;
    public proxyConfig :ProxyConfig;
    public tcpConnection :Tcp.Connection;
    public onceReady :Promise<void>;
    public onceClosed :Promise<void>;
    public channelLabel :() => string;
    public isClosed :() => boolean;
    public longId :() => string;
    public handleWebRtcDataFromPeer :(webrtcData: WebRtc.Data) => void;
    public toString :() => string;
  }
}
