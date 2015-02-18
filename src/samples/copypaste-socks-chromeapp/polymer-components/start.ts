/// <reference path='../../../../build/third_party/polymer/polymer.d.ts' />

import copypaste_api = require('../copypaste-api');
declare var copypaste :copypaste_api.CopypasteApi;

Polymer({
  giveMode: function() {
    copypaste.model.givingOrGetting = 'giving';
  },
  getMode: function() {
    copypaste.model.givingOrGetting = 'getting';
  },
});
