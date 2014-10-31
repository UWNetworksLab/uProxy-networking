/// <reference path='../../freedom/typings/freedom.d.ts' />

var script = document.createElement('script');
script.setAttribute('data-manifest', 'lib/echo/freedom-module.json');
script.textContent = '{ "debug": "warn" }';
script.src = 'lib/freedom/freedom-for-chrome-for-uproxy.js';
document.head.appendChild(script);
script.onload = () => {
  freedom.emit('start', { address: '127.0.0.1', port: 9998 });
};
