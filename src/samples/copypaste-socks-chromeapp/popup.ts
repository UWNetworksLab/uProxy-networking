/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../networking-typings/polymer.d.ts' />
/// <reference path='../../networking-typings/i18n.d.ts' />
/// <reference path='../../webrtc/peerconnection.d.ts' />

// 'model' object contains variables about the state of the application.
// Polymer elements will bind to model so that the elements' style and 
// contents are up to date.
var model = { givingOrGetting : <string>null,
              readyForStep2 : false,
              outboundMessageValue : '',
              inputIsWellFormed : false,
              totalBytesReceived : 0,
              totalBytesSent : 0,
            };

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
  if (null !== parsedSignals && parsedSignals.length > 0) {
    model.inputIsWellFormed = true;
  } else {
    // TODO: Notify the user that the pasted text is malformed.
  }

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
  // TODO: Report success/failure to the user.
};

freedom.on('signalForPeer', (signal:WebRtc.SignallingMessage) => {
  model.readyForStep2 = true;

  model.outboundMessageValue =
      model.outboundMessageValue.trim() + '\n' + JSON.stringify(signal);
});

freedom.on('bytesReceived', (numNewBytesReceived:number) => {
  model.totalBytesReceived += numNewBytesReceived;
});

freedom.on('bytesSent', (numNewBytesSent:number) => {
  model.totalBytesSent += numNewBytesSent;
});


// Translation.

/**
  * Return the language of the user's browser.
  */
// TODO (lucyhe): find a better way to do this.
var getBrowserLanguage = () : string => {
  return navigator.language.substring(0, 2);
}

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
  }
  xhr.send(null);  
}
