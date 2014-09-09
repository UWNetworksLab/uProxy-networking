/// <reference path='../../../socks-to-rtc/socks-to-rtc.ts' />
/// <reference path='../../../rtc-to-net/rtc-to-net.ts' />

/// <reference path='../../../webrtc/peerconnection.d.ts' />
/// <reference path='../../../freedom/coreproviders/uproxylogging.d.ts' />
/// <reference path='../../../freedom/typings/freedom.d.ts' />
/// <reference path='../../../networking-typings/communications.d.ts' />

var log :Freedom_UproxyLogging.Log = freedom['core.log']('socks-rtc-net');

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

var socksRtc:SocksToRtc.SocksToRtc;
var rtcNet:RtcToNet.RtcToNet;

freedom.on('start', () => {
  var localhostEndpoint:Net.Endpoint = { address: '127.0.0.1', port:9999 };
  socksRtc = new SocksToRtc.SocksToRtc(localhostEndpoint, socksRtcPcConfig);
  log.info('created socks-to-rtc');
  // Forward signalling channel messages to the UI.
  socksRtc.signalsForPeer.setSyncHandler((signal:WebRtc.SignallingMessage) => {
    freedom.emit('signalForPeer', signal);
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
freedom.on('handleSignalMessage', (signal:WebRtc.SignallingMessage) => {
  if (socksRtc !== undefined) {
    socksRtc.handleSignalFromPeer(signal);
  } else {
    if (rtcNet === undefined) {
      rtcNet = new RtcToNet.RtcToNet(rtcNetPcConfig, {allowNonUnicast:true});
      log.info('created rtc-to-net');
      // Forward signalling channel messages to the UI.
      rtcNet.signalsForPeer.setSyncHandler((signal:WebRtc.SignallingMessage) => {
        freedom.emit('signalForPeer', signal);
      });
      rtcNet.onceReady.then(() => {
        log.info('rtcNet ready.');
      });
    }
    rtcNet.handleSignalFromPeer(signal);
  }
});
