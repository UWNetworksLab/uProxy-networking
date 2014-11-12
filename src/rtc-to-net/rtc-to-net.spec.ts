/// <reference path='rtc-to-net.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

var mockProxyConfig :RtcToNet.ProxyConfig = {
  allowNonUnicast: false
};

var mockEndpoint :Net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

// Neither fulfills nor rejects.
// Useful in a bunch of tests where a promise must be returned
// for chaining purposes.
var noopPromise = new Promise<any>((F, R) => {});

describe('RtcToNet', function() {
  var server :RtcToNet.RtcToNet;

  var mockPeerconnection :freedom_UproxyPeerConnection.Pc;

  beforeEach(function() {
    server = new RtcToNet.RtcToNet();

    mockPeerconnection = jasmine.createSpyObj('peerconnection', [
        'on',
        'onceConnected',
        'onceDisconnected',
        'close'
      ]);
  });

  it('onceReady fulfills on peerconnection success', (done) => {
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    // We're not testing termination.
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(noopPromise);

    server.start(mockProxyConfig, mockPeerconnection).then(done);
  });

  it('onceReady rejects on peerconnection setup failure', (done) => {
    (<any>mockPeerconnection.onceConnected).and.returnValue(
        Promise.reject(new Error('failed to establish connection')));
    // We're not testing termination.
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(noopPromise);

    server.start(mockProxyConfig, mockPeerconnection).catch(done);
  });

  it('onceClosed fulfills on peerconnection termination', (done) => {
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDisconnected)
        .and.returnValue(Promise.resolve());

    server.start(mockProxyConfig, mockPeerconnection)
      .then(() => { return server.onceClosed; })
      .then(done);
  });

  it('onceClosed fulfills on call to stop', (done) => {
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    // Calling stop() alone should be sufficient to initiate shutdown.
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(noopPromise);

    server.start(mockProxyConfig, mockPeerconnection)
      .then(server.close)
      .then(() => { return server.onceClosed; })
      .then(done);
  });
});

describe("RtcToNet session", function() {
  var mockTcpConnection :Tcp.Connection;
  var mockPeerconnection :freedom_UproxyPeerConnection.Pc;
  // var mockBytesSent :Handler.Queue<number,void>;

  beforeEach(function() {
    mockTcpConnection = jasmine.createSpyObj('tcp connection', [
        'onceConnected',
        'onceClosed',
        'isClosed',
        'close'
      ]);
    mockPeerconnection = jasmine.createSpyObj('peerconnection', [
        'onceDataChannelClosed',
        'closeDataChannel'
      ]);
    // mockBytesSent = jasmine.createSpyObj('bytes sent handler', [
    //     'handle'
    //   ]);
  });

  it('onceReady fulfills with listening endpoint on successful negotiation', (done) => {
    var session  = new RtcToNet.Session('buzz', mockPeerconnection, mockProxyConfig);
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockEndpoint));
    spyOn(session, 'returnEndpointToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockEndpoint);
    // We're not testing termination.
    (<any>mockPeerconnection.onceDataChannelClosed).and.returnValue(noopPromise);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().then(done);
  });

  it('onceReady rejects and onceStopped fulfills on unsuccessful endpoint negotiation', (done) => {
    var session  = new RtcToNet.Session('buzz', mockPeerconnection, mockProxyConfig);
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.reject(new Error('bad format')));
    spyOn(session, 'returnEndpointToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockEndpoint);
    // Neither datachannel nor TCP connection terminate "naturally".
    (<any>mockPeerconnection.onceDataChannelClosed).and.returnValue(noopPromise);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().catch(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on datachannel termination', (done) => {
    var session  = new RtcToNet.Session('buzz', mockPeerconnection, mockProxyConfig);
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockEndpoint));
    spyOn(session, 'returnEndpointToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockEndpoint);
    (<any>mockPeerconnection.onceDataChannelClosed).and.returnValue(Promise.resolve());
    mockTcpConnection.onceClosed = noopPromise;

    session.start().then(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on TCP connection termination', (done) => {
    var session  = new RtcToNet.Session('buzz', mockPeerconnection, mockProxyConfig);
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockEndpoint));
    spyOn(session, 'returnEndpointToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockEndpoint);
    (<any>mockPeerconnection.onceDataChannelClosed).and.returnValue(noopPromise);
    mockTcpConnection.onceClosed = Promise.resolve();

    session.start().then(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    var session  = new RtcToNet.Session('buzz', mockPeerconnection, mockProxyConfig);
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockEndpoint));
    spyOn(session, 'returnEndpointToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockEndpoint);
    // Calling stop() alone should be sufficient to initiate shutdown.
    (<any>mockPeerconnection.onceDataChannelClosed).and.returnValue(noopPromise);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().then(session.stop).then(session.onceStopped).then(done);
  });
});
