const {Cu} = require("chrome");
var self = require("sdk/self");
var {setTimeout} = require("sdk/timers");

Cu.import(self.data.url("lib/freedom/freedom-for-firefox.jsm"));

var manifest = self.data.url("lib/simple-socks/freedom-module.json");
freedom(manifest, { 'debug': 'log' }).then(function(interface) {
  var simpleSocks = interface();
}, function() {
  console.error('could not load freedom');
});
