/// <reference path='../../freedom/typings/freedom.d.ts' />

var sendButtonA = document.getElementById("sendButtonA");
var sendButtonB = document.getElementById("sendButtonB");

var sendAreaA = <HTMLInputElement>document.getElementById("sendAreaA");
var sendAreaB = <HTMLInputElement>document.getElementById("sendAreaB");
var receiveAreaA = <HTMLInputElement>document.getElementById("receiveAreaA");
var receiveAreaB = <HTMLInputElement>document.getElementById("receiveAreaB");

freedom('freedom-module.json', { 'debug': 'debug' }).then(function(interface:any) {
  var simpleChurnChat :any = interface();

  simpleChurnChat.on('ready', function() {
    sendAreaA.disabled = false;
    sendAreaB.disabled = false;
  });

  simpleChurnChat.on('error', function() {
    sendAreaA.disabled = true;
    sendAreaB.disabled = true;
  });

  function send(suffix:string, textArea:HTMLInputElement) {
    // Currently, PeerConnection does not support empty text messages:
    //   https://github.com/freedomjs/freedom/issues/67
    simpleChurnChat.emit('send' + suffix, textArea.value || '(empty message)');
  }
  sendButtonA.onclick = send.bind(null, 'A', sendAreaA);
  sendButtonB.onclick = send.bind(null, 'B', sendAreaB);

  function receive(textArea:HTMLInputElement, message:string) {
    textArea.value = message;
  }
  simpleChurnChat.on('receiveA', receive.bind(null, receiveAreaA));
  simpleChurnChat.on('receiveB', receive.bind(null, receiveAreaB));
}, (e:Error) => {
  console.error('could not load freedom: ' + e.message);
});
