/*
  This is a TCP server based on Freedom's sockets API.

  Based on:
    https://github.com/GoogleChrome/chrome-app-samples/tree/master/tcpserver
*/

/**
 * Converts an array buffer to a string of hex codes and interpretations as
 * a char code.
 *
 * @param {ArrayBuffer} buf The buffer to convert.
 */

/// <reference path='../../node_modules/freedom-typescript-api/interfaces/tcp-socket.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/promise.d.ts' />


module TCP {
  import TcpSocket = freedom.TcpSocket;

  var DEFAULT_MAX_CONNECTIONS = 1048576;

  interface IConnectionCallbacks {
    recv :any;
    sent :any;
  }

  /**
   * TCP.ServerOptions
   */
  export interface ServerOptions {
    maxConnections?:number;
    allowHalfOpen?:boolean;
  }

  /**
   * TCP.Server
   *
   * Aside: see http://developer.chrome.com/trunk/apps/socket.html#method-getNetworkList
   */
  export class Server {
    private serverSocket_ :TcpSocket;
    private maxConnections :number;
    private conns:{[socketId:number] : TCP.Connection} = {};
    private endpoint_ :string = null;
    private callbacks :any;  // TODO: replace with promises.

    /**
     * Create TCP server.
     */
    constructor(public addr, public port, options ?:ServerOptions) {
      this.maxConnections = (options && options.maxConnections) ||
                            DEFAULT_MAX_CONNECTIONS;
      this.endpoint_ = addr + ':' + port;
      // Callback functions. TODO: remove when promises are here.
      this.callbacks = {
        connection: null,  // Called when a new socket connection happens.
        disconnect: null,  // Called when server stops listening for connections.
      };
      this.serverSocket_ = freedom['core.tcpsocket']();
    }

    /**
     * Open new socket and listen for TCP requests.
     *
     * Returns: Promise that this server is now listening.
     */
    public listen() : Promise<any> {
      return this.startListening_()
          // Success. Attach connect, disconnect, and data handlers.
          .then(this.attachSocketHandlers_)
          .catch(this.handleError_);
    }

    /**
     * Promise that socket begins listening.
     */
    private startListening_ = () : Promise<any> => {
      if (!this.serverSocket_) {
        return Util.reject('failed to create socket on ' + this.endpoint_);
      }
      dbg('created server socket, listening on ' + this.endpoint_);
      return this.serverSocket_.listen(this.addr, this.port);
    }

    /**
     * Promise attachment of connection and data handlers.
     * Assumes server socket is successfully listening.
     */
    private attachSocketHandlers_ = () => {
      this.serverSocket_.on('onConnection', this.onConnectionHandler_);
    }

    /**
     * Accept and promise creation of new TCP connection.
     */
    private onConnectionHandler_ = (acceptValue) => {
      var socketId = acceptValue.socket;

      // Check that we haven't reach the maximum number of connections
      var connectionsCount = Object.keys(this.conns).length;
      if (connectionsCount >= this.maxConnections) {
        // Stop too many connections.  We create a new socket here from the
        // incoming Id and immediately close it, because we don't yet have a
        // reference to the incomming socket.
        var tempSocket = freedom['core.tcpsocket'](socketId);
        tempSocket.close();
        return Util.reject('too many connections: ' + connectionsCount);
      }

      // Create new connection.
      dbg('TCP.Server accepted connection on socket id ' + socketId);
      this.conns[socketId] = new Connection(socketId, this);

      // Fire any callback remove of this class may have added for connection.
      if (this.callbacks.connection) {
        this.callbacks.connection(this.conns[socketId]);
      }
    }

    /**
     * Disconnect all sockets and stops listening.
     */
    public disconnect = () : Promise<any> => {
      return new Promise((F, R) => {
        var allPromises = [];

        // Disconnect server socket.
        if (this.serverSocket_) {
          allPromises.push(this.serverSocket_.close());
        }

        // Disconnect all connections.
        for (var i in this.conns) {
          try {
            allPromises.push(this.conns[i].disconnect().then(this.removeFromServer));
          } catch (ex) {
            console.warn(ex);
          }
        }

        // Wait for all promises to complete.
        Promise.all(allPromises).then(
          () => { dbg('successfully disconnected'); F(); },
          (ex) => { console.warn(ex); });  // 1 or more promises rejected
      });
    }

    public removeFromServer = (conn:TCP.Connection) => {
      return new Promise((F,R) => {
        delete this.conns[conn.socketId];
        F();
      });
    }

    /**
     * Set an event handler. See http://developer.chrome.com/trunk/apps/socket.
     * html for more about the events than can happen.
     */
    public on = (eventName :string, callback) => {
      if (!(eventName in this.callbacks)) {
        console.error('TCP.Server: on() failure for ' + eventName);
        return;
      }
      this.callbacks[eventName] = callback;
    }

    /**
     * Locally stop a TCP connection and remove from server.
     */
    public endConnection = (socketId) => {
      if (!(socketId in this.conns)) {
        return;  // Do nothing, silently. There are multiple directions in which
                 // tcp connections must be closed, so this is expected.
      }
      this.conns[socketId].close().then(this.removeFromServer);
    }

    private handleError_ = (err :Error) => {
      console.error('TCP.Server: ' + err.message);
      console.error(err.stack);
    }

  }  // class TCP.Server


  /**
   * TCP.Connection - Holds a TCP connection to a client
   *
   * @param {number} socketId The ID of the server<->client socket.
   */
  export class Connection {

