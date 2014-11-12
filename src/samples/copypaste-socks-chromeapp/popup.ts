/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../networking-typings/communications.d.ts' />
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
              proxyingState : 'notYetAttempted',
              endpoint : <string>null,  // E.g., "127.0.0.1:9999"
              totalBytesReceived : 0,
              totalBytesSent : 0,
            };

// Define basee64 helper functions that are type-annotated and meaningfully
// named.
function base64Encode(unencoded:string): string {
  return window.btoa(unencoded);
}
// Throws an exception if the input is malformed.
function base64Decode(encoded:string): string {
  return window.atob(encoded);
}

// Stores the parsed messages for use later, if & when the user clicks the
// button for consuming the messages.
var parsedInboundMessages :WebRtc.SignallingMessage[];

// Parses the contents of the form field 'inboundMessageField' as a sequence of
// signalling messages. Enables/disables the corresponding form button, as
// appropriate. Returns null if the field contents are malformed.
function parseInboundMessages(inboundMessageFieldValue:string)
    : WebRtc.SignallingMessage[] {
  // Base64-decode the pasted text.
  var signalsString :string = null;
  try {
    signalsString = base64Decode(inboundMessageFieldValue.trim());
  } catch (e) {
    // TODO: Notify the user that the pasted text is malformed.
    return null;
  }

  var signals :string[] = signalsString.trim().split('\n');

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

  // Append the new signalling message to the previous message(s), if any.
  // Base64-encode the concatenated messages because some communication
  // channels are likely to transform portions of the raw concatenated JSON
  // into emoticons, whereas the base64 alphabet is much less prone to such
  // unintended transformation.
  var oldConcatenatedJson = base64Decode(model.outboundMessageValue.trim());
  var newConcatenatedJson = oldConcatenatedJson + '\n' + JSON.stringify(signal);
  model.outboundMessageValue = base64Encode(newConcatenatedJson);
});

freedom.on('bytesReceived', (numNewBytesReceived:number) => {
  model.totalBytesReceived += numNewBytesReceived;
});

freedom.on('bytesSent', (numNewBytesSent:number) => {
  model.totalBytesSent += numNewBytesSent;
});

freedom.on('proxyingStarted', (listeningEndpoint:Net.Endpoint) => {
  if (listeningEndpoint !== null) {
    model.endpoint = listeningEndpoint.address + ':' + listeningEndpoint.port;
  }
  model.proxyingState = 'started';
});

freedom.on('proxyingStopped', () => {
  model.proxyingState = 'stopped';
});


// Translation.

// Map of the supported languages to whether they are left-to-right or
// right-to-left languages.
var languageDirection :{[index:string]:string} = {
  'en' : 'ltr',
  'it' : 'ltr',
  'ar' : 'rtl',
  'fa' : 'rtl'
};

// UI strings in the language selected by the user.
var translatedStrings :{[index:string]:string} = {};

// Retrieve messages.json file of the appropriate language and insert strings
// into the application's UI.
var changeLanguage = (language:string) : void => {
  clearTranslatedStrings();
  var xhr = new XMLHttpRequest();
  xhr.open('GET','locales/' + language + '/messages.json',true);

  xhr.onload = function() {
    if (this.readyState != 4) {
      return;
    }
    // Translate the JSON format to a simple { key : value, ... } dictionary.
    var retrievedMessages = JSON.parse(xhr.responseText);
    for (var key in retrievedMessages) {
      if (retrievedMessages.hasOwnProperty(key)) {
        translatedStrings[key] = retrievedMessages[key].message;
      }
    }
    var htmlNode = document.querySelector('html');
    addTranslatedStrings(htmlNode);
    htmlNode.setAttribute('dir', languageDirection[language]);
  }
  xhr.send(null);
}

// Clears the dictionary of UI strings (i.e. before a new language dictionary
// is loaded).
var clearTranslatedStrings = () : void => {
  for (var key in translatedStrings) {
    delete translatedStrings[key];
  }
}

// Return the language of the user's browser.
//
// TODO (lucyhe): find a better way to do this.
var getBrowserLanguage = () : string => {
  return navigator.language.substring(0, 2);
}

// Given a node, add translated strings to any text-containing child nodes.
var addTranslatedStrings = (node:any) : void => {
  i18nTemplate.process(node, translatedStrings);
}
