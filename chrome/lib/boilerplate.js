/*
  This is Freedom boilerplate to be removed eventually...
*/
window.freedomcfg = function(register) {
  // Necessary until core.udpsocket is in freedom-runtime-chrome.
  register('core.udpsocket', UdpSocket.Chrome);  // src/chrome-udpsocket.ts
}
