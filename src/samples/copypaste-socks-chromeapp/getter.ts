Polymer({
  model: model,
  generateIceCandidates: function(){
    this.$.generateIceCandidatesButton.disabled = true;
    freedom.emit('start', {});
  },
  parseInboundText: function() {
    parsedInboundMessages = parseInboundMessages(this.inboundText);
  },
  consumeInboundText: function() {
    consumeInboundMessage();
    // Disable the form field, since it no longer makes sense to accept further
    // input in it.
    this.$.inboundMessageNode.disabled = true;
    // Disable the "Start Proxying" button after it's clicked.
    this.$.consumeMessageButton.disabled = true;
  },
  ready: function() {
    addTranslatedStrings(this);
  }
});
