/*
 * This is a TCP server based on Freedom's sockets API.
 */

/// <reference path='../freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../freedom-typescript-api/interfaces/tcp-socket.d.ts' />
/// <reference path='../third_party/promise/promise.d.ts' />
/// <reference path='../handler/handler-queue.ts' />
/// <reference path='../interfaces/communications.d.ts' />

module Tcp {
  import TcpSocket = freedom.TcpSocket;

  function endpointOfSocketInfo(info:TcpSocket.SocketInfo) : Net.Endpoint {
     return { address: info.peerAddress, port: info.peerPort }
  }

  // A limit on the max number of TCP connections before we start rejecting
  // new ones.
  var DEFAULT_MAX_CONNECTIONS = 1048576;

  // Tcp.Server: a TCP Server. This listens for connections when listen is
  // called, and handles the new connection as specified by the onConnection
  // argument to the constructor.
  export class Server {
    private serverSocket_ :TcpSocket;
    // TODO: index by connectionId not socketID. More stable & string based.
    private conns:{[socketId:number] : Tcp.Connection} = {};

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
        (acceptValue:TcpSocket.ConnectInfo) : void => {
      var socketId = acceptValue.socket;

      // Check that we haven't reach the maximum number of connections
      var connectionsCount = Object.keys(this.conns).length;
      if (connectionsCount >= this.maxConnections) {
        // Stop too many connections.  We create a new socket here from the
        // incoming Id and immediately close it, because we don't yet have a
        // reference to the incomming socket.
        freedom['core.tcpsocket'](socketId).close();
        dbgErr('Too many connections: ' + connectionsCount);
        return;
      }

      // if we don't know how to handle the connection, so close it.
      if (!this.onConnection) {
        freedom['core.tcpsocket'](socketId).close();
        dbgErr('No connection handler is defined!');
        return;
      }

      // Create new connection.
      dbg('Tcp.Server accepted connection on socket id ' + socketId);
      var conn = new Connection({existingSocketId:socketId});
      // When the connection is disconnected correctly, or by error, remove
      // from the server's list of connections.
      conn.onceDisconnected.then(
        () => {
          delete this.conns[socketId];
          dbg('Tcp.Server(' + this.address + ':' + this.port +
          ') : connection closed (' + socketId + '). Conn Count: ' +
          Object.keys(this.conns).length + ']');
        },
        (e) => {
          delete this.conns[socketId];
          dbgWarn('Tcp.Server(' + this.address + ':' + this.port +
          ') : connection closed by error (' + socketId + ')' + e.toString()
          + ' . Conn Count: ' + Object.keys(this.conns).length + ']');
        })
      this.conns[socketId] = conn;
      dbg(this.toString());
      this.onConnection(conn);
    }

    public toString = () : string => {
      var s = 'Tcp.Server(' + this.address + ':' + this.port +
          ') connections: ' + Object.keys(this.conns).length + '\n{';
      for(var socketId in this.conns) {
        s += '  ' + this.conns[socketId].toString() + '\n';
      }
      return s += '}';
    }

    // Disconnect all sockets and stops listening.
    public closeAll = () : Promise<void> => {
      var allPromises :Promise<void>[] = [];

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
  }  // class Tcp.Server

  /**
   * Tcp.Connection - Wraps up a single TCP connection to a client
   *
   * @param {number} socketId The ID of the server<->client socket.
   */
  export class Connection {
    // Unique identifier for each connection.
    private static globalConnectionId_ :number = 0;

    // Promise for when this connection is closed.
    public onceConnected :Promise<Net.Endpoint>;
    public onceDisconnected :Promise<void>;
    // Queue of data to be handled, and the capacity to set a handler and
    // handle the data.
    public dataFromSocketQueue :Handler.Queue<ArrayBuffer,void>;
    public dataToSocketQueue :Handler.Queue<ArrayBuffer, TcpSocket.WriteInfo>;

    // Public unique connectionId.
    public connectionId :string;

    // isClosed() === state_ === Connection.State.CLOSED iff onceDisconnected
    // has been rejected or fulfilled. We use isClosed to ensure that we only
    // fulfill/reject the onceDisconnectd once.
    private state_ :Connection.State;
    // The underlying Freedom TCP socket.
    private connectionSocket_ :TcpSocket;
    // Private functions called to invoke fullfil/reject onceDisconnected.
    private fulfillDisconnect_ :()=>void;
    // reeject is used for Bad disconnections (errors)
    private rejectDisconnect_ :(e:Error)=>void;