    private connectionSocket_ :TcpSocket;
    private recvOptions :any;
    private pendingReadBuffer_ :any;
    private pendingRead_ :boolean;
    private callbacks :IConnectionCallbacks;
    // Promise for the disconnection of this connection.
    private disconnectPromise_ :Promise<number>;
    // Private function called to invoke disconnectPromise_. 
    private fulfillDisconnect_ :(number)=>void;
    private server_ :Server;

    /**
     * This constructor should not be called directly.
     */
    constructor(public socketId :number, server :Server) {
      this.callbacks = {
        recv: null,
        sent: null
      };
      this.pendingReadBuffer_ = null;
      this.recvOptions = null;
      this.pendingRead_ = false;
      this.disconnectPromise_ = new Promise<number>((F, R) => {
        this.fulfillDisconnect_ = F;  // To be fired on disconnect.
      });
      this.connectionSocket_ = freedom['core.tcpsocket'](socketId);
      this.connectionSocket_.on('onData', this.onDataHandler_);
      this.connectionSocket_.on('onDisconnect', this.onDisconnectHandler_);
      this.server_ = server;
    }

    private onDataHandler_ = (data) => {
      data = data.data;
      if (this.callbacks.recv) {
        this.addPendingData_(data);
        this.bufferedCallRecv_();
      } else {
        // If not receiving data at the moment, store the received data in a
        // pendingReadBuffer_ for the next time this.callbacks.recv is
        // turned on.
        this.addPendingData_(data);
        this.pendingRead_ = false;
      }
    }

    private onDisconnectHandler_ = (data :TcpSocket.DisconnectInfo) => {
      if (data.errcode) {
        dbgWarn('Socket ' + this.socketId + ' disconnected with errcode ' +
          data.errcode + ': ' + data.message);
      }
      this.close().then(() => {
        this.server_.removeFromServer(this);
      });
    }

    /**
     * Set an event handler. See http://developer.chrome.com/trunk/apps/socket.
     * html for more about the events than can happen.
     *
     * When 'recv' callback is null, data is buffered and given to next non-null
     * callback.
     *
     * @param {string} eventName Enumerated instance of valid callback.
     * @param {function} callback Callback function.
     */
    public on = (eventName, callback, options?) => {
      if (!(eventName in this.callbacks)) {
        dbgErr('TCP.Connection [' + this.socketId + ']:' +
            'no such event for on: ' + eventName + ".  Available keys are " +
            JSON.stringify({available_keys: Object.keys(this.callbacks)}));
        return
      }
      this.callbacks[eventName] = callback;
      // For receiving, if recv is set to null at some point, we may end up with
      // data in pendingReadBuffer_ which when it is set to something else,
      // makes the callback with the pending data, and then re-starts reading.
      if (('recv' == eventName) && callback) {
        this.recvOptions = options || null;
        // TODO: write a test for the pending buffer.
        if (this.pendingReadBuffer_) {
          this.bufferedCallRecv_();
        }
      }
    }

    /**
     * Obtain a promise for a buffer as the result of a recv.
     */
    public receive = (minByteLength ?:number) : Promise<ArrayBuffer> => {
      return new Promise((F, R) => {
        if (minByteLength) {
          this.recvOptions = {
            minByteLength: minByteLength
          };
          if (this.pendingReadBuffer_) {
            this.bufferedCallRecv_();
          }
        }
        this.on('recv', F);
      });
    }

    /**
     * Buffer the calls to |recv| if there is a minByeLength.
     */
    private bufferedCallRecv_ = () => {
      if (this.recvOptions && this.recvOptions.minByteLength &&
          this.recvOptions.minByteLength > this.pendingReadBuffer_.byteLength) {
        return;
      }
      var tmpBuf = this.pendingReadBuffer_;
      this.pendingReadBuffer_ = null;
      this.callbacks.recv(tmpBuf);  // Fire external recv callback.
    }

    /**
     * Sends a message pre-formatted into an arrayBuffer.
     */
    public sendRaw = (msg, callback?) => {
      var realCallback = callback || this.callbacks.sent || function() {};
      this.connectionSocket_.write(msg).then(realCallback);
    }

    /**
     * Close underlying socket locally.
     */
    public close = () : Promise<Connection> => {
      return new Promise((F, R) => {
        this.connectionSocket_.close().then(() => {
          F(this);
        });
      });
    }

    /**
     * Fired when underlying socket disconnected remotely.
     */
    public disconnect = () : Promise<Connection> => {
      this.fulfillDisconnect_(0);
      return this.close();
    }

    /**
     * Return promise for the (remote) disconnection of this socket.
     */
    public onceDisconnected = () :Promise<number> => {
      return this.disconnectPromise_;
    }

    private addPendingData_ = (buffer :ArrayBuffer) => {
      if (!this.pendingReadBuffer_) {
        this.pendingReadBuffer_ = buffer;
      } else {
        var temp = new Uint8Array(this.pendingReadBuffer_.byteLength +
                              buffer.byteLength);
        temp.set(new Uint8Array(this.pendingReadBuffer_), 0);
        temp.set(new Uint8Array(buffer), this.pendingReadBuffer_.byteLength);
        this.pendingReadBuffer_ = temp.buffer;
      }
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


module Util {
  /**
   * Wrapper around creating a Promise rejection with Error.
   */
  export function reject(msg:string) {
    return Promise.reject(new Error(msg));
  }
}  // module Util
