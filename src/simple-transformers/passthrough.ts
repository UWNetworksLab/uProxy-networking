import Transformer = require('../../build/third_party/uproxy-obfuscators/utransformer');

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
