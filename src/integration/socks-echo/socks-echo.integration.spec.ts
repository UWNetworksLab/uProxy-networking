/// <reference path='../../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../third_party/typings/jasmine/jasmine.d.ts' />
/// <reference path="../../socks-common/socks-headers.d.ts" />

// Integration test for the whole proxying system.
// The real work is done in the Freedom module which performs each test.
describe('proxy integration tests', function() {
  var testModule :any;

  var testStrings = [
    'foo',
    'bar',
    'longer string',
    '1',
    'that seems like enough'
  ];

  beforeEach(function(done) {
    freedom('scripts/build/integration/socks-echo/integration.json',
            { 'debug': 'log' })
        .then((interface:any) => {
          testModule = interface();
          done();
        });
  });

  it('run a simple echo test', (done) => {
    var input = ArrayBuffers.stringToArrayBuffer('arbitrary test string');
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port);
    }).then((connectionId:string) => {
      return testModule.echo(connectionId, input);
    }).then((output:ArrayBuffer) => {
      expect(ArrayBuffers.byteEquality(input, output)).toBe(true);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run multiple echo tests in a batch on one connection', (done) => {
    var testBuffers = testStrings.map(ArrayBuffers.stringToArrayBuffer);
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port);
    }).then((connectionId:string) => {
      return testModule.echoMultiple(connectionId, testBuffers);
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
    testModule.startEchoServer(name).then((port:number) => {
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
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('connect to the same server multiple times in parallel', (done) => {
    testModule.startEchoServer().then((port:number) : Promise<any> => {
      var promises = testStrings.map((s:string) : Promise<void> => {
        var buffer = ArrayBuffers.stringToArrayBuffer(s);
        return testModule.connect(port).then((connectionId:string) => {
          return testModule.echo(connectionId, buffer);
        }).then((response:ArrayBuffer) => {
          expect(ArrayBuffers.byteEquality(buffer, response)).toBe(true);
        });
      });
      return Promise.all(promises);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('connect to many different servers in parallel', (done) => {
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

  it('run a localhost echo test while localhost is blocked.', (done) => {
    // Replace the test module with one that doesn't allow localhost access.
    freedom('scripts/build/integration/socks-echo/integration.json',
            { 'debug': 'log' })
        .then((interface:any) => {
          testModule = interface(true);  // Block localhost
          var input = ArrayBuffers.stringToArrayBuffer('arbitrary test string');
          testModule.startEchoServer().then((port:number) => {
            return testModule.connect(port);
          }).then((connectionId:string) => {
            // This code should not run, because testModule.connect() should
            // reject with a NOT_ALLOWED error.
            expect(connectionId).toBeUndefined();
          }, (e:any) => {
            expect(e.replyField).toEqual(Socks.Response.NOT_ALLOWED);
          }).then(done);
        });
  });

  it('Get a 404 from uproxy.org', (done) => {
    var nonExistentPath = '/noSuchPath';
    var input = ArrayBuffers.stringToArrayBuffer(
      'GET ' + nonExistentPath + ' HTTP/1.0\r\n\r\n');
    testModule.connect(80, 'uproxy.org').then((connectionId:string) => {
      return testModule.echo(connectionId, input);
    }).then((output:ArrayBuffer) => {
      var outputString = ArrayBuffers.arrayBufferToString(output);
      expect(outputString.indexOf('HTTP/1.0 404 Not Found')).not.toBe(-1);
      expect(outputString.indexOf(nonExistentPath)).not.toBe(-1);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('Get a 404 from uproxy.org while localhost is blocked.', (done) => {
    // Replace the test module with one that doesn't allow localhost access.
    freedom('scripts/build/integration/socks-echo/integration.json',
            { 'debug': 'log' })
        .then((interface:any) => {
          testModule = interface(true);  // Block localhost
          var nonExistentPath = '/noSuchPath';
          var input = ArrayBuffers.stringToArrayBuffer(
            'GET ' + nonExistentPath + ' HTTP/1.0\r\n\r\n');
          testModule.connect(80, 'uproxy.org').then((connectionId:string) => {
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

  // This test is disabled because the 'localhost' name seems to result in ECONNREFUSED,
  // and corporate DNS somehow blocks DNS names that resolve to nonpublic IP addresses.
  // Outside of a corporate firewall, this test ought to pass.
  xit('run a simple echo test to a DNS name that resolves to localhost', (done) => {
    var input = ArrayBuffers.stringToArrayBuffer('arbitrary test string');
    testModule.startEchoServer().then((port:number) => {
      return testModule.connect(port, 'www.127.0.0.1.xip.io');
    }).then((connectionId:string) => {
      return testModule.echo(connectionId, [input]);
    }).then((outputs:ArrayBuffer[]) => {
      expect(ArrayBuffers.byteEquality(input, outputs[0])).toBe(true);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  // Disabled for the same reason as above.
  xit('run a localhost-resolving DNS name echo test while localhost is blocked.', (done) => {
    // Replace the test module with one that doesn't allow localhost access.
    freedom('scripts/build/integration/socks-echo/integration.json',
            { 'debug': 'log' })
        .then((interface:any) => {
          testModule = interface(true);  // Block localhost
          var input = ArrayBuffers.stringToArrayBuffer('arbitrary test string');
          testModule.startEchoServer().then((port:number) => {
            return testModule.connect(port, 'www.127.0.0.1.xip.io');
          }).then((connectionId:string) => {
            // This code should not run, because testModule.connect() should
            // reject with a NOT_ALLOWED error.
            expect(connectionId).toBeUndefined();
          }, (e:any) => {
            expect(e.replyField).toEqual(Socks.Response.NOT_ALLOWED);
          }).then(done);
        });
  });

  // Disabled because CONNECTION_REFUSED is not yet implemented in RtcToNet.
  xit('attempt to connect to a nonexistent echo daemon', (done) => {
    testModule.connect(1023).then((connectionId:string) => {
      // This code should not run, because there is no server on this port.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.replyField).toEqual(Socks.Response.CONNECTION_REFUSED);
    }).then(done);
  });

  // Disabled because HOST_UNREACHABLE is not yet implemented in RtcToNet.
  xit('attempt to connect to a nonexistent DNS name', (done) => {
    testModule.connect(80, 'www.nonexistentdomain.gov').then((connectionId:string) => {
      // This code should not run, because there is no such DNS name.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.replyField).toEqual(Socks.Response.HOST_UNREACHABLE);
    }).then(done);
  });

  // Disabled because HOST_UNREACHABLE is not yet implemented in RtcToNet.
  xit('attempt to connect to a nonexistent IP address', (done) => {
    testModule.connect(80, '192.0.2.111').then((connectionId:string) => {
      // This code should not run, because this is a reserved IP address.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.replyField).toEqual(Socks.Response.HOST_UNREACHABLE);
    }).then(done);
  });
});
