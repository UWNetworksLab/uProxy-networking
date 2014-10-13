/// <reference path='socks-to-rtc.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

describe("socksToRtc", function() {
  var server :SocksToRtc.SocksToRtc;
  var stop :jasmine.Spy;

  beforeEach(function() {
    server = new SocksToRtc.SocksToRtc();
    stop = spyOn(server, 'stop');
  });

  it('onceStarted fulfills on socket and peerconnection success and does not clean up', (done) => {
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
    stop.and.returnValue(Promise.reject('shutdown failed'));
    server.makeOnceStopped(
        Promise.resolve(),  // socket
        Promise.resolve()); // peerconnection
    server.onceStopped()
      .catch((e:Error) => {
        expect(stop).toHaveBeenCalled();
      })
      .then(done);
  });
});
