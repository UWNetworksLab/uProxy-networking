var script = document.createElement('script');
script.setAttribute('data-manifest', 'lib/echo-server/freedom.json');
//script.setAttribute('data-manifest', 'test/tcp_echo_server.json');
script.textContent = '{ "debug": false }';
script.src = 'lib/freedom/freedom-for-chrome-for-uproxy.js';
document.head.appendChild(script);
script.onload = function() {
  freedom.emit('start', { address: '127.0.0.1', port: 9999 });
};
