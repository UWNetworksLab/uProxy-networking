// Based on http://www.html5rocks.com/en/tutorials/es6/promises/#toc-api

interface Thenable<F,R> {
  then:(onFulfilled:(F) => void,
        onRejected:(R) => void) => Thenable<F,R>;
}

/**
 * Generic Promise class.
 *
 * F is the `fullfilled` type given to onFulfilled function.
 * R is the `rejected` type given to the onRejected object.
 */
declare class Promise<F,R> {

  constructor (f:(onFulfilled:(fulfillObj:F)=>void,
                  onRejected:(rejectObj?:R)=>void)=>void);

  then<F2,R2> (onFulfilled:(F) => Promise<F2,R2>,
               onRejected?:(R) => void)
      :Promise<F2,R2>;

  catch (catchFn:(rejectObj:R) => void)
      :Promise<F,R>;

  static resolve<F,R> (thenable:Thenable<F,R>)
      :Promise<F,R>;

  static resolve<F,R> (fulfillObj:F)
      :Promise<F,R>;

  static reject<F,R>  (rejectObj:R)
      :Promise<F,R>;

  static all<F,R> (...args:Thenable<F,R>[])
      :Promise<F,R>;

  static race<F,R> (...args:Thenable<F,R>[])
      :Promise<F,R>;

}
