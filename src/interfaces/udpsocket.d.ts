/**
 * Interface for a UDP socket.
 */

declare module UdpSocket {

  // Type for the chrome.socket.getInfo callback:
  //   https://developer.chrome.com/apps/sockets_udp#type-SocketInfo
  // This is also the type returned by getInfo().
  export interface SocketInfo {
    // Note that there are other fields but these are the ones we care about.
    localAddress:string;
    localPort:number;
  }

  export interface API {
    bind:any;
    sendTo:any;
    getInfo:any;
    destroy:any;
    on?:any;
  }

}
