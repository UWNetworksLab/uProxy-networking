/*
  A typescript SOCKS5 proxy based on:
    https://github.com/gvangool/node-socks

  For the RFC for socks, see:
    http://tools.ietf.org/html/rfc1928
*/
/// <reference path='tcp.ts' />


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

  /*
   The SOCKS request is formed as follows:
        +----+-----+-------+------+----------+----------+
        |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
        +----+-----+-------+------+----------+----------+
        | 1  |  1  | X'00' |  1   | Variable |    2     |
        +----+-----+-------+------+----------+----------+

     Where:
          o  VER    protocol version: X'05'
          o  CMD
             o  CONNECT X'01'
             o  BIND X'02'
             o  UDP ASSOCIATE X'03'
          o  RSV    RESERVED
          o  ATYP   address type of following address
             o  IP V4 address: X'01'
             o  DOMAINNAME: X'03'
             o  IP V6 address: X'04'
          o  DST.ADDR       desired destination address
          o  DST.PORT desired destination port in network octet
             order
  // TODO: typescript the SOCKS Request interface
  // TODO: document all fields populated by interpretSocksRequest
  interface Request {
    version:number;
    cmd:REQUEST_CMD;
    atyp:ATYP;
    failure:RESPONSE;
    addressString:string;
    port:number;
    protocol:string;
  }
  */


  /**
   * Parse byte array into a SOCKS request object.
   */
  export function interpretSocksRequest(byteArray:Uint8Array) {
    var result:any = {};

    // Fail if the request is too short to be valid.
    if(byteArray.length < 9) {
      result.failure = RESPONSE.FAILURE;
      return result;
    }

    // Fail if client is not talking Socks version 5.
    result.version = byteArray[0];
    if (result.version !== VERSION5) {
      console.error('Invalid Socks5 request: ' + Util.getStringOfArrayBuffer(byteArray))
      result.failure = RESPONSE.FAILURE;
      return result;
    }

    result.cmd = byteArray[1];
    // Fail unless we got a CONNECT or UDP_ASSOCIATE command.
    if (result.cmd != REQUEST_CMD.CONNECT &&
      result.cmd != REQUEST_CMD.UDP_ASSOCIATE) {
      result.failure = RESPONSE.UNSUPPORTED_COMMAND;
      return result;
    }

    // TODO(yangoon): not sure how BIND would work but we're not even thinking
    //                about support for that.
    result.protocol = result.cmd == REQUEST_CMD.CONNECT ? 'tcp' : 'udp';

    // Parse address and port and set the callback to be handled by the
    // destination proxy (the bit that actually sends data to the destination).
    result.atyp = byteArray[3];
    if (ATYP.IP_V4 == result.atyp) {
      result.addressSize = 4;
      result.address = byteArray.subarray(4, 4 + result.addressSize);
      result.addressString = Array.prototype.join.call(result.address, '.');
      result.portOffset = result.addressSize + 4;
    } else if (ATYP.DNS == result.atyp) {
      result.addressSize = byteArray[4];
      result.address = byteArray.subarray(5, 5 + result.addressSize);
      result.addressString = '';
      for (var i = 0; i < result.addressSize; ++i) {
        result.addressString += String.fromCharCode(byteArray[5 + i]);
      }
      result.portOffset = result.addressSize + 5;
    } else if (ATYP.IP_V6 == result.atyp) {
      result.addressSize = 16;
      result.address = byteArray.subarray(4, 4 + result.addressSize);
      var uint16View = new Uint16Array(byteArray.buffer, 4, 8);
      result.addressString = Array.prototype.map.call(uint16View, function(i){
        return (((i & 0xFF) << 8) | ((i >> 8) & 0xFF)).toString(16);
      }).join(':');
      result.portOffset = result.addressSize + 4;
    } else {
      return null;
    }
    result.portByte1 = byteArray[result.portOffset];
    result.portByte2 = byteArray[result.portOffset + 1];
    result.port = byteArray[result.portOffset] << 8 |
                  byteArray[result.portOffset + 1];
    result.dataOffset = result.portOffset + 2;
    result.raw = byteArray.subarray(0, result.dataOffset);
    result.data = byteArray.subarray(result.dataOffset,
                                     byteArray.length - result.dataOffset);
    return result;
  }

  /**
   * Send reply back over a TCP connection.
   * Assumes |conn| is a valid TCP.Connection.
   */
  function replyToTCP(conn:TCP.Connection, authType:Socks.AUTH) {
    var response:Uint8Array = new Uint8Array(2);
    response[0] = Socks.VERSION5;
    response[1] = authType;
    conn.sendRaw(response.buffer);
  }

  /**
   * Socks.Server
   */
  export class Server {

    private tcpServer:TCP.Server;

    /**
     * Construct Socks.Server by preparing underlying TCP server.
     */
    constructor(address, port, public destinationCallback) {
      this.tcpServer = new TCP.Server(address || 'localhost', port || 1080);
      this.tcpServer.on('connection', this.establishSession_);
    }

    /**
     * Promise a handshake-validated SOCKS session over TCP connection.
     */
    private establishSession_ = (conn:TCP.Connection) => {
      // One-time initial recv creates the session.
      return conn.receive(3)  // minimum byte length for handshake.
          .then(Socks.Session.getHandshake)
          .then(Socks.Session.checkVersion)
          .then(Socks.Session.checkAuth)
          // Success - Create new session.
          .then(() => {
            conn.on('recv', null);  // Disable recv until session is ready.
            return Socks.Session.Create(conn);
          // AUTH error. (Required method not available).
          }, (e) => {
            replyToTCP(conn, Socks.AUTH.NONE);
            dbgWarn('handshake problem: ' + e.message);
            return Util.reject('failed to establish session.');
          })
          // Handle a remote request over SOCKS.
          .then((session:Socks.Session) => {
            session.handleRequest(this.destinationCallback);
          })
          // Always disconnect underlying TCP when problems occur.
          .catch((e) => {
            dbgWarn(e.message);
            conn.disconnect();
          });
    }

    listen() {
      return this.tcpServer.listen().then(() => {
        dbg('LISTENING ' + this.tcpServer.addr + ':' + this.tcpServer.port);
      });
    }

    disconnect() { this.tcpServer.disconnect(); }

    /**
     * Closes the underlying TCP connection for SOCKS |session|.
     * Assumes |session| is valid.
     */
    public endSession(session:Session) {
      if (!session) {
        throw Error('SOCKS session object undefined!');
      }
      this.tcpServer.endConnection(session.tcpConnection.socketId);
    }

  }  // Socks.Server


  /**
   * Socks.Session - layer dealing with handshakes and requests over TCP.
   */
  export class Session {

    public static getHandshake(handshake:ArrayBuffer) {
      return new Uint8Array(handshake);
    }

    /**
     * Only SOCKS Version 5 is supported.
     */
    public static checkVersion(handshakeBytes:Uint8Array) {
      var socksVersion = handshakeBytes[0];
      if (Socks.VERSION5 != socksVersion) {
        return Util.reject('unsupported version: ' + socksVersion);
      }
      return Promise.resolve(handshakeBytes);
    }

    /**
     * Check AUTH methods on SOCKS handshake.
     */
    public static checkAuth(handshakeBytes:Uint8Array) {
      // Get supported auth methods. Starts from 1, since 0 is already read.
      var authMethods:Socks.AUTH[] = [];
      var numAuthMethods:number = handshakeBytes[1];
      for (var i = 0; i < numAuthMethods; i++) {
        authMethods.push(handshakeBytes[2 + i]);
      }
      // Make sure the client supports 'no authentication'.
      if (authMethods.indexOf(Socks.AUTH.NOAUTH) <= -1) {
        dbgErr('Socks.Session: no auth methods ' + Socks.AUTH.NOAUTH);
        return Util.reject('no auth methods: ' + Socks.AUTH.NOAUTH);
      }
    }

    public static Create(conn:TCP.Connection) { return new Session(conn); }

    // TODO: Implement SOCKS authentication in the future.
    //       (Not urgent because this part is local for now.)
    constructor(public tcpConnection:TCP.Connection) {
      replyToTCP(this.tcpConnection, Socks.AUTH.NOAUTH);  // Skip auth.
    }

    /**
     * Handle request over SOCKS session.
     * |callback| is external.
     */
    public handleRequest = (callback) => {
      var conn = this.tcpConnection;
      return conn.receive()
          .then(Socks.Session.interpretRequest)
          .then(Socks.Session.checkRequestFailure)
          // Valid request - fire external callback.
          .then((request) => {
            return callback(this, request.addressString, request.port,
                request.protocol);
          // Invalid request - notify client with |request.failure|.
          }, (e) => {
            replyToTCP(conn, parseInt(e.message));
            return Util.reject('invalid request.');
          })
          // Pass endpoint from external callback to client.
          .then(Socks.Session.composeEndpointResponse)
          .then((response) => { conn.sendRaw(response.buffer); })
          .catch((e) => {
            dbgErr(this + ': ' + e.message);
            return Util.reject('response error.');
          });
    }

    // Given a data |buffer|, interpret the SOCKS request.
    public static interpretRequest = (buffer:ArrayBuffer) => {
      var byteArray = new Uint8Array(buffer);
      var request = Socks.interpretSocksRequest(byteArray);
      if (null == request) {
        return Util.reject('bad request length: ' + byteArray.length);
      }
      return request;
    }

    public static checkRequestFailure(request) {
      if ('failure' in request) {
        return Util.reject(request.failure);
      }
      return request;
    }

    /**
     * Given an endpoint, compose a response.
     */
    public static composeEndpointResponse(
        connectionDetails:Channel.EndpointInfo) {
      var response:number[] = [];
      response[0] = Socks.VERSION5;
      response[1] = Socks.RESPONSE.SUCCEEDED;
      response[2] = 0x00;
      response[3] = Socks.ATYP.IP_V4;

      // Parse IPv4 values.
      var v4 = '([\\d]{1,3})';
      var v4d = '\\.';
      var v4complete = v4+v4d+v4+v4d+v4+v4d+v4
      var v4regex = new RegExp(v4complete);
      var ipv4 = connectionDetails.ipAddrString.match(v4regex);
      if (ipv4) {
        response[4] = parseInt(ipv4[1]);
        response[5] = parseInt(ipv4[2]);
        response[6] = parseInt(ipv4[3]);
        response[7] = parseInt(ipv4[4]);
      }
      // TODO: support IPv6
      response[8] = connectionDetails.port >> 8;
      response[9] = connectionDetails.port & 0xFF;
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
      var responseArray = new Uint8Array(response);
      return responseArray;
    }

    // Install recv handler for underlying TCP connection
    public onRecv = (callback:(buf)=>void) => {
      this.tcpConnection.on('recv', callback);
    }

    /**
     * Send |buffer| to session's TCP client.
     */
    public sendData = (buffer) => { this.tcpConnection.sendRaw(buffer); }

    /**
     * Return disconnection promise from underlying TCP connection.
     */
    public onceDisconnected = () => {
      return this.tcpConnection.onceDisconnected();
    }

    public toString() {
      return 'Socks.Session[' + this.tcpConnection.socketId + ']';
    }

  }  // Socks.Session


  // Debug helpers.
  var modulePrefix_ = '[SOCKS] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module Socks


module Util {

  /**
   * Converts an array buffer to a string of hex codes and interpretations as
   * a char code.
   *
   * @param {ArrayBuffer} buf The buffer to convert.
   */
  export function getHexStringOfArrayBuffer(buf) {
    var uInt8Buf = new Uint8Array(buf);
    var a = [];
    for (var i = 0; i < buf.byteLength; ++i) {
      a.push(uInt8Buf[i].toString(16));
    }
    return a.join('.');
  }

  /**
   * Converts an array buffer to a string.
   *
   * @param {ArrayBuffer} buf The buffer to convert.
   */
  export function getStringOfArrayBuffer(buf) {
    var uInt8Buf = new Uint8Array(buf);
    var a = [];
    for (var i = 0; i < buf.byteLength; ++i) {
      a.push(String.fromCharCode(buf[i]));
    }
    return a.join('');
  }
}
