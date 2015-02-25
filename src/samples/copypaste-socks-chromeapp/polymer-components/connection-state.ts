/// <reference path='../../../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../../../third_party/polymer/polymer.d.ts' />

import copypaste_api = require('../copypaste-api');
declare var copypaste :copypaste_api.CopypasteApi;

Polymer({
  model: copypaste.model,
  stopProxying: function() {
    copypaste.onceReady.then((copypasteModule) => {
      copypasteModule.emit('stop', {});
    });
  }
});
