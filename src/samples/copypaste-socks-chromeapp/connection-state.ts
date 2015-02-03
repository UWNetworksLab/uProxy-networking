/// <reference path='../../freedom/typings/freedom.d.ts' />

Polymer({
  model: model,
  stopProxying: function() {
    copypastePromise.then((copypaste:OnAndEmit<any,any>) => { copypaste.emit('stop', {}); });
  }
});
