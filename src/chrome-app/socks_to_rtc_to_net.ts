/*
  Runs the socksToRtc and rtcToNet peers (in separate webworkers) and tests that
  they can signal and set up a proxy connection.
*/
/// <reference path='socks.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/transport.d.ts' />
/// <reference path='../../node_modules/uproxy-build-tools/src/util/arraybuffers.d.ts' />
/// <reference path='../interfaces/communications.d.ts' />



var LOCALHOST = '127.0.0.1';
var DEFAULT_ECHO_PORT = 9998;
var DEFAULT_SOCKS_PORT = 9999;

var socksToRtc = freedom.SocksToRtc();
var rtcToNet = freedom.RtcToNet();
var tcpEchoServer = freedom.TcpEchoServer();

// Attach freedom handlers to peers.
socksToRtc.on('sendSignalToPeer', function(signal) {
  console.log(' * SOCKS-RTC signalling RTC-NET.'); // + JSON.stringify(signal));
  // Ordinarily, |signal| would have to go over a non-censored network to
  // complete NAT hole punching. In this contrived chrome app, both peers are on
  // the same machine, so we skip that fun stuff.
  rtcToNet.emit('handleSignalFromPeer', signal);
  // If all goes correctly, the rtcToNet will fire a 'sendSignalToPeer'.
});

// Listen for socksToRtc success or failure signals, and just print them for now.
socksToRtc.on('socksToRtcSuccess', function(addressAndPort) {
  console.log('Received socksToRtcSuccess for: '
      + JSON.stringify(addressAndPort));
});

socksToRtc.on('socksToRtcFailure', function(addressAndPort) {
  console.error('Received socksToRtcFailure for: '
      + JSON.stringify(addressAndPort));
});

// Server tells socksToRtc about itself.
rtcToNet.on('sendSignalToPeer', function(signal) {
  console.log(' * RTC-NET signaling SOCKS-RTC.');  // + JSON.stringify(signal));
  socksToRtc.emit('handleSignalFromPeer', signal);
});

// Actually startup the servers.
rtcToNet.emit('start');
tcpEchoServer.emit('start', {address: LOCALHOST, port: DEFAULT_ECHO_PORT});
// Once the socksToRtc peer successfully starts, it fires 'sendSignalToPeer'.
socksToRtc.emit('start', {
  'address':   LOCALHOST,
  'port':   DEFAULT_PORT,
});
