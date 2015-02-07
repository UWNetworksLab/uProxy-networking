/// <reference path="../../tcp/tcp.d.ts" />
/// <reference path='../../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />

// Starts an echo server on a free port and verifies that the server
// is listening on that port. Tests:
//  - a free port is chosen when port zero is requested
//  - the server is listening on that port
//  - data can be sent and received on that socket
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

  server.listen().then((endpoint:net.Endpoint) => {
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

// Starts an echo server on a free port and makes two connections to that
// port before shutting down the server.
// Tests:
//  - client sockets receive connection events
//  - server and client sockets receive disconnected events
//  - onceShutdown fulfills
// TODO: verify server receives connection events
freedom().on('shutdown', () => {
  var server = new Tcp.Server({
    address: '127.0.0.1',
    port: 0
  });

  server.listen().then((endpoint:net.Endpoint) => {
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
