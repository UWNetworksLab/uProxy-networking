// This file provides the freedom interface that is available to a freedom
// module created via a call to `freedom.['moduleName']()`. Note: this is the
// inverse of what you see at the bottom of the main module file (socks-to-rtc
// in this case).

/// <reference path='../interfaces/communications.d.ts' />

declare module freedom {
  interface SocksToRtc {
    emit(type:string, value:Object) : void;
    emit(type:'handleSignalFromPeer', signalFromPeer:string) : void;
    emit(type:'start', endpoint:Net.Endpoint) : void;

    emit(type:string) : void;

    emit(type:'stop') : void

    on(type:string, readyHandler:Function);
    on(type:'ready', f:()=>void);
    on(type:'socksToRtcSuccess', f:(endpoint:Net.Endpoint) => void);
    on(type:'socksToRtcFailure', f:(endpoint:Net.Endpoint) => void);
    on(type:'sendSignalToPeer', f:(msg:string) => void);
  }
}


/*
declare module freedom {
  // Once the socks-rtc module is ready, it emits 'ready'.
  function emit(t:'ready') : void;

  // Start is expected to start a SOCKS5 proxy listening at the given endpoint.
  // It is expected to result in signalling messages being sent and received,
  // and eventually either the
  function on(t:'start', f:(endpoint:Net.Endpoint) => void) : void;

  // Signalling messages are used by WebRTC to send/receive data needed to setup
  // the P2P connection. e.g. public facing port and IP. It is assumed that
  // signalling messages go to the peer that is acting as the end-point of the
  // socks5 proxy server.
  function on(t:'handleSignalFromPeer', f:(signal:string) => void) : void;
  function emit(t:'sendSignalToPeer', s:string);

  // Once a connection to the peer has successfully been established, socks-to-
  // rtc emits a |socksToRtcSuccess| message.
  function emit(t:'socksToRtcSuccess');
  // If the connection to the peer failed, socks-to-rtc emits a
  // |socksToRtcFailure| message.
  function emit(t:'socksToRtcFailure');

  // socks-to-rtc is expected to send a |socksToRtcTimeout| if the connection to
  // the peer is lost for more than a given time , e.g. the peer's computer
  // lost connectivity.
  function emit(t:'socksToRtcTimeout');

  // TODO: add an emit for when the remote side closes down the peer-connection,
  // or rename |socksToRtcTimeout| to capture that case too.

  // When stop is called, it is expected that socks-to-rtc stops listening on
  // the endpoint given to start and that it closes to the peer.
  function on(t:'stop', f:() => void) : void;
}
*/
