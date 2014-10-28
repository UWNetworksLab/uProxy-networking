Polymer({
  generateIceCandidates: function(){
		this.$.generateIceCandidatesButton.disabled = true;
    freedom.emit('start', {});
  },
  parseInboundText: function() {
  	parsedInboundMessages = parseInboundMessages(this.inboundText);
  },
	consumeInboundText: function() {
		consumeInboundMessage();
		// Disable the "Start Proxying" button after it's clicked.
		consumeMessageButton.disabled = true;
	},
  ready: function() {
		changeLanguage(selectedLanguage);

    step2ContainerNode = this.$.step2ContainerNode;
    outboundMessageNode = this.$.outboundMessageNode;
    inboundMessageNode = this.$.inboundMessageNode;    
    consumeMessageButton = this.$.consumeMessageButton;

    sentBytesNode = this.$.sentBytesNode;
    receivedBytesNode = this.$.receivedBytesNode;    
  }
});
