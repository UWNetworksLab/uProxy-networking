/// <reference path='../../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../third_party/typings/jasmine/jasmine.d.ts' />

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
    var name = 'echo';
    var input = ArrayBuffers.stringToArrayBuffer('arbitrary test string');
    testModule.startEchoServer(name).then(() => {
      return testModule.connect(name);
    }).then((connectionId:string) => {
      return testModule.echo(connectionId, [input]);
    }).then((outputs:ArrayBuffer[]) => {
      expect(ArrayBuffers.byteEquality(input, outputs[0])).toBe(true);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run multiple echo tests in a batch on one connection', (done) => {
    var name = 'echo';
    var testBuffers = testStrings.map(ArrayBuffers.stringToArrayBuffer);
    testModule.startEchoServer(name).then(() => {
      return testModule.connect(name);
    }).then((connectionId:string) => {
      return testModule.echo(connectionId, testBuffers);
    }).then((outputs:ArrayBuffer[]) => {
      for (var i = 0; i < testBuffers.length; ++i) {
        expect(ArrayBuffers.byteEquality(testBuffers[i], outputs[i])).toBe(true);
      }
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run multiple echo tests in series on one connection', (done) => {
    var name = 'echo';
    var testBuffers = testStrings.map(ArrayBuffers.stringToArrayBuffer);
    testModule.startEchoServer(name).then(() => {
      return testModule.connect(name);
    }).then((connectionId:string) => {
      var i = 0;
      return new Promise<void>((F, R) => {
        var step = () => {
          if (i == testBuffers.length) {
            F();
            return;
          }
          testModule.echo(connectionId, [testBuffers[i]])
              .then((echoes:ArrayBuffer[]) => {
            expect(ArrayBuffers.byteEquality(testBuffers[i], echoes[0])).toBe(true);
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
    var name = 'echo';
    testModule.startEchoServer(name).then(() : Promise<any> => {
      var promises = testStrings.map((s:string) : Promise<void> => {
        var buffer = ArrayBuffers.stringToArrayBuffer(s);
        return testModule.connect(name).then((connectionId:string) => {
          return testModule.echo(connectionId, [buffer]);
        }).then((response:ArrayBuffer[]) => {
          expect(ArrayBuffers.byteEquality(buffer, response[0])).toBe(true);
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
      return testModule.startEchoServer(s).then(() => {
        return testModule.connect(s);
      }).then((connectionId:string) => {
        return testModule.echo(connectionId, [buffer]);
      }).then((response:ArrayBuffer[]) => {
        expect(ArrayBuffers.byteEquality(buffer, response[0])).toBe(true);
      });
    });

    Promise.all(promises).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });
});
