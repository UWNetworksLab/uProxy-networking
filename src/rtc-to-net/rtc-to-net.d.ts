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

  // Type checking for snapshots.
  // Snapshots are spewed out every couple of seconds in DEBUG mode
  // for later analysis.
  interface HandlerQueueSnapshot {
    // Number of objects waiting to be handled right now.
    size :number;
    // True iff there is a handler attached right now.
    handling :boolean;
  }

  interface SocketSnapshot {
    // Total number of bytes sent since the connection was created.
    sent :number;
    // Total number of bytes received since the connection was created.
    received :number;
    // Data received from the peer.
    queue :HandlerQueueSnapshot;
  }

  interface DataChannelSnapshot {
    // Total number of bytes sent since the channel was created.
    sent :number;
    // Total number of bytes received since the channel was created.
    received :number;
    // Number of bytes sitting in the buffer right now.
    buffered :number;
    // Data received from the peer.
    queue :HandlerQueueSnapshot;
  }

  interface SessionSnapshot {
    // Name of this session, e.g. c0 or c221.
    name :string;
    // Data channel associated with this session.
    channel :DataChannelSnapshot;
    // TCP connection associated with this session.
    socket :SocketSnapshot;
  }

  interface RtcToNetSnapshot {
    // All sessions open right now.
    sessions :SessionSnapshot[];
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
    public initiateSnapshotting :() => void;
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
    public getSnapshot :() => SessionSnapshot;
  }
}
