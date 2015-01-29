/// <reference path='../../rtc-to-net/rtc-to-net.d.ts' />
/// <reference path='../../socks-to-rtc/socks-to-rtc.d.ts' />

/// <reference path='../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../freedom/typings/pgp.d.ts' />
/// <reference path='../../logging/logging.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../networking-typings/communications.d.ts' />
/// <reference path='../../webrtc/peerconnection.d.ts' />

// Set each module to I, W, E, or D depending on which module
// you're debugging. Since the proxy outputs quite a lot of messages,
// show only warnings by default from the rest of the system.
// Note that the proxy is extremely slow in debug (D) mode.
Logging.setConsoleFilter([
    '*:I',
    'SocksToRtc:I',
    'RtcToNet:I']);

var log :Logging.Log = new Logging.Log('copypaste-socks');
var pgp :PgpProvider = freedom.pgp();
var friendKey :string;
// TODO interactive setup w/real passphrase
pgp.setup('super passphrase', 'Joe <joe@test.com>');
pgp.exportKey().then((publicKey:string) => {
  freedom().emit('publicKeyExport', publicKey);
});

var rtcNetPcConfig :WebRtc.PeerConnectionConfig = {
  webrtcPcConfig: {
    iceServers: [{urls: ['stun:stun.l.google.com:19302']},
                 {urls: ['stun:stun1.l.google.com:19302']}]
  },
  peerName: 'rtcNet'
};

var socksRtcPcConfig :WebRtc.PeerConnectionConfig = {
  webrtcPcConfig: {
    iceServers: [{urls: ['stun:stun.l.google.com:19302']},
                 {urls: ['stun:stun1.l.google.com:19302']}]
  },
  peerName: 'socksRtc'
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
var socksRtc:SocksToRtc.SocksToRtc;
var rtcNet:RtcToNet.RtcToNet;

freedom().on('start', () => {
  var localhostEndpoint:Net.Endpoint = { address: '127.0.0.1', port: 9999 };
  socksRtc = new SocksToRtc.SocksToRtc();

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
      socksRtcPcConfig,
      false) // obfuscate
    .then((endpoint:Net.Endpoint) => {
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
freedom().on('handleSignalMessage', (signal:WebRtc.SignallingMessage) => {
  if (socksRtc !== undefined) {
    socksRtc.handleSignalFromPeer(signal);
  } else {
    if (rtcNet === undefined) {
      rtcNet = new RtcToNet.RtcToNet(
          rtcNetPcConfig,
          {
            allowNonUnicast:true
          },
          false); // obfuscate
      log.info('created rtc-to-net');

      // Forward signalling channel messages to the UI.
      rtcNet.signalsForPeer.setSyncHandler((signal:WebRtc.SignallingMessage) => {
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

// Helper function to convert strings to array buffers
function str2ab(str:string) :ArrayBuffer {
  // TODO: test more thoroughly w/unicode, standardize function across codebase
  var buf = new ArrayBuffer(str.length * 2);  // 2 bytes for each char
  var bufView = new Uint16Array(buf);
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

// Crypto request messages
freedom().on('friendKey', (newFriendKey:string) => {
  friendKey = newFriendKey;
});

freedom().on('signEncrypt', (message:string) => {
  pgp.signEncrypt(str2ab(message), friendKey)
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
