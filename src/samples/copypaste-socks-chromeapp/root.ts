Polymer({
  updateLanguage: function() {
  	var selectedLanguage = this.$.languageInput
  			.options[this.$.languageInput.selectedIndex].value;
  	changeLanguage(selectedLanguage);
  },
  ready: function() {
    changeLanguage(getBrowserLanguage());
  }
});