    // A TCP connection for a given socket.
    constructor(connectionKind:Connection.Kind) {
      this.connectionId = 'N.' + Connection.globalConnectionId_++;

      this.dataFromSocketQueue = new Handler.Queue<ArrayBuffer,void>();
      this.dataToSocketQueue =
          new Handler.Queue<ArrayBuffer,TcpSocket.WriteInfo>();

      if(Object.keys(connectionKind).length !== 1) {
        dbgErr('Badly formed New Tcp Connection Kind:' +
               JSON.stringify(connectionKind));
        this.state_ = Connection.State.ERROR;
        this.onceConnected =
            Promise.reject<Net.Endpoint>(new Error(
                'Badly formed New Tcp Connection Kind:' +
                JSON.stringify(connectionKind)));
        this.onceDisconnected =
            Promise.reject<void>(new Error(
                'Badly formed New Tcp Connection Kind:' +
                JSON.stringify(connectionKind)));
        return;
      }

      if(connectionKind.existingSocketId) {
        // If we already have an open socket; i.e. from a previous tcp listen.
        // So we get the old freedom socket.
        this.connectionSocket_ =
            freedom['core.tcpsocket'](connectionKind.existingSocketId);
        this.onceConnected =
            this.connectionSocket_.getInfo().then(endpointOfSocketInfo);
        this.state_ = Connection.State.CONNECTED;
        this.connectionId = this.connectionId + '.A.' +
            connectionKind.existingSocketId;
      } else if (connectionKind.destination) {
        // connectionKind specifies to create a new tcp socket to the given
        // destination.
        this.connectionSocket_ = freedom['core.tcpsocket']();
        this.onceConnected =
            this.connectionSocket_
                .connect(connectionKind.destination.address,
                         connectionKind.destination.port)
                .then(this.connectionSocket_.getInfo)
                .then(endpointOfSocketInfo)
        this.state_ = Connection.State.CONNECTING;
        this.onceConnected
            .then(() => { this.state_ = Connection.State.CONNECTED; });
      } else {
        throw(new Error('Should be impossible connectionKind' +
            JSON.stringify(connectionKind)));
      }

      // Handle data using a HandlerQueue for ArrayBuffers (queues up data
      // until a data hanlder is specified)
      this.connectionSocket_.on('onData',
          (readInfo:TcpSocket.ReadInfo) : void => {
        this.dataFromSocketQueue.handle(readInfo.data);
      });

      this.onceConnected.then(() => {
        this.dataToSocketQueue.setPromiseHandler(this.connectionSocket_.write);
      });

      // TODO: change to only ever fullfil, but give data on the way we were
      // disconnected.
      this.onceDisconnected = new Promise<void>((F, R) => {
        this.fulfillDisconnect_ = F;  // To be fired on good disconnect.
        this.rejectDisconnect_ = R;  // To be fired on bad disconnect.
      });
      this.connectionSocket_.on('onDisconnect', this.onDisconnectHandler_);
    }

    // reveieve returns a promise to get the next chunk of data.
    public receive = () : Promise<ArrayBuffer> => {
      return new Promise((F,R) => {
        this.dataFromSocketQueue.onceHandler(F).catch(R);
      });
    }

    // This happens when the Tcp connection is closed by the other end or
    // because  of an error. When closed by the other end, onceDisconnected is
    // fullfilled.  If there's an error, onceDisconnected is rejected with the
    // error.
    private onDisconnectHandler_ = (info:TcpSocket.DisconnectInfo) : void => {
      dbg('onDisconnectHandler_ (conn-id: ' + this.connectionId + ')');

      if(this.state_ === Connection.State.CLOSED) {
        dbgWarn('Got onDisconnect in state closed (connId=' +
            this.connectionId + '): errcode=' + info.errcode +
            '; msg=' + info.message);
        return;
      }

      this.state_ = Connection.State.CLOSED;

      if(info.errcode !== 'NONE') {
        var e = 'Socket ' + this.connectionId + ' disconnected with errcode '
          + info.errcode + ': ' + info.message;
        dbgErr(e);
        this.rejectDisconnect_(new Error(e));
        return;
      }

      dbg('Socket closed correctly (conn-id: ' + this.connectionId + ')');
      this.fulfillDisconnect_();
    }

    // This is called to close the underlying socket. This fulfills the
    // disconnect Promise `onceDisconnected`.
    public close = () : Promise<void> => {
      if (this.state_ === Connection.State.CLOSED) {
        dbgErr('Conn  ' + this.connectionId + ' was attempted to be closed ' +
          'after it was already closed.');
        return;
      }
      return this.connectionSocket_.close().then(this.fulfillDisconnect_,
                                                 this.fulfillDisconnect_)
    }

    // Boolean function to check if this connection is closed;
    public isClosed = () : boolean => {
      return this.state_ === Connection.State.CLOSED;
    };
    public getState = () : Connection.State => {
      return this.state_;
    };

    /**
     * Sends a message that is pre-formatted as an arrayBuffer.
     */
    public send = (msg :ArrayBuffer) : Promise<TcpSocket.WriteInfo> => {
      return this.dataToSocketQueue.handle(msg);
    }

    public toString = () => {
      return 'Tcp.Connection(' + this.connectionId + ':' + Connection.State[this.state_] + ')';
    }

  }  // class Tcp.Connection

  // Static stuff for the Connection class.
  export module Connection {
    // Exactly one of the arguments must be specified.
    export interface Kind {
      // To wrap up a connection for an existing socket
      existingSocketId ?:number;
      // TO create a new TCP connection to this target address and port.
      destination ?:Net.Endpoint;
    }

    // Exactly one of the arguments must be specified.
    export enum State {
      ERROR,
      CONNECTING,
      CONNECTED,
      CLOSED
    }
  } // module Connection

  var modulePrefix_ = '[Tcp] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module TCP
