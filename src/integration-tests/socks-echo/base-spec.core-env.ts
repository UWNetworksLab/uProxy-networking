/// <reference path='../../../../third_party/freedom-typings/freedom-core-env.d.ts' />
/// <reference path='../../../../third_party/typings/jasmine/jasmine.d.ts' />

import arraybuffers = require('../../../../third_party/uproxy-lib/arraybuffers/arraybuffers');
import socks = require('../../socks-common/socks-headers');

import ProxyIntegrationTester = require('./proxy-integration-test.types');

import freedom_types = require('freedom.types');

// Integration test for the whole proxying system.
// The real work is done in the Freedom module which performs each test.
export function socksEchoTestDescription(useChurn:boolean) {
  var testStrings = [
    'foo',
    'bar',
    'longer string',
    '1',
    'that seems like enough'
  ];

  var testerFactoryManager
        :freedom_types.FreedomModuleFactoryManager<ProxyIntegrationTester>;
  var getTestModule = function(denyLocalhost?:boolean)
      :ProxyIntegrationTester {
    return testerFactoryManager(denyLocalhost, useChurn);
  };

  beforeEach((done) => {
    freedom('files/freedom-module.json', { 'debug': 'debug' })
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

  it('run a simple echo test', (done) => {
    var input = arraybuffers.stringToArrayBuffer('arbitrary test string');
    var testModule = getTestModule();
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port);
    }).then((connectionId:string) => {
      return testModule.echo(connectionId, input);
    }).then((output:ArrayBuffer) => {
      expect(arraybuffers.byteEquality(input, output)).toBe(true);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('detects a remote close', (done) => {
    var input = arraybuffers.stringToArrayBuffer('arbitrary test string');
    var testModule = getTestModule();
    var connid : string;
    var testModuleCopy:any;
    testModuleCopy = testModule;
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port);
    }).then((connectionId:string) => {
      connid = connectionId;
      return testModule.echo(connectionId, input);
    }).then((output:ArrayBuffer) => {
      expect(arraybuffers.byteEquality(input, output)).toBe(true);
      testModule.notifyClose(connid).then(() => {
        testModuleCopy.on('sockClosed', (cnnid:string) => {
          expect(cnnid).toBe(connid);
          done();
        });
        testModule.closeEchoConnections();});
    });
  });

  it('run multiple echo tests in a batch on one connection', (done) => {
    var testBuffers = testStrings.map(arraybuffers.stringToArrayBuffer);
    var testModule = getTestModule();
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port);
    }).then((connectionId:string) => {
      return testModule.echoMultiple(connectionId, testBuffers);
    }).then((outputs:ArrayBuffer[]) => {
      var concatenatedInputs = arraybuffers.concat(testBuffers);
      var concatenatedOutputs = arraybuffers.concat(outputs);
      var isEqual = arraybuffers.byteEquality(concatenatedInputs, concatenatedOutputs);
      expect(isEqual).toBe(true);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run multiple echo tests in series on one connection', (done) => {
    var testBuffers = testStrings.map(arraybuffers.stringToArrayBuffer);
    var testModule = getTestModule();
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port);
    }).then((connectionId:string) => {
      var i = 0;
      return new Promise<void>((F, R) => {
        var step = () => {
          if (i == testBuffers.length) {
            F();
            return;
          }
          testModule.echo(connectionId, testBuffers[i])
              .then((echo:ArrayBuffer) => {
            expect(arraybuffers.byteEquality(testBuffers[i], echo)).toBe(true);
            ++i;
          }).then(step);
        };
        step();
      });
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('connect to the same server multiple times in parallel', (done) => {
    var testModule = getTestModule();
    testModule.startEchoServer().then((port:number) : Promise<any> => {
      var promises = testStrings.map((s:string) : Promise<void> => {
        var buffer = arraybuffers.stringToArrayBuffer(s);
        return testModule.connect(port).then((connectionId:string) => {
          return testModule.echo(connectionId, buffer);
        }).then((response:ArrayBuffer) => {
          expect(arraybuffers.byteEquality(buffer, response)).toBe(true);
        });
      });
      return Promise.all(promises);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('connect to many different servers in parallel', (done) => {
    var testModule = getTestModule();
    var promises = testStrings.map((s:string) : Promise<void> => {
      var buffer = arraybuffers.stringToArrayBuffer(s);

      // For each string, start a new echo server with that name, and
      // then echo that string from that server.
      return testModule.startEchoServer().then((port:number) => {
        return testModule.connect(port);
      }).then((connectionId:string) => {
        return testModule.echo(connectionId, buffer);
      }).then((response:ArrayBuffer) => {
        expect(arraybuffers.byteEquality(buffer, response)).toBe(true);
      });
    });

    Promise.all(promises).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run a localhost echo test while localhost is blocked.', (done) => {
    // Get a test module that doesn't allow localhost access.
    var testModule = getTestModule(true);
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port);
    }).then((connectionId:string) => {
      // This code should not run, because testModule.connect() should
      // reject with a NOT_ALLOWED error.
      expect(connectionId).toBeUndefined();
    }, (e:any) => {
      expect(e.reply).toEqual(socks.Reply.NOT_ALLOWED);
    }).then(done);
  });

  var runUproxyOrg404Test = (testModule:any, done:Function) => {
    var nonExistentPath = '/noSuchPath';
    var input = arraybuffers.stringToArrayBuffer(
        'GET ' + nonExistentPath + ' HTTP/1.0\r\n\r\n');
    testModule.connect(80, 'uproxy.org').then((connectionId:string) => {
      var isDone = false;
      var outputString = '';
      testModule.on('pong', (response:ArrayBuffer) => {
        if (isDone) {
          return;
        }
        outputString += arraybuffers.arrayBufferToString(response);
        if (outputString.indexOf('HTTP/1.0 404 Not Found') != -1 &&
            outputString.indexOf(nonExistentPath) != -1) {
          isDone = true;
          done();
        }
      });
      return testModule.ping(connectionId, input);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    });
  };

  it('fetch from non-localhost address', (done) => {
    var testModule = getTestModule();
    runUproxyOrg404Test(testModule, done);
  });

  it('fetch from non-localhost address while localhost is blocked.', (done) => {
    var testModule = getTestModule(true);
    runUproxyOrg404Test(testModule, done);
  });

  it('do a request that gets blocked, then another that succeeds.', (done) => {
    var nonExistentPath = '/noSuchPath';
    var input = arraybuffers.stringToArrayBuffer(
        'GET ' + nonExistentPath + ' HTTP/1.0\r\n\r\n');
    // Get a test module that doesn't allow localhost access.
    var testModule = getTestModule(true);
    // Try to connect to localhost, and fail
    testModule.connect(1023).then((connectionId:string) => {
      // This code should not run, because testModule.connect() should
      // reject with a NOT_ALLOWED error.
      expect(connectionId).toBeUndefined();
    }, (e:any) => {
      expect(e.reply).toEqual(socks.Reply.NOT_ALLOWED);
    }).then(() => {
      runUproxyOrg404Test(testModule, done);
    });
  });

  it('run a localhost-resolving DNS name echo test while localhost is blocked.', (done) => {
    // Get a test module with one that doesn't allow localhost access.
    var testModule = getTestModule(true);
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port, 'www.127.0.0.1.xip.io');
    }).then((connectionId:string) => {
      // This code should not run, because testModule.connect() should
      // reject.
      expect(connectionId).toBeUndefined();
    }, (e:any) => {
      // On many networks, www.127.0.0.1.xip.io is non-resolvable, because
      // corporate DNS can drop responses that resolve to local network
      // addresses.  Accordingly, the error code may either indicate
      // a generic failure (if resolution fails) or NOT_ALLOWED if name
      // resolution succeeds.  However, to avoid portscanning leaks
      // (https://github.com/uProxy/uproxy/issues/809) both will be reported
      // as FAILURE
      expect(e.reply).toEqual(socks.Reply.FAILURE);
    }).then(done);
  });

  it('attempt to connect to a nonexistent echo daemon', (done) => {
    var testModule = getTestModule();
    // 1023 is a reserved port.
    testModule.connect(1023).then((connectionId:string) => {
      // This code should not run, because there is no server on this port.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(socks.Reply.CONNECTION_REFUSED);
    }).then(done);
  });

  it('attempt to connect to a nonexistent echo daemon while localhost is blocked', (done) => {
    var testModule = getTestModule(true);
    // 1023 is a reserved port.
    testModule.connect(1023).then((connectionId:string) => {
      // This code should not run, because localhost is blocked.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(socks.Reply.NOT_ALLOWED);
    }).then(done);
  });

  it('attempt to connect to a nonexistent local echo daemon while localhost is blocked as 0.0.0.0', (done) => {
    var testModule = getTestModule(true);
    // 1023 is a reserved port.
    testModule.connect(1023, '0.0.0.0').then((connectionId:string) => {
      // This code should not run because the destination is invalid.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      // TODO: Make this just NOT_ALLOWED once this bug in ipadddr.js is fixed:
      // https://github.com/whitequark/ipaddr.js/issues/9
      expect([socks.Reply.NOT_ALLOWED, socks.Reply.FAILURE]).toContain(e.reply);
    }).then(done);
  });

  it('attempt to connect to a nonexistent local echo daemon while localhost is blocked as IPv6', (done) => {
    var testModule = getTestModule(true);
    // 1023 is a reserved port.
    testModule.connect(1023, '::1').then((connectionId:string) => {
      // This code should not run, because localhost is blocked.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(socks.Reply.NOT_ALLOWED);
    }).then(done);
  });

  it('attempt to connect to a local network IP address while it is blocked', (done) => {
    var testModule = getTestModule(true);
    // 1023 is a reserved port.
    testModule.connect(1023, '10.5.5.5').then((connectionId:string) => {
      // This code should not run, because local network access is blocked.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(socks.Reply.NOT_ALLOWED);
    }).then(done);
  });

  it('connection refused from DNS name', (done) => {
    var testModule = getTestModule();
    // Many sites (such as uproxy.org) seem to simply ignore SYN packets on
    // unmonitored ports, but openbsd.org actually refuses the connection as
    // expected.
    testModule.connect(1023, 'openbsd.org').then((connectionId:string) => {
      // This code should not run, because there is no server on this port.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(socks.Reply.CONNECTION_REFUSED);
    }).then(done);
  });

  it('connection refused from DNS name while localhost is blocked', (done) => {
    var testModule = getTestModule(true);
    // Many sites (such as uproxy.org) seem to simply ignore SYN packets on
    // unmonitored ports, but openbsd.org actually refuses the connection as
    // expected.
    testModule.connect(1023, 'openbsd.org').then((connectionId:string) => {
      // This code should not run, because there is no server on this port.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      // This should be CONNECTION_REFUSED, but since we can't be sure that the
      // domain isn't on the local network, and we're concerned about port
      // scanning, we return the generic FAILURE code instead.
      // See https://github.com/uProxy/uproxy/issues/809.
      expect(e.reply).toEqual(socks.Reply.FAILURE);
    }).then(done);
  });

  // Disabled because HOST_UNREACHABLE is not yet exposed in freedom-for-chrome's
  // implementation of the core.tcpsocket API.
  //  https://github.com/freedomjs/freedom-for-chrome/issues/73
  xit('attempt to connect to a nonexistent DNS name', (done) => {
    var testModule = getTestModule(true);
    testModule.connect(80, 'www.nonexistentdomain.gov').then((connectionId:string) => {
      // This code should not run, because there is no such DNS name.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(socks.Reply.HOST_UNREACHABLE);
    }).then(done);
  });
};
