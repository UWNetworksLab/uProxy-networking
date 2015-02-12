/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../build/third_party/freedom-typings/freedom-module-env.d.ts' />
/// <reference path='../../build/third_party/typings/jasmine/jasmine.d.ts' />

import arraybuffers = require('../../build/dev/arraybuffers/arraybuffers');
import peerconnection = require('../../build/dev/webrtc/peerconnection');
import handler = require('../../build/dev/handler/queue');

import rtc_to_net = require('./rtc-to-net');
import net = require('../net/net.types');
import tcp = require('../net/tcp');
import socks = require('../socks-common/socks-headers');

import logging = require('../../build/dev/logging/logging');

var log :logging.Log = new logging.Log('socks-to-rtc spec');


var mockBoundEndpoint :net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

var voidPromise = Promise.resolve<void>();

var mockProxyConfig :rtc_to_net.ProxyConfig = {
  allowNonUnicast: false
};

var mockRemoteEndpoint :net.Endpoint = {
  // This address and port are both reserved for testing.
  address: '192.0.2.111',
  port: 1023
};

var mockConnectionInfo :tcp.ConnectionInfo = {
  bound: mockBoundEndpoint,
  remote: mockRemoteEndpoint
}

// Neither fulfills nor rejects.
// Useful in a bunch of tests where a promise must be returned
// for chaining purposes.
var noopPromise = new Promise<any>((F, R) => {});

describe('RtcToNet', function() {
  var server :rtc_to_net.RtcToNet;

  var mockPeerconnection
      :peerconnection.PeerConnection<peerconnection.SignallingMessage>;

  beforeEach(function() {
    server = new rtc_to_net.RtcToNet();

    mockPeerconnection = <any>{
      dataChannels: {},
      negotiateConnection: jasmine.createSpy('negotiateConnection'),
      onceConnecting: noopPromise,
      onceConnected: noopPromise,
      onceDisconnected: noopPromise,
      peerOpenedChannelQueue: new handler.Queue(),
      close: jasmine.createSpy('close')
    };
  });

  it('onceReady fulfills on peerconnection success', (done) => {
    mockPeerconnection.onceConnected = voidPromise;
    // We're not testing termination.

    server.start(mockProxyConfig, mockPeerconnection).then(done);
  });

  it('onceReady rejects on peerconnection setup failure', (done) => {
    mockPeerconnection.onceConnected =
        Promise.reject(new Error('failed to establish connection'));
    // We're not testing termination.

    server.start(mockProxyConfig, mockPeerconnection).catch(done);
  });

  it('onceClosed fulfills on peerconnection termination', (done) => {
    mockPeerconnection.onceConnected = voidPromise;
    mockPeerconnection.onceDisconnected = <any>Promise.resolve();

    server.start(mockProxyConfig, mockPeerconnection)
      .then(() => { return server.onceClosed; })
      .then(done);
  });

  it('onceClosed fulfills on call to stop', (done) => {
    mockPeerconnection.onceConnected = voidPromise;
    // Calling stop() alone should be sufficient to initiate shutdown.

    server.start(mockProxyConfig, mockPeerconnection)
      .then(server.close)
      .then(() => { return server.onceClosed; })
      .then(done);
  });
});

describe("RtcToNet session", function() {
  var session :rtc_to_net.Session;

  var mockTcpConnection :tcp.Connection;
  var mockDataChannel :peerconnection.DataChannel;
  var mockBytesReceived :handler.Queue<number,void>;
  var mockBytesSent :handler.Queue<number,void>;

  beforeEach(function() {
    mockTcpConnection = jasmine.createSpyObj('tcp connection', [
        'onceConnected',
        'onceClosed',
        'isClosed',
        'close'
      ]);
    mockDataChannel = <any>{
      closeDataChannel: noopPromise,
      onceClosed: noopPromise,
      close: jasmine.createSpy('close')
    };
    mockBytesReceived = jasmine.createSpyObj('bytes received handler', [
        'handle'
      ]);
    mockBytesSent = jasmine.createSpyObj('bytes sent handler', [
        'handle'
      ]);

    session  = new rtc_to_net.Session(
        mockDataChannel,
        mockProxyConfig,
        mockBytesReceived,
        mockBytesSent);
  });

  it('onceReady fulfills with listening endpoint on successful negotiation', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().then(done);
  });

  it('onceReady rejects and onceStopped fulfills on unsuccessful endpoint negotiation', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.reject(new Error('bad format')));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().catch(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on datachannel termination', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;
    mockDataChannel.onceClosed = Promise.resolve<void>();

    session.start().then(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on TCP connection termination', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = Promise.resolve();

    session.start().then(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().then(session.stop).then(session.onceStopped).then(done);
  });
});
