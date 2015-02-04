Polymer({
  model: model,
  parseInboundText: function() {
    if (model.usingCrypto && !model.inputDecrypted) {
      verifyDecryptInboundMessage(model.inboundText);
    } else {
      parsedInboundMessages = parseInboundMessages(model.inboundText);
    }
  },
  consumeInboundText: function() {
    consumeInboundMessage();
    // Disable the form field, since it no longer makes sense to accept further
    // input in it.
    this.$.inboundMessageNode.disabled = true;
  },
  ready: function() {
    addTranslatedStrings(this);
  }
});
