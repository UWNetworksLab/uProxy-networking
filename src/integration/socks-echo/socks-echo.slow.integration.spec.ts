/// <reference path='../../../build/third_party/freedom-typings/freedom-core-env.d.ts' />
/// <reference path='../../../build/third_party/typings/jasmine/jasmine.d.ts' />

import socks = require('../../socks-common/socks-headers');

// Integration test for the whole proxying system.
// The real work is done in the Freedom module which performs each test.
describe('proxy integration tests', function() {
  var getTestModule = function(denyLocalhost?:boolean) : any {
    return freedom('scripts/build/integration/socks-echo/integration.json',
            { 'debug': 'log' })
        .then((interface:any) => {
          return interface(denyLocalhost);
        });
  };

  // The default TCP SYN timeout is two minutes, so to be safe we
  // set a test timeout of four minutes.
  (<any>jasmine).DEFAULT_TIMEOUT_INTERVAL = 240000;

  it('attempt to connect to a nonexistent IP address', (done) => {
    getTestModule().then((testModule:any) => {
      // 192.0.2.0/24 is a reserved IP address range.
      return testModule.connect(80, '192.0.2.111');
    }).then((connectionId:string) => {
      // This code should not run, because this is a reserved IP address.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      // The socket should time out after two minutes.
      expect(e.reply).toEqual(socks.Reply.TTL_EXPIRED);
    }).then(done);
  });
});
