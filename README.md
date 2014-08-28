# uproxy-networking

[![Build Status](https://travis-ci.org/uProxy/uproxy-networking.svg?branch=master)](https://travis-ci.org/uProxy/uproxy-networking) [![devDependency Status](https://david-dm.org/uProxy/uproxy-networking/dev-status.svg)](https://david-dm.org/uProxy/uproxy-networking#info=devDependencies)

uProxy's networking library provides a localhost SOCKS5 proxy that sends traffic over WebRTC to the peer, or recieves traffic from a peer over WebRTC and sends it to the destination website.

## Overview

There are two main freedom modules: _socks-to-rtc_ and _rtc-to-net_.

 - _socks-to-rtc_ provides a local proxy (which the user could point their browser proxy settings to) which passes requests over a WebRTC peerconnection.
 - _rtc-to-net_ acts as the 'remote' proxy which receives the requests from the _socks-to-rtc_ peer over WebRTC, passes the request to the destination webserver, and serves the response back to _socks-to-rtc_.

## Requirements

 - [node](http://nodejs.org/) (and [npm](https://www.npmjs.org/), which is installed when you install node)
 - [Grunt](http://gruntjs.com/), which you can install with: `npm install -g grunt-cli`

## Build

 - Run `npm install` from the base directory to obtain all prerequisites.
 - Running `grunt` compiles all the typescript into javascript which goes into the `build` directory.

## Usage

This is built on top of [freedom](https://github.com/freedomjs/freedom). To make use of this library, one needs to include `socks-to-rtc.js` and `rtc-to-net.js` (the compiled javascript is built in `build/socks-to-rtc/` and `/build/rtc-to-net/`).

To see an example of using this for proxying, look at the `build/socks-rtc-net/samples/socks-rtc-net-freedom-chromeapp/` which contains a Chrome app. The chrome app when started will run a socks proxy on localhost, and requests will over two peerconnections (in this case both in the same chrome app admitedly), and then to the net.

## Run the Jasmine Tests

 - run Jasmine tests with `grunt test`

## End-to-End Test with Chrome

### Requirements

 - `chromedriver` must be in your path. You can download it from https://sites.google.com/a/chromium.org/chromedriver/downloads
 - `chrome` must be in a standard path location (see https://code.google.com/p/selenium/wiki/ChromeDriver#Requirements)

### Manual

 - Run `grunt` to build the chrome app in the `build/socks-rtc-net/samples/socks-rtc-net-freedom-chromeapp/` directory.
 - For Chrome, go to `chrome://extensions`, ensure developer mode is enabled, and load unpacked extension from the `build/socks-rtc-net/samples/socks-rtc-net-freedom-chromeapp/` directory.
 - Open the background page, which will start a socks-rtc proxy listening on `localhost:9999`.
 - For Firefox, activate cfx, and run the command `cfx run` from the `build/socks-rtc-net/samples/socks-rtc-net-freedom-firefoxapp/` directory.

At the moment, the way to test that this works is to just curl a webpage through the socks-rtc proxy. For example:

`curl -x socks5h://localhost:9999 www.google.com`

(the 'h' indicates that DNS requests are made through the proxy as well, and not resolved locally.)

You can also use an extension like [SwitchyProxySharp](https://chrome.google.com/webstore/detail/proxy-switchysharp/dpplabbmogkhghncfbfdeeokoefdjegm?hl=en) to set Chrome's proxy settings and then just browse stuff.

## End-to-End Echo-server Test with Firefox

The `addon-sdk` is required for firefox. You can find it at https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Installation

 - Build using the `grunt` command.
 - `cd build/socks-rtc-net/samples/socks-rtc-net-freedom-chromeapp/` and then run the command `cfx run` which should startup firefox with the Firefox echo-server app running.
 - Use `telnet 127.0.0.1 9998` to verify that echo server echo's what you send it. (type some stuff and see the same stuff repeated back to you). `Ctrl-]` then type `quit` exit telnet.

## Building for Android

Prerequisites:
 * the [ant](http://ant.apache.org/) build system.
 * the [android-sdk](http://developer.android.com/sdk/installing/index.html)
  * You will need `android` and `adb` are on your PATH (add `sdk/tools` and `sdk/platform-tools` to your PATH environment variable)
   * You'll also need to [install the various SDK support libraries](https://developer.android.com/sdk/installing/adding-packages.html) which you can do with the `android sdk` command.
 * [Configure an emulated Android device](https://developer.android.com/training/basics/firstapp/running-app.html#Emulator) using the `android avd` command.
   * So far tested on Ubuntu 14.04LTS using an emulated Nexus 4 device running Android L
   * The device MUST be configured with an SD card and "Use Host GPU"

Congiure and build:
* `grunt cca` will build the project, create an Android APK, and install it onto the device. If no device is attached, the default Android emulator is used
* `adb forward tcp:19999 tcp:9999` will forward localhost:19999 to the emulator's port 9999.
  * This is the SOCKS5 proxy
* `adb forward tcp:19998 tcp:9998` will forward localhost:19998 to the emulator's port 9998.
  * `telnet localhost 19998` is now the echo server on the device
