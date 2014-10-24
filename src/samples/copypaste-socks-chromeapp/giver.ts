Polymer({
    //parsedInboundMessages :WebRtc.SignallingMessage[];
    ready: function() {
    	console.log("giver ready");
    	changeLanguage(getBrowserLanguage());

      step2ContainerNode = this.$.step2ContainerNode;
      outboundMessageNode = this.$.outboundMessageNode;
      inboundMessageNode = this.$.inboundMessageNode;
      receivedBytesNode = this.$.receivedBytesNode;
      sentBytesNode = this.$.sentBytesNode;
      consumeMessageButton = this.$.consumeMessageButton;

    },
    parseInboundText: function() {
    	console.log("inbound + " + this.inbound);
    	parsedInboundMessages = parseInboundMessages(this.inbound);
    },
		consumeInboundText: function() {
			consumeInboundMessage();
		}
  });