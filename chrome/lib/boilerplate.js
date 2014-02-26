/*
  This is Freedom boilerplate to be removed eventually...
*/
window.freedomcfg = function(register) {
  // Necessary so we can actually use chrome sockets.
  register('core.socket', Sockets.Chrome);  // src/chrome-fsocket.ts
  register('core.udpsocket', UdpSocket.Chrome);  // src/chrome-udpsocket.ts
}
