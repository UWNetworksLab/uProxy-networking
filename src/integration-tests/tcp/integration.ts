/// <reference path='../../../build/third_party/freedom-typings/freedom-module-env.d.ts' />

import arraybuffers = require('../../../build/dev/arraybuffers/arraybuffers');
import tcp = require('../../net/tcp');
import net = require('../../net/net.types');

freedom['loggingcontroller']().setConsoleFilter(['*:D']);

var getServerOnFreePort = () : Tcp.Server => {
  return new Tcp.Server({
    address: '127.0.0.1',
    port: 0
  });
}

// Starts an echo server on a free port and sends some data to the server,
// verifying that an echo is received.
freedom().on('listen', () => {
  var server = getServerOnFreePort();

  server.connectionsQueue.setSyncHandler((tcpConnection:tcp.Connection) => {
    tcpConnection.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
      tcpConnection.send(buffer);
    });
  });

  server.listen().then((endpoint:net.Endpoint) => {
    var client = new tcp.Connection({endpoint: endpoint});
    client.dataFromSocketQueue.setSyncNextHandler((buffer:ArrayBuffer) => {
      var s = arraybuffers.arrayBufferToString(buffer);
      if (s == 'ping') {
        freedom().emit('listen');
      }
    });
    client.onceConnected.then((info:tcp.ConnectionInfo) => {
      client.send(arraybuffers.stringToArrayBuffer('ping'));
    });
  });
});

// Starts a server on a free port and makes a connection to that
// port before shutting down the server, verifying that onceShutdown
// fulfills.
freedom().on('shutdown', () => {
  var server = getServerOnFreePort();

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
// port before closing that connection, verifying that each side
// of the socket receives the appropriate SocketCloseKind event.
freedom().on('onceclosedbyserver', () => {
  var server = getServerOnFreePort();

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
// port before closing that connection, verifying that each side
// of the socket receives the appropriate SocketCloseKind event.
freedom().on('onceclosedbyclient', () => {
  var server = getServerOnFreePort();

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
  var server = getServerOnFreePort();

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

// Starts an echo server on a free port and verifies that its connectionsCount
// is correct once five clients have connected to it.
freedom().on('connectionscount', () => {
  var server = getServerOnFreePort();

  server.listen().then((endpoint:Net.Endpoint) => {
    var clients :Tcp.Connection[] = [];
    for (var i = 0; i < 5; i++) {
      clients.push(new Tcp.Connection({endpoint: endpoint}));
    }

    Promise.all(clients.map((client:Tcp.Connection) => {
      return client.onceConnected;
    })).then((answers:any) => {
      if (server.connectionsCount() != clients.length) {
        throw new Error();
      }
    }).then(() => {
      freedom().emit('connectionscount');
    });
  });
});
