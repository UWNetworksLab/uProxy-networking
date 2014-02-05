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
function getStringOfArrayBuffer(buf) {
  var uInt8Buf = new Uint8Array(buf);
  var s = '';
  for (var i = 0; i < buf.byteLength; ++i) {
    s += String.fromCharCode(uInt8Buf[i]);
  }
  return s;
}


module TCP {

  var DEFAULT_MAX_CONNECTIONS = 1048576;

  // Freedom Sockets API.
  // TODO: throw an Error if this isn't here.
  var FSockets = freedom['core.socket']();

  /**
   * TCP.Server
   *
   * Aside: see http://developer.chrome.com/trunk/apps/socket.html#method-getNetworkList
   * @param {Object} options Options of the form { maxConnections: integer,
   * allowHalfOpen: bool }.
   * @param {function} connect_callback Called when socket is connected.
   */
  export class Server {

    // TODO: finish typing these members
    maxConnections:number;
    callbacks:any;
    connectionCallbacks:any;
    openConnections:any;
    serverSocketId:number;

    constructor(public addr, public port, options?) {
      this.maxConnections = typeof(options) != 'undefined' &&
          options.maxConnections || DEFAULT_MAX_CONNECTIONS;

      // Callback functions.
      this.callbacks = {
        listening:  null,  // Called when server starts listening for connections.
        connection: null,  // Called when a new socket connection happens.
        disconnect: null,  // Called when server stops listening for connections.
        // Called when a socket is closed from the other side.  Passed socketId as an arg.
        socketRemotelyClosed: null
      };

      // Default callbacks for when we create new Connections.
      this.connectionCallbacks = {
        disconnect: null, // Called when a socket is closed
        recv: null,       // Called when server receives data.
        sent: null,       // Called when server has sent data.
        // TCP.Connection creation and removal callbacks.
        created: this._addToServer,
        removed: this._removeFromServer
      };

      this.openConnections = {};  // Open sockets.
      // Server socket (accepts and opens one socket per client)
      this.serverSocketId = null;
    }

    /** Open a socket to listen for TCP requests. */
    public listen() {
      FSockets.create('tcp', {}).done(this._onCreate);
    }

    /** Disconnect all sockets and stops listening. */
    public disconnect() {
      var serverSocketId = this.serverSocketId;
      if (serverSocketId) {
        console.log('TCP.Server: Disconnecting server socket ' + serverSocketId);
        FSockets.disconnect(serverSocketId);
        FSockets.destroy(serverSocketId);
      }
      this.serverSocketId = 0;
      for (var i in this.openConnections) {
        try {
          this.openConnections[i].disconnect();
          this._removeFromServer(this.openConnections[i]);
        } catch (ex) {
          console.warn(ex);
        }
      }
      this.callbacks.disconnect && this.callbacks.disconnect();
    }

    /**
     * Called when a new tcp connection is created.
     */
    private _addToServer = (tcpConnection) => {
      this.openConnections[tcpConnection.socketId] = tcpConnection;
    }

    /**
     * This is never called.
     */
    private _removeFromServer = (tcpConnection) => {
      // console.log("removing connection " + tcpConnection.socketId + " from server");
      delete this.openConnections[tcpConnection.socketId];
    }

    isConnected() { return this.serverSocketId > 0; }

    /**
     * Set an event handler. See http://developer.chrome.com/trunk/apps/socket.
     * html for more about the events than can happen.
     *
     * 'listening' takes TODO: complete.
     */
    public on(eventName, callback) {
      if (eventName in this.callbacks) {
        this.callbacks[eventName] = callback;
      } else {
        console.error('TCP.Server: on() failure for ' + eventName);
      }
    }

    /**
     * Callback upon creation of a socket. If socket was successfully created,
     * begin listening for incoming connections.
     */
    private _onCreate = (createInfo) => {
      console.log('TCP.Server: Creating socket ', createInfo);
      this.serverSocketId = createInfo.socketId;
      if (this.serverSocketId > 0) {
        console.log(JSON.stringify([this.serverSocketId, this.addr, this.port]));
        FSockets.listen(this.serverSocketId, this.addr, this.port)
          .done(this._onListenComplete);
      } else {
        console.error('Server: create socket failed for ' + this.addr + ':' +
            this.port);
      }
    }

