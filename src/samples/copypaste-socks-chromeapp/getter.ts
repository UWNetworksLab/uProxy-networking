Polymer({
  generateIceCandidates: function(){
		this.$.generateIceCandidatesButton.disabled = true;
    freedom.emit('start', {});
  },
  parseInboundText: function() {
  	parsedInboundMessages = parseInboundMessages(this.inbound);
  },
	consumeInboundText: function() {
		consumeInboundMessage();
		consumeMessageButton.disabled = true;
	},
  ready: function() {
  	changeLanguage(getBrowserLanguage());
    step2ContainerNode = this.$.step2ContainerNode;
    outboundMessageNode = this.$.outboundMessageNode;
    inboundMessageNode = this.$.inboundMessageNode;
    receivedBytesNode = this.$.receivedBytesNode;
    sentBytesNode = this.$.sentBytesNode;
    consumeMessageButton = this.$.consumeMessageButton;
  }
});