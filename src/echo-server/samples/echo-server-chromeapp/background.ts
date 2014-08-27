/// <reference path='../../freedom-module.d.ts' />

declare var freedom :freedom_TcpEchoServer.TcpEchoServer;

var script = document.createElement('script');
script.setAttribute('data-manifest', 'lib/echo-server/freedom-module.json');
script.textContent = '{ "debug": "log" }';
script.src = 'lib/freedom/freedom-for-chrome-for-uproxy.js';
document.head.appendChild(script);
script.onload = () => {
  freedom.emit('start', { address: '127.0.0.1', port: 9999 });
};
