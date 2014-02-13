// Types for communications between socks-to-rtc and rtc-to-net.

declare module Channel {

  export interface Message {
    channelLabel?:string;
    text?:string;
    buffer?:ArrayBuffer;
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
