// This file provides the declarations for the Rabbit and Fte uTransformers
// modules.

export interface Transformer {
  /**
   * Sets the key for this transformer session.
   *
   * @param {ArrayBuffer} key session key.
   * @return {boolean} true if successful.
   */
  setKey(key:ArrayBuffer) : void;

  /**
   * Configures this transformer.
   *
   * @param {String} serialized Json string.
   */
  configure(json:string) : void;

  /**
   * Transforms a piece of data to obfuscated form.
   *
   * @param {ArrayBuffer} plaintext data need to be obfuscated.
   * @return {?ArrayBuffer} obfuscated data, or null if failed.
   */
  transform(buffer:ArrayBuffer) : ArrayBuffer;

  /**
   * Restores data from obfuscated form to original form.
   *
   * @param {ArrayBuffer} ciphertext obfuscated data.
   * @return {?ArrayBuffer} original data, or null if failed.
   */
  restore(buffer:ArrayBuffer) : ArrayBuffer;

  /**
   * Dispose the transformer.
   *
   * This should be the last method called on a transformer instance.
   */
  dispose() : void;
}

declare module "utransformers/src/transformers/uTransformer.fte" {
  export class Transformer implements Transformer {}
}

declare module "utransformers/src/transformers/uTransformer.rabbit" {
  export class Transformer implements Transformer {}
}