    /**
     * Callback upon having heard the remote side. If connection was
     * successful, then accept and open a new socket.
     */
    private _onListenComplete = (resultCode) => {
      if (0 === resultCode) {
        FSockets.on('onConnection', this._accept);
        FSockets.on('onDisconnect', this._disconnect);
        // Start the listening callback if it exists.
        this.callbacks.listening && this.callbacks.listening();
      } else {
        console.error('Server: listen failed for ' + this.addr + ':' +
            this.port + '. Resultcode=' + resultCode);
      }
    }

    /** Accept a connection. */
    private _accept = (acceptValue) => {
      if (this.serverSocketId !== acceptValue.serverSocketId) {
        console.warn('Connected to unexpected socket ID: ',
                     this.serverSocketId);
        return;
      }
      var connectionsCount = Object.keys(this.openConnections).length;
      if (connectionsCount >= this.maxConnections) {
        FSockets.disconnect(acceptValue.clientSocketId);
        FSockets.destroy(acceptValue.clientSocketId);
        console.warn('Server: too many connections: ' + connectionsCount);
        return;
      }
      console.log('Server: got a connection socket=' + acceptValue.clientSocketId);
      this._createConnection(acceptValue.clientSocketId);
    }

    private _disconnect = (socketInfo) => {
      console.log('connection ' + socketInfo.socketId + ' remotely disconnected.');
      var disconnect_cb = this.openConnections[socketInfo.socketId].callbacks.disconnect;
      disconnect_cb && disconnect_cb(socketInfo.socketId);
      this.openConnections[socketInfo.socketId].disconnect();
      this._removeFromServer(socketInfo);
    }

