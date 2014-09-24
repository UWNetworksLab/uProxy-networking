/// <reference path='../../../freedom/typings/freedom.d.ts' />
/// <reference path='../../../webrtc/peerconnection.d.ts' />

// Freedom apps don't have direct access to the page so this
// file mediates between the page's controls and the Freedom app.


// DOM nodes. Locate all nodes of interest up front here to avoid code clutter
// later on.
var getAccessPanelNode = <HTMLElement>document.getElementById('getAccessPanel');
var getAccessPanel_consumeInboundMessageButtonNode = <HTMLElement>document.getElementById('getAccessPanel_consumeInboundMessageButton');
var getAccessPanel_generateIceCandidatesButton = <HTMLElement>document.getElementById('getAccessPanel_generateIceCandidatesButton');
var getAccessPanel_inboundMessageNode = <HTMLInputElement>document.getElementById('getAccessPanel_inboundMessage');
var getAccessPanel_outboundMessageNode = <HTMLInputElement>document.getElementById('getAccessPanel_outboundMessage');
var getAccessPanel_step2ContainerNode = <HTMLElement>document.getElementById('getAccessPanel_step2Container');
var giveAccessPanelNode = <HTMLElement>document.getElementById('giveAccessPanel');
var giveAccessPanel_consumeInboundMessageButtonNode = <HTMLElement>document.getElementById('giveAccessPanel_consumeInboundMessageButton');
var giveAccessPanel_inboundMessageNode = <HTMLInputElement>document.getElementById('giveAccessPanel_inboundMessage');
var giveAccessPanel_outboundMessageNode = <HTMLInputElement>document.getElementById('giveAccessPanel_outboundMessage');
var giveAccessPanel_step2ContainerNode = <HTMLElement>document.getElementById('giveAccessPanel_step2Container');
var startPanelNode = <HTMLElement>document.getElementById('startPanel');
var startPanel_getAccessLinkNode = <HTMLElement>document.getElementById('startPanel_getAccessLink');
var startPanel_giveAccessLinkNode = <HTMLElement>document.getElementById('startPanel_giveAccessLink');
var getAccessPanel_bytesReceived = <HTMLElement>document.getElementById('getAccessPanel_bytesReceived');
var getAccessPanel_bytesSent = <HTMLElement>document.getElementById('getAccessPanel_bytesSent');
var giveAccessPanel_bytesReceived = <HTMLElement>document.getElementById('giveAccessPanel_bytesReceived');
var giveAccessPanel_bytesSent = <HTMLElement>document.getElementById('giveAccessPanel_bytesSent');

// DOM nodes that we will choose from either the 'give access' panel or the
// 'get access' panel once the user chooses whether to give/get.
var step2ContainerNode :HTMLElement;
var outboundMessageNode :HTMLInputElement;
var inboundMessageNode :HTMLInputElement;
var receivedBytesNode :HTMLElement;
var sentBytesNode :HTMLElement;

// Stores the parsed messages for use later, if & when the user clicks the
// button for consuming the messages.
var parsedInboundMessages :WebRtc.SignallingMessage[];

var totalBytesReceived = 0;
var totalBytesSent = 0;

startPanel_giveAccessLinkNode.onclick =
    function(event:MouseEvent) : any {
      step2ContainerNode = giveAccessPanel_step2ContainerNode;
      outboundMessageNode = giveAccessPanel_outboundMessageNode;
      inboundMessageNode = giveAccessPanel_inboundMessageNode;
      receivedBytesNode = giveAccessPanel_bytesReceived;
      sentBytesNode = giveAccessPanel_bytesSent;

      startPanelNode.style.display = 'none';
      giveAccessPanelNode.style.display = 'block';
    };

startPanel_getAccessLinkNode.onclick =
    function(event:MouseEvent) : any {
      step2ContainerNode = getAccessPanel_step2ContainerNode;
      outboundMessageNode = getAccessPanel_outboundMessageNode;
      inboundMessageNode = getAccessPanel_inboundMessageNode;
      receivedBytesNode = getAccessPanel_bytesReceived;
      sentBytesNode = getAccessPanel_bytesSent;

      startPanelNode.style.display = 'none';
      getAccessPanelNode.style.display = 'block';
    };

