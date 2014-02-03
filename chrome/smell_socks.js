/*
  Runs the client and server (in separate webworkers) and tests that they can
  signal and set up a proxy connection.
*/
var LOCALHOST = '127.0.0.1';
var DEFAULT_PORT = 9999;
var SERVER_PEER_ID = 'ATotallyFakePeerID';  // Can be any string.
var server = freedom.server();
var client = freedom.client();
server.emit('start');

// Entry point. Once client successfully starts, it fires 'sendSignalToPeer' at
// the server.
function proxyClientThroughServer() {
  client.emit('start', {
    'host':   LOCALHOST,
    'port':   DEFAULT_PORT,
    'peerId': SERVER_PEER_ID
  });
}

// Attach freedom handlers to client and server webworkers.
client.on('sendSignalToPeer', function(signal) {
  console.log('Client wants to sendSignalToPeer: ' + JSON.stringify(signal));
  // Ordinarily, |signal| would have to go over a non-censored network to
  // complete NAT hole punching. In this contrived chrome app, client and server
  // are on the same machine, so we skip that fun stuff.
  passSignalToServer(signal);
});

// Tells the server about the client.
function passSignalToServer(signal) {
  server.emit('handleSignalFromPeer', signal);
  // If all goes correctly, the server will fire a 'sendSignalToPeer'.
}

// Server responds to client.
server.on('sendSignalToPeer', function(signal) {
  console.log('Server wants to sendSignalToPeer:' + JSON.stringify(signal));
  // Like above, |signal| quietly skips any additional adventures and goes
  // straight to the client..
  passSignalToClient(signal);
});

// Tell the client about the server.
function passSignalToClient(signal) {
  client.emit('handleSignalFromPeer', signal);
}

proxyClientThroughServer();
