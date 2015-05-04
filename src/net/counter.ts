/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />

// Counts calls to an object with asynchronous functions, running some
// function once that counter reaches zero *and* a discard() function
// has been called.
// Intended for safely destroying freedomjs providers, which may emit
// disconnect notifications before all outstanding calls have resolved.

// Sandwiches a call, using the given call counter.
export function wrap<T>(
    counter:Counter,
    f:() => Promise<T>) : Promise<T> {
  // expect() should never throw.
  counter.before();
  return f().then((result:T) => {
    counter.after();
    return result;
  }, (e:Error) => {
    counter.after();
    throw e;
  });
}

// Counts calls, notifying when discard() has been called and there are no
// more calls inflight.
export class Counter {
  private counter_ = 0;

  private fulfillDestroyed_ :() => void;
  private rejectDestroyed_ :(e:Error) => void;
  private onceDestroyed_ = new Promise<void>((F, R) => {
    this.fulfillDestroyed_ = F;
    this.rejectDestroyed_ = R;
  });

  constructor(private destructor_ :() => void) {}

  public discard = () : void => {
    this.after();
  }

  public onceDestroyed = () : Promise<void> => {
    return this.onceDestroyed_;
  }

  // Intended for use only by wrap().
  public before = () : void => {
    this.counter_++;
  }

  // Intended for use only by wrap().
  public after = () : void => {
    this.counter_--;
    if (this.counter_ < 0) {
      try {
        this.destructor_();
        this.fulfillDestroyed_();
      } catch (e) {
        this.rejectDestroyed_(e);
      }
    }
  }
}
