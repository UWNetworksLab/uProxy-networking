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
/// <reference path='../chrome-fsocket.ts' />
/// <reference path='../interfaces/promise.d.ts' />


module TCP {

  var DEFAULT_MAX_CONNECTIONS = 1048576;

  // Freedom Sockets API.
  // TODO: throw an Error if this isn't here.
  var fSockets:ISockets = freedom['core.socket']();

  interface ICreateInfo {
    socketId:number;
  }

  /**
   * TCP.Server
   *
   * Aside: see http://developer.chrome.com/trunk/apps/socket.html#method-getNetworkList
   * @param {Object} options Options of the form { maxConnections: integer,
   * allowHalfOpen: bool }.
   * @param {function} connect_callback Called when socket is connected.
   */
  export class Server {

    // Server accepts & opens one socket per client.
    private serverSocketId:number = null;
    private maxConnections:number;
    private conns:{[socketId:number]:Promise<TCP.Connection>} = {};
    private endpoint_:string = null;

    // TODO: replace with promises.
    private callbacks:any;
    private connectionCallbacks:any;

    constructor(public addr, public port, options?) {
      this.maxConnections = (options && options.maxConnections) ||
                            DEFAULT_MAX_CONNECTIONS;
      this.endpoint_ = addr + ':' + port;
      // Callback functions. TODO: remove when promises are here.
      this.callbacks = {
        connection: null,  // Called when a new socket connection happens.
        disconnect: null,  // Called when server stops listening for connections.
      };

      // Default callbacks for when we create new Connections.
      this.connectionCallbacks = {
        recv: null,       // Called when server receives data.
        sent: null,       // Called when server has sent data.
      };
    }

    /**
     * Open new socket and listen for TCP requests.
     *
     * Returns: Promise that this server is now listening.
     */
    public listen():Promise<any> {
      return this.createSocket_()
          .then(this.startListening_)
          .then(this.attachSocketHandlers_)
          .catch(this.handleError_);
    }

    /**
     * Promise the creation of a freedom socket.
     * TODO: When freedom uses promises, simplify this function away.
     */
    private createSocket_ = ():Promise<ICreateInfo> => {
      return new Promise((F, R) => {
        fSockets.create('tcp', {}).done(F).fail(R);
      });
    }

    /**
     * Promise that socket begins listening.
     */
    private startListening_ = (createInfo:ICreateInfo):Promise<number>  => {
      this.serverSocketId = createInfo.socketId;
      if (this.serverSocketId <= 0) {
        return Util.Reject('failed to create socket on ' + this.endpoint_);
      }
      console.log('TCP.Server: created socket ' + this.serverSocketId +
          ' listening at ' + this.endpoint_);
      return new Promise((F, R) => {
        fSockets.listen(this.serverSocketId, this.addr, this.port)
            .done(F).fail(R);
      });
    }

    /**
     * Promise attachment of connection and data handlers if socket listening
     * was successful.
     */
    private attachSocketHandlers_ = (resultCode:number) => {
      if (0 !== resultCode) {
        return Util.Reject('listen failed on ' + this.endpoint_ +
                             ' \n Result Code: ' + resultCode);
      }
      // Success. Attach connect, disconnect, and data handlers.
      fSockets.on('onConnection', this.accept_);
      fSockets.on('onData', this.readConnectionData_);
      fSockets.on('onDisconnect', this.disconnectSocket_);
    }

    /**
     * Accept and promise creation of new TCP connection.
     */
    private accept_ = (acceptValue) => {
      if (this.serverSocketId !== acceptValue.serverSocketId) {
        return Util.Reject('cannot accept unexpected socket ID: ' +
            this.serverSocketId + ' vs ' + acceptValue.serverSocketId);
      }
      var socketId = acceptValue.clientSocketId;
      var connectionsCount = Object.keys(this.conns).length;
      if (connectionsCount >= this.maxConnections) {
        // Stop too many connections.
        fSockets.disconnect(socketId);
        fSockets.destroy(socketId);
        return Util.Reject('too many connections: ' + connectionsCount);
      }
      var promise = this.conns[socketId] = Connection.Create(
          socketId, this.connectionCallbacks);
      console.log('TCP.Server accepted connection ' + socketId);
      promise.then(this.callbacks.connection);  // External connect handler.
    }

