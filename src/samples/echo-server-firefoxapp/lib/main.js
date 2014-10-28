const {Cu} = require("chrome");
var self = require("sdk/self");
var {setTimeout} = require("sdk/timers");

Cu.import(self.data.url("lib/freedom/freedom-for-firefox-for-uproxy.jsm"));

var manifest = self.data.url("lib/echo/freedom-module.json");
console.log('manifest location: ' + manifest);
var freedom = setupFreedom(manifest, { 'debug': 'log' });

freedom.emit('start', { address: '127.0.0.1', port: 9998 });
