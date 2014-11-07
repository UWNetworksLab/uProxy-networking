/// <reference path='../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />

// Starts an echo server on a free port and verifies that the server
// sends back to clients whatever it receives. Tests that:
//  - a free port is chosen when port zero is requested
//  - data is received on the socket
//  - data can be sent on a socket
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
    client.send(ArrayBuffers.stringToArrayBuffer('ping'));

    client.dataFromSocketQueue.setSyncNextHandler((buffer:ArrayBuffer) => {
      var s = ArrayBuffers.arrayBufferToString(buffer);
      if (s == 'ping') {
        freedom().emit('listen');
      }
    });
  });
});

// Starts an echo server on a free port and makes two connections to that
// port before shutting down the server.
// Tests that:
//  - connections receive shutdown events
//  - onceShutdown fulfills
freedom().on('shutdown', () => {
  var server = new Tcp.Server({
    address: '127.0.0.1',
    port: 0
  });

  server.listen().then((endpoint:Net.Endpoint) => {
    var client1 = new Tcp.Connection({endpoint: endpoint});
    var client2 = new Tcp.Connection({endpoint: endpoint});
    Promise.all([client1.onceConnected, client2.onceConnected])
      .then(server.shutdown)
      .then(() => {
        return Promise.all<any>([
            server.onceShutdown(),
            client1.onceClosed,
            client2.onceClosed]);
      })
      .then((values:any) => {
        freedom().emit('shutdown');
      });
  });
});