    /**
     * Disconnect all sockets and stops listening.
     */
    public disconnect():Promise<any> {
      return new Promise((F,R) => {
        var serverSocketId = this.serverSocketId;
        if (serverSocketId) {
          console.log('TCP.Server: Disconnecting server socket ' + serverSocketId);
          // Block on disconnection and destruction.
          fSockets.disconnect(serverSocketId).fail(R);
          fSockets.destroy(serverSocketId).fail(R);
        }
        this.serverSocketId = 0;
        for (var i in this.conns) {
          try {
            this.conns[i]
                .then(Connection.disconnect)
                .then(this.removeFromServer_);
          } catch (ex) {
            console.warn(ex);
          }
        }
        F();  // Fulfill.
      });
    }

    /**
     * Read data from one of the connection.
     * Assumes that the connection exists.
     */
    private readConnectionData_ = (readInfo) => {
      if (!(readInfo.socketId in this.conns)) {
        console.error('connectionRead: received data for non-existing socket ' +
                     readInfo.socketId);
        return;
      }
      this.conns[readInfo.socketId].then((conn) => {
        conn.read(readInfo.data);
      });
    }

    private removeFromServer_ = (conn:TCP.Connection) => {
      delete this.conns[conn.socketId];
    }

    public isOn() { return this.serverSocketId > 0; }

    /**
     * Set an event handler. See http://developer.chrome.com/trunk/apps/socket.
     * html for more about the events than can happen.
     */
    public on(eventName:string, callback) {
      if (!(eventName in this.callbacks)) {
        console.error('TCP.Server: on() failure for ' + eventName);
        return;
      }
      this.callbacks[eventName] = callback;
    }

    /**
     * Fired when remote socket disconnected.
     */
    private disconnectSocket_ = (socketInfo) => {
      var socketId = socketInfo.socketID;
      if (!(socketId in this.conns)) {
        console.warn('Socket ' + socketId + ' D.N.E. for disconnect.');
        return;
      }
      console.log('TCP.Server: socket ' + socketInfo.socketId +
                  ' remotely disconnected.');
      this.endConnection(socketId);
    }

    /**
     * Stop a TCP connection and remove from server.
     */
    public endConnection = (socketId) => {
      console.log('ENDING ' + socketId);
      this.conns[socketId]
          .then(Connection.disconnect)
          .then(this.removeFromServer_);
      // TODO: Do we need an external callback here?
    }

    private handleError_ = (err:Error) => {
      console.error('TCP.Server: ' + err.message);
      console.error(err.stack);
    }

  }  // class TCP.Server


  /**
   * TCP.Connection - Holds a TCP connection to a client
   *
   * @param {number} socketId The ID of the server<->client socket.
   * @param {Server.callbacks.connection}  serverConnectionCallback
   *    Called when the new TCP connection is formed and initialized,
   *    passing itself as a parameter.
   * @param {Server.connectionCallbacks} callbacks
   */
  export class Connection {

    public isConnected:boolean = false;
    private socketInfo:any = null;
    private recvOptions:any;

    private pendingReadBuffer_:any;
    private pendingRead_:boolean;
    // Right now this is only false until the socket has all the information a
    // user might need (ie socketInfo). The socket shouldn't be doing work for
    // the user until the internals are ready.
    private initialized_:boolean = false;
    public callbacks;

    private disconnectPromise:Promise<void> = null;
    private fulfillDisconnect = null;

    // Static connection creation function which returns a promise.
    static Create = (socketId, callbacks):Promise<Connection> => {
      return new Promise((F,R) => {
        var conn = new Connection(socketId, callbacks);
        fSockets.getInfo(socketId).done((socketInfo) => {
          conn.socketInfo = socketInfo;
          conn.initialized_ = true;
          F(conn);
        });
      });
    }

