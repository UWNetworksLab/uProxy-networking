/// <reference path='../../../../third_party/freedom-typings/freedom-core-env.d.ts' />
/// <reference path='../../../../third_party/typings/jasmine/jasmine.d.ts' />

import socks = require('../../socks-common/socks-headers');
import ProxyIntegrationTester = require('./proxy-integration-test.types');
import arraybuffers = require('../../../../third_party/uproxy-lib/arraybuffers/arraybuffers');

import freedom_types = require('freedom.types');

function slowTestDescription(useChurn:boolean) {
  var testerFactoryManager
        :freedom_types.FreedomModuleFactoryManager<ProxyIntegrationTester>;
  var getTestModule = function(denyLocalhost?:boolean)
      :ProxyIntegrationTester {
    return testerFactoryManager(denyLocalhost, useChurn);
  };

  beforeEach((done) => {
    freedom('files/freedom-module.json', { 'debug': 'info' })
        .then((freedomModuleFactoryManager) => {
          testerFactoryManager = freedomModuleFactoryManager;
          done();
        });
  });

  afterEach(() => {
    expect(testerFactoryManager).not.toBeUndefined();
    // Close all created interfaces to the freedom module.
    testerFactoryManager.close();
  });

  // The default TCP SYN timeout is two minutes, so to be safe we
  // set a test timeout of four minutes.
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 240000;

  it('download load test', (done) => {
    var blockSize = 1024;
    var testBlock :ArrayBuffer = new ArrayBuffer(blockSize);
    var repeat :number = 250;
    var testModule = getTestModule();
    testModule.setRepeat(repeat);
    testModule.startEchoServer().then((port:number) => {
      var connectionPromises :Promise<string>[] = [];
      for (var i = 0; i < 200; ++i) {
        connectionPromises.push(testModule.connect(port));
      }
      return Promise.all(connectionPromises);
    }).then((connectionIds:string[]) => {
      var completions = connectionIds.map((connectionId:string) : Promise<void> => {
        var resolve :Function;
        var result :Promise<void> = new Promise<void>((F, R) => { resolve = F; });
        var isDone = false;
        var outputString = '';
        testModule.on('pong', (pong:any) => {
          if (pong.connectionId != connectionId) {
            return;
          }
          expect(isDone).toBe(false);
          outputString += arraybuffers.arrayBufferToString(pong.response);
          if (outputString.length == repeat * blockSize) {
            isDone = true;
            resolve();
          }
        });
        return testModule.ping(connectionId, testBlock).then(() => {
          return result;
        });
      });
      Promise.all(completions).then(done);
    });
  });

  it('upload load test', (done) => {
    var size = 250 * 1024;
    var testBlock :ArrayBuffer = new ArrayBuffer(size);
    var testModule = getTestModule();
    testModule.setRepeat(0);  // Don't send a reply at all.
    testModule.startEchoServer().then((port:number) => {
      var connectionPromises :Promise<string>[] = [];
      for (var i = 0; i < 200; ++i) {
        connectionPromises.push(testModule.connect(port));
      }
      return Promise.all(connectionPromises);
    }).then((connectionIds:string[]) : Promise<void>[] => {
      return connectionIds.map((connectionId:string) : Promise<void> => {
        return testModule.ping(connectionId, testBlock);
      });
    }).then((pingResults:Promise<void>[]) : Promise<[any]> => {
      return Promise.all(pingResults);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('100 MB echo load test', (done) => {
    var size = 100 * 1024 * 1024;  // Larger than the 16 MB internal buffer in Chrome.
    var input = new ArrayBuffer(size);
    var testModule = getTestModule();
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port);
    }).then((connectionId:string) => {
      return testModule.echo(connectionId, input);
    }).then((output:ArrayBuffer) => {
      expect(output.byteLength).toEqual(input.byteLength);
      expect(arraybuffers.byteEquality(input, output)).toBe(true);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('attempt to connect to a nonexistent IP address', (done) => {
    var testModule = getTestModule();
    // 192.0.2.0/24 is a reserved IP address range.
    testModule.connect(80, '192.0.2.111').then((connectionId:string) => {
      // This code should not run, because this is a reserved IP address.
      expect(connectionId).toBeUndefined();
    }).catch((e:{reply:socks.Reply}) => {
      // The socket should time out after two minutes.
      expect(e.reply).toEqual(socks.Reply.TTL_EXPIRED);
    }).then(done);
  });
}

describe('slow integration tests', function() {
  slowTestDescription(false);
});

describe('slow integration tests with churn', function() {
  slowTestDescription(true);
});
