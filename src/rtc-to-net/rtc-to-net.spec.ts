/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-module-env.d.ts' />
/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import freedomMocker = require('../../../third_party/uproxy-lib/freedom/mocks/mock-freedom-in-module-env');
freedom = freedomMocker.makeMockFreedomInModuleEnv();

import arraybuffers = require('../../../third_party/uproxy-lib/arraybuffers/arraybuffers');
import peerconnection = require('../../../third_party/uproxy-lib/webrtc/peerconnection');
import signals = require('../../../third_party/uproxy-lib/webrtc/signals');
import handler = require('../../../third_party/uproxy-lib/handler/queue');

import rtc_to_net = require('./rtc-to-net');
import net = require('../net/net.types');
import tcp = require('../net/tcp');
import socks = require('../socks-common/socks-headers');

import logging = require('../../../third_party/uproxy-lib/logging/logging');

import ProxyConfig = require('./proxyconfig');

var log :logging.Log = new logging.Log('socks-to-rtc spec');


var mockBoundEndpoint :net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

var voidPromise = Promise.resolve<void>();

var mockProxyConfig :ProxyConfig = {
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
      :peerconnection.PeerConnection<signals.Message>;

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

  it('onceStopped fulfills on peerconnection termination', (done) => {
    mockPeerconnection.onceConnected = voidPromise;
    mockPeerconnection.onceDisconnected = <any>Promise.resolve();

    server.start(mockProxyConfig, mockPeerconnection)
      .then(() => { return server.onceStopped; })
      .then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    mockPeerconnection.onceConnected = voidPromise;
    // Calling stop() alone should be sufficient to initiate shutdown.

    server.start(mockProxyConfig, mockPeerconnection)
      .then(server.stop)
      .then(() => { return server.onceStopped; })
      .then(done);
  });
});

describe("RtcToNet session", function() {
  var session :rtc_to_net.Session;

  var mockTcpConnection :tcp.Connection;
  var mockDataChannel :peerconnection.DataChannel;
  var mockDataFromPeerQueue :handler.Queue<peerconnection.Data,void>;
  var mockBytesReceived :handler.Queue<number,void>;
  var mockBytesSent :handler.Queue<number,void>;

  beforeEach(function() {
    mockTcpConnection = jasmine.createSpyObj('tcp connection', [
        'onceConnected',
        'onceClosed',
        'isClosed',
        'close',
        'send'
      ]);
    (<any>mockTcpConnection.send).and.returnValue(Promise.resolve({ bytesWritten: 1 }));
    mockTcpConnection.dataFromSocketQueue = new handler.Queue<ArrayBuffer,void>();
    mockDataFromPeerQueue = new handler.Queue<peerconnection.Data,void>();

    mockDataChannel = <any>{
      close: jasmine.createSpy('close'),
      closeDataChannel: noopPromise,
      dataFromPeerQueue: mockDataFromPeerQueue,
      getLabel: jasmine.createSpy('getLabel'),
      onceClosed: noopPromise,
      send: jasmine.createSpy('send')
    };
    (<any>mockDataChannel.send).and.returnValue(voidPromise);

    mockBytesReceived = new handler.Queue<number, void>();
    mockBytesSent = new handler.Queue<number, void>();
    session = new rtc_to_net.Session(
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
    mockTcpConnection.onceClosed = Promise.resolve(tcp.SocketCloseKind.WE_CLOSED_IT);

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

  it('bytes sent counter', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    var buffer = new Uint8Array([1,2,3]).buffer;
    session.start().then(() => {
      mockTcpConnection.dataFromSocketQueue.handle(buffer);
    });
    mockBytesSent.setSyncNextHandler((numBytes:number) => {
      expect(numBytes).toEqual(buffer.byteLength);
      done();
    });
  });

  it('bytes received counter', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    var message :peerconnection.Data = {
      buffer: new Uint8Array([1,2,3]).buffer
    };
    session.start().then(() => {
      mockDataFromPeerQueue.handle(message);
    });
    mockBytesReceived.setSyncNextHandler((numBytes:number) => {
      expect(numBytes).toEqual(message.buffer.byteLength);
      done();
    });
  });

  it('channel queue drains before termination', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    // The data channel is closed before the session starts.
    mockDataChannel.onceClosed = voidPromise;

    var message :peerconnection.Data = {
      buffer: new Uint8Array([1,2,3]).buffer
    };
    var onceMessageHandled = mockDataFromPeerQueue.handle(message);

    session.start().then(session.onceStopped).then(() => {
      return onceMessageHandled;
    }).then(() => {
      expect(mockDataChannel.dataFromPeerQueue.getLength()).toEqual(0);
      done();
    });
  });

  it('socket queue drains before termination', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    // The TCP connection is closed before the session starts.
    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = Promise.resolve(tcp.SocketCloseKind.WE_CLOSED_IT);
    (<any>mockTcpConnection.isClosed).and.returnValue(true);

    var buffer = new Uint8Array([1,2,3]).buffer;
    var onceMessageHandled = mockTcpConnection.dataFromSocketQueue.handle(buffer);

    session.start().then(session.onceStopped).then(() => {
      return onceMessageHandled;
    }).then(() => {
      expect(mockTcpConnection.dataFromSocketQueue.getLength()).toEqual(0);
      done();
    });
  });
});
