/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../networking-typings/polymer.d.ts' />
/// <reference path='../../networking-typings/i18n.d.ts' />
/// <reference path='../../webrtc/peerconnection.d.ts' />

// DOM nodes that we will choose from either the 'give access' panel or the
// 'get access' panel once the user chooses whether to give/get.
var step2ContainerNode :HTMLElement;
var outboundMessageNode :HTMLInputElement;
var inboundMessageNode :HTMLInputElement;
var receivedBytesNode :HTMLElement;
var sentBytesNode :HTMLElement;
var consumeMessageButton :HTMLElement;

var totalBytesReceived = 0;
var totalBytesSent = 0;

// Stores the parsed messages for use later, if & when the user clicks the
// button for consuming the messages.
var parsedInboundMessages :WebRtc.SignallingMessage[];

// Parses the contents of the form field 'inboundMessageField' as a sequence of
// signalling messages. Enables/disables the corresponding form button, as
// appropriate. Returns null if the field contents are malformed.
function parseInboundMessages(inboundMessageFieldValue:string)
    : WebRtc.SignallingMessage[] {
  var signals :string[] = inboundMessageFieldValue.trim().split('\n');

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
    consumeMessageButton.removeAttribute("disabled");
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
function consumeInboundMessage() : void {
  // Forward the signalling messages to the Freedom app.
  for (var i = 0; i < parsedInboundMessages.length; i++) {
    freedom.emit('handleSignalMessage', parsedInboundMessages[i]);
  }

  // Disable the form field, since it no longer makes sense to accept further
  // input in it.
  inboundMessageNode.disabled = true;

  // TODO: Report success/failure to the user.
};

freedom.on('signalForPeer', (signal:WebRtc.SignallingMessage) => {
  step2ContainerNode.style.display = 'block';

  outboundMessageNode.value =
      outboundMessageNode.value.trim() + '\n' + JSON.stringify(signal);
});

freedom.on('bytesReceived', (numNewBytesReceived:number) => {
  totalBytesReceived += numNewBytesReceived;
  receivedBytesNode.innerHTML = totalBytesReceived.toString();
});

freedom.on('bytesSent', (numNewBytesSent:number) => {
  totalBytesSent += numNewBytesSent;
  sentBytesNode.innerHTML = totalBytesSent.toString();
});


// Translation.

/**
  * Map of the supported languages to whether they are left-to-right or
  * right-to-left languages.
  */
var languageDirection :{[index:string]:string} = {
  'en' : 'ltr',
  'it' : 'ltr',
  'ar' : 'rtl',
  'fa' : 'rtl'
};

/**
  * Return the language of the user's browser.
  */
// TODO (lucyhe): find a better way to do this.
var getBrowserLanguage = () : string => {
  return navigator.language.substring(0, 2);
}

var selectedLanguage = getBrowserLanguage();

/** Retrieve messages.json file of the appropriate language and insert
  * strings into the application's UI.  
  */
var changeLanguage = (language:string) => {
  var xhr = new XMLHttpRequest();
  xhr.open('GET','locales/' + language + '/messages.json',true);
  
  xhr.onload = function() {
    if (this.readyState != 4) {
      return;
    }
    // Translate the JSON format to a simple
    // { key : value, ... } dictionary.
    var translations = JSON.parse(xhr.responseText);
    for (var key in translations) {
      if (translations.hasOwnProperty(key)) {
        translations[key] = translations[key].message;
      }
    }
    i18nTemplate.process(document, translations);
    document.querySelector('html')
        .setAttribute('dir', languageDirection[language]);
  }
  xhr.send(null);  
}
