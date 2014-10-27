/// <reference path='socks-to-rtc.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../handler/queue.d.ts' />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />

var mockEndpoint :Net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

describe('SOCKS server', function() {
  var server :SocksToRtc.SocksToRtc;

  var mockTcpServer :Tcp.Server;
  var mockPeerconnection :freedom_UproxyPeerConnection.Pc;

  beforeEach(function() {
    server = new SocksToRtc.SocksToRtc();

    // TODO: create named more fleshed out TcpServer and PeerConnection mock
    // classes for testing. e.g. failing to listen mock, listen & gets
    // connection, listen and connection drops, etc.
    mockTcpServer = jasmine.createSpyObj('tcp server', [
        'on',
        'onceListening',
        'shutdown',
        'onceShutdown',
        'isShutdown'
      ]);
    // TODO: make a real mock of listen; this one is frgaile to implementation
    // changes and tests that might call onceListening before listen.
    mockTcpServer.listen = () => { return mockTcpServer.onceListening(); }
    mockTcpServer.connectionsQueue = new Handler.Queue<Tcp.Connection, void>();
    mockTcpServer.shutdown = () => { return mockTcpServer.onceShutdown(); }

    mockPeerconnection = jasmine.createSpyObj('peerconnection', [
        'on',
        'negotiateConnection',
        'onceConnected',
        'onceDisconnected',
        'close'
      ]);
  });

  it('onceReady fulfills with server endpoint on server and peerconnection success', (done) => {
    (<any>mockTcpServer.onceListening).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockTcpServer.onceShutdown)
        .and.returnValue(new Promise((F,R) => {}));
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDisconnected)
        .and.returnValue(new Promise<void>((F, R) => {}));

    server.start(mockTcpServer, mockPeerconnection)
      .then((result:Net.Endpoint) => {
        expect(result.address).toEqual(mockEndpoint.address);
        expect(result.port).toEqual(mockEndpoint.port);
      })
      .then(done);
  });

  it('onceReady rejects and onceStopped fulfills on socket setup failure', (done) => {
    (<any>mockTcpServer.onceListening)
        .and.returnValue(Promise.reject(new Error('could not allocate port')));
    (<any>mockTcpServer.onceShutdown).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceConnected)
        .and.returnValue(new Promise<void>((F, R) => {}));
    (<any>mockPeerconnection.onceDisconnected)
        .and.returnValue(new Promise<void>((F, R) => {}));

    server.start(mockTcpServer, mockPeerconnection).catch(server.onceStopped).then(done);
  });

  it('onceStopped fulfills on peerconnection termination', (done) => {
    (<any>mockTcpServer.onceListening).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockTcpServer.onceShutdown).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDisconnected)
        .and.returnValue(Promise.resolve());

    server.start(mockTcpServer, mockPeerconnection).then(server.onceStopped).then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    (<any>mockTcpServer.onceListening).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockTcpServer.onceShutdown).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceConnected).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDisconnected).and.returnValue(new Promise<void>((F, R) => {}));

    server.start(mockTcpServer, mockPeerconnection).then(
        server.stop).then(server.onceStopped).then(done);
  });
});

describe("SOCKS session", function() {
  var session :SocksToRtc.Session;

  var mockTcpConnection :Tcp.Connection;
  var mockPeerconnection :freedom_UproxyPeerConnection.Pc;
  var mockBytesSent :Handler.Queue<number,void>;

  beforeEach(function() {
    session = new SocksToRtc.Session();

    mockTcpConnection = jasmine.createSpyObj('tcp connection', [
        'onceClosed',
        'close',
        'isClosed'
      ]);
    mockPeerconnection = jasmine.createSpyObj('peerconnection', [
        'onceDataChannelClosed',
        'closeDataChannel'
      ]);
    mockBytesSent = jasmine.createSpyObj('bytes sent handler', [
        'handle'
      ]);
  });

  it('onceReady fulfills with listening endpoint on successful negotiation', (done) => {
    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(Promise.resolve(mockEndpoint));

    session.start('buzz', mockTcpConnection, mockPeerconnection, mockBytesSent)
      .then((result:Net.Endpoint) => {
        expect(result.address).toEqual(mockEndpoint.address);
        expect(result.port).toEqual(mockEndpoint.port);
      })
      .then(done);
  });

  it('onceReady rejects and onceStopped fulfills on unsuccessful negotiation', (done) => {
    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(Promise.reject('unknown hostname'));
    (<any>mockTcpConnection.isClosed).and.returnValue(false);

    session.start('buzz', mockTcpConnection, mockPeerconnection, mockBytesSent)
      .catch((e:Error) => { return session.onceStopped; }).then(done);
  });

  it('onceStopped fulfills on TCP connection termination', (done) => {
    (<any>mockTcpConnection.onceClosed).and.returnValue(Promise.resolve());
    (<any>mockPeerconnection.onceDataChannelClosed).and.returnValue(new Promise<void>((F, R) => {}));
    (<any>mockTcpConnection.isClosed).and.returnValue(false);

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(Promise.resolve(mockEndpoint));

    session.start('buzz', mockTcpConnection, mockPeerconnection, mockBytesSent)
      .then(() => { return session.onceStopped; }).then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    (<any>mockTcpConnection.onceClosed).and.returnValue(new Promise<void>((F, R) => {}));
    (<any>mockPeerconnection.onceDataChannelClosed).and.returnValue(new Promise<void>((F, R) => {}));
    (<any>mockTcpConnection.isClosed).and.returnValue(false);

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(Promise.resolve(mockEndpoint));

    session.start('buzz', mockTcpConnection, mockPeerconnection, mockBytesSent)
      .then(session.stop).then(() => { return session.onceStopped; }).then(done);
  });
});
