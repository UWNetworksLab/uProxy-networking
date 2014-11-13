/// <reference path='rtc-to-net.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

var mockEndpoint :Net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

var mockConnectionAddresses : WebRtc.ConnectionAddresses = {
  local: mockEndpoint,
  localType: 'mock',
  remote: mockEndpoint,
  remoteType: 'mock'
};

var mockProxyConfig :RtcToNet.ProxyConfig = {
  allowNonUnicast: false
};

// Neither fulfills nor rejects.
// Useful in a bunch of tests where a promise must be returned
// for chaining purposes.
var noopPromise = new Promise<void>((F, R) => {});

describe('module', function() {
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
    mockPeerconnection.onceConnected = Promise.resolve(mockConnectionAddresses);
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
    mockPeerconnection.onceConnected = Promise.resolve(mockConnectionAddresses);
    mockPeerconnection.onceDisconnected = <any>Promise.resolve();

    server.start(mockProxyConfig, mockPeerconnection)
      .then(() => { return server.onceClosed; })
      .then(done);
  });

  it('onceClosed fulfills on call to stop', (done) => {
    mockPeerconnection.onceConnected = Promise.resolve(mockConnectionAddresses);
    // Calling stop() alone should be sufficient to initiate shutdown.

    server.start(mockProxyConfig, mockPeerconnection)
      .then(server.close)
      .then(() => { return server.onceClosed; })
      .then(done);
  });
});
