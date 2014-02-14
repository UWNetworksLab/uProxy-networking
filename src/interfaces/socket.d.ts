/**
 * Interface for sockets.
 */

declare module Sockets {

  export interface CreateInfo {
    socketId:number;
  }

  export interface ReadInfo {
    socketId:number;
    data:ArrayBuffer;
  }

  // Platform independent, extension on Freedom.
  export interface API {
    create:any;
    listen:any;
    connect:any;
    write:any;
    getInfo:any;
    disconnect:any;
    destroy:any;
    on?:any;
  }

}  // module Sockets