    /** Create a TCP connection. */
    private _createConnection(socketId) {
      new Connection(socketId, this.callbacks.connection,
            this.connectionCallbacks);
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

    socketInfo:any = null;
    isConnected:boolean = false;
    pendingReadBuffer:any;
    recvOptions:any;
    pendingRead;
    // Right now this is only false until the socket has all the information a
    // user might need (ie socketInfo). The socket shouldn't be doing work for
    // the user until the internals are ready.
    _initialized:boolean = false;

    constructor(
        public socketId,
        public serverConnectionCallback,
        public callbacks) {

      this.callbacks.recv = callbacks.recv;
      this.callbacks.disconnect = callbacks.disconnect;
      this.callbacks.sent = callbacks.sent;
      this.callbacks.created = callbacks.created;
      this.callbacks.removed = callbacks.removed;
      this.isConnected = true;
      this.pendingReadBuffer = null;
      this.recvOptions = null;
      this.pendingRead = false;
      this.callbacks.created(this);

      FSockets.on('onData', this._onRead);
      FSockets.getInfo(socketId).done((socketInfo) => {
        this.socketInfo = socketInfo;
        this._initialized = true;

        // Fire connection callback for the server.
        console.log('Server: client connected, socketInfo=' +
                    JSON.stringify(socketInfo));
        if (serverConnectionCallback) {
          serverConnectionCallback(this);
        }
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
    public on(eventName, callback, options?) {
      if (eventName in this.callbacks) {
        this.callbacks[eventName] = callback;
        // For receiving, if recv is set to null at some point, we may end up with
        // data in pendingReadBuffer which when it is set to something else,
        // makes the callback with the pending data, and then re-starts reading.
        if(eventName == 'recv' && callback) {
          if(options) { this.recvOptions = options; }
          else { this.recvOptions = null; }

          // TODO: write a test for the pending buffer.
          if (this.pendingReadBuffer) {
            this._bufferedCallRecv();
          }
        }
      } else {
        console.error('Connection(' + this.socketId + '):' +
            'no such event for on: ' + eventName + ".  Available keys are " +
            JSON.stringify({available_keys: Object.keys(this.callbacks)}));
      }
    }

    /**
     *
     */
    private _bufferedCallRecv = () => {
      if(this.recvOptions && this.recvOptions.minByteLength &&
          this.recvOptions.minByteLength > this.pendingReadBuffer.byteLength) return;
      var tmpBuf = this.pendingReadBuffer;
      this.pendingReadBuffer = null;
      this.callbacks.recv(tmpBuf);
    }

    /**
     * Sends a message down the wire to the remote side
     *
     * @see http://developer.chrome.com/trunk/apps/socket.html#method-write
     * @param {String} msg The message to send.
     * @param {Function} callback The function to call when the message has sent.
     */
    public send(msg, callback?) {
      // Register sent callback.
      if ((typeof msg) != "string") {
        console.log("Connection.send: got non-string object.");
      }
      _stringToArrayBuffer(msg + '\n', (msg) => {
        this.sendRaw(msg, callback);
      });
    }

    /**
     * Sends a message pre-formatted into an arrayBuffer.
     */
    public sendRaw(msg, callback?) {
      if(!this.isConnected) {
        console.warn('Connection(' + this.socketId + '):' +
            ' sendRaw when disconnected.');
        return;
      }
      var realCallback = callback || this.callbacks.sent || function() {};
      FSockets.write(this.socketId, msg).done(realCallback);
    }

    /** Disconnects from the remote side. */
    public disconnect() {
      if(!this.isConnected) return;
      this.isConnected = false;
      // Temporarily remember disconnect callback.
      var disconnectCallback = this.callbacks.disconnect;
      // Remove all callbacks.
      this.callbacks.disconnect = null;
      this.callbacks.recv = null;
      this.callbacks.sent = null;
      // Close the socket.
      FSockets.disconnect(this.socketId);
      FSockets.destroy(this.socketId);
      // Make disconnect callback if not null
      disconnectCallback && disconnectCallback(this);
      // Fire removal callback for the Server containing this callback.
      this.callbacks.removed(this);
    }

    private _addPendingData(buffer) {
      if (!this.pendingReadBuffer) {
        this.pendingReadBuffer = buffer;
      } else {
        var temp = Uint8Array(this.pendingReadBuffer.byteLength +
                              buffer.byteLength);
        temp.set(new Uint8Array(this.pendingReadBuffer), 0);
        temp.set(new Uint8Array(buffer), this.pendingReadBuffer.byteLength);
        this.pendingReadBuffer = temp.buffer;
      }
    }

    /**
     * Callback function for when data has been read from the socket.
     * Converts the array buffer that is read in to a string
     * and sends it on for further processing by passing it to
     * the previously assigned callback function.
     * See freedom core.socket onData event.
     */
    private _onRead = (readInfo) => {
      if (readInfo.socketId !== this.socketId) {
        console.warn('onRead: received data for the wrong socketId: ',
                     this.socketId);
        return;
      }
      if (this.callbacks.recv && this._initialized) {
        this._addPendingData(readInfo.data);
        this._bufferedCallRecv();
      } else {
        // If we are not receiving data at the moment, we store the received
        // data in a pendingReadBuffer for the next time this.callbacks.recv is
        // turned on.
        this._addPendingData(readInfo.data);
        this.pendingRead = false;
      }
    }

    /** Callback for when data has been successfully written to socket. */
    private _onWriteComplete = (writeInfo) => {
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
        pendingReadBuffer: this.pendingReadBuffer,
        recvOptions: this.recvOptions,
        pendingRead: this.pendingRead
      };
    }

    // TODO(keroserene): add a toString for this
    public toString = () => {
      return JSON.stringify(this.state());
    }

  }  // class TCP.Connection


  /**
   * Converts an array buffer to a string
   *
   * @private
   * @param {ArrayBuffer} buf The buffer to convert.
   * @param {Function} callback The function to call when conversion is
   * complete.
   */
  function _arrayBufferToString(buf, callback) {
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
  function _stringToArrayBuffer(str, callback) {
    var bb = new Blob([str]);
    var f = new FileReader();
    f.onload = function(e) {
        callback(e.target.result);
    };
    f.readAsArrayBuffer(bb);
  }

}  // module TCP
