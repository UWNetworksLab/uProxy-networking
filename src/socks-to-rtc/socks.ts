/*
  A typescript SOCKS5 proxy based on:
    https://github.com/gvangool/node-socks

  For the RFC for socks, see:
    http://tools.ietf.org/html/rfc1928
*/
/// <reference path='tcp.ts' />

module Socks {

  /**
   * Sends a message over a TCP connection.
   * TODO: have this return a promise when sendRaw supports it
   */
  // TODO: rename this! it should only be used during the handshake phase
  function replyToTCP(conn:TCP.Connection, authType:Socks.AUTH) {
    var response:Uint8Array = new Uint8Array(2);
    response[0] = Socks.VERSION5;
    response[1] = authType;
    conn.sendRaw(response.buffer);
  }

  export class Server {

    private tcpServer:TCP.Server;
    private callback:(session:Socks.Session) => Promise<Channel.EndpointInfo>;

    /**
     * @param address local interface on which to bind the server
     * @param port port on which to bind the server
     * @param callback function which will be called once a SOCKS session has
     *     been negotiated and which should return the address on which the
     *     connection has been made at the remote end
     */
    constructor(
        address:string,
        port:number,
        callback:(session:Socks.Session) => Promise<Channel.EndpointInfo>) {
      this.tcpServer = new TCP.Server(address, port);
      this.tcpServer.on('connection', this.establishSession_);
      this.callback = callback;
    }

    /**
     * Returns a promise to start listening for connections.
     */
    listen() {
      return this.tcpServer.listen().then(() => {
        dbg('LISTENING ' + this.tcpServer.addr + ':' + this.tcpServer.port);
      });
    }

