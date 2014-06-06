/*
 * This is a TCP server based on Freedom's sockets API.
 */

/// <reference path='../../node_modules/freedom-typescript-api/interfaces/tcp-socket.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/promise.d.ts' />

module TCP {
  import TcpSocket = freedom.TcpSocket;

  var DEFAULT_MAX_CONNECTIONS = 1048576;

  // Queue up stuff while the handler is set to null. When set to not null
  // handle all the stuff that got queued.
  // (TODO: a kind of opposite to a promise, can probably be extended)
  export class HandlerQueue<T> {
    // the Queue of things to handle.
    private queue_ :T[] = [];

    // handler for things on the queue.
    private handler_ :(T) => void = null;

    // We store a handler's promise rejection function and cal it when
    // setHandler is called for an unfullfilled promise. We need to do this
    // because the old handler that would fulfill the promise is no longer
    // attached, sothe promise may never then be fulfilled.
    //
    // Note: we could try to generalise to event handling (many handlers),  but
    // there is some tricky questions for how long to queue stuff: it would need
    // explicitly start/stop queueing operations or some such. (having a handler
    // might no longer double as a mechanism to know that we are ready to handle
    // stuff: you'd have to deal with promiseHandling vs other).
    //
    // Invaiant: rejectFn_ == null iff handlePromise_ == null;
    private rejectFn_ : (e:Error) => void = null;

    // For measuring accumulation of things to handle.
    private measure :number = 0;
    private accumulate :NumberAccumulator<T>;

    constructor() {}

    // Calling setHandler with null pauses handling and queue all objects to be
    // handled.
    //
    // If you have an unfulfilled promise, calling setHandler rejects the old
    // promise.
    public setHandler = (handler:(T) => void) : void => {
      if (rejectFn_) {
        // Question: How efficient is new Error? Maybe best to have rejection
        // with error.
        rejectFn_(new Error('Cancelled by a call to setHandler'));
        rejectFn_ = null;
      }
      this.handler_ = handler;
      processQueue();
    }

    private processQueue = () : void => {
      // Note: a handler may itself setHandler to being null, doing so should
      // pause proccessing of the queue.
      while(this.handler_ && this.queue_.length > 0) {
        this.handler_(this.queue_.shift());
      }
    }

    public clearQueue = () : void => {
      this.queue_ = [];
    }

    public getLength = () : number => {
      return this.queue_.length;
    }

    public handle = (x:T) : void => {
      if(this.handler_) {
        this.handler_(x);
        return
      }
      this.queue_.push(x);
    }

    // Note: this sets the Handler to fulfil this promise when there is
    // something to handle.
    public makePromise = () :Promise<T> => {
      var fulfillFn :(x:T) => void;
      var promiseForNextHandle = new Promise((F,R) => {
          fulfillFn = F;
          this.rejectFn_ = R;
      };
      this.setHandler((x:T) => {
        // Note: we don't call setHandler here because it is responsible for
        // cancelling the last promise if one was made: you only get one promise
        // to handle, so if we called it, we'd reject the promise we are
        // supposed to be fulfilling!
        this.handler_ = null;
        this.rejectFn_ = null;
        fulfillFn(x);
      });

      return promiseForNextHandle;
    }
  }


  /**
   * TCP.ServerOptions
   */
  export interface ServerOptions {
    maxConnections?:number;
  }

  // TCP.Server: a TCP Server.
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
