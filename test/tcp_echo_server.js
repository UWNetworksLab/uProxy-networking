/*
  For testing just the TCP server portion (see src/client/tcp.ts)
*/
if (typeof window === "undefined") {
  var window = {};
}

TcpEchoServer = function(address, port) {
  console.log('Starting TcpEchoServer(' + address + ', ' + port + ')');
  this.server = new TCP.Server(address, port);
  this.address = address;
  this.port = port;

  this.server.listen().then(function(address, port) {
    console.log('Listening on ' + address + ':' + port);
  }.bind(this, address, port));

  this.server.on('connection', function(tcp_conn) {
    console.log('Connected on socket ' + tcp_conn.socketId);
    tcp_conn.on('recv', function(buffer) {
      console.log('Received buffer, echoing');
      tcp_conn.sendRaw(buffer, null);
    });
  }, {minByteLength: 1});
}
console.log('TcpEchoServer installed');

freedom.on('start', function() {
  window.tcpEchoServer = new TcpEchoServer('127.0.0.1', 9998);
});
