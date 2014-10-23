/// <reference path='../utransformers/interfaces/utransformer.d.ts' />

module Transformers {
  /** An obfuscator which does nothing. */
  export class PassThrough implements UTransformers.Transformer {

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
}
