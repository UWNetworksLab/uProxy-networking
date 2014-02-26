/**
 * Interface for a UDP socket.
 */

declare module UdpSocket {

  export interface RecvFromInfo {
    resultCode:number;
    address:string;
    port:number;
    data:ArrayBuffer
  }

  export interface API {
    bind:any;
    sendTo:any;
    destroy:any;
    on?:any;
  }

}
