// Based on http://www.html5rocks.com/en/tutorials/es6/promises/#toc-api

interface Thenable<T> {
  then:(fulfill:(t:T) => void,
        reject?:(e:Error) => void) => Thenable<T>;
}

/**
 * Generic Promise for built-in js Promises.
 *
 * T is the `fullfillment object` type given to onTulfilled function.
 *
 * The rejection object is always a javascript Error.
 */
declare class Promise<T> {

  constructor (f:(fulfill:(t:T)=>void,
                  reject:(e:Error)=>void)=>void);

  // |onTulfilled| either returns a promise...
  then<T2> (fulfill:(t:T) => Promise<T2>,
            reject?:(e:Error) => void)
      :Promise<T2>;

  // or the next fulfillment object directly.
  then<T2> (fulfill?:(t:T) => T2,
            reject?:(e:Error) => void)
      :Promise<T2>;

  catch (catchTn:(e:Error) => void)
      :Promise<T>;

  static resolve<T> (thenable:Thenable<T>)
      :Promise<T>;

  static resolve<T> (t?:T)
      :Promise<T>;

  static reject<T> (e:Error)
      :Promise<T>;

  static all<T> (...args:Thenable<T>[])
      :Promise<T>;

  static race<T> (...args:Thenable<T>[])
      :Promise<T>;

}
