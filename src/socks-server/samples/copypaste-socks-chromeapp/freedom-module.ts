/// <reference path='../../../rtc-to-net/rtc-to-net.d.ts' />
/// <reference path='../../../socks-to-rtc/socks-to-rtc.d.ts' />

/// <reference path='../../../freedom/coreproviders/uproxylogging.d.ts' />
/// <reference path='../../../freedom/typings/freedom.d.ts' />
/// <reference path='../../../networking-typings/communications.d.ts' />
/// <reference path='../../../webrtc/peerconnection.d.ts' />

var log :Freedom_UproxyLogging.Log = freedom['core.log']('copypaste-socks');

var rtcNetPcConfig :WebRtc.PeerConnectionConfig = {
  webrtcPcConfig: {
    iceServers: [{url: 'stun:stun.l.google.com:19302'},
                 {url: 'stun:stun1.l.google.com:19302'},
                 {url: 'stun:stun2.l.google.com:19302'},
                 {url: 'stun:stun3.l.google.com:19302'},
                 {url: 'stun:stun4.l.google.com:19302'}]
  },
  webrtcMediaConstraints: {
    optional: [{DtlsSrtpKeyAgreement: true}]
  },
  peerName: 'rtcNet'
};

var socksRtcPcConfig :WebRtc.PeerConnectionConfig = {
  webrtcPcConfig: {
    iceServers: [{url: 'stun:stun.l.google.com:19302'},
                 {url: 'stun:stun1.l.google.com:19302'},
                 {url: 'stun:stun2.l.google.com:19302'},
                 {url: 'stun:stun3.l.google.com:19302'},
                 {url: 'stun:stun4.l.google.com:19302'}]
  },
  webrtcMediaConstraints: {
    optional: [{DtlsSrtpKeyAgreement: true}]
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

freedom.on('start', () => {
  var localhostEndpoint:Net.Endpoint = { address: '127.0.0.1', port: 9999 };
  socksRtc = new SocksToRtc.SocksToRtc(
      localhostEndpoint,
      socksRtcPcConfig,
      false); // obfuscate
  log.info('created socks-to-rtc');

  // Forward signalling channel messages to the UI.
  socksRtc.signalsForPeer.setSyncHandler((signal:WebRtc.SignallingMessage) => {
    freedom.emit('signalForPeer', signal);
  });

  // SocksToRtc adds the number of bytes it sends/receives to its respective
  // queue as it proxies. When new numbers (of bytes) are added to these queues,
  // emit the number to the UI (look for corresponding freedom.on in main.html).
  socksRtc.bytesReceivedFromPeer.setSyncHandler((numBytes:number) => {
    freedom.emit('newBytesReceived', numBytes);
  });

  socksRtc.bytesSentToPeer.setSyncHandler((numBytes:number) => {
    freedom.emit('newBytesSent', numBytes);
  });

  socksRtc.onceReady
    .then((endpoint:Net.Endpoint) => {
      log.info('socksRtc ready. listening to SOCKS5 on: ' + JSON.stringify(endpoint));
      log.info('` curl -x socks5h://localhost:9999 www.google.com `')
    })
    .catch((e) => {
      console.error('socksRtc Error: ' + e + '; ' + this.socksRtc.toString());
    });
});

// Receive signalling channel messages from the UI.
// Messages are dispatched to either the socks-to-rtc or rtc-to-net
// modules depending on whether we're acting as the frontend or backend,
// respectively.
freedom.on('handleSignalMessage', (signal:WebRtc.SignallingMessage) => {
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
        freedom.emit('signalForPeer', signal);
      });

      // Similarly to with SocksToRtc, emit the number of bytes sent/received
      // in RtcToNet to the UI.
      rtcNet.bytesReceivedFromPeer.setSyncHandler((numBytes:number) => {
        freedom.emit('newBytesReceived', numBytes);
      });

      rtcNet.bytesSentToPeer.setSyncHandler((numBytes:number) => {
        freedom.emit('newBytesSent', numBytes);
      });

      rtcNet.onceReady.then(() => {
        log.info('rtcNet ready.');
      });
    }
    rtcNet.handleSignalFromPeer(signal);
  }
});
