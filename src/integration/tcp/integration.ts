/// <reference path="../../tcp/tcp.d.ts" />
/// <reference path='../../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />

// Starts an echo server on a free port and verifies that the server
// is listening on that port. Tests:
//  - a free port is chosen when port zero is requested
//  - server sockets receive connectionsQueue events
//  - client sockets receive onceConnected and dataFromSocketQueue events
//  - sockets supplied to connectionsQueue events can receive data
//  - client sockets can send data
freedom().on('listen', () => {
  var server = new Tcp.Server({
    address: '127.0.0.1',
    port: 0
  });

  server.connectionsQueue.setSyncHandler((tcpConnection:Tcp.Connection) => {
    tcpConnection.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
      tcpConnection.send(buffer);
    });
  });

  server.listen().then((endpoint:Net.Endpoint) => {
    var client = new Tcp.Connection({endpoint: endpoint});
    client.dataFromSocketQueue.setSyncNextHandler((buffer:ArrayBuffer) => {
      var s = ArrayBuffers.arrayBufferToString(buffer);
      if (s == 'ping') {
        freedom().emit('listen');
      }
    });
    client.onceConnected.then((info:Tcp.ConnectionInfo) => {
      client.send(ArrayBuffers.stringToArrayBuffer('ping'));
    });
  });
});

// Starts a server on a free port and makes a connection to that
// port before shutting down the server.
// Tests:
//  - server sockets receive connectionsQueue events
//  - client sockets receive onceConnected events
//  - client sockets receive onceClosed events on server shutdown
//  - sockets supplied to connectionsQueue receive onceClosed events
//    on server shutdown
//  - onceShutdown fulfills
freedom().on('shutdown', () => {
  var server = new Tcp.Server({
    address: '127.0.0.1',
    port: 0
  });

  server.listen().then((endpoint:Net.Endpoint) => {
    var client = new Tcp.Connection({endpoint: endpoint});
    server.connectionsQueue.setSyncHandler((connection:Tcp.Connection) => {
      client.onceConnected.then(() => {
        server.shutdown();
        return Promise.all<any>([connection.onceClosed, client.onceClosed,
            server.onceShutdown()]);
      })
      .then((values:any) => {
        freedom().emit('shutdown');
      });
    });
  });
});

// Starts a server on a free port and makes a connection to that
// port before closing that connection.
// Tests:
//  - server sockets receive connectionsQueue events
//  - client sockets receive onceConnected and onceClosed events
//  - sockets supplied to connectionsQueue receive onceClosed events
//  - the correct SocketCloseKind value is sent by onceClosed events
//    when the server closes the connection
freedom().on('onceclosedbyserver', () => {
  var server = new Tcp.Server({
    address: '127.0.0.1',
    port: 0
  });

  server.listen().then((endpoint:Net.Endpoint) => {
    var client = new Tcp.Connection({endpoint: endpoint});
    server.connectionsQueue.setSyncHandler((connection:Tcp.Connection) => {
      client.onceConnected.then(() => {
        connection.close();
        return Promise.all<any>([connection.onceClosed, client.onceClosed]);
      })
      .then((values:any) => {
        if (values[0] === Tcp.SocketCloseKind.WE_CLOSED_IT &&
            values[1] === Tcp.SocketCloseKind.REMOTELY_CLOSED) {
          freedom().emit('onceclosedbyserver');
        }
      });
    });
  });
});

// Starts a server on a free port and makes a connection to that
// port before closing that connection.
// Tests:
//  - server sockets receive connectionsQueue events
//  - client sockets receive onceConnected and onceClosed events
//  - sockets supplied to connectionsQueue receive onceClosed events
//  - the correct SocketCloseKind value is sent by onceClosed events
//    when the remote client closes the connection
freedom().on('onceclosedbyclient', () => {
  var server = new Tcp.Server({
    address: '127.0.0.1',
    port: 0
  });

  server.listen().then((endpoint:Net.Endpoint) => {
    var client = new Tcp.Connection({endpoint: endpoint});
    server.connectionsQueue.setSyncHandler((connection:Tcp.Connection) => {
      client.onceConnected.then(() => {
        client.close();
        return Promise.all<any>([connection.onceClosed, client.onceClosed]);
      })
      .then((values:any) => {
        if (values[0] === Tcp.SocketCloseKind.REMOTELY_CLOSED &&
            values[1] === Tcp.SocketCloseKind.WE_CLOSED_IT) {
          freedom().emit('onceclosedbyclient');
        }
      });
    });
  });
});

// Attempts to connect to an address which is not bound.
// Tests:
//  - client sockets' onceConnected fails when CONNECTION_REFUSED
//  - client sockets' onceClosed returns NEVER_CONNECTED when
//    CONNECTION_REFUSED
freedom().on('neverconnected', () => {
  var client = new Tcp.Connection({
    endpoint: {
      address: '127.0.0.1',
      port: 1023 // Reserved port.
    }
  });
  client.onceConnected.catch((e:Error) => {
    return client.onceClosed;
  }).then((kind:Tcp.SocketCloseKind) => {
    if (kind === Tcp.SocketCloseKind.NEVER_CONNECTED) {
      freedom().emit('neverconnected');
    }
  });
});

// Starts an echo server on a free port and verifies that five echo clients
// can send and receive data from the server.
freedom().on('multipleclients', () => {
  var server = new Tcp.Server({
    address: '127.0.0.1',
    port: 0
  });

  server.connectionsQueue.setSyncHandler((tcpConnection:Tcp.Connection) => {
    tcpConnection.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
      tcpConnection.send(buffer);
    });
  });

  server.listen().then((endpoint:Net.Endpoint) => {
    var addEchoClient = (i:number) : Promise<void> => {
      var fulfill :() => void;
      var client = new Tcp.Connection({endpoint: endpoint});
      client.dataFromSocketQueue.setSyncNextHandler((buffer:ArrayBuffer) => {
        var bytes = new Uint8Array(buffer);
        if (bytes.length == 1 && bytes[0] == i) {
          fulfill();
        }
      });
      client.onceConnected.then((info:Tcp.ConnectionInfo) => {
        var bytes = new Uint8Array([i]);
        client.send(bytes.buffer);
      });
      return new Promise<void>((F, R) => { fulfill = F; });
    };

    var promises :Promise<void>[] = [];
    for (var i = 0; i < 5; i++) {
      promises.push(addEchoClient(i));
    }
    Promise.all(promises).then((answers:any) => {
      freedom().emit('multipleclients');
    });
  });
});
