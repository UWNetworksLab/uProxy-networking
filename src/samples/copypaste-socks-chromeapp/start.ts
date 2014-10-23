  Polymer({
    giveMode: function() {
    	this.giving = true; 
    },
    getMode: function() {
    	this.getting = true;
    },
    ready: function() {
    	this.giving = false;
    	this.getting = false;
    }
  });