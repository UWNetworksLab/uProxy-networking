/// <reference path='socks-to-rtc.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />

describe("socksToRtc", function() {
  var server :SocksToRtc.SocksToRtc;

  var mockTcpServer :Tcp.Server;
  var mockPeerconnection :freedom_UproxyPeerConnection.Pc;

  beforeEach(function() {
    server = new SocksToRtc.SocksToRtc();

    mockTcpServer = jasmine.createSpyObj('tcp server',
          ['on', 'listen', 'shutdown']);
    mockTcpServer.endpoint = {
      address: 'localhost',
      port: 9999
    };
    mockPeerconnection = jasmine.createSpyObj('peerconnection',
          ['on', 'negotiateConnection', 'close']);
  });

  it('onceReady fulfills on socket and peerconnection success', (done) => {
    // Both TCP server and peerconnection start successfully.
    // They do not terminate in this test.
    spyOn(server, 'getOnceTcpServerStarted').and.returnValue(Promise.resolve());
    spyOn(server, 'getOncePeerconnectionStarted').and.returnValue(Promise.resolve());
    spyOn(server, 'getOnceTcpServerStopped').and.returnValue(new Promise<void>((F, R) => {}));
    spyOn(server, 'getOncePeerconnectionStopped').and.returnValue(new Promise<void>((F, R) => {}));
    server.configure(mockTcpServer, mockPeerconnection);

    server.onceReady.then(done);
  });

  it('onceReady and onceStopped fulfill on socket and peerconnection setup and termination success', (done) => {
    // Both TCP server and peerconnection start and terminate successfully.
    spyOn(server, 'getOnceTcpServerStarted').and.returnValue(Promise.resolve());
    spyOn(server, 'getOnceTcpServerStopped').and.returnValue(Promise.resolve());
    spyOn(server, 'getOncePeerconnectionStarted').and.returnValue(Promise.resolve());
    spyOn(server, 'getOncePeerconnectionStopped').and.returnValue(Promise.resolve());
    server.configure(mockTcpServer, mockPeerconnection);

    server.onceReady.then(server.onceStopped).then(done);
  });

  it('stop sufficient to fulfill onceStopped', (done) => {
    // Both TCP server and peerconnection start terminate successfully.
    spyOn(server, 'getOnceTcpServerStarted').and.returnValue(Promise.resolve());
    spyOn(server, 'getOncePeerconnectionStarted').and.returnValue(Promise.resolve());
    spyOn(server, 'getOnceTcpServerStopped').and.returnValue(new Promise<void>((F, R) => {}));
    spyOn(server, 'getOncePeerconnectionStopped').and.returnValue(new Promise<void>((F, R) => {}));
    server.configure(mockTcpServer, mockPeerconnection);

    server.stop();
    server.onceStopped().then(done);
  });

  it('socket setup failure sufficient to fulfill onceStopped', (done) => {
    // TCP server fails to start.
    spyOn(server, 'getOnceTcpServerStarted').and.returnValue(Promise.reject(new Error('failed to listen')));
    spyOn(server, 'getOncePeerconnectionStarted').and.returnValue(Promise.resolve());
    spyOn(server, 'getOnceTcpServerStopped').and.returnValue(new Promise<void>((F, R) => {}));
    spyOn(server, 'getOncePeerconnectionStopped').and.returnValue(new Promise<void>((F, R) => {}));
    server.configure(mockTcpServer, mockPeerconnection);

    server.onceReady.catch(server.onceStopped).then(done);
  });
});
