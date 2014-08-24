/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../freedom/typings/tcp-socket.d.ts' />
/// <reference path='../handler/queue.d.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path="../third_party/typings/es6-promise/es6-promise.d.ts" />


declare module Tcp {
  class Server {
    constructor(endpoint        :Net.Endpoint,
                onConnection    :(c:Connection) => void,
                maxConnections  ?:number);

    public  endpoint        :Net.Endpoint;

    public connections :() => Connection[];
    public connectionsCount :() => number;  // equivalent to connections().length
    public closeAll :() => Promise<void>;  // calls close on all connections.

    // start accepting new connections; returns the actual endpoint it ends up
    // listening on (e.g. when port 0 is specifed, a dynamic port number is
    // chosen).
    public listen :() => Promise<Net.Endpoint>;
    // stop accepting new connections.
    public stopListening :() => Promise<void>;

    public shutdown :() => Promise<void>; // stop listening and then close-all

    // Mostly useful for debugging
    public toString :() => string;
  }

  // Code for how a Tcp Connection is closed.
  enum SocketCloseKind {
    WE_CLOSED_IT,
    REMOTELY_CLOSED,
    NEVER_CONNECTED,
    UNKOWN
  }

  /**
  * Tcp.Connection - Wraps up a single TCP connection to a client
  *
  * @param {number} socketId The ID of the server<->client socket.
  */
  class Connection {
    constructor(connectionKind :Connection.Kind);

    public onceConnected :Promise<Net.Endpoint>;
    public onceClosed :Promise<SocketCloseKind>;
    // `close` will cause onceClosed to be fulfilled.
    public close :() => Promise<SocketCloseKind>;

    // Send writes data to the tcp socket = dataToSocketQueue.handle
    public send :(msg: ArrayBuffer) => Promise<freedom_TcpSocket.WriteInfo>;
    // `receive` sets the handler for dataFromSocketQueue.
    public receive :() => Promise<ArrayBuffer>;
    // Handler function for dataToSocketQueue is set when onceConnected is
    // fulfilled, once that happens, any data on this queue is sent on the
    // underlying tcp-socket. TODO: test and check that TCP can handle
    // arrayviews: they can are better for sending data: saves array copies for
    // writing.
    public dataToSocketQueue :Handler.Queue<ArrayBuffer,
                                            freedom_TcpSocket.WriteInfo>;
    // Whenever data is receieved form the socket, this queue's handle function
    // is called, which will queue it if no handler has been set.
    public dataFromSocketQueue :Handler.Queue<ArrayBuffer, void>;

    public connectionId: string;
    public getState :() => Connection.State;
    public isClosed :() => boolean;
    public toString :() => string;
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