    /**
     * Called when a client attempts to connect to the server.
     * Roughly, this implements sections 3 and 4 of the RFC.
     *
     * First, comes session establishment:
     *  - wait for the client to send us data (generally just four bytes)
     *  - reply if successful (generally just two bytes)
     *
     * Second, comes the "SOCKS request":
     *  - wait for the client to send us data
     *  - parse the request
     *  - if the client requested UDP_ASSOCIATE, fire up a UDP relay
     *  - create a new Socks.Session
     *  - inform the callback of the new Socks.Session and wait for *it* to
     *    do its thing (which should be establishing a secure datachannel)
     *  - send a SOCKS reply to the client
     *
     * (if any of those steps fail then we return an error to the client
     * and close the connection)
     *
     * After this point, we basically forget about the Socks.Session (and its
     * associated connections) and rely on the callback to configure the
     * relevant handlers in such a way that data is passed back and forth to
     * SOCKS client along the datachannel.
     */
    private establishSession_ = (conn:TCP.Connection): void => {
      var socksRequest:SocksRequest = {};
      var udpRelay:Socks.UdpRelay;
      conn.receive()
          .then((buffer:ArrayBuffer) => {
            Server.validateHandshake(buffer);
          })
          .catch((e) => {
            replyToTCP(conn, Socks.AUTH.NONE);
            return Promise.reject(e);
          })
          .then(() => {
            // Ideally, replyToTCP would be async and we would wait for the response
            // but this works okay since the client is waiting on us anyway.
            replyToTCP(conn, Socks.AUTH.NOAUTH);
            return conn.receive();
          })
          .then((buffer:ArrayBuffer) => {
            Socks.interpretSocksRequest(new Uint8Array(buffer), socksRequest);
          })
          .catch((e) => {
            // TODO: this should be a SOCKS response
            replyToTCP(conn, Socks.AUTH.NONE);
            return Promise.reject(e);
          })
          .then(() => {
            // UDP_ASSOCIATE.
            if (socksRequest.protocol != 'udp') {
              return Promise.resolve(undefined);
            }
            udpRelay = new Socks.UdpRelay();
            return udpRelay.bind(this.tcpServer.addr, 0)
                .then(() => {
                  return Promise.resolve(udpRelay);
                });
          })
          .catch((e) => {
            // TODO: this should be a SOCKS response
            replyToTCP(conn, Socks.AUTH.NONE);
            return Promise.reject(e);
          })
          .then(() => {
            dbg('established SOCKS session');
            return this.callback(new Socks.Session(socksRequest, conn, udpRelay));
          })
          .then((endpointInfo:Channel.EndpointInfo) => {
            // UDP requests work a little differently.
            // Rather than telling the client the host:port on which the SOCKS
            // server is forwarding data, we tell the client the host:port on
            // which the client should send data.
            if (udpRelay) {
              endpointInfo = {
                ipAddrString: udpRelay.getAddress(),
                port: udpRelay.getPort()
              };
            }
            var socksResponse = Server.composeSocksResponse(endpointInfo);
            conn.sendRaw(socksResponse);
          })
          .catch((e) => {
            dbgWarn('failed to establish SOCKS session: ' + e.message);
            conn.disconnect();
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
      this.tcpServer.endConnection(session.getTcpConnection().socketId);
    }

    /**
     * Examines the supplied session establishment bytes, throwing an
     * error if the requested SOCKS version or METHOD is unsupported.
     */
    static validateHandshake(buffer:ArrayBuffer) {
      var handshakeBytes = new Uint8Array(buffer);

      // Only SOCKS Version 5 is supported.
      var socksVersion = handshakeBytes[0];
      if (socksVersion != Socks.VERSION5) {
        throw new Error('unsupported SOCKS version: ' + socksVersion);
      }

      // Check AUTH methods on SOCKS handshake.
      // Get supported auth methods. Starts from 1, since 0 is already read.
      var authMethods:Socks.AUTH[] = [];
      var numAuthMethods:number = handshakeBytes[1];
      for (var i = 0; i < numAuthMethods; i++) {
        authMethods.push(handshakeBytes[2 + i]);
      }
      // Make sure the client supports 'no authentication'.
      if (authMethods.indexOf(Socks.AUTH.NOAUTH) <= -1) {
        throw new Error('client requires authentication');
      }
    }

    /**
     * Given an endpoint, compose a response.
     */
    // TODO: this should probably move to socks-headers.ts
    static composeSocksResponse(connectionDetails:Channel.EndpointInfo) : ArrayBuffer {
      var buffer:ArrayBuffer = new ArrayBuffer(10);
      var bytes:Uint8Array = new Uint8Array(buffer);
      bytes[0] = Socks.VERSION5;
      bytes[1] = Socks.RESPONSE.SUCCEEDED;
      bytes[2] = 0x00;
      bytes[3] = Socks.ATYP.IP_V4;

      // Parse IPv4 values.
      var v4 = '([\\d]{1,3})';
      var v4d = '\\.';
      var v4complete = v4+v4d+v4+v4d+v4+v4d+v4
      var v4regex = new RegExp(v4complete);
      var ipv4 = connectionDetails.ipAddrString.match(v4regex);
      if (ipv4) {
        bytes[4] = parseInt(ipv4[1]);
        bytes[5] = parseInt(ipv4[2]);
        bytes[6] = parseInt(ipv4[3]);
        bytes[7] = parseInt(ipv4[4]);
      }
      // TODO: support IPv6
      bytes[8] = connectionDetails.port >> 8;
      bytes[9] = connectionDetails.port & 0xFF;
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

  /**
   * Socks.Session - layer dealing with handshakes and requests over TCP.
   */
  export class Session {

    private socksRequest:SocksRequest;
    private tcpConnection:TCP.Connection;

    /**
     * Relay for this session, iff the client requested UDP_ASSOCIATE
     * during the initial handshake.
     */
    private udpRelay:Socks.UdpRelay;

    constructor(
        socksRequest:SocksRequest,
        tcpConnection:TCP.Connection,
        udpRelay?:Socks.UdpRelay) {
      this.socksRequest = socksRequest;
      this.tcpConnection = tcpConnection;
      this.udpRelay = udpRelay;
    }

    public getSocksRequest() : SocksRequest {
      return this.socksRequest;
    }

    public getTcpConnection() : TCP.Connection {
      return this.tcpConnection;
    }

    // Install recv handler for underlying TCP connection
    public onRecv = (callback:(buf)=>void) => {
      this.tcpConnection.on('recv', callback);
    }

    // TODO: onRecv for udp

    /**
     * Send |buffer| to session's TCP client.
     */
    public sendData = (buffer) => { this.tcpConnection.sendRaw(buffer); }

    // TODO: sendData for udp

    /**
     * Return disconnection promise from underlying TCP connection.
     */
    public onceDisconnected = () => {
      return this.tcpConnection.onceDisconnected();
      // TODO(yangoon): close udp relay (right now this method does not seem
      //                to be called when the TCP connection terminates)
    }
  }

  // Debug helpers.
  var modulePrefix_ = '[SOCKS] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}
