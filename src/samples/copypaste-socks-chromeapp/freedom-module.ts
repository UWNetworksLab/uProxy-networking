/// <reference path='../../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../build/third_party/freedom-typings/pgp.d.ts' />
/// <reference path='../../../build/third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../build/third_party/freedom-typings/freedom-module-env.d.ts' />

import arraybuffers = require('../../../build/dev/arraybuffers/arraybuffers');
import rtc_to_net = require('../../rtc-to-net/rtc-to-net');
import socks_to_rtc = require('../../socks-to-rtc/socks-to-rtc');
import net = require('../../net/net.types');
import peerconnection = require('../../../build/dev/webrtc/peerconnection');

import logging = require('../../../build/dev/logging/logging');

// Set each module to I, W, E, or D depending on which module
// you're debugging. Since the proxy outputs quite a lot of messages,
// show only warnings by default from the rest of the system.
// Note that the proxy is extremely slow in debug (D) mode.
freedom['loggingprovider']().setConsoleFilter([
    '*:I',
    'SocksToRtc:I',
    'RtcToNet:I']);

var log :logging.Log = new logging.Log('copypaste-socks');
var pgp :PgpProvider = freedom['pgp']();
var friendKey :string;
// TODO interactive setup w/real passphrase
pgp.setup('', 'uProxy user <noreply@uproxy.org>');
pgp.exportKey().then((publicKey:string) => {
  freedom().emit('publicKeyExport', publicKey);
});

var pcConfig :freedom_RTCPeerConnection.RTCConfiguration = {
  iceServers: [{urls: ['stun:stun.l.google.com:19302']},
               {urls: ['stun:stun1.l.google.com:19302']}]
};

// These two modules together comprise a SOCKS server:
//  - socks-to-rtc is the frontend, which speaks the SOCKS protocol
//  - rtc-to-net creates sockets on behalf of socks-to-rtc
//
// The two modules communicate via a peer-to-peer connection.
//
// If we receive the 'start' signal from the UI then we create a
// socks-to-rtc module and this app will run the SOCKS frontend.
// If we receive signalling channel messages without having received
// the 'start' signal then we create an rtc-to-net instance and
// will act as the SOCKS backend.
var socksRtc:socks_to_rtc.SocksToRtc;
var rtcNet:rtc_to_net.RtcToNet;

freedom().on('start', () => {
  var localhostEndpoint:net.Endpoint = { address: '127.0.0.1', port: 9999 };
  socksRtc = new socks_to_rtc.SocksToRtc();

  // Forward signalling channel messages to the UI.
  socksRtc.on('signalForPeer', (signal:any) => {
      freedom().emit('signalForPeer', signal);
  });

  // SocksToRtc adds the number of bytes it sends/receives to its respective
  // queue as it proxies. When new numbers (of bytes) are added to these queues,
  // emit the number to the UI (look for corresponding freedom.on in main.html).
  socksRtc.on('bytesReceivedFromPeer', (numBytes:number) => {
      freedom().emit('bytesReceived', numBytes);
  });

  socksRtc.on('bytesSentToPeer', (numBytes:number) => {
      freedom().emit('bytesSent', numBytes);
  });

  socksRtc.on('stopped', () => {
    freedom().emit('proxyingStopped');
  });

  socksRtc.start(
      localhostEndpoint,
      pcConfig,
      false) // obfuscate
    .then((endpoint:net.Endpoint) => {
      log.info('socksRtc ready. listening to SOCKS5 on: ' + JSON.stringify(endpoint));
      log.info('` curl -x socks5h://localhost:9999 www.google.com `')
      freedom().emit('proxyingStarted', endpoint);
    })
    .catch((e) => {
      console.error('socksRtc Error: ' + e + '; ' + this.socksRtc.toString());
    });
  log.info('created socks-to-rtc');
});

// Receive signalling channel messages from the UI.
// Messages are dispatched to either the socks-to-rtc or rtc-to-net
// modules depending on whether we're acting as the frontend or backend,
// respectively.
freedom().on('handleSignalMessage', (signal:peerconnection.SignallingMessage) => {
  if (socksRtc !== undefined) {
    socksRtc.handleSignalFromPeer(signal);
  } else {
    if (rtcNet === undefined) {
      rtcNet = new rtc_to_net.RtcToNet(
          pcConfig,
          {
            allowNonUnicast:true
          },
          false); // obfuscate
      log.info('created rtc-to-net');

      // Forward signalling channel messages to the UI.
      rtcNet.signalsForPeer.setSyncHandler((signal:peerconnection.SignallingMessage) => {
          freedom().emit('signalForPeer', signal);
      });

      // Similarly to with SocksToRtc, emit the number of bytes sent/received
      // in RtcToNet to the UI.
      rtcNet.bytesReceivedFromPeer.setSyncHandler((numBytes:number) => {
          freedom().emit('bytesReceived', numBytes);
      });

      rtcNet.bytesSentToPeer.setSyncHandler((numBytes:number) => {
          freedom().emit('bytesSent', numBytes);
      });

      rtcNet.onceReady.then(() => {
        log.info('rtcNet ready.');
        freedom().emit('proxyingStarted', null);
      });

      rtcNet.onceClosed.then(() => {
        freedom().emit('proxyingStopped');
      });
    }
    rtcNet.handleSignalFromPeer(signal);
  }
});

// Crypto request messages
freedom().on('friendKey', (newFriendKey:string) => {
  friendKey = newFriendKey;
});

freedom().on('signEncrypt', (message:string) => {
  pgp.signEncrypt(arraybuffers.stringToArrayBuffer(message), friendKey)
    .then((cipherdata:ArrayBuffer) => {
      return pgp.armor(cipherdata);
    })
    .then((ciphertext:string) => {
      freedom().emit('ciphertext', ciphertext);
    });
});

freedom().on('verifyDecrypt', (ciphertext:string) => {
  pgp.dearmor(ciphertext)
    .then((cipherdata:ArrayBuffer) => {
      return pgp.verifyDecrypt(cipherdata, friendKey);
    })
    .then((result:VerifyDecryptResult) => {
      freedom().emit('verifyDecryptResult', result);
    });
});

// Stops proxying.
freedom().on('stop', () => {
  if (socksRtc !== undefined) {
    socksRtc.stop();
  } else if (rtcNet !== undefined) {
    rtcNet.close();
  }
});
