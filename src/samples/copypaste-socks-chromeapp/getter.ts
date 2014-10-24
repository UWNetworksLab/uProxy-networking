  Polymer({
    //parsedInboundMessages :WebRtc.SignallingMessage[];
    generateIceCandidates: function(){
			this.$.generateIceCandidatesButton.disabled = true;
      freedom.emit('start', {});
    },
    parseInboundText: function() {
    	console.log("inbound + " + this.inbound);
    	parsedInboundMessages = parseInboundMessages(this.inbound);
    },
		consumeInboundText: function() {
			consumeInboundMessage();
			consumeMessageButton.disabled = true;
		},
    ready: function() {
    	console.log("getter ready");
    	changeLanguage(getBrowserLanguage());
      step2ContainerNode = this.$.step2ContainerNode;
      outboundMessageNode = this.$.outboundMessageNode;
      inboundMessageNode = this.$.inboundMessageNode;
      receivedBytesNode = this.$.receivedBytesNode;
      sentBytesNode = this.$.sentBytesNode;
      consumeMessageButton = this.$.consumeMessageButton;

    }
  });