/// <reference path='../../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../../third_party/freedom-typings/freedom-core-env.d.ts' />

import freedom_types = require('freedom.types');

var script = document.createElement('script');
script.src = 'freedom-for-chrome/freedom-for-chrome.js';
document.head.appendChild(script);

script.onload = () => {
  freedom('uproxy-lib/simple-socks/freedom-module.json', {
      'logger': 'lib/loggingprovider/loggingprovider.json',
      'debug': 'debug'
  }).then((simpleSocksFactory:freedom_types.FreedomModuleFactoryManager) => {
    // Keep a background timeout running continuously, to prevent chrome from
    // putting the app to sleep.
    function keepAlive() { setTimeout(keepAlive, 5000); }
    keepAlive();

    var simpleSocks :freedom_types.OnAndEmit<any,any> = simpleSocksFactory();
  }, (e:Error) => {
    console.error('could not load freedom: ' + e.message);
  });
}
