/// <reference path='../../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import arraybuffers = require('../../../../third_party/uproxy-lib/arraybuffers/arraybuffers');
import tcp = require('../../net/tcp');
import net = require('../../net/net.types');

export var loggingController = freedom['loggingcontroller']();
loggingController.setConsoleFilter(['*:D']);

import logging = require('../../../../third_party/uproxy-lib/logging/logging');
export var moduleName = 'integration-tests/tcp';
export var log :logging.Log = new logging.Log(moduleName);


var getServerOnFreePort = () : tcp.Server => {
  return new tcp.Server({
    address: '127.0.0.1',
    port: 0
  });
}

export var parentModule = freedom();

// Starts an echo server on a free port and sends some data to the server,
// verifying that an echo is received.
parentModule.on('listen', () => {
  var server = getServerOnFreePort();
  server.connectionsQueue.setSyncHandler((tcpConnection:tcp.Connection) => {
    log.info('New TCP connection: ' + tcpConnection.toString());
    tcpConnection.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
      tcpConnection.send(buffer);
    });
  });

  server.listen().then((endpoint:net.Endpoint) => {
    var client = new tcp.Connection({endpoint: endpoint});
    client.dataFromSocketQueue.setSyncNextHandler((buffer:ArrayBuffer) => {
      var s = arraybuffers.arrayBufferToString(buffer);
      if (s == 'ping') {
        parentModule.emit('listen');
      }
    });
    client.onceConnected.then((info:tcp.ConnectionInfo) => {
      client.send(arraybuffers.stringToArrayBuffer('ping'));
    });
  });
});

parentModule.on('floodtwoclient', (data) => {
  var firstport = 1224;
  var secondport = 1225;
  var last_out = performance.now();
  var first_total = 0.0;
  var second_total = 0.0;
  var first_start = 0;
  var second_start = 0;
  var first_end = 0;
  var second_end = 0;
  if (data) {
    if (data["firstport"]) {
      firstport = data.firstport;
    }
    if (data["secondport"]) {
      secondport = data.secondport;
    }
  }
  var firstclient = new tcp.Connection({endpoint:{address:"localhost", port:firstport}});
  var secondclient = new tcp.Connection({endpoint:{address:"localhost", port:secondport}});
  log.info("Starting flood client to localhost:[" + firstport + "," + secondport + "]");
  var fun = () => {
    if (first_end == 0 && second_end == 0) {
      var fstats = firstclient.dataFromSocketQueue.getStats();
      var sstats = secondclient.dataFromSocketQueue.getStats();
      var now = performance.now();
      var frate = (first_total / (now - first_start)) / 1000.0;
      var srate = (second_total / (now - second_start)) / 1000.0;
      log.info("{\"now\": " + now + ", \"nr\": 1, \"rate\": " + frate + ", " +
               "\"queued_events\": " + fstats.queued_events + ", " +
               "\"handled_events\": " + fstats.handled_events + ", " +
               "\"following_queued_events\": " + fstats.following_queued_events + ", " +
               "\"num_handlers_set\": " + fstats.num_handlers_set + ", " +
               "\"dropped_events\": " + fstats.dropped_events  +
               "}, {\"now\": " + now + ", \"nr\": 2, \"rate\": " + srate + ", " +
               "\"queued_events\": " + sstats.queued_events + ", " +
               "\"handled_events\": " + sstats.handled_events + ", " +
               "\"following_queued_events\": " + sstats.following_queued_events + ", " +
               "\"num_handlers_set\": " + sstats.num_handlers_set + ", " +
               "\"dropped_events\": " + sstats.dropped_events + "}");
      setTimeout(fun, 1000);
    }
  };
  setTimeout(fun, 1000);
  firstclient.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
    var bytes = new Uint8Array(buffer);
    first_total += bytes.length;
  });
  firstclient.onceConnected.then((info:tcp.ConnectionInfo) => {
    first_start = performance.now();
  });
  firstclient.onceClosed.then((info:tcp.ConnectionInfo) => {
    first_end = performance.now();
  });
  secondclient.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
    var bytes = new Uint8Array(buffer);
    second_total += bytes.length;
  });
  secondclient.onceConnected.then((info:tcp.ConnectionInfo) => {
    second_start = performance.now();
  });
  secondclient.onceClosed.then((info:tcp.ConnectionInfo) => {
    second_end = performance.now();
  });
});

parentModule.on('floodclient', (port) => {
  if (!port) {
    port = 1224;
  }
  var client = new tcp.Connection({endpoint:{address:"localhost", port:port}});
  log.info("Starting flood client to localhost:1224");
  var fun = () => {
    var stats = client.dataFromSocketQueue.getStats();
    var now = performance.now();
    log.info("now: " + now + ", " +
             "tcp_queued_events: " + stats.queued_events + ", " +
             "tcp_handled_events: " + stats.handled_events + ", " +
             "tcp_following_queued_events: " + stats.following_queued_events + ", " +
             "tcp_num_handlers_set: " + stats.num_handlers_set + ", " +
             "tcp.dropped_events: " + stats.dropped_events);
    setTimeout(1000, fun);
  };
  setTimeout(1000, fun);
  var last_out = performance.now();
  client.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
    var bytes = new Uint8Array(buffer);
    var stats = client.dataFromSocketQueue.getStats();
    var now = performance.now();
    if (now - last_out >= 1000.0) {
      last_out = now;
      log.info("now: " + now + ", data_len: " + bytes.length + ", " +
               "tcp_queued_events: " + stats.queued_events + ", " +
               "tcp_handled_events: " + stats.handled_events + ", " +
               "tcp_following_queued_events: " + stats.following_queued_events + ", " +
               "tcp_num_handlers_set: " + stats.num_handlers_set + ", " +
               "tcp.dropped_events: " + stats.dropped_events);
    }
    buffer = null;
    bytes = null;
    stats = null;
  });
  client.onceConnected.then((info:tcp.ConnectionInfo) => {
    log.info("Connected.");
  });
});

