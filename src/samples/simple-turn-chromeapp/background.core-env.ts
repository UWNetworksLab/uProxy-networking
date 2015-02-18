/// <reference path='../../../build/third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../build/third_party/freedom-typings/freedom-core-env.d.ts' />

import freedom_types = require('freedom.types');

var script = document.createElement('script');
script.src = 'lib/freedom/freedom-for-chrome.js';
document.head.appendChild(script);

script.onload = () => {
  freedom('freedom-module.json', {
      'logger': 'lib/loggingprovider/loggingprovider.json',
      'debug': 'log'
  }).then(function(simpleTurnFactory:freedom_types.FreedomModuleFactoryManager) {
    var simpleTurn :freedom_types.OnAndEmit<any,any> = simpleTurnFactory();
  }, (e:Error) => {
    console.error('could not load freedom: ' + e.message);
  });
}
