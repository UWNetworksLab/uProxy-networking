/// <reference path='tcp-echo-server.ts' />
/// <reference path='../logging/logging.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />

var log :Logging.Log = new Logging.Log('echo-server');

var tcpServer :TcpEchoServer;

// TODO: smarter encapsulation logic for echo server.
freedom().on('start', (endpoint:Net.Endpoint) => {
  if(tcpServer) { tcpServer.server.closeAll(); }
  tcpServer = new TcpEchoServer(endpoint);
});

freedom().on('stop', () => {
  if(tcpServer) { tcpServer.server.closeAll(); tcpServer = null; }
});
