/// <reference path='../../../freedom/typings/freedom.d.ts' />
/// <reference path='../../../webrtc/peerconnection.d.ts' />

var startButton = document.getElementById("startButton");
startButton.onclick = start;
var copyTextarea = <HTMLInputElement>document.getElementById("copy");
var pasteTextarea = <HTMLInputElement>document.getElementById("paste");
var receiveButton = document.getElementById("receiveButton");
receiveButton.onclick = handleSignallingMessages;

function start() {
  freedom.emit('start', {});
}

freedom.on('signalForPeer', (signal:WebRtc.SignallingMessage) => {
  copyTextarea.value = copyTextarea.value.trim() + '\n' + JSON.stringify(signal);
});

// Dispatches each line from the paste box as a signalling channel message.
function handleSignallingMessages() {
  var signals = pasteTextarea.value.split('\n');
  for (var i = 0; i < signals.length; i++) {
    var s:string = signals[i];
    var signal:WebRtc.SignallingMessage = JSON.parse(s);
    freedom.emit('handleSignalMessage', signal);
  }

  // "Flush" the signalling channels.
  copyTextarea.value = '';
  pasteTextarea.value = '';
}
