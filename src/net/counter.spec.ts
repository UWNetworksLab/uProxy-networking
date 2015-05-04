/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import counter = require('./counter');

describe('socket call counter', function() {
  // One wrapped call, then destroy.
  it('simple wrap', (done) => {
    var destroyCalled = false;
    var destructor = () => {
      destroyCalled = true;
    };

    var callCounter = new counter.Counter(destructor);
    spyOn(callCounter, 'before').and.callThrough();
    spyOn(callCounter, 'after').and.callThrough();

    counter.wrap(callCounter, () => {
      expect(callCounter.before).toHaveBeenCalled();
      expect(callCounter.after).not.toHaveBeenCalled();

      return Promise.resolve(1);
    }).then((result:number) => {
      expect(result).toEqual(1);
      expect(callCounter.after).toHaveBeenCalled();
      expect(destroyCalled).toBeFalsy();

      callCounter.discard();
    });

    callCounter.onceDestroyed().then(() => {
      expect(destroyCalled).toBeTruthy();
      done();
    });
  });
});
