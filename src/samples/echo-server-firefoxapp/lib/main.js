const {Cu} = require("chrome");
var self = require("sdk/self");
var {setTimeout} = require("sdk/timers");

Cu.import(self.data.url("lib/freedom/freedom-for-firefox.jsm"));

var manifest = self.data.url("lib/uproxy-networking/echo/freedom-module.json");
var loggingProviderManifest = self.data.url("lib/uproxy-lib/loggingprovider/loggingprovider.json");
freedom(manifest, {
  'logger': loggingProviderManifest,
  'debug': 'debug'
}).then(function(echoFactory) {
  var echo = echoFactory();
  echo.emit('start', { address: '127.0.0.1', port: 9998 });
}, function() {
  console.error('could not load freedom');
});
