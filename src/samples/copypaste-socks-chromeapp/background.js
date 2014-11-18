chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('popup.html', {
    id: 'main',
    bounds: {
      width: 450,
      height: 625
    }
  });
});
