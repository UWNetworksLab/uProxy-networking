/// <reference path='../../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../../third_party/freedom-typings/freedom-core-env.d.ts' />

import freedom_types = require('freedom.types');

var script = document.createElement('script');
script.src = 'freedom-for-chrome/freedom-for-chrome.js';
document.head.appendChild(script);

// Keep a background timeout running continuously, to prevent chrome from
// putting the app to sleep.
function keepAlive() { setTimeout(keepAlive, 5000); }
keepAlive();

export var freedomModule :freedom_types.OnAndEmit<any,any> = null;

export var tcpPath = 'uproxy-networking/integration-tests/tcp/freedom-module.json';

export function runFreedomModule(modulePath:string) :void {
  freedom(modulePath, {
      'logger': 'uproxy-lib/loggingprovider/freedom-module.json',
      'debug': 'debug'
  }).then((freedomModuleFactory:freedom_types.FreedomModuleFactoryManager) => {
    freedomModule = freedomModuleFactory();
  }, (e:Error) => { throw e; });
}

console.info(
  'This is a sample app to run top level freedom modules. \n' +
  'This can be helpful to debug integration test failures, for example. + \n' +
  'Example usage: \n ' +
  '  browserified_exports.runFreedomModule(\'' + tcpPath + '\'); \n' +
  'Then, once loaded, you can bind the module with something like this: \n' +
  '  var m = browserified_exports.freedomModule; \n'
);
