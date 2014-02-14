// Types for communications between socks-to-rtc and rtc-to-net.

declare module Channel {

  export interface Message {
    channelLabel:string;
    text?:string;
    buffer?:ArrayBuffer;
  }

  // Should be returned after tieing a data-channel with SOCKS, back to form an
  // endpoint response to the local TCP server.
  interface EndpointInfo {
    ipAddrString:string;
    port:number;
  }

  interface CloseData {
    channelId:string;
  }

}  // module Channel


// Target peer's information, to be sent over a signalling channel.
interface PeerInfo {
  host:string;
  port:number;
  peerId:string;
}

interface PeerSignal {
  peerId:string;
  data:string;  // Expected in JSON-format.
}
