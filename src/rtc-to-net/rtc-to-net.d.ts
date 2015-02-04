/// <reference path="../handler/queue.d.ts" />
/// <reference path='../freedom/typings/rtcpeerconnection.d.ts' />
/// <reference path="../webrtc/datachannel.d.ts" />
/// <reference path="../webrtc/peerconnection.d.ts" />
/// <reference path="../tcp/tcp.d.ts" />
/// <reference path="../third_party/typings/es6-promise/es6-promise.d.ts" />

declare module RtcToNet {
  interface ProxyConfig {
    allowNonUnicast :boolean;
  }
  class RtcToNet {
    constructor(pcConfig?:freedom_RTCPeerConnection.RTCConfiguration,
                proxyConfig?:ProxyConfig,
                obfuscate?:boolean);
    public start :(
        proxyConfig:ProxyConfig,
        peerconnection:WebRtc.PeerConnection) => Promise<void>;
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
    constructor(channel:WebRtc.DataChannel,
                proxyConfig:ProxyConfig,
                bytesReceivedFromPeer:Handler.Queue<number,void>,
                bytesSentToPeer:Handler.Queue<number,void>);

    public start :() => Promise<void>;
    public onceReady :Promise<void>;

    public stop :() => void;
    public onceStopped :() => Promise<void>;
    public isStopped :() => boolean;

    public proxyConfig :ProxyConfig;
    public tcpConnection :Tcp.Connection;
    public channelLabel :() => string;
    public longId :() => string;
    public toString :() => string;
  }
}
