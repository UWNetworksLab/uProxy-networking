// Types for communications between socks-to-rtc and rtc-to-net.

/// <reference path='../third_party/promise/promise.d.ts' />
/// <reference path='../handler/queue.ts' />

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

// Interfaces and enums for P2P DataChannels used for socks-rtc proxying.
declare module Channel {

  // Commands send over a special command data channel.
  export enum Commands {
    // TODO REQUEST/RESPONCE no longer should go on the command channel.
    NET_CONNECT_REQUEST = 1,   // implies `data :NetConnectRequest`
    NET_CONNECT_RESPONSE = 2,  // implies `data :NetConnectResponse`
    NET_DISCONNECTED = 3,      // implies there is no data
    SOCKS_DISCONNECTED = 4,    // implies there is no data
    HELLO = 5,
    PING = 6,
    PONG = 7
  }

  // "Top-level" message for the control channel.
  export interface Command {
    // Name of message, e.g. NetConnectRequest.
    type   :Commands;
    // Datachannel with which this message is associated.
    tag    ?:string;
    // JSON-encoded message, e.g. NetConnectRequest, depends on `type`.
    data   ?:string;
  }

  // Used to batch messages sent over the signalling channel.
  // TODO: rename to MessageBatch
  export interface BatchedMessages {
    version :number;
    messages :string[];
  }
}  // module Channel
