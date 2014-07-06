/// <reference path='../../peer-connection/peer-connection.d.ts' />
/// <reference path='../../peer-connection/data-channel.d.ts' />

//------------------------------------------------------------------------------
// Setup vars for dom elements & their behaviour.
var nameTextarea = <HTMLInputElement>document.getElementById('name');

var errorDiv = document.getElementById('error');
var stateDiv = document.getElementById('state');
var connectionAddressesDiv =
    document.getElementById('connectionAddresses');

var copyTextarea = <HTMLInputElement>document.getElementById('copy');
var initiateConnectionButton =
    <HTMLButtonElement>document.getElementById('initiateConnectionButton');
initiateConnectionButton.onclick = initiateConnection;

var pasteTextarea = <HTMLInputElement>document.getElementById('paste');
var receiveButton =
    <HTMLButtonElement>document.getElementById('handleRemoteConnectionButton');
receiveButton.onclick = onRemoteSignallingMessages;

var messages = document.getElementById('messages');

var channelLabelInput = <HTMLInputElement>document.getElementById('label');
var sendMessageInput = <HTMLInputElement>document.getElementById('message');
var sendButton =
    <HTMLButtonElement>document.getElementById('sendMessageButton');
sendButton.onclick = sendMessage;

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
    webrtcMediaConstraints: {
      optional: [{DtlsSrtpKeyAgreement: true}]
    }
  };
var pc :WebRtc.PeerConnection = new WebRtc.PeerConnection(pcConfig);
pc.toPeerSignalQueue.setSyncHandler(onLocalSignallingMessage);

stateDiv.innerText = 'WAITING.';

pc.onceConnecting.then(() => {
    stateDiv.innerText = 'CONNECTING...';
  });

pc.onceConnected.then((addresses) => {
    stateDiv.innerText = 'CONNECTED!';
    connectionAddressesDiv.innerText = JSON.stringify(addresses);
    sendTextarea.disabled=false;
    receiveButton.disabled=true;
    pasteTextarea.disabled=true;
  });

pc.onceDisconnected.then(() => {
    stateDiv.innerText = 'DISCONNECTED.';
    sendButton.disabled=true;
    sendTextarea.disabled=true;
  });

//------------------------------------------------------------------------------
// called when the start button is clicked.
// only called on the initiating side.
function initiateConnection() {
  console.log('initiateConnection');
  pc.negotiateConnection().catch((e) => {
    errorDiv.innerText = 'ERROR: ' + e.toString();
  });
  initiateConnectionButton.disabled=true;
};

// Adds a signal to the copy box.
function onLocalSignallingMessage(signal:WebRtc.SignallingMessage) {
  console.log('onLocalSignallingMessage');
  copyTextarea.value = copyTextarea.value.trim() + '\n' +
      JSON.stringify(signal);
};

// dispatches each line from the paste box as a signalling channel message.
function onRemoteSignallingMessages() {
  console.log('onRemoteSignallingMessages');
  var messages = pasteTextarea.value.split('\n');
  for (var i = 0; i < messages.length; i++) {
    var s:string = messages[i];
    var signal:WebRtc.SignallingMessage = JSON.parse(s);
    pc.handleSignalMessage(signal);
  }
};

function sendMessage() {
  channelLabelInput
}
