/// <reference path='tcp.d.ts' />

/// <reference path='../freedom/typings/freedom.d.ts' />

/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

describe('TCP wrapper', function() {
  it('runs', () => {
    expect(true).toEqual(true);
  });

  it('listens and echoes', (done) => {
    loadFreedom().then((interface:any) => {
      var module :any = interface();
      module.emit('listen');
      module.on('listen', done);
    });
  });

  it('shutdown', (done) => {
    loadFreedom().then((interface:any) => {
      var module :any = interface();
      module.emit('shutdown');
      module.on('shutdown', done);
    });
  });

  function loadFreedom() : Promise<any> {
    return freedom('scripts/build/tcp/freedom-module.json', { 'debug': 'log' });
  }
});
