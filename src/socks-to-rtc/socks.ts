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
  interface Request {
    version:number;
    cmd:REQUEST_CMD;
    rsv:number;
    atyp:ATYP;
    failure:RESPONSE;
  }
  */


  /**
   * Parse byte array into a SOCKS request object.
   */
  export function interpretSocksRequest(byteArray:Uint8Array) {
    if(byteArray.length < 9) {
      return null;
    }
    var result:any = {};
    // Fail if client is not talking Socks version 5.
    result.version = byteArray[0];
    if (result.version !== VERSION5) {
      console.error('Invalid Socks5 request: ' + Util.getStringOfArrayBuffer(byteArray))
      result.failure = RESPONSE.FAILURE;
      return result;
    }

    result.cmd = byteArray[1];
    // Fail unless we got a CONNECT (to TCP) command.
    if (result.cmd != REQUEST_CMD.CONNECT) {
      result.failure = RESPONSE.UNSUPPORTED_COMMAND;
      return;
    }

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
   * Socks.Server
   */
  export class Server {

    private tcpServer:TCP.Server;

    /**
     * Construct a new Socks.Server based on TCP.
     */
    constructor(address, port, public destinationCallback) {
      var tcpServer = new TCP.Server(address || 'localhost',
                                     port    || 1080);

      // Each new TCP connection attaches a |recv| handler which creates a new
      // Socks.Session. The same |recv| handler then gets replaced with a
      // continuous session handler.
      tcpServer.on('connection', this.establishSession);

      this.tcpServer = tcpServer;
    }

    /**
     * Promise the establishment of a SOCKs session on a TCP connection.
     */
    private establishSession = (conn:TCP.Connection) => {
      // One-time initial recv creates the session.
      return conn.promiseRecv(3)
          .then(Socks.Session.GetHandshakeBytes)
          .then(Socks.Session.CheckVersion)
          .then(Socks.Session.CheckAuth)
          .then(() => {
            // Success - Create new session.
            conn.on('recv', null);  // Disable recv until session is ready.
            return Socks.Session.Create(conn);
          }, (e:Error) => {
            // Send specific no auth reply.
            Socks.Session.SendReply(conn, Socks.AUTH.NONE);  // Unacceptable!
            return e;
          })

      // Handle the request over this session.
      .then((session:Socks.Session) => {
        return conn.promiseRecv()
            .then(Socks.Session.InterpretRequest)
            .then(Socks.Session.CheckRequestFailure)
            .then((request) => {
              return this.destinationCallback(session,
                  request.addressString, request.port)
            }, (e:Error) => {
              // Send specific request failure response to client.
              // session.sendReply_(request.failure);
              return e;
            })
            .then(Socks.Session.ComposeEndpointResponse)
            // Tell client the address of the newly connected destination.
            .then((response) => {
              conn.sendRaw(response.buffer);
            })
            .catch((e) => {
              console.error(session + ': ' + e.message);
              // TODO: Make disconnections server-handled to prevent
              // bidirectional callbacks.
              return e;
            });
      }).catch((e) => {
        conn.disconnect();
      });
    }

    listen() {
      return this.tcpServer.listen().then(() => {
        console.log('LISTENING ' + this.tcpServer.addr + ':' + this.tcpServer.port);
        return null;
      });
    }

    disconnect() { this.tcpServer.disconnect(); }

  }  // Socks.Server


  /**
   * Socks.Session
   */
  export class Session {

    private request:any = null;

    public static GetHandshakeBytes(handshake) {
      // console.log('new Socks.Session (' + conn.socketId + '): \n' +
         // '* Got data: ' + conn + ' \n' +
      console.log('New SOCKs handshake data: ' +
          Util.getHexStringOfArrayBuffer(handshake));
      return new Uint8Array(handshake);
    }

    /**
     * Check acceptable SOCKS version.
     */
    public static CheckVersion(handshakeBytes:Uint8Array) {
      var socksVersion = handshakeBytes[0];
      if (Socks.VERSION5 != socksVersion) {
        // Only SOCKS Version 5 is supported.
        return Promise.reject(new Error('unsupported version: ' + socksVersion));
      }
      return Promise.resolve(handshakeBytes);
    }

    /**
     * Check AUTH methods on SOCKs handshake.
     */
    public static CheckAuth(handshakeBytes:Uint8Array) {
      // Get supported auth methods. Starts from 1, since 0 is already read.
      var authMethods:Socks.AUTH[] = [];
      var numAuthMethods:number = handshakeBytes[1];
      for (var i = 0; i < numAuthMethods; i++) {
        authMethods.push(handshakeBytes[2 + i]);
      }
      // Make sure the client supports 'no authentication'.
      if (authMethods.indexOf(Socks.AUTH.NOAUTH) <= -1) {
        console.error('Socks.Session: no auth methods',
            Socks.AUTH.NOAUTH);
        // this.tcpConnection.disconnect();
        return Promise.reject(new Error('no auth methods: ' + Socks.AUTH.NOAUTH));
      }
    }

    public static Create(conn:TCP.Connection) {
      return new Session(conn);
    }

    // Create SOCKS session atop existing TCP connection.
    // TODO: Implement SOCKS authentication in the future.
    //       (Not urgent because this part is local for now.)
    constructor(private tcpConnection:TCP.Connection) {
      // console.log(this + ': Auth (length=' + buffer.byteLength + ')');
      // Install request handler on the TCP connection and skip auth.
      this.sendReply_(Socks.AUTH.NOAUTH);
    }

    // Install recv handler for underlying cp connection
    public onRecv = (callback:(buf)=>void) => {
      this.tcpConnection.on('recv', callback);
    }

    public sendData = (buffer) => {
      this.tcpConnection.sendRaw(buffer);
    }

    public onDisconnect = (callback:(buf)=>void) => {
      this.tcpConnection.on('disconnect', callback);
    }

    public disconnect = () => {
      // TODO: This will fire the disconnect handler from the underlying TCP
      // connection, but it's actually just some other callback. Clean this up
      // with promises.
      return this.tcpConnection.disconnect();
    }

    /**
     * Send an authentication response back to the client.
     * Assumes |tcpConnection| is valid.
     */
    private sendReply_(authType:Socks.AUTH) {
      Socks.Session.SendReply(this.tcpConnection, authType);
    }

    public static SendReply(conn:TCP.Connection, authType:Socks.AUTH) {
      var response:Uint8Array = new Uint8Array(2);
      response[0] = Socks.VERSION5;
      response[1] = authType;
      conn.sendRaw(response.buffer);
    }

    // Given a data |buffer|, interpret the SOCKS request.
    public static InterpretRequest = (buffer) => {
      var byteArray:Uint8Array = new Uint8Array(buffer);
      var request = Socks.interpretSocksRequest(byteArray);
      if (null == request) {
        // console.error('Socks.Session(' + this.tcpConnection.socketId +
            // '): bad request length ' + byteArray.length + ')');
        return Promise.reject(new Error('bad request length'));
      }
      return request;
    }

    public static CheckRequestFailure(request) {
      if ('failure' in request) {
        // console.error('Socks.Session(' + this.tcpConnection.socketId +
                      // ') failed request received: ' + JSON.stringify(this.request));
        // this.sendReply_(this.request.failure);
        return Promise.reject(new Error('failed request'));
      }
      return request;
    }

    /**
     * Given an endpoint, compose a response.
     */
    public static ComposeEndpointResponse(connectionDetails) {
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
        response[7] = parseInt(ipv4[3]);
      }
      // TODO: support IPv6
      response[8] = connectionDetails.port & 0xF0;
      response[9] = connectionDetails.port & 0x0F;
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

    /*
    public static validateRequest = (buffer) => {
      // Only handle one request per tcp connection, so disable the |recv|
      // callback for now. Pending data will be stored for the next handler.
      this.tcpConnection.on('recv', null);

      var byteArray:Uint8Array = new Uint8Array(buffer);
      this.request = Socks.interpretSocksRequest(byteArray);

      if (null == this.request) {
        console.error('Socks.Session(' + this.tcpConnection.socketId +
            '): bad request length ' + byteArray.length + ')');
        this.tcpConnection.disconnect();
        return;

      } else if ('failure' in this.request) {
        console.error('Socks.Session(' + this.tcpConnection.socketId +
                      ') failed request received: ' + JSON.stringify(this.request));
        this.sendReply_(this.request.failure);
        this.tcpConnection.disconnect();
        return;
      }

      this.destinationCallback(
          this,
          this.request.addressString, this.request.port,
          this.connectedToDestination_);
      // TODO: add a handler for failure to reach destination.
    }
    */


    public toString() {
      return 'Socks.Session[' + this.tcpConnection.socketId + ']';
    }

  }  // Socks.Session

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
