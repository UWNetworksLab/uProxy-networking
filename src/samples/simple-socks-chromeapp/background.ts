/// <reference path='../../freedom/typings/freedom.d.ts' />

var script = document.createElement('script');
script.src = 'lib/freedom/freedom-for-chrome.js';
document.head.appendChild(script);

script.onload = () => {
  freedom('lib/simple-socks/freedom-module.json', { 'debug': 'log' }).then(function(interface:any) {
    var simpleSocks :any = interface();
  }, (e:Error) => {
    console.error('could not load freedom: ' + e.message);
  });
}
