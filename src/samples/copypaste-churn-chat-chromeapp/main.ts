/// <reference path='messages.d.ts' />
/// <reference path='../../churn/churn.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />

var startButton = document.getElementById("startButton");
startButton.onclick = start;
var copyTextarea = <HTMLInputElement>document.getElementById("copy");
var pasteTextarea = <HTMLInputElement>document.getElementById("paste");
var receiveButton = document.getElementById("receiveButton");
receiveButton.onclick = handleSignallingMessages;

function start() {
  freedom.emit('start', {});
}

freedom.on('signalForPeer', (signal:Churn.ChurnSignallingMessage) => {
  copyTextarea.value = copyTextarea.value.trim() + '\n' + JSON.stringify(signal);
});

// Dispatches each line from the paste box as a signalling channel message.
function handleSignallingMessages() {
  var signals = pasteTextarea.value.split('\n');
  for (var i = 0; i < signals.length; i++) {
    var s:string = signals[i];
    var signal:Churn.ChurnSignallingMessage = JSON.parse(s);
    freedom.emit('handleSignalMessage', signal);
  }

  // "Flush" the signalling channels.
  copyTextarea.value = '';
  pasteTextarea.value = '';
}

var sendButton = document.getElementById("sendButton");

var sendArea = <HTMLInputElement>document.getElementById("sendArea");
var receiveArea = <HTMLInputElement>document.getElementById("receiveArea");

freedom.on('ready', function() {
  console.log('peer connection established!');
  sendArea.disabled = false;
});

freedom.on('error', function() {
  console.error('something went wrong with the peer connection');
  sendArea.disabled = true;
});

sendButton.onclick = function() {
  freedom.emit('send', {
    // Currently, PeerConnection does not support empty text messages:
    //   https://github.com/freedomjs/freedom/issues/67
    message: sendArea.value || '(empty message)'
  });
}

freedom.on('receive', function(msg:Chat.Message) {
  receiveArea.value = msg.message;
});
