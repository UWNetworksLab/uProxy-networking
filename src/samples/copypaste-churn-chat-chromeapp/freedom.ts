/// <reference path="../../churn/churn.d.ts" />
/// <reference path='../../logging/logging.d.ts' />
/// <reference path="../../freedom/typings/freedom.d.ts" />

var log :Logging.Log = new Logging.Log('top');

var pc = new Churn.Connection({
  webrtcPcConfig: {
    iceServers: [{urls: ['stun:stun.l.google.com:19302']},
                 {urls: ['stun:stun1.l.google.com:19302']}]
  }
});

// Forward signalling channel messages to the UI.
pc.signalForPeerQueue.setSyncHandler((signal:WebRtc.SignallingMessage) => {
  // FIXME: Does signalForPeer want a ChurnSignallingMessage?  How is the stage
  // value supposed to get filled in.
  freedom().emit('signalForPeer', signal);
});

// Receive signalling channel messages from the UI.
freedom().on('handleSignalMessage', (signal:Churn.ChurnSignallingMessage) => {
  pc.handleSignalMessage(signal);
});

pc.onceConnecting.then(() => { log.info('connecting...'); });


var connectDataChannel = (channel:WebRtc.DataChannel) => {
	// Send messages over the datachannel, in response to events from the UI,
	// and forward messages received on the datachannel to the UI.
	freedom().on('send', (message:string) => {
    channel.send({ str: message }).catch((e:Error) => {
			log.error('error sending message: ' + e.message);
		});
	});
	channel.dataFromPeerQueue.setSyncHandler((d:WebRtc.Data) => {
		if (d.str === undefined) {
			log.error('only text messages are supported');
			return;
		}
		freedom().emit('receive', d.str);
	});
};

// TODO: This is messy...would be great just to have both sides
//       call onceConnected but it doesn't seem to fire :-/
pc.peerOpenedChannelQueue.setSyncHandler((channel:WebRtc.DataChannel) => {
  log.info('peer opened datachannel!');
	connectDataChannel(channel);
  freedom().emit('ready', {});
});

// Negotiate a peerconnection.
freedom().on('start', () => {
  pc.negotiateConnection().then((endpoints:WebRtc.ConnectionAddresses) => {
      pc.openDataChannel('text').then((channel:WebRtc.DataChannel) => {
      log.info('datachannel open!');
		  connectDataChannel(channel);
      freedom().emit('ready', {});
    }, (e) => {
      log.error('could not setup datachannel: ' + e.message);
      freedom().emit('error', {});
    });
  }, (e) => {
    log.error('could not negotiate peerconnection: ' + e.message);
  });
});
