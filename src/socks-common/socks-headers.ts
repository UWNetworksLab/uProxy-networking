/*
  For the RFC for socks, see:
    http://tools.ietf.org/html/rfc1928
*/
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path='../ipaddrjs/ipaddrjs.d.ts' />

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



  // Client to Server (Step 1)
  //
  // Examines the supplied session establishment bytes, throwing an
  // error if the requested SOCKS version or METHOD is unsupported.
  //
  //   +----+----------+----------+
  //   |VER | NMETHODS | METHODS  |
  //   +----+----------+----------+
  //   | 1  |    1     | 1 to 255 |
  //   +----+----------+----------+
  //
  //
  export function interpretAuthHandshakeBuffer(buffer:ArrayBuffer) : Auth[] {
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
    return authMethods;
  }

  export function composeAuthHandshake(auths:Auth[]) : Uint8Array {
    var handshakeBytes = new Uint8Array(auths.length + 2);
    handshakeBytes[0] = Socks.VERSION5;
    handshakeBytes[1] = auths.length;
    handshakeBytes.set(auths, 2);
    return handshakeBytes;
  }

  // Server to Client (Step 2)
  //
  // Given an initial authentication query, compose a response with the support
  // authentication types (none needed).
  export function composeAuthResponse(authType:Socks.Auth)
      : ArrayBuffer {
    var buffer:ArrayBuffer = new ArrayBuffer(2);
    var bytes:Uint8Array = new Uint8Array(buffer);
    bytes[0] = Socks.VERSION5;
    bytes[1] = authType;
    return buffer;
  }

  export function interpretAuthResponse(byteArray:Uint8Array) : Socks.Auth {
    return byteArray[1];
  }

  // Client to Server (Step 3-A)
  //
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

  export function composeRequest(request:Request) : Uint8Array {
    // The header is 3 bytes
    var byteArray = new Uint8Array(3 + request.destination.addressByteLength);
    byteArray[0] = request.version;
    byteArray[1] = request.command;
    byteArray[2] = 0;  // reserved
    byteArray.set(composeDestination(request.destination), 3);
    return byteArray;
  }

  // Client to Server (Step 3-B)
  //
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
      var addressArray =
          Array.prototype.slice.call(byteArray, 1, 1 + addressSize);
      var ipAddress = new ipaddr.IPv4(addressArray);
      address = ipAddress.toString();
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
          byteArray.subarray(1, 1 + addressSize));
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

  // Heler function for parsing an IPv6 address from an Uint8Array portion of
  // a socks address in an arraybuffer.
  export function interpretIpv6Address(byteArray:Uint8Array) : string {
    // |byteArray| contains big-endian shorts, but Uint16Array will read it
    // as little-endian on most platforms, so we have to read it manually.
    var parts :number[] = [];
    for (var i = 0; i < 16; i += 2) {
      parts.push(byteArray[i] << 8 | byteArray[i + 1]);
    }
    var ipAddress = new ipaddr.IPv6(parts);
    return ipAddress.toString();
  }

  export function composeDestination(destination:Destination) : Uint8Array {
    var endpoint = destination.endpoint;
    var address = new Uint8Array(destination.addressByteLength);
    address[0] = destination.addressType;
    var addressSize :number;
    switch (destination.addressType) {
      case AddressType.IP_V4:
        addressSize = 4;
        var ipv4 = ipaddr.IPv4.parse(endpoint.address);
        address.set(ipv4.octets, 1);
        break;
      case AddressType.DNS:
        addressSize = endpoint.address.length + 1;
        address[1] = endpoint.address.length;
        for (var i = 0; i < endpoint.address.length; ++i) {
          address[i + 2] = endpoint.address.charCodeAt(i);
        }
        break;
      case AddressType.IP_V6:
        addressSize = 16;
        var ipv6 = ipaddr.IPv6.parse(endpoint.address);
        address.set(ipv6.toByteArray(), 1);
        break;
      default:
        throw new Error(
            'Unsupported SOCKS address type: ' + destination.addressType);
    }

    var portOffset = addressSize + 1;
    address[portOffset] = endpoint.port >> 8;
    address[portOffset + 1] = endpoint.port & 0xFF;

    return address;
  }

  // Server to Client (Step 4-A)
  //
  // TODO: support failure (https://github.com/uProxy/uproxy/issues/321)
  //
  // Given a destination reached, compose a response.
  export function composeRequestResponse(endpoint:Net.Endpoint)
      : ArrayBuffer {
    var buffer:ArrayBuffer = new ArrayBuffer(10);
    var bytes:Uint8Array = new Uint8Array(buffer);
    bytes[0] = Socks.VERSION5;
    bytes[1] = Socks.Response.SUCCEEDED;
    bytes[2] = 0x00;
    bytes[3] = Socks.AddressType.IP_V4;

    // Parse IPv4 values.
    var address = ipaddr.parse(endpoint.address);
    if (address.kind() == 'ipv4') {
      bytes.set(address.toByteArray(), 4);
    } else {
      console.warn('composeRequestResponse: got non-ipv4: ' +
          JSON.stringify(endpoint) +
          'returning false resolution address of 0.0.0.0');
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
