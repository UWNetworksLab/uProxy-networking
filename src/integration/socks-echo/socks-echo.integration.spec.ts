/// <reference path='../../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../third_party/typings/jasmine/jasmine.d.ts' />

// Integration test for the whole proxying system.
// The real work is done in the Freedom module which performs each test.
describe('proxy integration tests', function() {
  var testModule :any;

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
    var testStrings = [
      'foo',
      'bar',
      'longer string',
      '1',
      'that seems like enough'
    ];
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

  it('run multiple echo tests in series', (done) => {
    var name = 'echo';
    var testStrings = [
      'foo',
      'bar',
      'longer string',
      '1',
      'that seems like enough'
    ];
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
});
