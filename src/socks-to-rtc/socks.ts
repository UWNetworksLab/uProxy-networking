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
  // TODO: rename this! it should only be used during the handshake phase
  function replyToTCP(conn:TCP.Connection, authType:Socks.AUTH) {
    var response:Uint8Array = new Uint8Array(2);
    response[0] = Socks.VERSION5;
    response[1] = authType;
    conn.sendRaw(response.buffer);
  }

  export class Server {

    private tcpServer:TCP.Server;

    /**
     * @param address local interface on which to bind the server
     * @param port port on which to bind the server
     * @param createChannel_ function to create a new datachannel
     */
    constructor(
        address:string,
        port:number,
        private createChannel_:(params:Channel.EndpointInfo) => Promise<Channel.EndpointInfo>) {
      this.tcpServer = new TCP.Server(address, port);
      this.tcpServer.on('connection', this.establishSession_);
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
            return (socksRequest.protocol == 'tcp') ?
                this.doTcp(conn, socksRequest) :
                this.doUdp(conn);
          })
          .catch((e) => {
            dbgWarn('failed to establish SOCKS session: ' + e.message);
            conn.disconnect();
          });
    }

    /**
     * Returns a promise to negotiate a TCP connection with the SOCKS client.
     */
    private doTcp(conn:TCP.Connection, socksRequest:Socks.SocksRequest) {
      var params:Channel.EndpointInfo = {
        protocol: 'tcp',
        address: socksRequest.addressString,
        port: socksRequest.port,
        send: (buffer:ArrayBuffer) => { conn.sendRaw(buffer); },
        terminate: () => { this.tcpServer.endConnection(conn.socketId); }
      };
      return this.createChannel_(params)
        .then((endpointInfo:Channel.EndpointInfo) => {
          // Clean up when the TCP connection terminates.
          conn.onceDisconnected().then(() => {
            endpointInfo.terminate();
          });
          conn.on('recv', endpointInfo.send);
          var socksResponse = Server.composeSocksResponse(
              endpointInfo.address, endpointInfo.port);
          conn.sendRaw(socksResponse);
        });
    }

    /**
     * Returns a promise to negotiate a UDP session with the SOCKS client.
     */
    private doUdp(conn:TCP.Connection) {
      var udpRelay = new Socks.UdpRelay();
      return udpRelay.bind(this.tcpServer.addr, 0)
          .then(() => {
            return Promise.resolve(udpRelay);
          }, (e) => {
            throw new Error('could not create udp relay: ' + e.message);
          })
          .then(() => {
            var udpSession:UdpSession = new UdpSession(
                udpRelay,
                this.createChannel_,
                () => { this.tcpServer.endConnection(conn.socketId); });
            // Clean up any UDP datachannels when the TCP connection terminates.
            conn.onceDisconnected().then(() => {
              udpSession.disconnected();
            });
            var socksResponse = Server.composeSocksResponse(
                udpRelay.getAddress(), udpRelay.getPort());
            conn.sendRaw(socksResponse);
          });
    }

    disconnect() { this.tcpServer.disconnect(); }

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
    static composeSocksResponse(address:string, port:number) : ArrayBuffer {
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
      var ipv4 = address.match(v4regex);
      if (ipv4) {
        bytes[4] = parseInt(ipv4[1]);
        bytes[5] = parseInt(ipv4[2]);
        bytes[6] = parseInt(ipv4[3]);
        bytes[7] = parseInt(ipv4[4]);
      }
      // TODO: support IPv6
      bytes[8] = port >> 8;
      bytes[9] = port & 0xFF;
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
   * Handles a UDP session with a SOCKS client.
   * One data channel is created for each host:pair with which the SOCKS
   * client wishes to communicate.
   */
  class UdpSession {

    // Active data channels, keyed by destination host:port.
    private channels_:{[dest:string]:Promise<Channel.EndpointInfo>} = {};

    constructor(
        private udpRelay_:Socks.UdpRelay,
        private createChannel_:(params:Channel.EndpointInfo) => Promise<Channel.EndpointInfo>,
        private terminate_:() => any) {
      this.udpRelay_.setDataReceivedHandler(this.onData_);
    }

    // TODO: slice would be beneficial! figure out how to use it in TypeScript
    private onData_ = (data:ArrayBuffer) => {
      // Split the datagram into two parts: the UDP header and the payload.
      // TODO: have interpretUdpRequest return an integer which we can use here
      var headerLength = 10;
      var bytes = new Uint8Array(data);
      var header = new ArrayBuffer(headerLength);
      var headerBytes = new Uint8Array(header);
      for (var i = 0; i < header.byteLength; i++) {
        headerBytes[i] = bytes[i];
      }
      var payload = new ArrayBuffer(bytes.byteLength - headerLength);
      var payloadBytes = new Uint8Array(payload);
      for (var i = 0; i < payload.byteLength; i++) {
        payloadBytes[i] = bytes[headerLength + i];
      }

      // Decode the header. We need to know where to send it.
      var request:Socks.UdpRequest = {};
      Socks.interpretUdpRequest(headerBytes, request);
      var dest = request.addressString + ':' + request.port;

      // Get or create data channel for this host:port.
      var channel:Channel.EndpointInfo;
      if (!(dest in this.channels_)) {
        var params:Channel.EndpointInfo = {
          protocol: 'udp',
          address: request.addressString,
          port: request.port,
          send: (reply:ArrayBuffer) => {
            // Relay the reply back to the SOCKS client, first prepending the
            // header we received in the first request from the SOCKS client.
            var out = new ArrayBuffer(headerLength + reply.byteLength);
            var outBytes = new Uint8Array(out);
            for (var i = 0; i < header.byteLength; i++) {
              outBytes[i] = headerBytes[i];
            }
            var replyBytes = new Uint8Array(reply);
            for (var i = 0; i < reply.byteLength; i++) {
              outBytes[headerLength + i] = replyBytes[i];
            }
            this.udpRelay_.sendRemoteReply(out);
          },
          terminate: () => { this.terminate_(); }
        };
        this.channels_[dest] = this.createChannel_(params);
      }
      // Send the payload on the datachannel.
      this.channels_[dest]
          .then((endpointInfo:Channel.EndpointInfo) => {
            endpointInfo.send(payload);
          });
    }

    /**
     * Closes all datachannels created by this UDP session.
     * Intended to be called when the outer-lying TCP connection is terminated.
     */
    public disconnected() : void {
      // TODO!
      dbg('TODO: close all udp datachannels');
    }

  }  // Socks.UdpSession


  // Debug helpers.
  var modulePrefix_ = '[SOCKS] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module Socks
