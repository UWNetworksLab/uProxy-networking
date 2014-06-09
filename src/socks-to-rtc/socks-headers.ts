/*
  For the RFC for socks, see:
    http://tools.ietf.org/html/rfc1928
*/

module Socks {

  // version 5 of socks
  export var VERSION5 = 0x05;

  // Authentication methods
  export enum AUTH {
    NOAUTH   = 0x00,  // X'00' NO AUTHENTICATION REQUIRED
    GSSAPI   = 0x01,  // X'01' GSSAPI
    USERPASS = 0x02,  // X'02' USERNAME/PASSWORD
                      // X'03' to X'7F' IANA ASSIGNED
                      // X'80' to X'FE' RESERVED FOR PRIVATE METHODS
    NONE     = 0xFF   // X'FF' NO ACCEPTABLE METHODS
  }

  // Commands
  export enum REQUEST_CMD {
    CONNECT       = 0x01, // Connect to TCP
    BIND          = 0x02, // Listen for TCP
    UDP_ASSOCIATE = 0x03  // Connect to UDP association
  }

  // ATYP - address type of following address.
  export enum ATYP {
    IP_V4 = 0x01,  // IP V4 Address
    DNS   = 0x03,  // DOMAINNAME
    IP_V6 = 0x04   // IP V6 Address
  }

  // REP - Reply Field
  export enum RESPONSE {
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

  /**
   * Represents a SOCKS request.
   * @see interpretSocksRequest
   */
  export interface SocksRequest {
    version?:number;
    cmd?:REQUEST_CMD;
    atyp?:ATYP;
    addressString?:string;
    port?:number;
    // TODO(yangoon): remove this field
    protocol?:string;
  }

  /*
   * Interprets a SOCKS 5 request, which looks like this:
   *
   *   +----+-----+-------+------+----------+----------+
   *   |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
   *   +----+-----+-------+------+----------+----------+
   *   | 1  |  1  | X'00' |  1   | Variable |    2     |
   *   +----+-----+-------+------+----------+----------+
   */
  export function interpretSocksRequest(byteArray:Uint8Array) : SocksRequest {

    var result :SocksRequest = {};
    // Fail if the request is too short to be valid.
    if(byteArray.length < 9) {
      throw new Error('SOCKS request too short');
    }

    // Fail if client is not talking Socks version 5.
    result.version = byteArray[0];
    if (result.version !== VERSION5) {
      throw new Error('must be SOCKS5');
    }

    result.cmd = byteArray[1];
    // Fail unless we got a CONNECT or UDP_ASSOCIATE command.
    if (result.cmd != REQUEST_CMD.CONNECT &&
      result.cmd != REQUEST_CMD.UDP_ASSOCIATE) {
      throw new Error('unsupported SOCKS command (CMD): ' + result.cmd);
    }

    result.protocol = result.cmd == REQUEST_CMD.CONNECT ? 'tcp' : 'udp';

    interpretSocksAddress(byteArray.subarray(3), result);

    return result;
  }

  export function interpretSocksRequestBuffer(buffer:ArrayBuffer)
      : SocksRequest {
    return interpretSocksRequest(new Uint8Array(buffer));
  }

  /**
   * Represents a UDP request.
   * @see interpretSocksRequest
   */
  export interface UdpRequest {
    frag?:number;
    atyp?:ATYP;
    addressString?:string;
    port?:number;
    data?:Uint8Array;
  }

  /*
   * Interprets a SOCKS5 UDP request, which looks like this:
   *
   *   +----+------+------+----------+----------+----------+
   *   |RSV | FRAG | ATYP | DST.ADDR | DST.PORT |   DATA   |
   *   +----+------+------+----------+----------+----------+
   *   | 2  |  1   |  1   | Variable |    2     | Variable |
   8   +----+------+------+----------+----------+----------+
   */
  export function interpretUdpRequest(byteArray:Uint8Array, result:UdpRequest) : void {
    // Fail if the request is too short to be valid.
    if(byteArray.length < 10) {
      throw new Error('UDP request too short');
    }

    // Fail if client is requesting fragmentation.
    result.frag = byteArray[2];
    if (result.frag !== 0) {
      throw new Error('fragmentation not supported');
    }

    var addressLength = interpretSocksAddress(byteArray.subarray(3), result);

    result.data = byteArray.subarray(3 + addressLength);
  }

  /**
   * Represents the destination portion of a SOCKS request.
   * @see interpretSocksAddress
   */
  export interface SocksDestination {
    atyp?:ATYP;
    addressString?:string;
    port?:number;
  }

  /*
   * Interprets this sub-structure, found within both "regular" SOCKS requests
   * and UDP requests:
   *
   *   +------+----------+----------+
   *   | ATYP | DST.ADDR | DST.PORT |
   *   +------+----------+----------+
   *   |  1   | Variable |    2     |
   *   +------+----------+----------+
   *
   * Returns a number indicating the length, in bytes, of this structure. The
   * length varies according to the type found (IPv4, IPv6, host name, etc).
   */
  export function interpretSocksAddress(byteArray:Uint8Array, result:SocksDestination) : number {
    // Parse address and port and set the callback to be handled by the
    // destination proxy (the bit that actually sends data to the destination).
    var portOffset:number;
    result.atyp = byteArray[0];
    if (ATYP.IP_V4 == result.atyp) {
      var addressSize = 4;
      var address = byteArray.subarray(1, 1 + addressSize);
      result.addressString = Array.prototype.join.call(address, '.');
      portOffset = addressSize + 1;
    } else if (ATYP.DNS == result.atyp) {
      var addressSize = byteArray[1];
      result.addressString = '';
      for (var i = 0; i < addressSize; ++i) {
        result.addressString += String.fromCharCode(byteArray[2 + i]);
      }
      portOffset = addressSize + 2;
    } else if (ATYP.IP_V6 == result.atyp) {
      var addressSize = 16;
      var uint16View = new Uint16Array(byteArray.buffer, 1, 5);
      result.addressString = Array.prototype.map.call(uint16View, function(i){
        return (((i & 0xFF) << 8) | ((i >> 8) & 0xFF)).toString(16);
      }).join(':');
      portOffset = addressSize + 1;
    } else {
      throw new Error('unsupported SOCKS address type (ATYP): ' + result.atyp);
    }

    // Parse the port.
    var portByte1 = byteArray[portOffset];
    var portByte2 = byteArray[portOffset + 1];
    result.port = byteArray[portOffset] << 8 | byteArray[portOffset + 1];

    return portOffset + 2;
  }
}
