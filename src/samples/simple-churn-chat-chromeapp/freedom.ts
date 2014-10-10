/// <reference path='messages.d.ts' />
/// <reference path="../../churn/churn.d.ts" />
/// <reference path="../../webrtc/peerconnection.d.ts" />
/// <reference path="../../freedom/typings/freedom.d.ts" />
/// <reference path='../../freedom/coreproviders/uproxylogging.d.ts' />
/// <reference path="../../freedom/coreproviders/uproxypeerconnection.d.ts" />
/// <reference path='../../third_party/typings/webrtc/RTCPeerConnection.d.ts' />

// NOTE: This sample app is virtually identical to the 'freedomchat'
//       sample app in uproxy-lib. The only real difference is that
//       this uses churn.

import PcLib = freedom_UproxyPeerConnection;

var log :Freedom_UproxyLogging.Log = freedom['core.log']('top-level freedom module');

var config :WebRtc.PeerConnectionConfig = {
  webrtcPcConfig: {
    iceServers: [{url: 'stun:stun.l.google.com:19302'},
                 {url: 'stun:stun1.l.google.com:19302'}]
  },
  webrtcMediaConstraints: {
    optional: [{DtlsSrtpKeyAgreement: true}]
  }
};

var a :PcLib.Pc = freedom.churn(config);
var b :PcLib.Pc = freedom.churn(config);

// Connect the two signalling channels.
// Normally, these messages would be sent over the internet.
a.on('signalForPeer', (signal:Churn.ChurnSignallingMessage) => {
  log.info('signalling channel A message: ' + JSON.stringify(signal));
  b.handleSignalMessage(signal);
});
b.on('signalForPeer', (signal:Churn.ChurnSignallingMessage) => {
  log.info('signalling channel B message: ' + JSON.stringify(signal));
  a.handleSignalMessage(signal);
});

b.on('peerOpenedChannel', (channelLabel:string) => {
  log.info('i can see that `a` created a data channel called ' + channelLabel);
});

a.onceConnecting().then(() => { log.info('a is connecting...'); });
b.onceConnecting().then(() => { log.info('b is connecting...'); });

// Log the chosen endpoints.
function logEndpoints(name:string, endpoints:WebRtc.ConnectionAddresses) {
  log.info(name + ' connected: ' +
      endpoints.local.address + ':' + endpoints.local.port +
      ' (' + endpoints.localType + ') <-> ' +
      endpoints.remote.address + ':' + endpoints.remote.port +
      ' (' + endpoints.remoteType + ')');
}
a.onceConnected().then(logEndpoints.bind(null, 'a'));
b.onceConnected().then(logEndpoints.bind(null, 'b'));

// Negotiate a peerconnection.
// Once negotiated, enable the UI and add send/receive handlers.
a.negotiateConnection().then((endpoints:WebRtc.ConnectionAddresses) => {
  // Send messages over the datachannel, in response to events from the UI.
  var sendMessage = (pc:PcLib.Pc, message:Chat.Message) => {
    pc.send('text', { str: message.message }).catch((e) => {
      log.error('error sending message: ' + e.message);
    });
  };
  freedom.on('sendA', sendMessage.bind(null, a));
  freedom.on('sendB', sendMessage.bind(null, b));

  // Handle messages received on the datachannel(s).
  // The message is forwarded to the UI.
  var receiveMessage = (name:string, d:PcLib.LabelledDataChannelMessage) => {
    if (d.message.str === undefined) {
      log.error('only text messages are supported');
      return;
    }
    freedom.emit('receive' + name, {
      message: d.message.str
    });
  };
  a.on('dataFromPeer', receiveMessage.bind(null, 'A'));
  b.on('dataFromPeer', receiveMessage.bind(null, 'B'));

  a.openDataChannel('text').then(() => {
    log.info('datachannel open!');
    freedom.emit('ready', {});
  }, (e) => {
    log.error('could not setup datachannel: ' + e.message);
    freedom.emit('error', {});
  });
}, (e) => {
  log.error('could not negotiate peerconnection: ' + e.message);
});
