const {Cu} = require("chrome");
var self = require("sdk/self");
var {setTimeout} = require("sdk/timers");

Cu.import(self.data.url("lib/freedom/freedom-for-firefox.jsm"));

var manifest = self.data.url("lib/simple-socks/freedom-module.json");
var loggingProviderManifest = self.data.url("lib/loggingprovider/loggingprovider.json");
freedom(manifest, {
  'logger': loggingProviderManifest,
  'debug': 'debug'
}).then(function(interface) {
  var simpleSocks = interface();
}, function() {
  console.error('could not load freedom');
});
