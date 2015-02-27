/// <reference path='../../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../../third_party/freedom-typings/freedom-core-env.d.ts' />

var script = document.createElement('script');
script.src = 'freedom-for-chrome.js';
document.head.appendChild(script);

script.onload = () => {
  freedom('uproxy-networking/echo/freedom-module.json', {
      'logger': 'uproxy-lib/loggingprovider/freedom-module.json',
      'debug': 'log'
  }).then(function(interface:any) {
    var echo :any = interface();
    echo.emit('start', { address: '127.0.0.1', port: 9998 });
  }, (e:Error) => {
    console.error('could not load freedom: ' + e.message);
  });
}
