
Polymer({
  ready: function() {
    console.log("setting language to " + getBrowserLanguage());
    changeLanguage(getBrowserLanguage());
  }
});