// TODO(ldixon): update to a require-style inclusion.
// e.g.
// import Transformer = require('../../../third_party/uproxy-obfuscators/utransformer');
/// <reference path='../../../third_party/uproxy-obfuscators/utransformer.d.ts' />

import Transformer = UTransformers.Transformer;

/** An obfuscator which does nothing. */
class PassThrough implements Transformer {

  public setKey = (key:ArrayBuffer) => {}

  public configure = (json:string) : void => {}

  public transform = (buffer:ArrayBuffer) : ArrayBuffer => {
    return buffer;
  }

  public restore = (buffer:ArrayBuffer) : ArrayBuffer => {
    return buffer;
  }

  public dispose = () : void => {}
}

export = PassThrough;
