/// <reference path='../../../../../third_party/polymer/polymer.d.ts' />


import copypaste_api = require('../copypaste-api');
declare var copypaste :copypaste_api.CopypasteApi;

import I18nUtil = require('../i18n-util.types');
declare var i18n :I18nUtil;

Polymer({
  model: copypaste.model,
  updateLanguage: function() {
    var selectedLanguage = this.$.languageInput
        .options[this.$.languageInput.selectedIndex].value;
    i18n.changeLanguage(selectedLanguage);
  },
  ready: function() {
    // The application starts up without a set language.
    // Default to setting the language to the browser's language.
    i18n.changeLanguage(i18n.getBrowserLanguage());
  },
  useCrypto: function() {
    copypaste.model.usingCrypto = true;
  },
});
