Polymer({
  model: model,
  stopProxying: function() {
    freedom.emit('stop', {});
  }
});
