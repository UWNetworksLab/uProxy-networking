/*
  Wrapper which terminates relayed web requests through a native socket object.
*/
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/tcp-socket.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/promise.d.ts' />

module Net {
  import TcpSocket = freedom.TcpSocket;

  enum State {
    CREATING_SOCKET,
    CONNECTING,
    CONNECTED,
    CLOSED
  }

  export interface Endpoint {
    address:string;
    port:number;
  }

  /**
   * Net.Client - TCP socket connection to a net destination.
   *
   * TODO: write a unit test using this and tcp-server.
   */
  export class Client {

    private socket_:TcpSocket = null;
    private queue:any[] = [];
    private state:State = State.CLOSED;

    private disconnectPromise:Promise<void>;
    private fulfillDisconnect:()=>void;

    /**
     * Constructing a Net.Client immediately begins a socket connection.
     */
    constructor (
        // External callback for data coming back over this socket.
        private onResponse_:(buffer:ArrayBuffer)=>any,
        private destination:Endpoint) {
      this.state = State.CREATING_SOCKET;
      this.disconnectPromise = new Promise<void>((F, R) => {
        this.fulfillDisconnect = F;  // To be fired on close.
      });
    }

    // TODO: this should probably just be a static creation function
    public create = () : Promise<Endpoint> => {
      return this.createSocket_()  // Initialize client TCP socket.
          .then(this.connect_)
          .then(this.attachHandlers_)
          .then(() => {
            return {
              // TODO: return the real address from which we are connected
              address: '127.0.0.1',
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
        this.socket_.write(buffer).then(this.onWrite_);
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
      dbg('closing socket of ' + JSON.stringify(this.destination));
      this.state = State.CLOSED;
      if (this.socket_) {
        this.socket_.close();
      }
      this.socket_ = null;
    };

    /**
     * Wrapper which returns a promise for a created socket.
     */
    private createSocket_ = () : Promise<any> => {
      return new Promise((F, R) => {
        this.socket_ = freedom['core.tcpsocket']();
        F();
      });
    }

    /**
     * Connect the socket. Assumes it was successfully created.
     */
    private connect_ = () : Promise<any> => {
      this.state = State.CONNECTING;
      return this.socket_.connect(this.destination.address,
                                  this.destination.port);
    }

    /**
     * Once connected to socket, attach handlers and send any queued data.
     */
    private attachHandlers_ = () => {
      this.state = State.CONNECTED;
      this.socket_.on('onData', this.readData_);
      this.socket_.on('onDisconnect', this.onDisconnect_);
      if (0 < this.queue.length) {
        this.send(this.queue.shift());
      }
    }

    /**
     * Read data from the destination.
     */
    private readData_ = (readInfo:TcpSocket.ReadInfo) => {
      this.onResponse_(readInfo.data);
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
