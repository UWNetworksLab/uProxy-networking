/// <reference path='../../../build/third_party/freedom-typings/freedom-core-env.d.ts' />
/// <reference path='../../../build/third_party/typings/jasmine/jasmine.d.ts' />

// Coarse-grained tests for tcp.ts.
// The real work is done in the Freedom module which starts a test in response
// to a Freedom message and is expected to "echo" that messages iff the test
// succeeds.
// TODO: Move the code in the Freedom module to here, with many more
//       expectations. This depends on a test runner which can run its tests
//       *inside* of a Freedom module (rather than a Chrome app):
//         https://github.com/freedomjs/freedom/issues/146
describe('core.tcpsocket wrapper', function() {
  // TODO: This is flaky! figuring out why may help explain why
  //       the SOCKS server sometimes fails to start..
  it('listens and echoes', (done) => {
    loadFreedom('listen').then(done);
  });

  it('shutdown notifications', (done) => {
    loadFreedom('shutdown').then(done);
  });

  // Loads the testing Freedom module, emits a signal and returns
  // a promise which fulfills once the signal is echoed.
  function loadFreedom(name:string) : Promise<void> {
    return freedom('scripts/build/integration/tcp/integration.json', { 'debug': 'log' })
      .then((integrationFactoryConstructor) => {
        return new Promise((F, R) => {
          var testModule = integrationFactoryConstructor();
          testModule.emit(name);
          testModule.on(name, F);
        })
        // Cleanup! Note: this will not run if the test times out... TODO: do
        // we really want close on an promise rejection? better to error then?
        .then(integrationFactoryConstructor.close, integrationFactoryConstructor.close);
      });
  }
});
