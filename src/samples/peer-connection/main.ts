/// <reference path='../../peer-connection/peer-connection.d.ts' />
/// <reference path='../../peer-connection/data-channel.d.ts' />

//------------------------------------------------------------------------------
// Setup vars for dom elements & their behaviour.
var nameTextarea :HTMLInputElement = document.getElementById("name");
var connectionAddressesDiv :HTMLElement =
    document.getElementById("connectionAddresses");

var copyTextarea :HTMLInputElement = document.getElementById("copy");
var initiateConnectionButton :HTMLButtonElement =
    document.getElementById("initiateConnectionButton");
initiateConnectionButton.onclick = initiateConnection;

var pasteTextarea :HTMLInputElement = document.getElementById("paste");
var receiveButton :HTMLButtonElement =
    document.getElementById("handleRemoteConnectionButton");
receiveButton.onclick = onRemoteSignallingMessages;

var sendTextarea :HTMLInputElement = document.getElementById("message");
var sendButton :HTMLButtonElement =
    document.getElementById("sendmessageButton");
receiveButton.onclick = sendMessage;

//------------------------------------------------------------------------------
// Create a new peer connection.
var pcConfig :WebRtc.PeerConnectionConfig = {
    webrtcPcConfig: {
      iceServers: [{url: 'stun:stun.l.google.com:19302'},
                   {url: 'stun:stun1.l.google.com:19302'},
                   {url: 'stun:stun2.l.google.com:19302'},
                   {url: 'stun:stun3.l.google.com:19302'},
                   {url: 'stun:stun4.l.google.com:19302'}],
    },
    webrtcMediaContraints: {
      optional: [{DtlsSrtpKeyAgreement: true}]
    }
  };
var pc :WebRtc.PeerConnection = new WebRtc.PeerConnection(pcConfig);
pc.

//------------------------------------------------------------------------------
// called when the start button is clicked.
// only called on the initiating side.
function initiateConnection() {
  pc.negotiateConnection().then((connectionAddresses) => {
      sendTextarea.disabled=false;
      connectionAddressesDiv.value=JSON.stringify(connectionAddresses);
    });
  initiateConnectionButton.disabled=true;
}

// adds a message to the copy box.
function onLocalSignallingMessage(message) {
  copyTextarea.value = copyTextarea.value.trim() + '\n' +
      JSON.stringify(message);
}

// dispatches each line from the paste box as a signalling channel message.
function onRemoteSignallingMessages() {
  var messages = pasteTextarea.value.split('\n');
  for (var i = 0; i < messages.length; i++) {
    var s:string = messages[i];
    var message:WebRtc.SignallingMessage = JSON.parse(s);
    pc.message;
  }
}
