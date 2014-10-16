# uproxy-networking

[![Build Status](https://travis-ci.org/uProxy/uproxy-networking.svg?branch=master)](https://travis-ci.org/uProxy/uproxy-networking) [![devDependency Status](https://david-dm.org/uProxy/uproxy-networking/dev-status.svg)](https://david-dm.org/uProxy/uproxy-networking#info=devDependencies)

## Overview

uProxy's networking library provides a "split SOCKS5 proxy" whose two halves communicate with one another via WebRTC data channels, optionally disguising the WebRTC network traffic as some other protocol.

There are two main components: `socks-to-rtc` and `rtc-to-net`.

 - `socks-to-rtc` provides a local proxy (which the user can point their browser or command-line tools at) which passes requests over a WebRTC peerconnection.
 - `rtc-to-net` acts as the "remote proxy" which receives the requests from the `socks-to-rtc` peer over WebRTC, passes the request to the destination webserver, and serves the response back to `socks-to-rtc`.

## Requirements

 - NPM, which may be installed as part of [Node.js](http://nodejs.org/).
 - [Grunt](http://gruntjs.com/) which may, once NPM has been installed, be installed with the command `npm install -g grunt-cli`

## Building for Chrome and Firefox

 - Run `npm install` from the base directory to obtain all prerequisites.
 - Running `grunt` compiles all the TypeScript into JavaScript in the `dist/` directory.

## Usage

This is built on top of [freedom](https://github.com/freedomjs/freedom). To make use of this library, one needs to include `socks-to-rtc.js` and `rtc-to-net.js` (the compiled javascript is built in `build/socks-to-rtc/` and `/build/rtc-to-net/`).

To see an example of using this for proxying, look at the `build/socks-server/samples/` directory which contains two sample apps:

1. `simple-socks` starts a SOCKS proxy on port 9999. `socks-to-rtc` and `rtc-to-net` both run in the same Chrome app, on the same machine, and communicate via direct function calls (no WebRTC datachannels).

2. `copypaste-socks-chromeapp/` starts a SOCKS proxy on port 9999. One peer runs `socks-to-rtc` and the other runs `rtc-to-net`. The two peers may run on separate machines which may be located on separate private networks. Communication takes place via WebRTC datachannels and the peer-to-peer connection is established by exchanging signalling messages over some medium, e.g. email or, if the peers are on the same machine, copy and paste.

 - For Chrome, go to `chrome://extensions`, ensure developer mode is enabled, and load unpacked extension from the `dist/samples/simple-socks-chromeapp/` directory.
 - For Firefox, activate cfx, and run the command `cfx run` from the `dist/samples/simple-socks-firefoxapp/` directory.
 - Run this command to test the proxy: `curl -x socks5h://localhost:9999 www.example.com` (the `h` indicates that DNS requests are made through the proxy too, i.e. not resolved locally)

To see debugging output, open the background page.

You can also use an extension like [SwitchyProxySharp](https://chrome.google.com/webstore/detail/proxy-switchysharp/dpplabbmogkhghncfbfdeeokoefdjegm?hl=en) to set Chrome's proxy settings and then just browse stuff.

## Run the Jasmine Tests

 - run Jasmine tests with `grunt test`

### End-to-end echo server test for Firefox

The `addon-sdk` is required for firefox. You can find it at https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Installation

 - Build using the `grunt` command.
 - `cd dist/samples/echo-server-firefoxapp/` and then run the command `cfx run`.
 - Run `telnet 127.0.0.1 9998` and type some stuff to verify that echo server echoes what you send it (press `Ctrl-]` then type `quit` to exit telnet).

## Benchmarking
 * Build everything: 'grunt'
 * Load 'build/socks-server/samples/simple-socks-chromeapp' in chrome (it's an app) and run it.
 * Do these once:
   * 'bin/make-data.sh' (probably works for linux only)
   * 'npm install -g wup'
 * Run wup in data/: '(cd data ; wup) &'
 * Then, run the benchmark with 'npm run benchmark'

## Android

### Prerequisites:

 * the [ant](http://ant.apache.org/) build system.
 * the [android-sdk](http://developer.android.com/sdk/installing/index.html)
  * You will need `android` and `adb` are on your PATH (add `sdk/tools` and `sdk/platform-tools` to your PATH environment variable)
   * You'll also need to [install the various SDK support libraries](https://developer.android.com/sdk/installing/adding-packages.html) which you can do with the `android sdk` command.
 * [Configure an emulated Android device](https://developer.android.com/training/basics/firstapp/running-app.html#Emulator) using the `android avd` command.
   * So far tested on Ubuntu 14.04LTS using an emulated Nexus 4 device running Android L
   * The device MUST be configured with an SD card and "Use Host GPU"

### Configure and build:

* `grunt cca` will build the project, create an Android APK, and install it onto the device. If no device is attached, the default Android emulator is used
* `adb forward tcp:19999 tcp:9999` will forward localhost:19999 to the emulator's port 9999.
  * This is the SOCKS5 proxy
* `adb forward tcp:19998 tcp:9998` will forward localhost:19998 to the emulator's port 9998.
  * `telnet localhost 19998` is now the echo server on the device
