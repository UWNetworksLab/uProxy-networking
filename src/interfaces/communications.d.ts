// Types for communications between socks-to-rtc and rtc-to-net.

declare module Channel {
  // "Top-level" message for the control channel.
  export interface Command {
    // Name of message, e.g. NetConnectRequest.
    type:string;
    // Datachannel with which this message is associated.
    tag?:string;
    // JSON-encoded message, e.g. NetConnectRequest.
    data?:string;
  }

  // Sent to request a connection be established with a remote server.
  export interface NetConnectRequest {
    // 'tcp' or 'udp'.
    protocol:string;
    // Destination address and port.
    address:string;
    port:number;
  }

  export interface NetConnectResponse {
    // Address and port on which we have made the connection to the
    // remote server, or both undefined if the connection could not be
    // made.
    address?:string;
    port?:number;
  }

  // Should be returned after tieing a data-channel with SOCKS, back to form an
  // endpoint response to the local TCP server.
  export interface EndpointInfo {
    ipAddrString:string;
    port:number;
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
