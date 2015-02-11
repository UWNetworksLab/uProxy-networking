/// <reference path='../../../build/third_party/freedom-typings/freedom-core-env.d.ts' />
/// <reference path='../../../build/third_party/typings/jasmine/jasmine.d.ts' />

import arraybuffers = require('../../../build/dev/arraybuffers/arraybuffers');
import socks = require('../../socks-common/socks-headers');

// Integration test for the whole proxying system.
// The real work is done in the Freedom module which performs each test.
var socksEchoTestDescription = function(useChurn:boolean) {
  var testStrings = [
    'foo',
    'bar',
    'longer string',
    '1',
    'that seems like enough'
  ];

  var getTestModule = function(denyLocalhost?:boolean) : any {
    return freedom('scripts/build/integration/socks-echo/integration.json',
            { 'debug': 'debug' })
        .then((interface:any) => {
          return interface(denyLocalhost, useChurn);
        });
  };

  it('run a simple echo test', (done) => {
    var input = ArrayBuffers.stringToArrayBuffer('arbitrary test string');
    getTestModule().then((testModule:any) => {
      return testModule.startEchoServer().then((port:number) => {
        return testModule.connect(port);
      }).then((connectionId:string) => {
        return testModule.echo(connectionId, input);
      });
    }).then((output:ArrayBuffer) => {
      expect(ArrayBuffers.byteEquality(input, output)).toBe(true);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run multiple echo tests in a batch on one connection', (done) => {
    var testBuffers = testStrings.map(ArrayBuffers.stringToArrayBuffer);
    getTestModule().then((testModule:any) => {
      return testModule.startEchoServer().then((port:number) => {
        return testModule.connect(port);
      }).then((connectionId:string) => {
        return testModule.echoMultiple(connectionId, testBuffers);
      });
    }).then((outputs:ArrayBuffer[]) => {
      for (var i = 0; i < testBuffers.length; ++i) {
        expect(ArrayBuffers.byteEquality(testBuffers[i], outputs[i])).toBe(true);
      }
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run multiple echo tests in series on one connection', (done) => {
    var testBuffers = testStrings.map(ArrayBuffers.stringToArrayBuffer);
    getTestModule().then((testModule:any) => {
      return testModule.startEchoServer().then((port:number) => {
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
              expect(ArrayBuffers.byteEquality(testBuffers[i], echo)).toBe(true);
              ++i;
            }).then(step);
          };
          step();
        });
      });
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('connect to the same server multiple times in parallel', (done) => {
    getTestModule().then((testModule:any) => {
      return testModule.startEchoServer().then((port:number) : Promise<any> => {
        var promises = testStrings.map((s:string) : Promise<void> => {
          var buffer = ArrayBuffers.stringToArrayBuffer(s);
          return testModule.connect(port).then((connectionId:string) => {
            return testModule.echo(connectionId, buffer);
          }).then((response:ArrayBuffer) => {
            expect(ArrayBuffers.byteEquality(buffer, response)).toBe(true);
          });
        });
        return Promise.all(promises);
      });
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('connect to many different servers in parallel', (done) => {
    getTestModule().then((testModule:any) => {
      var promises = testStrings.map((s:string) : Promise<void> => {
        var buffer = ArrayBuffers.stringToArrayBuffer(s);

        // For each string, start a new echo server with that name, and
        // then echo that string from that server.
        return testModule.startEchoServer().then((port:number) => {
          return testModule.connect(port);
        }).then((connectionId:string) => {
          return testModule.echo(connectionId, buffer);
        }).then((response:ArrayBuffer) => {
          expect(ArrayBuffers.byteEquality(buffer, response)).toBe(true);
        });
      });

      Promise.all(promises).catch((e:any) => {
        expect(e).toBeUndefined();
      }).then(done);
    });
  });

  it('run a localhost echo test while localhost is blocked.', (done) => {
    // Get a test module that doesn't allow localhost access.
    getTestModule(true).then((testModule:any) => {
      return testModule.startEchoServer().then((port:number) => {
        return testModule.connect(port);
      });
    }).then((connectionId:string) => {
      // This code should not run, because testModule.connect() should
      // reject with a NOT_ALLOWED error.
      expect(connectionId).toBeUndefined();
    }, (e:any) => {
      expect(e.reply).toEqual(Socks.Reply.NOT_ALLOWED);
    }).then(done);
  });

  it('fetch from non-localhost address', (done) => {
    var nonExistentPath = '/noSuchPath';
    var input = ArrayBuffers.stringToArrayBuffer(
        'GET ' + nonExistentPath + ' HTTP/1.0\r\n\r\n');
    getTestModule().then((testModule:any) => {
      return testModule.connect(80, 'uproxy.org').then((connectionId:string) => {
        return testModule.echo(connectionId, input);
      });
    }).then((output:ArrayBuffer) => {
      var outputString = ArrayBuffers.arrayBufferToString(output);
      expect(outputString.indexOf('HTTP/1.0 404 Not Found')).not.toBe(-1);
      expect(outputString.indexOf(nonExistentPath)).not.toBe(-1);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('fetch from non-localhost address while localhost is blocked.', (done) => {
    var nonExistentPath = '/noSuchPath';
    var input = ArrayBuffers.stringToArrayBuffer(
        'GET ' + nonExistentPath + ' HTTP/1.0\r\n\r\n');
    getTestModule(true).then((testModule:any) => {
      return testModule.connect(80, 'uproxy.org').then((connectionId:string) => {
        return testModule.echo(connectionId, input);
      });
    }).then((output:ArrayBuffer) => {
      var outputString = ArrayBuffers.arrayBufferToString(output);
      expect(outputString.indexOf('HTTP/1.0 404 Not Found')).not.toBe(-1);
      expect(outputString.indexOf(nonExistentPath)).not.toBe(-1);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('do a request that gets blocked, then another that succeeds.', (done) => {
    var nonExistentPath = '/noSuchPath';
    var input = ArrayBuffers.stringToArrayBuffer(
        'GET ' + nonExistentPath + ' HTTP/1.0\r\n\r\n');
    // Get a test module that doesn't allow localhost access.
    getTestModule(true).then((testModule:any) => {
      // Try to connect to localhost, and fail
      testModule.connect(1023).then((connectionId:string) => {
        // This code should not run, because testModule.connect() should
        // reject with a NOT_ALLOWED error.
        expect(connectionId).toBeUndefined();
      }, (e:any) => {
        expect(e.reply).toEqual(Socks.Reply.NOT_ALLOWED);
      }).then(() => {
        // After the first request fails, try to fetch uproxy.org.
        return testModule.connect(80, 'uproxy.org');
      }).then((connectionId:string) => {
        return testModule.echo(connectionId, input);
      }).then((output:ArrayBuffer) => {
        var outputString = ArrayBuffers.arrayBufferToString(output);
        expect(outputString.indexOf('HTTP/1.0 404 Not Found')).not.toBe(-1);
        expect(outputString.indexOf(nonExistentPath)).not.toBe(-1);
      }).catch((e:any) => {
        expect(e).toBeUndefined();
      }).then(done);
    });
  });

  it('run a localhost-resolving DNS name echo test while localhost is blocked.', (done) => {
    // Get a test module with one that doesn't allow localhost access.
    getTestModule(true).then((testModule:any) => {
      return testModule.startEchoServer().then((port:number) => {
        return testModule.connect(port, 'www.127.0.0.1.xip.io');
      });
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
      expect(e.reply).toEqual(Socks.Reply.FAILURE);
    }).then(done);
  });

  it('attempt to connect to a nonexistent echo daemon', (done) => {
    getTestModule().then((testModule:any) => {
      return testModule.connect(1023);  // 1023 is a reserved port.
    }).then((connectionId:string) => {
      // This code should not run, because there is no server on this port.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(Socks.Reply.CONNECTION_REFUSED);
    }).then(done);
  });

  it('attempt to connect to a nonexistent echo daemon while localhost is blocked', (done) => {
    getTestModule(true).then((testModule:any) => {
      return testModule.connect(1023);  // 1023 is a reserved port.
    }).then((connectionId:string) => {
      // This code should not run, because localhost is blocked.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(Socks.Reply.NOT_ALLOWED);
    }).then(done);
  });

  it('attempt to connect to a nonexistent local echo daemon while localhost is blocked as 0.0.0.0', (done) => {
    getTestModule(true).then((testModule:any) => {
      return testModule.connect(1023, '0.0.0.0');  // 1023 is a reserved port.
    }).then((connectionId:string) => {
      // This code should not run because the destination is invalid.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      // TODO: Make this just NOT_ALLOWED once this bug in ipadddr.js is fixed:
      // https://github.com/whitequark/ipaddr.js/issues/9
      expect([Socks.Reply.NOT_ALLOWED, Socks.Reply.FAILURE]).toContain(e.reply);
    }).then(done);
  });

  it('attempt to connect to a nonexistent local echo daemon while localhost is blocked as IPv6', (done) => {
    getTestModule(true).then((testModule:any) => {
      return testModule.connect(1023, '::1');  // 1023 is a reserved port.
    }).then((connectionId:string) => {
      // This code should not run, because localhost is blocked.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(Socks.Reply.NOT_ALLOWED);
    }).then(done);
  });

  it('attempt to connect to a local network IP address while it is blocked', (done) => {
    getTestModule(true).then((testModule:any) => {
      return testModule.connect(1023, '10.5.5.5');  // 1023 is a reserved port.
    }).then((connectionId:string) => {
      // This code should not run, because local network access is blocked.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(Socks.Reply.NOT_ALLOWED);
    }).then(done);
  });

  it('connection refused from DNS name', (done) => {
    getTestModule().then((testModule:any) => {
      // Many sites (such as uproxy.org) seem to simply ignore SYN packets on
      // unmonitored ports, but openbsd.org actually refuses the connection as
      // expected.
      return testModule.connect(1023, 'openbsd.org');
    }).then((connectionId:string) => {
      // This code should not run, because there is no server on this port.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(Socks.Reply.CONNECTION_REFUSED);
    }).then(done);
  });

  it('connection refused from DNS name while localhost is blocked', (done) => {
    getTestModule(true).then((testModule:any) => {
      // Many sites (such as uproxy.org) seem to simply ignore SYN packets on
      // unmonitored ports, but openbsd.org actually refuses the connection as
      // expected.
      return testModule.connect(1023, 'openbsd.org');
    }).then((connectionId:string) => {
      // This code should not run, because there is no server on this port.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      // This should be CONNECTION_REFUSED, but since we can't be sure that the
      // domain isn't on the local network, and we're concerned about port
      // scanning, we return the generic FAILURE code instead.
      // See https://github.com/uProxy/uproxy/issues/809.
      expect(e.reply).toEqual(Socks.Reply.FAILURE);
    }).then(done);
  });

  // Disabled because HOST_UNREACHABLE is not yet exposed in freedom-for-chrome's
  // implementation of the core.tcpsocket API.
  xit('attempt to connect to a nonexistent DNS name', (done) => {
    getTestModule(true).then((testModule:any) => {
      return testModule.connect(80, 'www.nonexistentdomain.gov');
    }).then((connectionId:string) => {
      // This code should not run, because there is no such DNS name.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(Socks.Reply.HOST_UNREACHABLE);
    }).then(done);
  });
};
