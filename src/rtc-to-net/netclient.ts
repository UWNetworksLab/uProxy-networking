/*
  Wrapper which terminates relayed web requests through a native socket object.
*/
/// <reference path='../interfaces/socket.d.ts' />
/// <reference path='../interfaces/promise.d.ts' />

declare var freedom:any;

module Net {

  var fSockets:Sockets.API = freedom['core.socket']();

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

    private closePromise:Promise<void>;
    private fulfillClose:()=>void;

    /**
     * Constructing a Net.Client immediately begins a socket connection.
     */
    constructor (
        // External callback for data coming back over this socket.
        private onResponse:(buffer:any)=>any,
        private destination:Destination) {
      this.state = State.CREATING_SOCKET;
      this.closePromise = new Promise<void>((F, R) => {
        this.fulfillClose = F;  // To be fired on close.
      });
      this.createSocket_()  // Initialize client TCP socket.
          .then(this.connect_)
          .then(this.attachHandlers_)
          .catch((e) => {
            console.error('Net.Client: ' + e.message);
          });
    }

    /**
     * Send |buffer| over this TCP connection.
     */
    public send = (buffer) => {
      if (State.CLOSED == this.state) {
        console.warn('Net.Client: attempted to send data to closed socket :(');
        return;
      }
      if (State.CONNECTED == this.state) {
        fSockets.write(this.socketId, buffer).done(this.onWrite_);
      } else {
        this.queue.push(buffer);
      }
    }

    public close = this.onClose_;

    /**
     * Wrapper which returns a promise for a created socket.
     */
    private createSocket_ = ():Promise<Sockets.CreateInfo> => {
      return new Promise((F, R) => {
        fSockets.create('tcp', {}).done(F).fail(R);
      }).then((createInfo:Sockets.CreateInfo) => {
        this.socketId = createInfo.socketId;
        if (!this.socketId) {
          return Promise.reject(new Error(
              'Failed to create socket. createInfo: ' + createInfo));
        }
      })
    }

    /**
     * Connect the socket. Assumes it was successfully created.
     */
    private connect_ = ():Promise<number> => {
      this.state = State.CONNECTING;
      return new Promise((F, R) => {
        fSockets.connect(this.socketId,
                         this.destination.host,
                         this.destination.port).done(F);
      });
    }

    /**
     * Once connected to socket, attach handlers and send any queued data.
     */
    private attachHandlers_ = (result:number) => {
      if (0 !== result) {
        return Promise.reject(new Error('connect error ' + result));
      }
      this.state = State.CONNECTED;
      // TODO: Update the onRead to socket-specific when that happens.
      fSockets.on('onData', this.readConnectionData_);
      if (0 < this.queue.length) {
        this.send(this.queue.shift());
      }
    }

    /**
     * Read data from one of the connection.
     * Assumes that the connection exists.
     */
    private readConnectionData_ = (readInfo:Sockets.ReadInfo) => {
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
      console.log('Bytes written: ' + writeInfo.bytesWritten);
      // TODO: change sockets to having an explicit failure rather than giving -1
      // in the bytesWritten field.
      if (0 >= writeInfo.bytesWritten) {
        this.onClose_();
        return;
      }
      // If there is more to write, send it again.
      // TODO: this callback recursion could cause a stack explosion...
      if (0 < this.queue.length) {
        this.send(this.queue.shift());
      }
    }

    /**
     * Close socket and fire external close handlers.
     */
    private onClose_ = () => {
      if (State.CLOSED == this.state) {
        return;
      }
      this.state = State.CLOSED;
      console.log('Net.Client: closing socket ' + this.socketId);
      if (this.socketId) {
        fSockets.disconnect(this.socketId);
        fSockets.destroy(this.socketId);
      }
      this.socketId = null;
      this.fulfillClose();
    }

    /**
     * Promise the future closing of this client.
     */
    public onceClosed = () => { return this.closePromise; }

  }  // Net.Client

}  // module Net
