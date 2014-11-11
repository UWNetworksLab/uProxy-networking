const {Cu} = require("chrome");
var self = require("sdk/self");
var {setTimeout} = require("sdk/timers");

Cu.import(self.data.url("lib/freedom/freedom-for-firefox-for-uproxy.jsm"));

var manifest = self.data.url("lib/simple-socks/freedom-module.json");

var freedom = setupFreedom(manifest, { 'debug': 'log' });
