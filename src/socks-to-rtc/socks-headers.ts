/*
  For the RFC for socks, see:
    http://tools.ietf.org/html/rfc1928
*/
/// <reference path='../interfaces/communications.d.ts' />

module Socks {

  // version 5 of socks
  export var VERSION5 = 0x05;

  // AUTH - Authentication methods
  export enum Auth {
    NOAUTH   = 0x00,  // X'00' NO AUTHENTICATION REQUIRED
    GSSAPI   = 0x01,  // X'01' GSSAPI
    USERPASS = 0x02,  // X'02' USERNAME/PASSWORD
                      // X'03' to X'7F' IANA ASSIGNED
                      // X'80' to X'FE' RESERVED FOR PRIVATE METHODS
    NONE     = 0xFF   // X'FF' NO ACCEPTABLE METHODS
  }

  // CMD - Commands
  export enum Command {
    TCP_CONNECT       = 0x01, // Connect to TCP = CONNECT in the RFC.
    TCP_BIND          = 0x02, // Listen for TCP = BIND in the RFC.
    UDP_ASSOCIATE     = 0x03  // Connect to UDP association
  }

  // ATYP - address type of following address.
  export enum AddressType {
    IP_V4 = 0x01,  // IP V4 Address
    DNS   = 0x03,  // DOMAINNAME
    IP_V6 = 0x04   // IP V6 Address
  }

  // REP - Reply Field
  export enum Response {
    SUCCEEDED           = 0x00,  // Succeeded
    FAILURE             = 0x01,  // General SOCKS server failure
    NOT_ALLOWED         = 0x02,  // Connection not allowed by ruleset
    NETWORK_UNREACHABLE = 0x03,  // Network unreachable
    HOST_UNREACHABLE    = 0x04,  // Host unreachable
    CONNECTION_REFUSED  = 0x05,  // Connection refused
    TTL_EXPIRED         = 0x06,  // TTL expired
    UNSUPPORTED_COMMAND = 0x07,  // Command not supported
    ADDRESS_TYPE        = 0x08,  // Address type not supported
    RESERVED            = 0x09   // 0x09 - 0xFF unassigned
  }

  // Represents the destination portion of a SOCKS request.
  // @see interpretDestination
  export interface Destination {
    addressType    :AddressType;
    endpoint       :Net.Endpoint;
    // The length, in bytes, of the address in an arraybuffer. Used to know far
    // to move in the arraybuffer to get to the next bit of data to interpret.
    addressByteLength     :number;
  }

  // Represents a SOCKS request.
  // @see interpretSocksRequest
  export interface Request {
    version        :number;
    command        :Command;
    destination    :Destination;
  }

  // Represents a UDP request message.
  // @see interpretUdpMessage
  export interface UdpMessage {
    frag           :number;
    destination    :Destination;
    data           :Uint8Array;
  }

  // Interprets a SOCKS 5 request, which looks like this:
  //
  //   +----+-----+-------+------+----------+----------+
  //   |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
  //   +----+-----+-------+------+----------+----------+
  //   | 1  |  1  | X'00' |  1   | Variable |    2     |
  //   +----+-----+-------+------+----------+----------+
  export function interpretRequestBuffer(buffer:ArrayBuffer)
      : Request {
    return interpretRequest(new Uint8Array(buffer));
  }
  export function interpretRequest(byteArray:Uint8Array) : Request {
    var version     :number;
    var command     :Command;
    var protocol    :Net.Protocol;
    var destination :Destination;

    // Fail if the request is too short to be valid.
    if(byteArray.length < 9) {
      throw new Error('SOCKS request too short');
    }

    // Fail if client is not talking Socks version 5.
    var version = byteArray[0];
    if (version !== VERSION5) {
      throw new Error('must be SOCKS5');
    }

    command = byteArray[1];
    // Fail unless we got a CONNECT or UDP_ASSOCIATE command.
    if (command != Command.TCP_CONNECT &&
      command != Command.UDP_ASSOCIATE) {
      throw new Error('unsupported SOCKS command (CMD): ' + command);
    }

    destination = interpretDestination(byteArray.subarray(3));

    return {
      version: version,
      command: command,
      destination: destination
    };
  }

  // Interprets a SOCKS5 UDP request, returning the UInt8Array view of the
  // sub-section for the DATA part of the request. The Request looks like this:
  //
  //   +----+------+------+----------+----------+----------+
  //   |RSV | FRAG | ATYP | DST.ADDR | DST.PORT |   DATA   |
  //   +----+------+------+----------+----------+----------+
  //   | 2  |  1   |  1   | Variable |    2     | Variable |
  //   +----+------+------+----------+----------+----------+
  export function interpretUdpMessage(byteArray:Uint8Array) : UdpMessage {
    // Fail if the request is too short to be valid.
    if(byteArray.length < 10) {
      throw new Error('UDP request too short');
    }

    var destination :Destination = interpretDestination(byteArray.subarray(3));

    var udpMessage :UdpMessage = {
      frag: byteArray[2],
      destination: destination,
      data: byteArray.subarray(3 + destination.addressByteLength)
    };

    // Fail if client is requesting fragmentation.
    if (udpMessage.frag !== 0) {
      throw new Error('fragmentation not supported');
    }

    return udpMessage;
  }


