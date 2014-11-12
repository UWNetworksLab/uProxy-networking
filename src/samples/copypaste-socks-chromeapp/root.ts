Polymer({
  model: model,
  updateLanguage: function() {
    var selectedLanguage = this.$.languageInput
        .options[this.$.languageInput.selectedIndex].value;
    changeLanguage(selectedLanguage);
  },
  ready: function() {
    // The application starts up without a set language.
    // Default to setting the language to the browser's language.
    changeLanguage(getBrowserLanguage());
  }
});
