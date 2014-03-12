/*
  A typescript SOCKS5 proxy based on:
    https://github.com/gvangool/node-socks

  For the RFC for socks, see:
    http://tools.ietf.org/html/rfc1928
*/
/// <reference path='tcp.ts' />

module Socks {

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

  export class Server {

    private tcpServer:TCP.Server;
    private address;
    private port;

    /**
     * Construct Socks.Server by preparing underlying TCP server.
     */
    constructor(address, port, public destinationCallback) {
      this.address = address;
      this.port = port;
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
            return new Socks.Session(conn, this.address);
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

    // UDP relay for this session, if the client requested UDP_ASSOCIATE
    // during the initial handshake.
    private udpRelay:Socks.UdpRelay;

    // TODO: Implement SOCKS authentication in the future.
    //       (Not urgent because this part is local for now.)
    // TODO(yangoon): address is a hack for UDP...it would be much better
    //                if we could interrogate the connection for the address
    constructor(
        public tcpConnection:TCP.Connection,
        public address:string) {
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
          // Valid request - fire external callback.
          .then(this.maybeUdpStartRelay)
          .then((request:any) => {
            // TODO(yangoon): serious refactoring needed here!
            var connectionDetails = callback(
                this, request.addressString, request.port, request.protocol);
            return this.udpRelay ? {
              ipAddrString: this.udpRelay.getAddress(),
              port: this.udpRelay.getPort() } : connectionDetails;
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
      var request:SocksRequest = {};
      Socks.interpretSocksRequest(byteArray, request);
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
     * Returns a promise to create a UDP relay server if the requested
     * protocol is UDP, otherwise just returns the supplied request instance.
     */
    private maybeUdpStartRelay = (request:any) => {
      if (request.protocol != 'udp') {
        return Promise.resolve(request);
      }
      this.udpRelay = new Socks.UdpRelay();
      return this.udpRelay.bind(this.address, 0).then(() => {
        return request;
      });
    }

    /**
     * Return disconnection promise from underlying TCP connection.
     */
    public onceDisconnected = () => {
      return this.tcpConnection.onceDisconnected();
      // TODO(yangoon): close udp relay (right now this method does not seem
      //                to be called when the TCP connection terminates)
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
