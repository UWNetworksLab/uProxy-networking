// Types for communications between socks-to-rtc and rtc-to-net.

/// <reference path="../third_party/typings/es6-promise/es6-promise.d.ts" />
/// <reference path='../handler/queue.d.ts' />

// |PeerSignal| holds information for signals to peers from RtcToNet. This
// includes a peerId which is used to identify which peer to send signaling
// messages to, or to indicate which peer sent RtcToNet a signalling message.
// Signalling messages pass the SDP headers that contain the public facing
// IP/PORT for establishing P2P connections.
interface PeerSignal {
  peerId :string;
  data :string;
}

// Useful abbreviation for this common interface.
declare module Net {
  // TODO: Rename this to TransportAddress.
  export interface Endpoint {
    address:string;  // TODO: rename to IpAddress
    port:number;
  }

  export enum Protocol {
    UDP, TCP
  }

  // Sent to request a connection be established with a remote server.
  export interface ConnectRequest {
    // 'tcp' or 'udp'.
    protocol :Protocol;
    // Destination address and port.
    endpoint :Endpoint
  }

  // Interface that wraps up data that can be transported to an endpoint, e.g. a
  // stream of data to a TCP socket or over WebRTC.
  export interface Transport {
    onceConnected: Promise<void>;
    onceClosed: Promise<void>;

    send: (data:ArrayBuffer) => Promise<void>;
    // Calling receive sets |dataFromTransportQueue|'s handler.
    receive: () => Promise<ArrayBuffer>;

    // `dataToPeerQueue` has handler set by class when `onceConnected` is
    // `fulfilled.
    dataToTransportQueue: Handler.Queue<ArrayBuffer, void>;
    dataFromTransportQueue: Handler.Queue<ArrayBuffer, void>;

    close: () => Promise<void>;
  }

}
