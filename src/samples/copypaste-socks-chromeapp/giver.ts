Polymer({
  parseInboundText: function() {
  	parsedInboundMessages = parseInboundMessages(this.inboundText);
  },
	consumeInboundText: function() {
		consumeInboundMessage();
	},
	ready: function() {
  	changeLanguage(getBrowserLanguage());
  	
    step2ContainerNode = this.$.step2ContainerNode;
    outboundMessageNode = this.$.outboundMessageNode;
    inboundMessageNode = this.$.inboundMessageNode;
    consumeMessageButton = this.$.consumeMessageButton;

    sentBytesNode = this.$.sentBytesNode;
    receivedBytesNode = this.$.receivedBytesNode;    
  }
});
