// This file provides the freedom interface that is available to a freedom
// module created via a call to `freedom.['moduleName']()`. Note: this is the
// inverse of what you see at the bottom of the main module file (socks-to-rtc-
// to-net in this case).

declare module freedom {
  interface EchoServer {
    // CONSIDER: this currently just starts everything when created; maybe
    // better to have a start/stop style interface like other tests/modules?
  }
}
