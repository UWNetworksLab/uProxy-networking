/// <reference path="../freedom-typescript-api/interfaces/freedom.d.ts" />
/// <reference path="../freedom-typescript-api/interfaces/tcp-socket.d.ts" />
/// <reference path="../third_party/promise/promise.d.ts" />
/// <reference path="../handler/handler-queue.d.ts" />
/// <reference path="../interfaces/communications.d.ts" />
declare module Tcp {
  class Server {
    constructor(public  endpoint        :Net.Endpoint,
                private onConnection    :(c:Connection) => void,
                public  maxConnections  ?:number);

    public connections() : Connection[];
    public connectionsCount() : number;  // equivalent to connections().length
    public closeAll: () => Promise<void>;  // calls close on all connections.

    public listen: () => Promise<void>;  // start accepting new connections.
    public stopListening () => Promise<void>  // stop accepting new connections.

    public shutdown () => Promise<void> // stop listening and then close-all

    // Mostly useful for debugging
    public toString: () => string;
  }

  /**
  * Tcp.Connection - Wraps up a single TCP connection to a client
  *
  * @param {number} socketId The ID of the server<->client socket.
  */
  class Connection {
    constructor(connectionKind :Connection.Kind);

    public onceConnected :Promise<Net.Endpoint>;
    public onceClosed :Promise<void>;
    // `close` will cause onceClosed to be fulfilled.
    public close() : Promise<void>;

    // Send writes data to the tcp socket = dataToSocketQueue.handle
    public send(msg: ArrayBuffer) : Promise<freedom.TcpSocket.WriteInfo>;
    // `receive` sets the handler for dataFromSocketQueue.
    public receive() : Promise<ArrayBuffer>;
    // Handler function for dataToSocketQueue is set when onceConnected is
    // fulfilled, once that happens, any data on this queue is sent on the
    // underlying tcp-socket.
    public dataToSocketQueue :Handler.Queue<ArrayBuffer,
                                            freedom.TcpSocket.WriteInfo>;
    // Whenever data is receieved form the socket, this queue's handle function
    // is called, which will queue it if no handler has been set.
    public dataFromSocketQueue :Handler.Queue<ArrayBuffer, void>;

    public connectionId: string;
    public getState() : Connection.State;
    public isClosed() : boolean;
    public toString() : string;
  }

  module Connection {
    // An instance of Kind is assumed to have only one parameter, either
    // `existingSocketId` or `endpoint`
    interface Kind {
      // To connect use an existing socket, e.g. from a listen's callback to
      // onConnection function.
      existingSocketId  ?:number;
      // To connect to this endpoint on the net.
      endpoint          ?:Net.Endpoint;
    }
    enum State {
      ERROR, // Cannot change state.
      CONNECTING, // Can change to ERROR or CONNECTED.
      CONNECTED, // Can change to ERROR or CLOSED.
      CLOSED // Cannot change state.
    }
  }
}
