/// <reference path="../../churn/churn.d.ts" />
/// <reference path="../../webrtc/peerconnection.d.ts" />
/// <reference path='../../freedom/coreproviders/uproxylogging.d.ts' />
/// <reference path="../../freedom/coreproviders/uproxypeerconnection.d.ts" />
/// <reference path="../../freedom/typings/freedom.d.ts" />
/// <reference path='../../third_party/typings/webrtc/RTCPeerConnection.d.ts' />

var log :Freedom_UproxyLogging.Log = freedom['core.log']('top');

var pc = freedom.churn({
  webrtcPcConfig: {
    iceServers: [{url: 'stun:stun.l.google.com:19302'},
                 {url: 'stun:stun1.l.google.com:19302'}]
  },
  webrtcMediaConstraints: {
    optional: [{DtlsSrtpKeyAgreement: true}]
  }
});

// Forward signalling channel messages to the UI.
pc.on('signalForPeer', (signal:Churn.ChurnSignallingMessage) => {
  freedom.emit('signalForPeer', signal);
});

// Receive signalling channel messages from the UI.
freedom.on('handleSignalMessage', (signal:Churn.ChurnSignallingMessage) => {
  pc.handleSignalMessage(signal);
});

pc.onceConnecting().then(() => { log.info('connecting...'); });

// Send messages over the datachannel, in response to events from the UI,
// and forward messages received on the datachannel to the UI.
freedom.on('send', (message:string) => {
  pc.send('text', { str: message }).catch((e) => {
    log.error('error sending message: ' + e.message);
  });
});
pc.on('dataFromPeer', (d:freedom_UproxyPeerConnection.LabelledDataChannelMessage) => {
  if (d.message.str === undefined) {
    log.error('only text messages are supported');
    return;
  }
  freedom.emit('receive', d.message.str);
});

// TODO: This is messy...would be great just to have both sides
//       call onceConnected but it doesn't seem to fire :-/
pc.on('peerOpenedChannel', (channelLabel:string) => {
  log.info('peer opened datachannel!');
  freedom.emit('ready', {});
});

// Negotiate a peerconnection.
freedom.on('start', () => {
  pc.negotiateConnection().then((endpoints:WebRtc.ConnectionAddresses) => {
    pc.openDataChannel('text').then(() => {
      log.info('datachannel open!');
      freedom.emit('ready', {});
    }, (e) => {
      log.error('could not setup datachannel: ' + e.message);
      freedom.emit('error', {});
    });
  }, (e) => {
    log.error('could not negotiate peerconnection: ' + e.message);
  });
});
