/// <reference path='../../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../build/third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../build/third_party/freedom-typings/freedom-module-env.d.ts' />
/// <reference path='../../../build/third_party/freedom-typings/rtcpeerconnection.d.ts' />

import peerconnection = require('../../../build/dev/webrtc/peerconnection');
import churn = require('../../churn/churn');
import churn_types = require('../../churn/churn.types');
import ChurnSignallingMessage = churn_types.ChurnSignallingMessage;

import logging = require('../../../build/dev/logging/logging');

freedom['loggingprovider']().setConsoleFilter(['*:D']);

var log :logging.Log = new logging.Log('simple churn chat');

var config :freedom_RTCPeerConnection.RTCConfiguration = {
  iceServers: [{urls: ['stun:stun.l.google.com:19302']},
               {urls: ['stun:stun1.l.google.com:19302']}]
};

var pcA = freedom['core.rtcpeerconnection'](config);
var a :churn.Connection = new churn.Connection(pcA);
var pcB = freedom['core.rtcpeerconnection'](config);
var b :churn.Connection = new churn.Connection(pcB);

// Connect the two signalling channels.
// Normally, these messages would be sent over the internet.
a.signalForPeerQueue.setSyncHandler((signal:ChurnSignallingMessage) => {
  log.info('signalling channel A message: ' + JSON.stringify(signal));
  b.handleSignalMessage(signal);
});
b.signalForPeerQueue.setSyncHandler((signal:ChurnSignallingMessage) => {
  log.info('signalling channel B message: ' + JSON.stringify(signal));
  a.handleSignalMessage(signal);
});

// Send messages over the datachannel, in response to events from the UI.
var sendMessage = (channel:peerconnection.DataChannel, message:string) => {
  channel.send({ str: message }).catch((e:Error) => {
    log.error('error sending message: ' + e.message);
  });
};

// Handle messages received on the datachannel(s).
// The message is forwarded to the UI.
var receiveMessage = (name:string, d:peerconnection.Data) => {
    if (d.str === undefined) {
		log.error('only text messages are supported');
		return;
    }
    freedom().emit('receive' + name, d.str);
};

b.peerOpenedChannelQueue.setSyncHandler((channel:peerconnection.DataChannel) => {
	log.info('i can see that `a` created a data channel called ' + channel.getLabel());
	freedom().on('sendB', sendMessage.bind(null, channel));
	channel.dataFromPeerQueue.setHandler(receiveMessage.bind(null, 'B'));
});

a.onceConnecting.then(() => { log.info('a is connecting...'); });
b.onceConnecting.then(() => { log.info('b is connecting...'); });

// Log the fact that the specified connection is connected.
function logConnected(name:string) {
  log.info(name + ' connected');
}
a.onceConnected.then(logConnected.bind(null, 'a'));
b.onceConnected.then(logConnected.bind(null, 'b'));

// Negotiate a peerconnection.
// Once negotiated, enable the UI and add send/receive handlers.
a.negotiateConnection().then(() => {
  a.openDataChannel('text').then((channel:peerconnection.DataChannel) => {
    log.info('datachannel open!');
    freedom().on('sendA', sendMessage.bind(null, channel));
    channel.dataFromPeerQueue.setHandler(receiveMessage.bind(null, 'A'));
    freedom().emit('ready', {});
  }, (e:Error) => {
    log.error('could not setup datachannel: ' + e.message);
    freedom().emit('error', {});
  });
}, (e:Error) => {
  log.error('could not negotiate peerconnection: ' + e.message);
});