// Starts a server on a free port and makes a connection to that
// port before shutting down the server, verifying that onceShutdown
// fulfills.
parentModule.on('shutdown', () => {
  var server = getServerOnFreePort();

  server.listen().then((endpoint:net.Endpoint) => {
    var client = new tcp.Connection({endpoint: endpoint});
    server.connectionsQueue.setSyncHandler((connection:tcp.Connection) => {
      client.onceConnected.then(() => {
        server.shutdown();
        return Promise.all<any>([connection.onceClosed, client.onceClosed,
            server.onceShutdown()]);
      })
      .then((values:any) => {
        parentModule.emit('shutdown');
      });
    });
  });
});

// Starts a server on a free port and makes a connection to that
// port before closing that connection, verifying that each side
// of the socket receives the appropriate SocketCloseKind event.
parentModule.on('onceclosedbyserver', () => {
  var server = getServerOnFreePort();

  server.listen().then((endpoint:net.Endpoint) => {
    var client = new tcp.Connection({endpoint: endpoint});
    server.connectionsQueue.setSyncHandler((connection:tcp.Connection) => {
      client.onceConnected.then(() => {
        connection.close();
        return Promise.all<any>([connection.onceClosed, client.onceClosed]);
      })
      .then((values:any) => {
        if (values[0] === tcp.SocketCloseKind.WE_CLOSED_IT &&
            values[1] === tcp.SocketCloseKind.REMOTELY_CLOSED) {
          parentModule.emit('onceclosedbyserver');
        }
      });
    });
  });
});

// Starts a server on a free port and makes a connection to that
// port before closing that connection, verifying that each side
// of the socket receives the appropriate SocketCloseKind event.
parentModule.on('onceclosedbyclient', () => {
  var server = getServerOnFreePort();

  server.listen().then((endpoint:net.Endpoint) => {
    var client = new tcp.Connection({endpoint: endpoint});
    server.connectionsQueue.setSyncHandler((connection:tcp.Connection) => {
      client.onceConnected.then(() => {
        client.close();
        return Promise.all<any>([connection.onceClosed, client.onceClosed]);
      })
      .then((values:any) => {
        if (values[0] === tcp.SocketCloseKind.REMOTELY_CLOSED &&
            values[1] === tcp.SocketCloseKind.WE_CLOSED_IT) {
          parentModule.emit('onceclosedbyclient');
        }
      });
    });
  });
});

// Attempts to connect to an address which is not bound.
parentModule.on('neverconnected', () => {
  var client = new tcp.Connection({
    endpoint: {
      address: '127.0.0.1',
      port: 1023 // Reserved port.
    }
  });
  client.onceConnected.catch((e:Error) => {
    return client.onceClosed;
  }).then((kind:tcp.SocketCloseKind) => {
    if (kind === tcp.SocketCloseKind.NEVER_CONNECTED) {
      parentModule.emit('neverconnected');
    }
  });
});

// Starts an echo server on a free port and verifies that five echo clients
// can send and receive data from the server.
parentModule.on('multipleclients', () => {
  var server = getServerOnFreePort();

  server.connectionsQueue.setSyncHandler((tcpConnection:tcp.Connection) => {
    tcpConnection.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
      tcpConnection.send(buffer);
    });
  });

  server.listen().then((endpoint:net.Endpoint) => {
    var addEchoClient = (i:number) : Promise<void> => {
      var fulfill :() => void;
      var client = new tcp.Connection({endpoint: endpoint});
      client.dataFromSocketQueue.setSyncNextHandler((buffer:ArrayBuffer) => {
        var bytes = new Uint8Array(buffer);
        if (bytes.length == 1 && bytes[0] == i) {
          fulfill();
        }
      });
      client.onceConnected.then((info:tcp.ConnectionInfo) => {
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
      parentModule.emit('multipleclients');
    });
  });
});

// Starts an echo server on a free port and verifies that its connectionsCount
// is correct once five clients have connected to it.
parentModule.on('connectionscount', () => {
  var server = getServerOnFreePort();

  server.listen().then((endpoint:net.Endpoint) => {
    var clients :tcp.Connection[] = [];
    for (var i = 0; i < 5; i++) {
      clients.push(new tcp.Connection({endpoint: endpoint}));
    }

    Promise.all(clients.map((client:tcp.Connection) => {
      return client.onceConnected;
    })).then((answers:any) => {
      if (server.connectionsCount() != clients.length) {
        throw new Error();
      }
    }).then(() => {
      parentModule.emit('connectionscount');
    });
  });
});
