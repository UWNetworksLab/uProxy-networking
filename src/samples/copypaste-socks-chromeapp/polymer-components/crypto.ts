/// <reference path='../../../../../third_party/polymer/polymer.d.ts' />

import copypaste_api = require('../copypaste-api');
declare var copypaste :copypaste_api.CopypasteApi;

Polymer({
  model: copypaste.model
});
