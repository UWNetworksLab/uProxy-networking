Polymer({
  model: model,
  updateLanguage: function() {
    selectedLanguage = this.$.languageInput
        .options[this.$.languageInput.selectedIndex].value;
    changeLanguage(selectedLanguage);
  },
  ready: function() {
    changeLanguage(selectedLanguage);
  }
});
