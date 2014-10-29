/// <reference path='rtc-to-net.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

var mockProxyConfig :RtcToNet.ProxyConfig = {
  allowNonUnicast: false
};

// Neither fulfills nor rejects.
// Useful in a bunch of tests where a promise must be returned
// for chaining purposes.
var noopPromise = new Promise<void>((F, R) => {});

describe('module', function() {
  var server :RtcToNet.RtcToNet;

  // var mockTcpServer :Tcp.Server;
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
    // peerconnection doesn't close "naturally".
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(noopPromise);

    server.start(mockProxyConfig, mockPeerconnection)
      .then(server.close)
      .then(() => { return server.onceClosed; })
      .then(done);
  });
});
