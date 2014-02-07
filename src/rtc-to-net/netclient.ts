/*
  Wrapper which terminates relayed web requests through a native socket object.
*/
/// <reference path='../chrome-fsocket.ts' />

declare var freedom:any;

module Net {

  var fSockets:ISockets = freedom['core.socket']();

  enum State {
    CREATING_SOCKET,  // 'CREATING_SOCKET',
    CONNECTING,       // 'CONNECTING',
    CONNECTED,        // 'CONNECTED',
    CLOSED            // 'CLOSED'
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

    socketId:string = null;
    queue:any[] = [];
    private state:State = State.CLOSED;

    /**
     * Constructing a Net.Client immediately begins a socket connection.
     * TODO: Replace external callbacks with promises.
     */
    constructor (
        // External callback for data coming back over this socket.
        private onResponse:(buffer:any)=>any,
        // External callback for closure of this socket.
        private onClose,
        // destination: { host : "string", port : number }
        private destination:Destination) {
      this.state = State.CREATING_SOCKET;
      fSockets.create('tcp', {}).done(this.onCreate_);
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

    public close = function() { this.onClose_(); }

    /**
     * Connect the socket once created.
     */
    private onCreate_ = (createInfo) => {
      this.socketId = createInfo.socketId;
      if (!this.socketId) {
        console.error('Failed to create socket. createInfo: ', createInfo);
        return;
      }
      fSockets.connect(this.socketId,
                       this.destination.host,
                       this.destination.port)
        .done(this.onConnected_);
      this.state = State.CONNECTING;
    }

    /**
     * Once connected to socket, attach handlers and send any queued data.
     */
    private onConnected_ = () => {
      this.state = State.CONNECTED;
      // TODO: Update the onRead to socket-specific when that happens.
      fSockets.on('onData', this.onRead_);
      if (0 < this.queue.length) {
        this.send(this.queue.shift());
      }
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
     * After reading, send socket data to external handler.
     */
    private onRead_ = (readInfo) => {
      if (readInfo.socketId !== this.socketId) {
        // TODO: currently our Freedom socket API sends all messages to every
        // listener. Most crappy. Fix so that we tell it to listen to a
        // particular socket.
        return;
      } else {
        this.onResponse(readInfo.data);
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
      this.onClose();  // Fire external callback;
    }

  }  // Net.Client

}  // module Net
