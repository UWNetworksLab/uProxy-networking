/// <reference path="../networking-typings/communications.d.ts" />
declare module Socks {
    var VERSION5 :number;
    enum Auth {
        NOAUTH = 0,
        GSSAPI = 1,
        USERPASS = 2,
        NONE = 255,
    }
    enum Command {
        TCP_CONNECT = 1,
        TCP_BIND = 2,
        UDP_ASSOCIATE = 3,
    }
    enum AddressType {
        IP_V4 = 1,
        DNS = 3,
        IP_V6 = 4,
    }
    enum Response {
        SUCCEEDED = 0,
        FAILURE = 1,
        NOT_ALLOWED = 2,
        NETWORK_UNREACHABLE = 3,
        HOST_UNREACHABLE = 4,
        CONNECTION_REFUSED = 5,
        TTL_EXPIRED = 6,
        UNSUPPORTED_COMMAND = 7,
        ADDRESS_TYPE = 8,
        RESERVED = 9,
    }
    interface Destination {
        addressType :AddressType;
        endpoint :Net.Endpoint;
        addressByteLength :number;
    }
    interface Request {
        version :number;
        command :Command;
        destination :Destination;
    }
    interface UdpMessage {
        frag :number;
        destination :Destination;
        data :Uint8Array;
    }
    // The interpret functions fail by throwing an error.
    function interpretAuthHandshakeBuffer(buffer :ArrayBuffer) : Auth[];
    function composeAuthHandshake(auths:Auth[]) : Uint8Array;
    function composeAuthResponse(auth :Auth) : ArrayBuffer;
    function interpretAuthResponse(byteArray:Uint8Array) : Auth;
    function interpretRequestBuffer(buffer :ArrayBuffer) : Request;
    function interpretRequest(byteArray :Uint8Array) : Request;
    function composeRequest(request:Request) : Uint8Array;
    function interpretUdpMessage(byteArray :Uint8Array) : UdpMessage;
    function interpretDestination(byteArray :Uint8Array) : Destination;
    function composeDestination(destination:Destination) : Uint8Array;
    function interpretIpv6Address(uint16View :Uint16Array) : string;
    function composeRequestResponse(endpoint :Net.Endpoint) : ArrayBuffer;
}