// Tells the Freedom app to create an instance of the socks-to-rtc
// Freedom module and initiate a connection.
getAccessPanel_generateIceCandidatesButton.onclick =
    function(event:MouseEvent) : any {
      this.disabled = true;

      freedom.emit('start', {});
    };

giveAccessPanel_inboundMessageNode.onkeyup =
    function(event:Event) : any {
      parsedInboundMessages = parseInboundMessages(this, giveAccessPanel_consumeInboundMessageButtonNode);
    };

getAccessPanel_inboundMessageNode.onkeyup =
    function(event:Event) : any {
      parsedInboundMessages = parseInboundMessages(this, getAccessPanel_consumeInboundMessageButtonNode);
    };

giveAccessPanel_consumeInboundMessageButtonNode.onclick =
    function(event:MouseEvent) : any {
      consumeInboundMessage(giveAccessPanel_inboundMessageNode);
    };

getAccessPanel_consumeInboundMessageButtonNode.onclick =
    function(event:MouseEvent) : any {
      consumeInboundMessage(getAccessPanel_inboundMessageNode);
      getAccessPanel_consumeInboundMessageButtonNode.disabled = true;
    };


// Parses the contents of the form field 'inboundMessageField' as a sequence of
// signalling messages. Enables/disables the corresponding form button, as
// appropriate. Returns null if the field contents are malformed.
function parseInboundMessages(inboundMessageField:HTMLInputElement,
                              consumeMessageButton:HTMLElement)
    : WebRtc.SignallingMessage[] {
  var signals :string[] = inboundMessageField.value.trim().split('\n');

  // Each line should be a JSON representation of a WebRtc.SignallingMessage.
  // Parse the lines here.
  var parsedSignals :WebRtc.SignallingMessage[] = [];
  for (var i = 0; i < signals.length; i++) {
    var s :string = signals[i].trim();

    // TODO: Consider detecting the error if the text is well-formed JSON but
    // does not represent a WebRtc.SignallingMessage.
    var signal :WebRtc.SignallingMessage;
    try {
      signal = JSON.parse(s);
    } catch (e) {
      parsedSignals = null;
      break;
    }
    parsedSignals.push(signal);
  }

  // Enable/disable, as appropriate, the button for consuming the messages.
  var inputIsWellFormed :boolean = false;
  if (null !== parsedSignals && parsedSignals.length > 0) {
    inputIsWellFormed = true;
  } else {
    // TODO: Notify the user that the pasted text is malformed.
  }
  consumeMessageButton.disabled = !inputIsWellFormed;

  return parsedSignals;
}

// Forwards each line from the paste box to the Freedom app, which
// interprets each as a signalling channel message. The Freedom app
// knows whether this message should be sent to the socks-to-rtc
// or rtc-to-net module. Disables the form field.
function consumeInboundMessage(inboundMessageField:HTMLInputElement) : void {
  // Forward the signalling messages to the Freedom app.
  for (var i = 0; i < parsedInboundMessages.length; i++) {
    freedom.emit('handleSignalMessage', parsedInboundMessages[i]);
  }

  // Disable the form field, since it no longer makes sense to accept further
  // input in it.
  inboundMessageField.disabled = true;

  // TODO: Report success/failure to the user.
};


// Add signalling-channel messages to the box from which the user should
// copy/paste the outgoing message. We don't care whether the message came from
// the socks-to-rtc or rtc-to-net module.
//
// TODO: Accumulate signalling messages until we have all of them, and only
// then update the textarea.
freedom.on('signalForPeer', (signal:WebRtc.SignallingMessage) => {
  step2ContainerNode.style.display = 'block';

  outboundMessageNode.value =
      outboundMessageNode.value.trim() + '\n' + JSON.stringify(signal);
});

freedom.on('newBytesReceived', (numNewBytesReceived:number) => {
  totalBytesReceived += numNewBytesReceived;
  receivedBytesNode.innerHTML = totalBytesReceived.toString();
});

freedom.on('newBytesSent', (numNewBytesSent:number) => {
  totalBytesSent += numNewBytesSent;
  sentBytesNode.innerHTML = totalBytesSent.toString();
});
