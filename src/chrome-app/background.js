var script = document.createElement('script');
//script.setAttribute('data-manifest', 'socks_rtc.json');
script.setAttribute('data-manifest', 'test/tcp_echo_server.json');
script.textContent = '{ "debug": true }';
script.src = 'freedom-for-chrome.js';
document.head.appendChild(script);
