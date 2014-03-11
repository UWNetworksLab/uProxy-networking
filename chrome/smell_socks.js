/*
  Runs the socksToRtc and rtcToNet peers in separate webworkers.

  - Checks that the peers can signal and set up a proxy connection.
  - Run automatic start-stop and end-to-end tests.
  - Leave the peers up and listening so the user can manually curl or point a
    web browser at it.
*/
var LOCALHOST = '127.0.0.1';
var DEFAULT_PORT = 9999;
var REMOTE_PEER_ID = 'remotePeer1337';  // Can be any string.

var socksToRtc = freedom.SocksToRtc();
var rtcToNet = freedom.RtcToNet();

// Wrapper which curls a request through the proxy.
function curl(url) {
  console.log(' * curl ' + url);
  var request = new XMLHttpRequest();
  request.open('GET', url, false);  // Synchronous.
  request.send();
  return request.responseText;
}

// Once the socksToRtc peer successfully starts, it fires 'sendSignalToPeer'.
function signalSocksToRtcToNet() {
  socksToRtc.emit('start', {
    'host':   LOCALHOST,
    'port':   DEFAULT_PORT,
    'peerId': REMOTE_PEER_ID
  });
}

// Attach freedom handlers to peers.
socksToRtc.on('sendSignalToPeer', function(signal) {
  console.log(' * SOCKS-RTC signalling RTC-NET.'); // + JSON.stringify(signal));
  // Ordinarily, |signal| would have to go over a non-censored network to
  // complete NAT hole punching. In this contrived chrome app, both peers are on
  // the same machine, so we skip that fun stuff.
  rtcToNet.emit('handleSignalFromPeer', signal);
  // If all goes correctly, the rtcToNet will fire a 'sendSignalToPeer'.
});

// Server tells socksToRtc about itself.
rtcToNet.on('sendSignalToPeer', function(signal) {
  console.log(' * RTC-NET signaling SOCKS-RTC.');  // + JSON.stringify(signal));
  socksToRtc.emit('handleSignalFromPeer', signal);
});

console.log('testing end-to-end...');

// Start both peers and run a curl.
rtcToNet.emit('start');
signalSocksToRtcToNet();
var txt = curl('google.com');
console.log(txt);

console.log(' ------------------- tests complete ---------------------');

proxyClientThroughServer();
