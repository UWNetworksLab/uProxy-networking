socks-rtc
=========

[![Build Status](https://travis-ci.org/uProxy/socks-rtc.svg?branch=master)](https://travis-ci.org/uProxy/socks-rtc)

Library which allows you to proxy SOCKS5 through WebRTC.

This is built on top of [freedom](https://github.com/UWNetworksLab/freedom).

At the moment this only supports chrome.

### Overview

There are two modules: _socks-to-rtc_ and _rtc-to-net_.

-_socks-to-rtc_ provides a local proxy (which the user could point their browser proxy settings to) which passes requests over a WebRTC peerconnection.
-_rtc-to-net_ acts as the 'remote' proxy which receives the requests from the _socks-to-rtc_ peer over WebRTC, passes the request to the destination webserver, and serves the response back to _socks-to-rtc_.

#### Requirements

- node + npm
- grunt `npm install -g grunt-cli`

#### Build

- Run `npm install` from the base directory to obtain all prerequisites.
- Running `grunt` compiles all the typescript into javascript which goes into the `build` directory.

#### Usage

To make use of this library, one needs to include `socks-to-rtc.json`
and `rtc-to-net.json` (the freedom manifests for the two freedom modules)
as dependencies in the parent application's freedom manifest. There will be
the compiled javascript in `build/socks-to-rtc/` and `/build/rtc-to-net/`.
Three things must occur for the two components to speak to each other:

- In the your 'parent freedom' create instances of the modules. (i.e. `var socksToRtc = freedom.SocksToRtc();` and `var rtcToNet = freedom.RtcToNet();`
- `rtcToNet.emit('start')` begins the remote peer server.
- `socksToRtc.emit('start', { host, port, peerId })` begins listening locally, and sends a signal to the remote if _rtc-to-net_'s peerId matches.

This establish a signalling channel between _rtc-to-net_ and _socks-to-rtc_ so that they may communicate. See the chrome app for an example.

### Run the Jasmine Tests

 - run Jasmine tests with `grunt test`

### End-to-End Test

#### Requirements

 - `chromedriver` must be in your path. You can download it from https://sites.google.com/a/chromium.org/chromedriver/downloads
 - `chrome` must be in a standard path location (see https://code.google.com/p/selenium/wiki/ChromeDriver#Requirements)

#### Automated

We have a Selenium test which starts Chrome with the proxy loaded and its proxy
settings pointing at the proxy. You will need to have the Selenium server
running locally (on localhost:4444). To do this:

 - download the "Standalone Server" from http://docs.seleniumhq.org/download/
 - run the Selenium server, e.g. `java -jar selenium-server-standalone-*.jar`
 - run the test with `grunt endtoend`

#### Manual

- Run `grunt build` to build the chrome app in the `build/chrome-app/` directory.
- Go to `chrome://extensions`, ensure developer mode is enabled, and load unpacked extension the `build/chrome-app` directory.
- Open the background page, which will start a socks-rtc proxy listening on `localhost:9999`.

At the moment, the way to test that this works is to just curl a webpage through the socks-rtc proxy. For example:

`curl -x socks5h://localhost:9999 www.google.com`

(the 'h' indicates that DNS requests are made through the proxy as well, and not resolved locally.)

There will be more tests soon!
