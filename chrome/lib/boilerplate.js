/*
  This is Freedom boilerplate to be removed eventually...
*/
window.freedomcfg = function(register) {
  // Necessary so we can actually use chrome sockets.
  register('core.socket', ChromeSockets);  // src/chrome-fsocket.ts
}
