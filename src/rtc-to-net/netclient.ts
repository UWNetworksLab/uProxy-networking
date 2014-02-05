/*
  Wrapper which terminates relayed web requests through a native socket object.
*/

declare var freedom:any;

module Net {

  var FSockets = freedom['core.socket']();

  enum State {
    CREATING_SOCKET,  // 'CREATING_SOCKET',
    CONNECTING,       // 'CONNECTING',
    CONNECTED,        // 'CONNECTED',
    CLOSED            // 'CLOSED'
  }

  /*
    Net.Client
    // TODO: write a unit test using this and tcp-server.
  */
  export class Client {


    socketId:string = null;
    queue:any[] = [];
    private state:State = State.CLOSED;

    /*
      Constructing a Net.Client immediately begins a socket connection.
      onResponse: function (buffer) { ... }
      A function to handle the data from a packet that came from the destination.
      onClose: function() { ...}
      A function to handle closure of the socket.

      The destination host and port to connect to.
      destination: { host : "string", port : number }
    */
    constructor (
        public onResponse,
        public onClose,
        public destination) {
      this.state = State.CREATING_SOCKET;
      FSockets.create('tcp', {}).done(this.onCreate_);
    }

    public send = (buffer) => {
      if (this.state == State.CLOSED) {
        console.warn("Attempted to send data to a closed socket :(");
        return;
      }
      if (this.state == State.CONNECTED) {
        FSockets.write(this.socketId, buffer).done(this.onWrite_);
      } else {
        this.queue.push(buffer);
      }
    }


    public close = function() {
      this.onClose_();
    }

    // Connect to the socket once created.
    private onCreate_ = (createInfo) => {
      this.socketId = createInfo.socketId;
      if (!this.socketId) {
        console.error("Failed to create socket. createInfo", createInfo);
        return;
      }
      FSockets.connect(this.socketId,
                       this.destination.host,
                       this.destination.port)
        .done(this.onConnected_);
      this.state = State.CONNECTING;
    }

    // Attach handlers once connected to socket, and send queued up data.
    private onConnected_ = () => {
      this.state = State.CONNECTED;
      FSockets.on('onData', this.onRead_);
      if (0 < this.queue.length) {
        this.send(this.queue.shift());
      }
    }

    private onWrite_ = (writeInfo) => {
      // console.log("Bytes written: " + writeInfo.bytesWritten);
      // TODO: change sockets to having an explicit failure rather than giving -1
      // in the bytesWritten field.
      if (writeInfo.bytesWritten < 0) {
        this.onClose_();
        return;
      }
      // If there is more to write, write it.
      if (this.queue.length > 0) {
        this.send(this.queue.shift());
      }
    }

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

    private onClose_ = () => {
      // console.log("NetClient: closing socket " + this.socketId);
      this.state = State.CLOSED;
      if (this.socketId) {
        FSockets.destroy(this.socketId);
      }
      this.socketId = null;
      this.onClose();
    }

  }  // Net.Client

}  // module Net
