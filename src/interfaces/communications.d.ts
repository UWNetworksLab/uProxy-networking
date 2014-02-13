// Types for communications between socks-to-rtc and rtc-to-net.

declare module Channel {

  export interface Message {
    channelLabel?:string;
    text?:string;
    buffer?:ArrayBuffer;
  }

}  // module Channel

interface PeerSignal {
  peerId:string;
  data:string;  // Expected in JSON-format.
}
