// This file provides the freedom interface that is available to a freedom
// module created via a call to `freedom.['moduleName']()`. Note: this is the
// inverse of what you see at the bottom of the main module file (tcp-echo-
// server in this case).

declare module freedom {
  interface TcpEchoServer {
    emit(type:string, value:Object) : void;
    emit(type:'start', endpoint:Net.Endpoint) : void;

    emit(type:string) : void;
    emit(type:'stop') : void
  }
}
