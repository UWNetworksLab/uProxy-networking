/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../build/third_party/freedom-typings/freedom-module-env.d.ts' />

import peerconnection = require('../../build/dev/webrtc/peerconnection');

import rtc_to_net = require('../rtc-to-net/rtc-to-net');
import socks_to_rtc = require('../socks-to-rtc/socks-to-rtc');
import net = require('../net/net.types');

import logging = require('../../build/dev/logging/logging');
var log :logging.Log = new logging.Log('simple-socks');

/// <reference path='../logging/logging.d.ts' />

// Set each module to I, W, E, or D depending on which module
// you're debugging. Since the proxy outputs quite a lot of messages,
// show only warnings by default from the rest of the system.
// Note that the proxy is extremely slow in debug (D) mode.
freedom['loggingcontroller']().setConsoleFilter([
    '*:I',
    'SocksToRtc:I',
    'RtcToNet:I']);

//-----------------------------------------------------------------------------
var localhostEndpoint:net.Endpoint = { address: '127.0.0.1', port:9999 };

//-----------------------------------------------------------------------------
var pcConfig :freedom_RTCPeerConnection.RTCConfiguration = {
  iceServers: [{urls: ['stun:stun.l.google.com:19302']},
               {urls: ['stun:stun1.l.google.com:19302']}]
};
var rtcNet = new rtc_to_net.RtcToNet(
    pcConfig,
    {
      allowNonUnicast: true
    },
    false); // obfuscate

//-----------------------------------------------------------------------------
var socksRtc = new socks_to_rtc.SocksToRtc();
socksRtc.on('signalForPeer', rtcNet.handleSignalFromPeer);
socksRtc.start(
    localhostEndpoint,
    pcConfig,
    false) // obfuscate
  .then((endpoint:net.Endpoint) => {
    log.info('SocksToRtc listening on: ' + JSON.stringify(endpoint));
    log.info('curl -x socks5h://' + endpoint.address + ':' + endpoint.port +
        ' www.example.com')
  }, (e:Error) => {
    log.error('failed to start SocksToRtc: ' + e.message);
  });


//-----------------------------------------------------------------------------

var getterBytesReceived :number = 0;
var getterBytesSent :number = 0;
var giverBytesReceived :number = 0;
var giverBytesSent :number = 0;

rtcNet.signalsForPeer.setSyncHandler(socksRtc.handleSignalFromPeer);

socksRtc.on('bytesReceivedFromPeer', (numBytes:number) => {
  getterBytesReceived += numBytes;
  log.debug('Getter received ' + numBytes + ' bytes. (Total received: '
    + getterBytesReceived + ' bytes)');
});

socksRtc.on('bytesSentToPeer', (numBytes:number) => {
  getterBytesSent += numBytes;
  log.debug('Getter sent ' + numBytes + ' bytes. (Total sent: '
    + getterBytesSent + ' bytes)');
});

rtcNet.bytesReceivedFromPeer.setSyncHandler((numBytes:number) => {
  giverBytesReceived += numBytes;
  log.debug('Giver received ' + numBytes + ' bytes. (Total received: '
    + giverBytesReceived + ' bytes)');
});

rtcNet.bytesSentToPeer.setSyncHandler((numBytes:number) => {
  giverBytesSent += numBytes;
  log.debug('Giver sent ' + numBytes + ' bytes. (Total sent: '
    + giverBytesSent + ' bytes)');
});

rtcNet.onceReady
  .then(() => {
    log.info('RtcToNet ready');
  }, (e:Error) => {
    log.error('failed to start RtcToNet: ' + e.message);
  });
