Polymer({
  model: model,
  parseInboundText: function() {
    parsedInboundMessages = parseInboundMessages(this.inboundText);
  },
  consumeInboundText: function() {
    consumeInboundMessage();
    // Disable the form field, since it no longer makes sense to accept further
    // input in it.
    this.$.inboundMessageNode.disabled = true;
  },
  ready: function() {
    addTranslatedStringsToUI(this);
  }
});
