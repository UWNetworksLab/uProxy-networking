/// <reference path="../handler/queue.d.ts" />
/// <reference path="../networking-typings/communications.d.ts" />
/// <reference path="../webrtc/datachannel.d.ts" />
/// <reference path="../webrtc/peerconnection.d.ts" />
/// <reference path="../tcp/tcp.d.ts" />
/// <reference path="../third_party/typings/es6-promise/es6-promise.d.ts" />
declare module SocksToRtc {
  class SocksToRtc {
    // TODO: make |dispatchEvent| non-optional once modularization is complete.
    constructor(dispatchEvent?:(t:string, f:Function) => any);
    // NOTE: The caller MUST set the on-event handlers before calling start().
    public start :(endpoint:Net.Endpoint,
                   pcConfig:WebRtc.PeerConnectionConfig,
                   obfuscate?:boolean) => Promise<Net.Endpoint>;
    public stop :() => Promise<void>;

    on(t:string, f:Function) : void;
    on(t:'stopped', f:() => void) : void;
    on(t:'signalForPeer', f:(message:Object) => void) : void;
    on(t:'bytesReceivedFromPeer', f:(bytes:number) => void) : void;
    on(t:'bytesSentToPeer', f:(bytes:number) => void) : void;
    public handleSignalFromPeer :(signal: WebRtc.SignallingMessage) => Promise<void>;

    // These methods are exposed here only for testing purposes, and are not
    // actually available through the freedom interface.
    public toString :() => string;
    public startInternal :(
        tcpServer:Tcp.Server,
        peerconnection:WebRtc.PeerConnection)
        => Promise<Net.Endpoint>;
  }

  // This class is exposed here only for testing purposes, and is not
  // actually available through the freedom interface.
  class Session {
    constructor();
    public start :(
        tcpConnection:Tcp.Connection,
        dataChannel:WebRtc.DataChannel,
        bytesSentToPeer:Handler.Queue<number,void>,
        bytesReceivedFromPeer:Handler.Queue<number,void>)
        => Promise<Net.Endpoint>;
    public stop :() => Promise<void>;
    public tcpConnection :Tcp.Connection;
    public onceReady :Promise<Net.Endpoint>;
    public onceStopped :Promise<void>;
    public longId :() => string;
    public channelLabel :() => string;
    public toString :() => string;
  }
}
