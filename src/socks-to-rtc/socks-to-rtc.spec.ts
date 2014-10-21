/// <reference path='socks-to-rtc.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />

describe("socksToRtc", function() {
  var mockEndpoint :Net.Endpoint = {
    address: '127.0.0.1',
    port: 1234
  };

  var server :SocksToRtc.SocksToRtc;

  var mockTcpServer :Tcp.Server;
  var mockPeerconnection :freedom_UproxyPeerConnection.Pc;

  beforeEach(function() {
    server = new SocksToRtc.SocksToRtc();

    mockTcpServer = jasmine.createSpyObj('tcp server', [
        'on',
        'listen',
        'shutdown'
      ]);
    mockTcpServer.endpoint = mockEndpoint;
    mockPeerconnection = jasmine.createSpyObj('peerconnection', [
        'on',
        'negotiateConnection',
        'onceConnected',
        'onceDisconnected',
        'close'
      ]);
  });

  it('onceReady fulfills with server endpoint on server and peerconnection success', (done) => {
    (<any>mockTcpServer.listen).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(new Promise<void>((F, R) => {}));

    server.start(mockTcpServer, mockPeerconnection)
      .then((result:Net.Endpoint) => {
        expect(result.address).toEqual(mockEndpoint.address);
        expect(result.port).toEqual(mockEndpoint.port);
      })
      .then(done);
  });

  it('onceReady rejects and onceStopped fulfills on socket setup failure', (done) => {
    (<any>mockTcpServer.listen).and.returnValue(Promise.reject(new Error('could not allocate port')));
    (<any>mockPeerconnection.onceConnected).and.returnValue(new Promise<void>((F, R) => {}));
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(new Promise<void>((F, R) => {}));

    server.start(mockTcpServer, mockPeerconnection).catch(server.onceStopped).then(done);
  });

  it('onceStopped fulfills on peerconnection termination', (done) => {
    (<any>mockTcpServer.listen).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(Promise.resolve());

    server.start(mockTcpServer, mockPeerconnection).then(server.onceStopped).then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    (<any>mockTcpServer.listen).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(new Promise<void>((F, R) => {}));

    server.start(mockTcpServer, mockPeerconnection).then(
        server.stop).then(server.onceStopped).then(done);
  });

  it('onceStopped rejects on peerconnection shutdown failure', (done) => {
    (<any>mockTcpServer.listen).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(new Promise<void>((F, R) => {}));
    (<any>mockPeerconnection.close).and.returnValue(Promise.reject('could not cleanly shutdown'));

    server.start(mockTcpServer, mockPeerconnection).then(
        server.stop).then(server.onceStopped).catch(done);
  });
});
