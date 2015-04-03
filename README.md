# uproxy-networking

[![Build Status](https://travis-ci.org/uProxy/uproxy-networking.svg?branch=master)](https://travis-ci.org/uProxy/uproxy-networking) [![devDependency Status](https://david-dm.org/uProxy/uproxy-networking/dev-status.svg)](https://david-dm.org/uProxy/uproxy-networking#info=devDependencies)
[![Build Status](https://api.shippable.com/projects/54c823bf5ab6cc135289fbd1/badge?branchName=dev)](https://app.shippable.com/projects/54c823bf5ab6cc135289fbd1/builds/latest)

## Overview

uProxy's networking library provides a "split SOCKS5 proxy" whose two halves communicate with one another via WebRTC data channels, optionally disguised as some other protocol.

There are two main components: `socks-to-rtc` and `rtc-to-net`.

 - `socks-to-rtc` provides a local proxy (which the user can point their browser or command-line tools at) which passes requests over a WebRTC peerconnection.
 - `rtc-to-net` acts as the "remote proxy" which receives the requests from the `socks-to-rtc` peer over WebRTC, passes the request to the destination webserver, and serves the response back to `socks-to-rtc`.

## Obfuscation

WebRTC data channels are secured with
[DTLS](http://en.wikipedia.org/wiki/Datagram_Transport_Layer_Security).

An observer of the network traffic passing between two connected hosts can
see that DTLS is in use; from this, they may infer that data channels are in
use. We wish to make it difficult for an observer to detect the use of uProxy.

The SOCKS server can use the `churn` module to obfuscate its network traffic.
`churn` configures WebRTC to pass its network traffic through a local network
port which transforms the data prior to sending it over the internet; a
port on the remote host is similarly configured to restoret the data to its
original form prior to delivering it to the remote WebRTC peer.

[utransformers](https://github.com/uProxy/uTransformers) is used to
transform and restore the data being sent over the network.

## Requirements

 - NPM, which may be installed as part of [Node.js](http://nodejs.org/).
 - [Grunt](http://gruntjs.com/) which may, once NPM has been installed, be installed with the command `npm install -g grunt-cli`

## Building

 - Run `npm install` from the base directory to obtain all required NPM packages.
 - Run `bower install` from the base directory to obtain all required Bower packages.
 - Running `grunt` compiles all the TypeScript into JavaScript in the `dist/` directory.
 - Run Jasmine tests with `grunt test`.

## Usage

A variety of sample apps are included.

To run Chrome apps:

 - open `chrome://extensions`, ensure developer mode is enabled, and load unpacked extension from the relevant directory inside `dist/samples/`, e.g. `dist/samples/simple-socks-chromeapp/`.

To run Firefox add-ons:

- download the [Add-on SDK](https://developer.mozilla.org/en-US/Add-ons/SDK/Tutorials/Installation), and run the extension with `cfx run` from the relevant directory inside `dist/samples/`, e.g. `dist/samples/echo-server-firefoxapp/`.

### echo server

`echo-server-chromeapp` starts a TCP echo server on port 9998.

Run `telnet 127.0.0.1 9998` and then type some stuff to verify that echo server echoes what you send it.

Press ctrl-D to have the echo server terminate the connection or press `ctrl-]` then type `quit` to exit telnet.

### simple SOCKS

`simple-socks` starts a SOCKS proxy on port 9999. `socks-to-rtc` and `rtc-to-net` both run in the same Chrome app, on the same machine, and communicate via direct function calls (no WebRTC datachannels).

To see debugging output, open the background page.

This command may be used to test the proxy:

```bash
curl -x socks5h://localhost:9999 www.example.com
```

(the `-h` indicates that DNS requests are made through the proxy too, i.e. not resolved locally)

You can also use an extension like [SwitchyProxySharp](https://chrome.google.com/webstore/detail/proxy-switchysharp/dpplabbmogkhghncfbfdeeokoefdjegm?hl=en) to set Chrome's proxy settings and then just browse stuff.

### copypaste SOCKS

`copypaste-socks-chromeapp/` starts a SOCKS proxy on port 9999. One peer runs `socks-to-rtc` and the other runs `rtc-to-net`. The two peers may run on separate machines which may be located on separate private networks. Communication takes place via WebRTC datachannels and the peer-to-peer connection is established by exchanging signalling messages over some medium, e.g. email or, if the peers are on the same machine, copy and paste.

### churn chat

These two samples, `simple-churn-chat-chromeapp` and
`copypaste-churn-chat-chromeapp`, demonstrate how the `churn` module may be
used to drive a two-way chat client.

They are roughly analagous to the `simple-` and `copypaste-` SOCKS

Wireshark may be used to verify that the traffic is obfuscated; the endpoints
in use - along with a lot of debugging information - may be determined by
examining the Javascript console.

### simple turn

Demonstrates the simplest possible use of the `turn-frontend` and
`turn-backend` modules.

`turn-frontend` is the module with which TURN clients directly interact:

```
                                                    +-------------+
                                                    |             |
                                                    |          ++ +------->
                    +-------------+                 |          ++ |
                    |             |                 |             |
TURN client +-----> | oo          | <-------------> |          ++ +------->
                    | oo          |      webrtc     |          ++ |
                    |             |                 |             |
                    +---+---------+                 |          ++ +------->
                    turn-frontend                   |          ++ |
                                                    |             |
                                                    +---+---------+
                                                    turn-backend

                      oo                              ++
                      oo server socket                ++ relay socket
```

The server may be used with standard TURN clients, e.g. the command-line
tools from the `rfc5766-turn-server` suite:

* Install the [rfc5766-turn-server](https://code.google.com/p/rfc5766-turn-server) client utilities (`apt-get install rfc5766-turn-server` on Debian-like systems)
* Open a terminal and execute `turnutils_peer`. This starts a UDP echo server on ports 3480 and 3481.
* Open another terminal and execute `turnutils_uclient -s -u test -w test -e 127.0.0.1 127.0.0.1 -p 9997`

You should see a flurry of activity in the Chrome debugging console. On the
command line, you will soon see a report. The output is not very user-friendly
but the important parts are `tot_send_msgs` and `tot_send_bytes`. With the TURN
server, echo server, and TURN client all running locally, you should not see
any dropped packets. For more options, e.g. to open more channels or send
larger datagrams, see the
[turnutils_uclient documentation](https://code.google.com/p/rfc5766-turn-server/wiki/turnutils_uclient).

## Benchmarking
 * Build everything: 'grunt'
 * Load 'build/socks-server/samples/simple-socks-chromeapp' in chrome (it's an app) and run it.
 * Do these once:
   * 'bin/make-data.sh' (probably works for linux only)
   * 'npm install -g wup'
 * Run wup in data/: '(cd data ; wup) &'
 * Then, run the benchmark with 'npm run benchmark'

## Android

### Prerequisites

 * the [ant](http://ant.apache.org/) build system.
 * the [android-sdk](http://developer.android.com/sdk/installing/index.html)
  * You will need `android` and `adb` on your PATH (add `sdk/tools` and `sdk/platform-tools` to your PATH environment variable)
   * You'll also need to [install the various SDK support libraries](https://developer.android.com/sdk/installing/adding-packages.html) which you can do with the `android sdk` command.
 * [Configure an emulated Android device](https://developer.android.com/training/basics/firstapp/running-app.html#Emulator) using the `android avd` command.
   * So far tested on Ubuntu 14.04LTS using an emulated Nexus 4 device running Android L
   * The device MUST be configured with an SD card and "Use Host GPU"

### Building

* `grunt cca` will build the project, create an Android APK, and install it onto the device. If no device is attached, the default Android emulator is used
* `adb forward tcp:19999 tcp:9999` will forward localhost:19999 to the emulator's port 9999.
  * This is the SOCKS5 proxy
* `adb forward tcp:19998 tcp:9998` will forward localhost:19998 to the emulator's port 9998.
  * `telnet localhost 19998` is now the echo server on the device
