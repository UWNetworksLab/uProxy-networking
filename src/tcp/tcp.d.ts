/// <reference path='../freedom/typings/tcp-socket.d.ts' />
/// <reference path='../handler/queue.d.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path="../third_party/typings/es6-promise/es6-promise.d.ts" />


declare module Tcp {
  class Server {
    constructor(endpoint        :Net.Endpoint,
                maxConnections  ?:number);

    // The max allowed number of connections. More than this many connections
    // will result in new connections being closed as soon as they connect.
    public maxConnections  :number;

    // The handler queue of connections made to this server. By default no
    // handler is set; the consumer of the server is expected to set one.
    public connectionsQueue :Handler.Queue<Connection, void>;

    // Gets all the current connections to this server.
    public currentConnections :() => Connection[];
    // Equivalent to connections().length
    public connectionsCount :() => number;

    // Start accepting new connections; returns the actual endpoint it ends up
    // listening on (e.g. when port 0 is specifed, a dynamic port number is
    // chosen). Returns the same promise as calling `onceListening`.
    public listen :() => Promise<Net.Endpoint>;
    // Getter for the once listening promise. Use to write prettier code.
    // Fulfills once the server has server has successfully bound to a port
    // and is accepting connections. Rejects if there is any error.
    public onceListening :() => Promise<Net.Endpoint>;
    // The |isListening| variable is true after |onceListening| and before
    // |onceShutdown|
    public isListening :() => boolean;
    // Stop accepting new connections.
    public stopListening :() => Promise<void>;

    // Calls close on all connections. Doesn't stop listening.
    public closeAll :() => Promise<void>;

    // Stops accepting new connection (like |stopListening|) and then closes
    // all connections (like |closeAll|).
    public shutdown :() => Promise<void>;
    // The |onceShutdown| promise can be fulfilled by either a call to
    // shutdown, or by something going wrong in the OS.
    public onceShutdown :() => Promise<void>
    // Synchronous access to is |onceShutdown| fulfilled.
    public isShutdown :() => boolean

    // Mostly useful for debugging
    public toString :() => string;
  }

  // Describes how a Tcp Connection got to the closed state.
  enum SocketCloseKind {
    WE_CLOSED_IT,
    REMOTELY_CLOSED,
    NEVER_CONNECTED,
    UNKOWN
  }

  interface ConnectionInfo {
    bound?: Net.Endpoint;
    remote?: Net.Endpoint;
  }

  // Wraps up a single TCP connection to a client
  class Connection {
    constructor(connectionKind :Connection.Kind);

    public onceConnected :Promise<ConnectionInfo>;
    public onceClosed :Promise<SocketCloseKind>;
    // The |close| method will cause onceClosed to be fulfilled.
    public close :() => Promise<SocketCloseKind>;

    // Send writes data to the tcp socket = dataToSocketQueue.handle
    public send :(msg: ArrayBuffer) => Promise<freedom_TcpSocket.WriteInfo>;
    // The |receiveNext| method sets the handler for dataFromSocketQueue.
    public receiveNext :() => Promise<ArrayBuffer>;
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

  // Private function, exported only for unit tests.
  function endpointOfSocketInfo(info:freedom_TcpSocket.SocketInfo)
      : ConnectionInfo;
}
