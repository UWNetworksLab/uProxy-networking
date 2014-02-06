/*
  Runs the client and server (in separate webworkers) and tests that they can
  signal and set up a proxy connection.
*/
var LOCALHOST = '127.0.0.1';
var DEFAULT_PORT = 9999;
var SERVER_PEER_ID = 'ATotallyFakePeerID';  // Can be any string.

// In this case, 'client' and 'server' are named in terms of their WebRTC peer
// connection and signalling channel relationship.
var client = freedom.SocksToRtc();
var server = freedom.RtcToNet();

server.emit('start');

// Entry point. Once client successfully starts, it fires 'sendSignalToPeer'.
function proxyClientThroughServer() {
  client.emit('start', {
    'host':   LOCALHOST,
    'port':   DEFAULT_PORT,
    'peerId': SERVER_PEER_ID
  });
}

// Attach freedom handlers to client and server webworkers.
client.on('sendSignalToPeer', function(signal) {
  console.log(' * Client signalling server: ' + JSON.stringify(signal));
  // Ordinarily, |signal| would have to go over a non-censored network to
  // complete NAT hole punching. In this contrived chrome app, client and server
  // are on the same machine, so we skip that fun stuff.
  // Immediately tells the server about the client.
  // passSignalToServer(signal);
  server.emit('handleSignalFromPeer', signal);
  // If all goes correctly, the server will fire a 'sendSignalToPeer'.
});

// Server tells client about itself.
// Like above, |signal| quietly skips any additional adventures and goes
// straight to the client..
server.on('sendSignalToPeer', function(signal) {
  console.log(' * Server signalling client: ' + JSON.stringify(signal));
  client.emit('handleSignalFromPeer', signal);
});

function passSignalToClient(signal) {
}

proxyClientThroughServer();
