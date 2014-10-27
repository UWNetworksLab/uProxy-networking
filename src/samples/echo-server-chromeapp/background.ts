declare var freedom:any;

var script = document.createElement('script');
script.src = 'lib/freedom/freedom-for-chrome.js';
document.head.appendChild(script);
script.onload = () => {
  freedom('freedom-module.json', { 'debug': 'log' }).then(function(interface:any) {
    var echo :any = interface();
    echo.emit('start', { address: '127.0.0.1', port: 9998 });
  }, (e:Error) => {
    console.error('could not load freedom: ' + e.message);
  });
}
