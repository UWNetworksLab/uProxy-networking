Polymer({
  model: model,
  stopProxying: function() {
    copypastePromise.then((copypaste:any) => { copypaste.emit('stop', {}); });
  }
});
