const {Cu} = require("chrome");
var self = require("sdk/self");
var {setTimeout} = require("sdk/timers");

Cu.import(self.data.url("freedom-for-firefox.jsm"));

var manifest = self.data.url("socks_rtc.json");
var freedom = setupFreedom(manifest, { debug: true });
