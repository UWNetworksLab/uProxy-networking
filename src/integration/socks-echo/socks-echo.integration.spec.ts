/// <reference path='../../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../third_party/typings/jasmine/jasmine.d.ts' />
/// <reference path="../../socks-common/socks-headers.d.ts" />

// Integration test for the whole proxying system.
// The real work is done in the Freedom module which performs each test.
describe('proxy integration tests', function() {
  var testStrings = [
    'foo',
    'bar',
    'longer string',
    '1',
    'that seems like enough'
  ];

  var getTestModule = function(denyLocalhost?:boolean) : any {
    return freedom('scripts/build/integration/socks-echo/integration.json',
            { 'debug': 'log' })
        .then((interface:any) => {
          return interface(denyLocalhost);
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

  it('Get a 404 from uproxy.org', (done) => {
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

  it('Get a 404 from uproxy.org while localhost is blocked.', (done) => {
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

  // This test is disabled because it times out instead of returning an error.
  // TODO: Re-enable when fixing https://github.com/uProxy/uproxy/issues/800
  xit('run a localhost-resolving DNS name echo test while localhost is blocked.', (done) => {
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
      // resolution succeeds.
      var expectedReplies = [Socks.Reply.NOT_ALLOWED, Socks.Reply.FAILURE];
      expect(expectedReplies).toContain(e.reply);
    }).then(done);
  });

  // Disabled because CONNECTION_REFUSED is not yet implemented in RtcToNet.
  // Tracked by https://github.com/uProxy/uproxy/issues/800
  xit('attempt to connect to a nonexistent echo daemon', (done) => {
    getTestModule(true).then((testModule:any) => {
      return testModule.connect(1023);  // 1023 is a reserved port.
    }).then((connectionId:string) => {
      // This code should not run, because there is no server on this port.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(Socks.Reply.CONNECTION_REFUSED);
    }).then(done);
  });

  // Disabled because HOST_UNREACHABLE is not yet implemented in RtcToNet.
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

  // Disabled because HOST_UNREACHABLE is not yet implemented in RtcToNet.
  xit('attempt to connect to a nonexistent IP address', (done) => {
    getTestModule(true).then((testModule:any) => {
      // 192.0.2.0/24 is a reserved IP address range.
      return testModule.connect(80, '192.0.2.111');
    }).then((connectionId:string) => {
      // This code should not run, because this is a reserved IP address.
      expect(connectionId).toBeUndefined();
    }).catch((e:any) => {
      expect(e.reply).toEqual(Socks.Reply.HOST_UNREACHABLE);
    }).then(done);
  });
});
