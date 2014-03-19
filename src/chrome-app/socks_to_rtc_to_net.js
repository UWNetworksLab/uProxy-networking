/*
  Runs the socksToRtc and rtcToNet peers (in separate webworkers) and tests that
  they can signal and set up a proxy connection.
*/
var LOCALHOST = '172.26.76.61';
var DEFAULT_PORT = 9999;
var SERVER_PEER_ID = 'ATotallyFakePeerID';  // Can be any string.

var socksToRtc = freedom.SocksToRtc();
var rtcToNet = freedom.RtcToNet();

rtcToNet.emit('start');

// Once the socksToRtc peer successfully starts, it fires 'sendSignalToPeer'.
function proxyClientThroughServer() {
  socksToRtc.emit('start', {
    'host':   LOCALHOST,
    'port':   DEFAULT_PORT,
    'peerId': SERVER_PEER_ID
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

proxyClientThroughServer();