  // Interprets this sub-structure, found within both "regular" SOCKS requests
  // and UDP requests:
  //
  //   +------+----------+----------+
  //   | ATYP | DST.ADDR | DST.PORT |
  //   +------+----------+----------+
  //   |  1   | Variable |    2     |
  //   +------+----------+----------+
  //
  // The length of DST.ADDR varies according to the type found (IPv4, IPv6,
  // host name, etc).
  //
  // Returns a Socks.Destination which captures this in a more convenient form.
  export function interpretDestination(byteArray:Uint8Array) : Destination {
    var portOffset   :number;
    var addressType  :AddressType;
    var addressSize  :number;
    var address      :string;
    var port         :number;

    addressType = byteArray[0];
    if (AddressType.IP_V4 == addressType) {
      addressSize = 4;
      address = Array.prototype.join.call(
          byteArray.subarray(1, 1 + addressSize), '.');
      portOffset = addressSize + 1;
    } else if (AddressType.DNS == addressType) {
      addressSize = byteArray[1];
      address = '';
      for (var i = 0; i < addressSize; ++i) {
        address += String.fromCharCode(byteArray[2 + i]);
      }
      portOffset = addressSize + 2;
    } else if (AddressType.IP_V6 == addressType) {
      addressSize = 16;
      address = Socks.interpretIpv6Address(
          new Uint16Array(byteArray.buffer, byteArray.byteOffset + 1, 8));
      portOffset = addressSize + 1;
    } else {
      throw new Error('Unsupported SOCKS address type: ' + addressType);
    }

    // Parse the port.
    port = byteArray[portOffset] << 8 | byteArray[portOffset + 1];

    return {
      addressType: addressType,
      endpoint: { address: address, port: port },
      addressByteLength: portOffset + 2
    }
  }

  // Heler function for parsing an IPv6 address from an Uint16Array portion of
  // a socks address in an arraybuffer.
  export function interpretIpv6Address(uint16View:Uint16Array) : string {
    return Array.prototype.map.call(uint16View, (i) => {
        return (((i & 0xFF) << 8) | ((i >> 8) & 0xFF)).toString(16);
      }).join(':');
  }

  // Examines the supplied session establishment bytes, throwing an
  // error if the requested SOCKS version or METHOD is unsupported.
  export function validateHandshake(buffer:ArrayBuffer) : void {
    var handshakeBytes = new Uint8Array(buffer);

    // Only SOCKS Version 5 is supported.
    var socksVersion = handshakeBytes[0];
    if (socksVersion != Socks.VERSION5) {
      throw new Error('unsupported SOCKS version: ' + socksVersion);
    }

    // Check AUTH methods on SOCKS handshake.
    // Get supported auth methods. Starts from 1, since 0 is already read.
    var authMethods:Socks.Auth[] = [];
    var numAuthMethods:number = handshakeBytes[1];
    for (var i = 0; i < numAuthMethods; i++) {
      authMethods.push(handshakeBytes[2 + i]);
    }
    // Make sure the client supports 'no authentication'.
    if (authMethods.indexOf(Socks.Auth.NOAUTH) <= -1) {
      throw new Error('client requires authentication');
    }
  }

  // Given an endpoint, compose a response.
  export function composeSocksResponse(endpoint:Net.Endpoint) : ArrayBuffer {
    var buffer:ArrayBuffer = new ArrayBuffer(10);
    var bytes:Uint8Array = new Uint8Array(buffer);
    bytes[0] = Socks.VERSION5;
    bytes[1] = Socks.Response.SUCCEEDED;
    bytes[2] = 0x00;
    bytes[3] = Socks.AddressType.IP_V4;

    // Parse IPv4 values.
    var v4 = '([\\d]{1,3})';
    var v4d = '\\.';
    var v4complete = v4+v4d+v4+v4d+v4+v4d+v4
    var v4regex = new RegExp(v4complete);
    var ipv4 = endpoint.address.match(v4regex);
    if (ipv4) {
      bytes[4] = parseInt(ipv4[1]);
      bytes[5] = parseInt(ipv4[2]);
      bytes[6] = parseInt(ipv4[3]);
      bytes[7] = parseInt(ipv4[4]);
    } else {
      console.warn('composeSocksResponse: got non-ipv4, but does not yet ' +
          'support IPv6 or DNS; returning false resolution address of 0.0.0.0');
      bytes[4] = 0;
      bytes[5] = 0;
      bytes[6] = 0;
      bytes[7] = 0;
    }
    // TODO: support IPv6
    bytes[8] = endpoint.port >> 8;
    bytes[9] = endpoint.port & 0xFF;
    // TODO: support DNS
    /* var j = 4;
    if (this.request.atyp == ATYP.DNS) {
      response[j] = this.request.addressSize;
      j++;
    }
    for (var i = 0; i < this.request.addressSize; ++i) {
      response[i + j] = this.request.address[i];
    }
    response[this.request.addressSize + j] = this.request.portByte1;
    response[this.request.addressSize + j + 1] = this.request.portByte2;
    */
    return buffer;
  }

}
