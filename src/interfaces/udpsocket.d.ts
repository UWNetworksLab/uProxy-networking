/**
 * Interface for a UDP socket.
 */

declare module UdpSocket {

  export interface API {
    bind:any;
    sendTo:any;
    getInfo:any;
    destroy:any;
    on?:any;
  }

}
