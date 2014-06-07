// Types for communications between socks-to-rtc and rtc-to-net.

// Useful abbreviation for this common interface.
interface AddressAndPort {
  address :string;
  port :number;
}

// Signals to peers from RtcToNet include a peerId which is used to identify
// which peer to send signaling messages to, or to indicate which peer sent
// RtcToNet a signalling message. Signalling messages pass the SDP headers that
// contain the public facing IP/PORT for establishing P2P connections.
interface PeerSignal {
  peerId :string;
  data :string;
}

// Interfaces and enums for P2P DataChannels used for socks-rtc proxying.
declare module Channel {

  // Commands send over a special command data channel.
  export enum COMMANDS {
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
    type:COMMANDS;
    // Datachannel with which this message is associated.
    tag?:string;
    // JSON-encoded message, e.g. NetConnectRequest, depends on `type`.
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

  // Used for communication between the TCP-facing SOCKS server and the WebRTC-
  // facing SocksToRtc module when creating a new data channel for  proxying.
  //
  // At some point these might diverge but right now they both need to send data
  // to the other side and be notified of terminations from the other side so
  // this common interface works for us.
  export interface EndpointInfo {
    // 'tcp' or 'udp'.
    protocol:string;
    // Address on which we connected to the remote server.
    address:string;
    // Port on which we connected to the remote server.
    port:number;
    // Function which sends data to the other side.
    send:(bytes:ArrayBuffer) => any;
    // Function which tells the other side to terminate.
    terminate:() => any;
  }

  // Used to batch messages sent over the signalling channel.
  // TODO: rename to MessageBatch
  export interface BatchedMessages {
    version :number;
    messages :string[];
  }

}  // module Channel