    /**
     * This constructor should not be called directly.
     */
    constructor(public socketId, callbacks) {
      this.callbacks = callbacks;
      this.isConnected = true;
      this.pendingReadBuffer_ = null;
      this.recvOptions = null;
      this.pendingRead_ = false;
      this.disconnectPromise = new Promise<void>((F, R) => {
        this.fulfillDisconnect = F;  // To be fired on disconnect.
      })
      console.log('created tcp connection ' + socketId);
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
    public on(eventName, callback, options?) {
      if (!(eventName in this.callbacks)) {
        console.error('TCP.Connection [' + this.socketId + ']:' +
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
    public receive = (minByteLength?:number):Promise<any> => {
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
      // console.log('buffered call rcv' + this.pendingReadBuffer_ + this);
      if (this.recvOptions && this.recvOptions.minByteLength &&
          this.recvOptions.minByteLength > this.pendingReadBuffer_.byteLength) {
        return;
      }
      var tmpBuf = this.pendingReadBuffer_;
      this.pendingReadBuffer_ = null;
      this.callbacks.recv(tmpBuf);  // Fire external recv callback.
    }

    /**
     * Sends a message down the wire to the remote side
     *
     * @see http://developer.chrome.com/trunk/apps/socket.html#method-write
     * @param {String} msg The message to send.
     * @param {Function} callback The function to call when the message has sent.
     */
    public send(msg:string, callback?) {
      // Register sent callback.
      if ('string' !== (typeof msg)) {
        console.warn('Connection.send: got non-string object.');
      }
      Util.stringToArrayBuffer(msg + '\n', (msg) => {
        this.sendRaw(msg, callback);
      });
    }

    /**
     * Sends a message pre-formatted into an arrayBuffer.
     */
    public sendRaw(msg, callback?) {
      if(!this.isConnected) {
        console.warn('TCP.Connection socket#' + this.socketId + ' - ' +
            ' sendRaw() whilst disconnected.');
        return;
      }
      var realCallback = callback || this.callbacks.sent || function() {};
      fSockets.write(this.socketId, msg).done(realCallback);
    }

    /**
     * Disconnect underlying socket.
     */
    public disconnect() {
      if (!this.isConnected) { return; }
      this.isConnected = false;
      // Close the socket.
      fSockets.disconnect(this.socketId);
      fSockets.destroy(this.socketId);
      this.fulfillDisconnect();  // Fire the disconnect Promise.
      return this;
    }
    public onDisconnect() { return this.disconnectPromise; }
    public static disconnect(conn:Connection) { return conn.disconnect(); }

    private addPendingData_(buffer) {
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

    /**
     * Reads data from the socket.
     */
    public read = (data) => {
      if (this.callbacks.recv && this.initialized_) {
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

    /** Callback for when data has been successfully written to socket. */
    private onWriteComplete_ = (writeInfo) => {
      if (this.callbacks.sent) {
        this.callbacks.sent(writeInfo);
      }
    }

    /** Output the state of this connection */
    public state = () => {
      return {
        socketId: this.socketId,
        socketInfo: this.socketInfo,
        callbacks: this.callbacks,
        isConnected: this.isConnected,
        pendingReadBuffer_: this.pendingReadBuffer_,
        recvOptions: this.recvOptions,
        pendingRead: this.pendingRead_
      };
    }

    public toString = () => {
      // return JSON.stringify(this.state());
      return '<TCP.Connection[' + this.socketId +
          '] (' + (this.isConnected? 'connected' : 'disconnected') + ')>';
    }

  }  // class TCP.Connection

}  // module TCP


module Util {

  /**
   * Converts an array buffer to a string
   *
   * @private
   * @param {ArrayBuffer} buf The buffer to convert.
   * @param {Function} callback The function to call when conversion is
   * complete.
   */
  export function arrayBufferToString(buf, callback) {
    var bb = new Blob([new Uint8Array(buf)]);
    var f = new FileReader();
    f.onload = function(e) {
      callback(e.target.result);
    };
    f.readAsText(bb);
  }

  /**
   * Converts a string to an array buffer
   *
   * @private
   * @param {String} str The string to convert.
   * @param {Function} callback The function to call when conversion is
   * complete.
   */
  export function stringToArrayBuffer(str, callback) {
    var bb = new Blob([str]);
    var f = new FileReader();
    f.onload = function(e) {
      callback(e.target.result);
    };
    f.readAsArrayBuffer(bb);
  }

  /**
   * Wrapper around creating a Promise rejection with Error.
   */
  export function Reject(msg:string) {
    return Promise.reject(new Error(msg));
  }

}  // module Util
