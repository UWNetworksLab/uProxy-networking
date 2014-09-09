/// <reference path='../../../freedom/typings/freedom.d.ts' />
/// <reference path='../../../freedom/coreproviders/uproxylogging.d.ts' />

var log :Freedom_UproxyLogging.Log = freedom['core.log']('echo-server');

var tcpServer :TcpEchoServer;

// TODO: smarter encapsulation logic for echo server.
freedom.on('start', (endpoint:Net.Endpoint) => {
  if(tcpServer) { tcpServer.server.closeAll(); }
  tcpServer = new TcpEchoServer(endpoint);
});

freedom.on('stop', () => {
  if(tcpServer) { tcpServer.server.closeAll(); tcpServer = null; }
});

log.info('TcpEchoServer installed');
