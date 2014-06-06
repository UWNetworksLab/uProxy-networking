/*
 * This is a TCP server based on Freedom's sockets API.
 */

/// <reference path='../../node_modules/freedom-typescript-api/interfaces/tcp-socket.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/promise.d.ts' />
/// <reference path='../../node_modules/uproxy-build-tools/src/arraybuffers/arraybuffers.ts' />
/// <reference path='../../node_modules/uproxy-build-tools/src/handler/handler-queue.ts' />

module TCP {
  import TcpSocket = freedom.TcpSocket;

  // A limit on the max number of TCP connections before we start rejecting
  // new ones.
  var DEFAULT_MAX_CONNECTIONS = 1048576;

  // TCP.Server: a TCP Server. This listens for connections when listen is
  // called, and handles the new connection as specified by the onConnection
  // argument to the constructor.
  export class Server {
    private serverSocket_ :TcpSocket;
    private conns:{[socketId:number] : TCP.Connection} = {};

    // Create TCP server.
    // `address` = Address to be listening on.
    // `port` = the port to listen on; 0 = dynamic allocation.
    // `onConnection` = the handler for new TCP Connections.
    // `maxConnections` = the number of connections after which all new ones
    // will be closed as soon as they connect.
    // TODO: make address and port into getters; we don't support changing them.
    constructor(public address        :string,
                public port           :number,
                public onConnection   :(c:Connection) => void,
                public maxConnections ?:number) {
      this.maxConnections = maxConnections || DEFAULT_MAX_CONNECTIONS;
      this.serverSocket_ = freedom['core.tcpsocket']();
      // When `serverSocket_` gets new connections, handle them. This only
      // happens after the server's listen function is called.
      this.serverSocket_.on('onConnection', this.onConnectionHandler_);
    }

    // Listens on the serverSocket_ to `address:port` for new TCP connections.
    // Returns a Promise that this server is now listening.
    public listen = () : Promise<void> => {
      return this.serverSocket_.listen(this.address, this.port);
    }

    // onConnectionHandler_ is more or less TCP Accept: it is called when a new
    // TCP connection is established.
    private onConnectionHandler_ =
        (acceptValue:TcpSocket.OnConnectInfo) : void => {
      var socketId = acceptValue.socket;

      // Check that we haven't reach the maximum number of connections
      var connectionsCount = Object.keys(this.conns).length;
      if (connectionsCount >= this.maxConnections) {
        // Stop too many connections.  We create a new socket here from the
        // incoming Id and immediately close it, because we don't yet have a
        // reference to the incomming socket.
        freedom['core.tcpsocket'](socketId).close();
        console.error('Too many connections: ' + connectionsCount);
        return;
      }

      // if we don't know how to handle the connection, close it.
      if (!this.onConnection) {
        freedom['core.tcpsocket'](socketId).close();
        console.error('No connection handler is defined!');
        return;
      }

      // Create new connection.
      dbg('TCP.Server accepted connection on socket id ' + socketId);
      var conn = new Connection(
          socketId,
          // We provide Connection with a way to remove itself from the
          // server's list of connections if/when it closes itself.
          () => { delete this.conns[socketId]; });
      this.conns[socketId] = conn;
      this.onConnection(conn);
    }

    // Disconnect all sockets and stops listening.
    public closeAll = () : Promise<void> => {
      var allPromises = [];

      // Close the server socket.
      if (this.serverSocket_) {
        allPromises.push(this.serverSocket_.close());
      }

      // Close all Tcp connections.
      for (var i in this.conns) {
        var c = this.conns[i];
        allPromises.push(c.close());
      }

      // Wait for all promises to complete.
      return Promise.all(allPromises).then(() => {
        dbg('successfully closed all Tcp Connections.');
      });
    }
  }  // class TCP.Server

  /**
   * TCP.Connection - Wraps up a single TCP connection to a client
   *
   * @param {number} socketId The ID of the server<->client socket.
   */
  export class Connection {
    // Promise for when this connection is closed.
    public onceDisconnected :Promise<void>;
    // Queue of data to be handled, and the capacity to set a handler and
    // handle the data.
    public dataHandlerQueue :HandlerQueue<ArrayBuffer>;

    // isClosed() === isClosed_ === true iff onceDisconnected has been rejected
    // or fulfilled. We use isClosed to ensure that we only fulfill/reject the
    // onceDisconnectd once.
    private isClosed_ :boolean;
    // A function to remove itself from the server's list of open connections.
    private removeFromServer_ :() =>void;
    // The underlying Freedom TCP socket.
    private connectionSocket_ :TcpSocket;
    // Private functions called to invoke fullfil/reject onceDisconnected.
    private fulfillDisconnect_ :()=>void;
    // reeject is used for Bad disconnections (errors)
    private rejectDisconnect_ :(e:Error)=>void;

    // This constructor should not be called directly. It should be called by
    // Tcp.Server who will provide it with an onClose function to remove itself
    // from the server's list of open connections.
    constructor(public socketId :number, removeFromServer:()=>void) {
      this.removeFromServer_ = removeFromServer;
      this.isClosed_ = false;
      this.onceDisconnected = new Promise<void>((F, R) => {
        this.fulfillDisconnect_ = F;  // To be fired on good disconnect.
        this.rejectDisconnect_ = R;  // To be fired on bad disconnect.
      });
      this.connectionSocket_ = freedom['core.tcpsocket'](socketId);
      // Handle data using a HandlerQueue for ArrayBuffers (queues up data
      // until a data hanlder is specified)
      this.connectionSocket_.on('onData',
          (readInfo:TcpSocket.ReadInfo) : void => {
        this.dataHandlerQueue.handle(readInfo.data);
      });
      this.connectionSocket_.on('onDisconnect', this.onDisconnectHandler_);
    }

    // This happens when the Tcp connection is closed by the other end or
    // because  of an error. When closed by the other end, onceDisconnected is
    // fullfilled.  If there's an error, onceDisconnected is rejected. Either
    // way, we note our connection is closed and remove ourselve from the
    // server's listing of open connections.
    private onDisconnectHandler_ = (info:TcpSocket.DisconnectInfo) : void => {
      if (info.errcode) {
        var e = 'Socket ' + this.socketId + ' disconnected with errcode '
          + info.errcode + ': ' + info.message;
        dbgErr(e);
        this.rejectDisconnect_(new Error(e));
      } else {
        this.fulfillDisconnect_();
      }
      this.isClosed_ = true;
      this.removeFromServer_();
    }

    // This is called to close the underlying socket. This fulfills the
    // disconnect Promise `onceDisconnected`, removes the connection from the
    // sever's list of open connections, and gives back a promise for when the
    // connection has finished being closed down.
    public close = () : Promise<void> => {
      if (this.isClosed_) {
        dbgErr('Socket ' + this.socketId + ' was attempted to be closed after '
          + 'it was already closed.');
        return;
      }
      this.fulfillDisconnect_();
      this.removeFromServer_();
      return this.connectionSocket_.close();
    }

    // Boolean function to check if this connection is closed;
    public isClosed = () : boolean => { return this.isClosed_; };

    /**
     * Sends a message that is pre-formatted as an arrayBuffer.
     */
    public sendRaw = (msg :ArrayBuffer) : Promise<TcpSocket.WriteInfo> => {
      return this.connectionSocket_.write(msg);
    }

    public toString = () => {
      return '<TCP.Connection[' + this.socketId + ']>';
    }

  }  // class TCP.Connection

  var modulePrefix_ = '[TCP] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module TCP
