/*
  Runs the socksToRtc and rtcToNet peers (in separate webworkers) and tests that
  they can signal and set up a proxy connection.
*/
/// <reference path='../socks-to-rtc/socks.ts' />
/// <reference path='../freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../freedom-typescript-api/interfaces/transport.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />
/// <reference path='../interfaces/communications.d.ts' />
/// <reference path='../echo-server/freedom-module.d.ts' />
/// <reference path='../socks-to-rtc/freedom-module.d.ts' />
/// <reference path='../rtc-to-net/freedom-module.d.ts' />

// A wrapper to capture the work done by freedom when it imports modules by
// reading the freedom.json file.
declare module freedom {
  export function TcpEchoServer() : freedom.TcpEchoServer;
  export function SocksToRtc() : freedom.SocksToRtc;
  export function RtcToNet() : freedom.RtcToNet;
}

var LOCALHOST = '127.0.0.1';
var DEFAULT_ECHO_PORT = 9998;
var DEFAULT_SOCKS_PORT = 9999;
var fakeSessionId = 'some fake session id';

// CONSIDER: When networking code stabalises, we could remove the echo server.
// For now it's helpful for testing.
var tcpEchoServer :freedom.TcpEchoServer = freedom.TcpEchoServer();
tcpEchoServer.emit('start', {address: LOCALHOST, port: DEFAULT_ECHO_PORT});

var socksToRtc :freedom.SocksToRtc = freedom.SocksToRtc();
var rtcToNet :freedom.RtcToNet = freedom.RtcToNet();

// Attach freedom handlers to peers.
socksToRtc.on('sendSignalToPeer', (signalData:string) => {
  console.log(' * SOCKS-RTC signalling RTC-NET.'); // + JSON.stringify(signal));
  // Ordinarily, |signal| would have to go over a non-censored network to
  // complete NAT hole punching. In this contrived chrome app, both peers are on
  // the same machine, so we skip that fun stuff.
  rtcToNet.emit('handleSignalFromPeer',
                {peerId: fakeSessionId, data: signalData});
  // If all goes correctly, the rtcToNet will fire a 'sendSignalToPeer'.
});

// Listen for socksToRtc success or failure signals, and just print them for now.
socksToRtc.on('socksToRtcSuccess', (endpoint:Net.Endpoint) => {
  console.log('Received socksToRtcSuccess for: '
      + JSON.stringify(endpoint));
});

socksToRtc.on('socksToRtcFailure', (endpoint:Net.Endpoint) => {
  console.error('Received socksToRtcFailure for: '
      + JSON.stringify(endpoint));
});

// Server tells socksToRtc about itself.
rtcToNet.on('sendSignalToPeer', (signal:PeerSignal) => {
  console.log(' * RTC-NET signaling SOCKS-RTC.');  // + JSON.stringify(signal));
  socksToRtc.emit('handleSignalFromPeer', signal.data);
});

// Startup the servers.
rtcToNet.emit('start');
// Once the socksToRtc peer successfully starts, it fires 'sendSignalToPeer'.
socksToRtc.emit('start', {
  'address':   LOCALHOST,
  'port':   DEFAULT_SOCKS_PORT,
});

