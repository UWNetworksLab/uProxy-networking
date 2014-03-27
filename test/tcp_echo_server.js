/*
  For testing just the TCP server portion (see src/client/tcp.ts)
*/

TcpEchoServer = function(address, port) {
  console.log('TcpEchoServer(' + address + ', ' + port + ')');
  this.server = new TCP.Server(address, port);
  this.address = address;
  this.port = port;

  this.server.listen().then(function(address, port) {
    console.log('Listening on ' + address + ':' + port);
  }.bind(this, address, port));

  this.server.on('connection', function(tcp_conn) {
    console.log('Connected on socket ' + tcp_conn.socketId);
    tcp_conn.on('recv', function(buffer) {
      tcp_conn.sendRaw(buffer, null);
    });
  }, {minByteLength: 1});
}

console.log('TcpEchoServer installed');