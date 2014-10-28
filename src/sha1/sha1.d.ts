// TypeScript definitions for crypto's sha1 module.

declare module sha1 {
  /**
   * Computes the HMAC-SHA1 of some data, with the specified key.
   * Both key and data are interpreted as "binary strings" so to supply binary
   * data or key you can construct a string with the help of
   * String.fromCharCode(), e.g. [0x44, 0x5d, 0x75] -> 'D]u'.
   * Ditto for return type.
   */
  function str_hmac_sha1(key:string, data:string) : string

  /** As str_hmac_sha1 but returns a hex-formatted string. */
  function hex_hmac_sha1(key:string, data:string) : string
}
