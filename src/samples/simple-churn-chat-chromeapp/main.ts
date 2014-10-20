/// <reference path='../../freedom/typings/freedom.d.ts' />

var sendButtonA = document.getElementById("sendButtonA");
var sendButtonB = document.getElementById("sendButtonB");

var sendAreaA = <HTMLInputElement>document.getElementById("sendAreaA");
var sendAreaB = <HTMLInputElement>document.getElementById("sendAreaB");
var receiveAreaA = <HTMLInputElement>document.getElementById("receiveAreaA");
var receiveAreaB = <HTMLInputElement>document.getElementById("receiveAreaB");

freedom.on('ready', function() {
  console.log('peer connection established!');
  sendAreaA.disabled = false;
  sendAreaB.disabled = false;
});

freedom.on('error', function() {
  console.error('something went wrong with the peer connection');
  sendAreaA.disabled = true;
  sendAreaB.disabled = true;
});

function send(suffix:string, textArea:HTMLInputElement) {
  // Currently, PeerConnection does not support empty text messages:
  //   https://github.com/freedomjs/freedom/issues/67
  freedom.emit('send' + suffix, textArea.value || '(empty message)');
}
sendButtonA.onclick = send.bind(null, 'A', sendAreaA);
sendButtonB.onclick = send.bind(null, 'B', sendAreaB);

function receive(textArea:HTMLInputElement, message:string) {
  textArea.value = message;
}
freedom.on('receiveA', receive.bind(null, receiveAreaA));
freedom.on('receiveB', receive.bind(null, receiveAreaB));
