// This file defines, in typescript, the API for a freedom module created via a
// call to `freedom['TcpServer']()`. Note: this is the inverse of what you see
// at the bottom of the main module file (tcp- echo- server in this case). The
// 'TcpServer' binding comes from a module that depends on the freedom echo
// server module. e.g. in samples/echo-server-chromeapp, the echoserver is the
// top-level module and you see a freedom.emit('start', endpoint) in the
// background.js file.

/// <reference path='../networking-typings/communications.d.ts' />

declare module freedom_TcpEchoServer {
  interface TcpEchoServer {
    emit(type:string, value:Object) : void;
    emit(type:'start', endpoint:Net.Endpoint) : void;

    emit(type:string) : void;
    emit(type:'stop') : void
  }
}
