// This file provides the freedom interface that is available to a freedom
// module created via a call to `freedom.['moduleName']()`. Note: this is the
// inverse of what you see at the bottom of the main module file (socks-to-rtc
// in this case).

/// <reference path='../interfaces/communications.d.ts' />

declare module freedom {
  interface RtcToNet {
    emit(type:string, value:Object) : void;
    emit(type:'handleSignalFromPeer', signalFromPeer:PeerSignal) : void;

    emit(type:string) : void;
    emit(type:'start') : void;
    emit(type:'stop') : void

    on(type:string, readyHandler:Function);
    on(type:'ready', readyHandler:()=>void);
  }
}
