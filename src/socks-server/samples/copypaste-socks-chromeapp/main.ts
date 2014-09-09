/// <reference path='../../../freedom/typings/freedom.d.ts' />
/// <reference path='../../../webrtc/peerconnection.d.ts' />

// Freedom apps don't have direct access to the page so this
// file mediates between the page's controls and the Freedom app.

var startButton = document.getElementById("startButton");
var copyTextarea = <HTMLInputElement>document.getElementById("copy");
var pasteTextarea = <HTMLInputElement>document.getElementById("paste");
var receiveButton = document.getElementById("receiveButton");

startButton.onclick = start;
receiveButton.onclick = handleSignallingMessages;

// Tells the Freedom app to create an instance of the socks-to-rtc
// Freedom module and initiate a connection.
function start() {
  freedom.emit('start', {});
}

// Forwards each line from the paste box to the Freedom app, which
// interprets each as a signalling channel message. The Freedom app
// knows whether this message should be sent to the socks-to-rtc
// or rtc-to-net module.
function handleSignallingMessages() {
  var signals = pasteTextarea.value.split('\n');
  for (var i = 0; i < signals.length; i++) {
    var s:string = signals[i];
    var signal:WebRtc.SignallingMessage = JSON.parse(s);
    freedom.emit('handleSignalMessage', signal);
  }

  copyTextarea.value = '';
  pasteTextarea.value = '';
}

// Add signalling channel messages to the copy box.
// We don't care whether the message came from the socks-to-rtc or
// rtc-to-net module.
freedom.on('signalForPeer', (signal:WebRtc.SignallingMessage) => {
  copyTextarea.value = copyTextarea.value.trim() + '\n' + JSON.stringify(signal);
});
