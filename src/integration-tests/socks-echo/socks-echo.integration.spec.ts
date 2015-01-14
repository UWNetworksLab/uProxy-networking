/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../third_party/typings/jasmine/jasmine.d.ts' />

// Integration test for the whole proxying system.
// The real work is done in the Freedom module which performs each test.
describe('proxy integration tests', function() {
  var testModule :any;

  var str2ab = (s:string) : ArrayBuffer => {
    var byteArray = new Uint8Array(s.length);
    for (var i = 0; i < s.length; ++i) {
      byteArray[i] = s.charCodeAt(i);
    }
    return byteArray.buffer;
  };

  beforeEach(function(done) {
    freedom('scripts/build/integration-tests/socks-echo/integration.json',
            { 'debug': 'log' })
        .then((interface:any) => {
          testModule = interface();
          done();
        });
  });

  it('run a simple echo test', (done) => {
    var input = str2ab('arbitrary test string');
    testModule.singleEchoTest(input).then((output:ArrayBuffer) => {
      expect(new Uint8Array(output)).toEqual(new Uint8Array(input));
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run multiple echo tests in parallel', (done) => {
    var testStrings = [
      'foo',
      'bar',
      'longer string',
      '1',
      'that seems like enough'
    ];
    var testBuffers = testStrings.map(str2ab);
    var testArrays = testBuffers.map((b) => { return new Uint8Array(b); });
    testModule.parallelEchoTest(testBuffers).then((outputs:ArrayBuffer[]) => {
      var outputArrays = outputs.map((b) => { return new Uint8Array(b); });
      // The responses may be out of order, so we can't just compare directly.
      // This could be algorithmically faster using sorting, but I'm not sure
      // that comparison will work as expected for Uint8Arrays.
      testArrays.forEach((testArray) => {
        expect(outputArrays).toContain(testArray);
      });
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });

  it('run multiple echo tests in series', (done) => {
    var testStrings = [
      'foo',
      'bar',
      'longer string',
      '1',
      'that seems like enough'
    ];
    var testBuffers = testStrings.map(str2ab);
    var testArrays = testBuffers.map((b) => { return new Uint8Array(b); });
    testModule.serialEchoTest(testBuffers).then((outputs:ArrayBuffer[]) => {
      var outputArrays = outputs.map((b) => { return new Uint8Array(b); });
      // Order should be preserved in this test.
      expect(outputArrays).toEqual(testArrays);
    }).catch((e:any) => {
      expect(e).toBeUndefined();
    }).then(done);
  });
});
