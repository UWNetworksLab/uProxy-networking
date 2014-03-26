declare module ArrayBuffers {
    /**
    * Converts an ArrayBuffer to a string.
    *
    * @param {ArrayBuffer} buffer The buffer to convert.
    */
    function arrayBufferToString(buffer: ArrayBuffer): string;
    /**
    * Converts a string to an ArrayBuffer.
    *
    * @param {string} s The string to convert.
    */
    function stringToArrayBuffer(s: string): ArrayBuffer;
    /**
    * Converts an ArrayBuffer to a string of hex codes and interpretations as
    * a char code.
    *
    * @param {ArrayBuffer} buffer The buffer to convert.
    */
    function arrayBufferToHexString(buffer: ArrayBuffer): string;
    /**
    * Converts a HexString of the regexp form /(hh\.)*hh/ where `h` is a
    * hex-character to an ArrayBuffer.
    *
    * @param {string} hexString The hexString to convert.
    */
    function hexStringToArrayBuffer(hexString: string): ArrayBuffer;
}
