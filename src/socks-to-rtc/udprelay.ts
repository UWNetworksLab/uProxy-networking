/// <reference path='../../node_modules/freedom-typescript-api/interfaces/udp-socket.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/promise.d.ts' />
module Socks {
  import UdpSocket = freedom.UdpSocket;

  /**
   * A UDP-based "relay" server intended for use as part of a SOCKS5 proxy:
   *   http://www.ietf.org/rfc/rfc1928.txt
   *
   * Briefly, here's how to use this:
   *  - create an instance of this class
   *  - call bind (you probably want to specify port zero to have the system
   *    pick a free port)
   *  - call getInfo, to discover on which port the relay is listening
   *  - (the caller can now return the address and port back to the SOCKS
   *    client)
   *  - call setDataReceivedHandler
   *  - this class will invoke the setDataReceivedHandler each time a datagram
   *    is received on the socket; the full message is sent, including SOCKS
   *    UDP headers
   *  - (the caller can relay the message across the datachannel)
   *  - call sendRemoteReply for each datagram received from remote hosts; this
   *    will be sent to the client, and should include the same SOCKS UDP
   *    header received in the original request
   *  - call destroy to clean up, typically when the TCP connection on which
   *    the UDP_ASSOCIATE was negotiated is terminated
   *
   * One relay should be created in response to each UDP_ASSOCIATE command.
   * 
   * Other notes:
   *  - while the RFC states that the relay MUST drop any message originating
   *    from an IP other than that which requested the association, this
   *    implementation makes no effort to do so (this isn't urgent because we
   *    typically only listen locally)
   *  - similarly, we make no effort to respect the DST.PORT and DST.ADDR fields
   *    specified by the client during the handshake: having run various proxy
   *    clients it seems that these are rarely specified anyway (which is fine
   *    according to section 6 of the RFC)
   *    and, in any case, we are typically only listening locally
   *  - we make no attempt to implement fragmentation (see section 7 of the
   *    RFC)
   */
  export class UdpRelay {

    // The Socks client sends datagrams to this socket.
    // Eventually, it will also receive replies on this socket.
    private socket:UdpSocket;

    // Address and port to which the "client-side" socket is bound.
    private address:string;
    private port:number;

    // Address and port from which the client is sending us packets.
    // We store this so that we can relay responses from the server
    // back to the client.
    private clientAddress:string;
    private clientPort:number;

    /**
     * Function to be called when data is received.
     */
    private dataReceivedHandler:(data:ArrayBuffer) => void;

    constructor () {
      this.socket = freedom['core.udpsocket']();
    }

    /**
     * Returns a promise to create a socket, bind to the specified address and
     * port, and start relaying events. Specify port zero to have the system
     * choose a free port.
     */
    public bind(address:string, port:number) {
      return this.socket.bind(address, port)
          .then((resultCode:number) => {
            // Ensure the listen was successful.
            if (resultCode != 0) {
              return Promise.reject(new Error('listen failed on ' +
                  this.address + ':' + this.port +
                  ' with result code ' + resultCode));
            }
            return Promise.resolve(resultCode);
          })
          .then(this.socket.getInfo)
          .then((socketInfo:UdpSocket.SocketInfo) => {
            // Record the address and port on which our socket is listening.
            this.address = socketInfo.localAddress;
            this.port = socketInfo.localPort;
            dbg('listening on ' + this.address + ':' + this.port);
          })
          .then(this.attachSocketHandler);
    }

    /**
     * Listens for onData events.
     * The socket must be bound.
     */
    private attachSocketHandler = () => {
      this.socket.on('onData', this.onSocksClientData);
    }

    private onSocksClientData = (recvFromInfo:UdpSocket.RecvFromInfo) => {
      // Record the host:port from which the client is sending us datagrams.
      // This is where we'll relay any replies from remote servers.
      // TODO: check if these change over the liftime of the relay
      this.clientAddress = recvFromInfo.address;
      this.clientPort = recvFromInfo.port;
      dbg('received ' + recvFromInfo.data.byteLength + ' bytes datagram from ' + this.clientAddress + ':' + this.clientPort);
      if (this.dataReceivedHandler) {
        this.dataReceivedHandler(recvFromInfo.data);
      }
    }

    /**
     * Sets the function to be called when data is received from the client.
     * This is intended for relaying datagrams from the client across the
     * datachannel from a remote server. The full datagram as received from the
     * client is sent, complete with SOCKS headers.
     */
    public setDataReceivedHandler(callback:(buffer:ArrayBuffer) => void) {
      this.dataReceivedHandler = callback;
    }

    /**
     * Returns a promise to send data to the client.
     * This is intended for relaying responses from remote servers back to
     * the client.
     */
    public sendRemoteReply(buffer:ArrayBuffer) : Promise<number> {
      if (!this.clientAddress) {
        throw new Error('cannot send data to client before it sends data');
      }
      dbg('sending ' + buffer.byteLength + ' bytes datagram to ' + this.clientAddress + ':' + this.clientPort);
      return this.socket.sendTo(buffer, this.clientAddress, this.clientPort);
    }

    // TODO(yangoon): add destroy() method

    /**
     * Returns the address on which the local socket associated with this
     * relay is listening.
     */
    public getAddress = () => {
      return this.address;
    }

    /**
     * Returns the port on which the local socket associated with this
     * relay is listening.
     */
    public getPort = () => {
      return this.port;
    }
  }

  // Debug helpers.
  var modulePrefix_ = '[UDP-RELAY] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }
}
