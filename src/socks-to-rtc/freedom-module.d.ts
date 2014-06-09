// This file provides the freedom interface that is available to a freedom
// module created via a call to `freedom.['moduleName']()`. Note: this is the
// inverse of what you see at the bottom of the main module file (socks-to-rtc
// in this case).
declare module freedom {
  interface SocksToRtc {
    emit(type:string, value:Object) : void;
    emit(type:'handleSignalFromPeer', signalFromPeer:string) : void;

    emit(type:string) : void;
    emit(type:'start') : void;
    emit(type:'stop') : void

    on(type:string, readyHandler:Function);
    on(type:'ready', f:()=>void);
    on(type:'socksToRtcSuccess', f:(endpoint:Net.Endpoint) => void);
    on(type:'socksToRtcFailure', f:(endpoint:Net.Endpoint) => void);
    on(type:'sendSignalToPeer', f:(msg:string) => void);
  }
}
