/// <reference path='ui-polymer.d.ts' />
/// <reference path='lib/i18n/i18n.d.ts' />

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
    console.log(xhr.responseText);
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

// Dropdown for selecting a language.
var getLanguageInputNode = 
    <HTMLSelectElement>document.getElementById('languageInput');

// Listen for events indicating the language has changed.
getLanguageInputNode.onchange = function(event:Event) : void {
  var selectedLanguage = getLanguageInputNode
      .options[getLanguageInputNode.selectedIndex].value;
  changeLanguage(selectedLanguage);
}

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



