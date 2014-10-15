/// <reference path='socks-to-rtc.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

describe("socksToRtc", function() {
  var server :SocksToRtc.SocksToRtc;

  beforeEach(function() {
    server = new SocksToRtc.SocksToRtc();
  });

  it('onceStarted fulfills on socket and peerconnection success and does not clean up', (done) => {
    var stop = spyOn(server, 'stop');
    server.makeOnceStarted(
        Promise.resolve(),  // socket setup
        Promise.resolve()); // peerconnection setup
    server.onceStarted()
      .then(() => {
        expect(stop).not.toHaveBeenCalled();
      })
      .then(done);
  });

  it('onceStarted rejects and cleans up on socket setup failure', (done) => {
    var stop = spyOn(server, 'stop');
    server.makeOnceStarted(
        Promise.reject(new Error('failed to listen')), // socket
        new Promise((F, R) => {}));                    // peerconnection
    server.onceStarted()
      .catch((e:Error) => {
        expect(stop).toHaveBeenCalled();
      })
      .then(done);
  });

  it('onceStarted rejects and cleans up on peerconnection setup failure', (done) => {
    var stop = spyOn(server, 'stop');
    server.makeOnceStarted(
        new Promise((F, R) => {}),                         // socket
        Promise.reject(new Error('failed to negotiate'))); // peerconnection
    server.onceStarted()
      .catch((e:Error) => {
        expect(stop).toHaveBeenCalled();
      })
      .then(done);
  });

  it('onceStopped fulfills and cleans up on socket termination fulfillment', (done) => {
    var stop = spyOn(server, 'stop');
    server.makeOnceStopped(
        Promise.resolve(),          // socket
        new Promise((F, R) => {})); // peerconnection
    server.onceStopped()
      .then(() => {
        expect(stop).toHaveBeenCalled();
      })
      .then(done);
  });

  it('onceStopped fulfills and cleans up on peerconnection fulfillment', (done) => {
    var stop = spyOn(server, 'stop');
    server.makeOnceStopped(
        new Promise((F, R) => {}), // socket
        Promise.resolve());        // peerconnection
    server.onceStopped()
      .then(() => {
        expect(stop).toHaveBeenCalled();
      })
      .then(done);
  });

  it('onceStopped rejects if stop fails', (done) => {
    var stop = spyOn(server, 'stop').and.returnValue(
        Promise.reject('shutdown failed'));
    server.makeOnceStopped(
        Promise.resolve(),  // socket
        Promise.resolve()); // peerconnection
    server.onceStopped()
      .catch((e:Error) => {
        expect(stop).toHaveBeenCalled();
      })
      .then(done);
  });

  it('stop fulfills on socket and peerconnection shutdown success', (done) => {
    var mockTcpServer = jasmine.createSpyObj('tcp server', ['shutdown']);
    var mockPeerconnection = jasmine.createSpyObj('peerconnection', ['close']);

    server.setResources(mockTcpServer, mockPeerconnection);
    server.stop().then(done);
  });

  it('stop rejects if socket shutdown rejects', (done) => {
    var mockTcpServer = jasmine.createSpyObj('tcp server', ['shutdown']);
    mockTcpServer.shutdown.and.returnValue(
        Promise.reject(new Error('shutdown failed')));
    var mockPeerconnection = jasmine.createSpyObj('peerconnection', ['close']);

    server.setResources(mockTcpServer, mockPeerconnection);
    server.stop().catch(done);
  });
});
