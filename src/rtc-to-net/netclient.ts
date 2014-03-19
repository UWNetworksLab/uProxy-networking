/*
  Wrapper which terminates relayed web requests through a native socket object.
*/
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/tcp-socket.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/promise.d.ts' />

module Net {
  import TcpSocket = freedom.TcpSocket;

  var fSockets:TcpSocket = freedom['core.socket']();

  enum State {
    CREATING_SOCKET,
    CONNECTING,
    CONNECTED,
    CLOSED
  }

  export interface Destination {
    host:string;
    port:number;
  }

  /**
   * Net.Client - TCP socket connection to a net destination.
   *
   * TODO: write a unit test using this and tcp-server.
   */
  export class Client {

    private socketId:number = null;
    private queue:any[] = [];
    private state:State = State.CLOSED;

    private disconnectPromise:Promise<void>;
    private fulfillDisconnect:()=>void;

    /**
     * Constructing a Net.Client immediately begins a socket connection.
     */
    constructor (
        // External callback for data coming back over this socket.
        private onResponse:(buffer:ArrayBuffer)=>any,
        private destination:Destination) {
      this.state = State.CREATING_SOCKET;
      this.disconnectPromise = new Promise<void>((F, R) => {
        this.fulfillDisconnect = F;  // To be fired on close.
      });
    }

    // TODO: this should probably just be a static creation function
    public create = () : Promise<Channel.EndpointInfo> => {
      return this.createSocket_()  // Initialize client TCP socket.
          .then(this.connect_)
          .then(this.attachHandlers_)
          .then(() => {
            return {
              // TODO: return the real address from which we are connected
              ipAddrString: '127.0.0.1',
              port: 0
            };
          });
    }

    /**
     * Send |buffer| over this TCP connection.
     */
    public send = (buffer) => {
      if (State.CLOSED == this.state) {
        dbgWarn('attempted to send data to closed socket!');
        return;
      }
      if (State.CONNECTED == this.state) {
        fSockets.write(this.socketId, buffer).then(this.onWrite_);
      } else {
        this.queue.push(buffer);
      }
    }

    /**
     * Close the Net.Client locally.
     */
    public close = () => {
      if (State.CLOSED == this.state) {
        return;
      }
      dbg('closing ' + this.socketId + ' of ' + JSON.stringify(this.destination));
      this.state = State.CLOSED;
      if (this.socketId) {
        fSockets.disconnect(this.socketId);
        fSockets.destroy(this.socketId);
      }
      this.socketId = null;
    };

    /**
     * Wrapper which returns a promise for a created socket.
     */
    private createSocket_ = () : Promise<TcpSocket.CreateInfo> => {
      return fSockets.create('tcp', {})
          .then((createInfo:TcpSocket.CreateInfo) => {
            this.socketId = createInfo.socketId;
            if (!this.socketId) {
              return Promise.reject(new Error(
                  'Failed to create socket. createInfo: ' + createInfo));
            }
            return Promise.resolve(createInfo);
          });
    }

    /**
     * Connect the socket. Assumes it was successfully created.
     */
    private connect_ = ():Promise<number> => {
      this.state = State.CONNECTING;
      return fSockets.connect(this.socketId,
                              this.destination.host,
                              this.destination.port);
    }

    /**
     * Once connected to socket, attach handlers and send any queued data.
     */
    private attachHandlers_ = (result:number) => {
      if (0 !== result) {
        return Promise.reject(new Error('connect error ' + result));
      }
      this.state = State.CONNECTED;
      fSockets.on('onData', this.readData_);
      fSockets.on('onDisconnect', this.onDisconnect_);
      if (0 < this.queue.length) {
        this.send(this.queue.shift());
      }
    }

    /**
     * Read data from the destination.
     */
    private readData_ = (readInfo:TcpSocket.ReadInfo) => {
      if (readInfo.socketId !== this.socketId) {
        // TODO: currently our Freedom socket API sends all messages to every
        // listener. Most crappy. Fix so that we tell it to listen to a
        // particular socket.
        return;
      }
      this.onResponse(readInfo.data);
    }

    /**
     * After writing data to socket...
     */
    private onWrite_ = (writeInfo) => {
      // console.log('Bytes written: ' + writeInfo.bytesWritten);
      // TODO: change sockets to having an explicit failure rather than giving -1
      // in the bytesWritten field.
      if (0 >= writeInfo.bytesWritten) {
        this.close();
        return;
      }
      // If there is more to write, send it again.
      // TODO: this callback recursion could cause a stack explosion...
      if (0 < this.queue.length) {
        this.send(this.queue.shift());
      }
    }

    /**
     * Fired only when underlying socket closes remotely.
     */
    private onDisconnect_ = (socketInfo:TcpSocket.DisconnectInfo) => {
      if (socketInfo.socketId != this.socketId) {
        return;  // duplicity of socket events.
      }
      dbg(this.socketId + ' - ' + socketInfo.error);
      this.close();
      this.fulfillDisconnect();
    }

    /**
     * Promise the future closing of this client. This only gets fired by remote
     * disconnections, not from active close() calls locally.
     */
    public onceDisconnected = () => { return this.disconnectPromise; }

  }  // Net.Client

  var modulePrefix_ = '[Net] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module Net
