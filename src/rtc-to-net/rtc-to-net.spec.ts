/// <reference path='rtc-to-net.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

var mockBoundEndpoint :Net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

var voidPromise = Promise.resolve<void>();

var mockProxyConfig :RtcToNet.ProxyConfig = {
  allowNonUnicast: false
};

var mockRemoteEndpoint :Net.Endpoint = {
  // This address and port are both reserved for testing.
  address: '192.0.2.111',
  port: 1023
};

var mockConnectionInfo :Tcp.ConnectionInfo = {
  bound: mockBoundEndpoint,
  remote: mockRemoteEndpoint
}

// Neither fulfills nor rejects.
// Useful in a bunch of tests where a promise must be returned
// for chaining purposes.
var noopPromise = new Promise<any>((F, R) => {});

describe('RtcToNet', function() {
  var server :RtcToNet.RtcToNet;

  var mockPeerconnection :WebRtc.PeerConnection;

  beforeEach(function() {
    server = new RtcToNet.RtcToNet();

    mockPeerconnection = <any>{
      dataChannels: {},
      negotiateConnection: jasmine.createSpy('negotiateConnection'),
      onceConnecting: noopPromise,
      onceConnected: noopPromise,
      onceDisconnected: noopPromise,
      peerOpenedChannelQueue: new Handler.Queue(),
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
  var session :RtcToNet.Session;

  var mockTcpConnection :Tcp.Connection;
  var mockDataChannel :WebRtc.DataChannel;
  var mockBytesReceived :Handler.Queue<number,void>;
  var mockBytesSent :Handler.Queue<number,void>;

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

    session  = new RtcToNet.Session(
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
