/*
  Client which passes socks requests over WebRTC datachannels.
  TODO: Cleanups and typescripting.
*/
/// <reference path='socks.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
declare var freedom:any;
var core = freedom.core();

console.log('SOCKS5 client: ' + self.location.href);

function onClose(label, connection) {
  console.warn("onClose not implemented.");
  return false;
}

// TODO: Change into SocksToRTC and RTCtoNet module way of doing things.

function initClient() {

  var _socksServer = null;  // socks TCP Server.
  var _sctpPc = null;       // Freedom sctp-peer connection.
  var _peerId = null;
  var _signallingChannel = null;
  var _messageQueue = [];
  var _conns = {};  // Index each active TcpConnection by sctp channel id.

  function start(options) {
    console.log('Client: on(start)... ' + JSON.stringify(options));
    _peerId = options.peerId;
    if (!_peerId) {
      console.error('Client: No Peer ID provided! Cannot connect.');
      return false;
    }
    shutdown();  // Reset everything.

    // Create SOCKS server and start listening.
    _socksServer = new Socks.Server(options.host, options.port, onConnection);
    _socksServer.listen();

    // Create sctp connection to a peer.
    _sctpPc = _createSCTPPeerConnection();

    var _peerId = _peerId;  // Bind peerID to scope so promise can work.

    // Create a freedom-channel to act as the signaling channel.
    core.createChannel().done(function(chan) {  // When the signaling channel is created.
      // chan.identifier is a freedom-_socksServer (not a socks _socksServer) for the
      // signalling channel used for signalling.
      console.log('Preparing SCTP peer connection. peerId: ' + _peerId);
      _sctpPc.setup(chan.identifier, 'client-to-' + _peerId, true);

      // when the channel is complete, setup handlers.
      chan.channel.done(function(signallingChannel) {
        console.log('Client channel to sctpPc created');
        // when the signalling channel gets a message, send that message to the
        // freedom 'fromClient' handlers.
        signallingChannel.on('message', function(msg) {
          freedom.emit('sendSignalToPeer', {
              peerId: _peerId,
              data: msg
          });
        });

        // When the signalling channel is ready, set the global variable.
        signallingChannel.on('ready', function() {
          _signallingChannel = signallingChannel;
          console.log('Client channel to sctpPc ready.');
          while(_messageQueue.length > 0) {
            _signallingChannel.emit('message', _messageQueue.shift());
          }
        });
        // _signallingChannel.emit('handleSignalFromPeer');
      });
    });
  }


  // Stop running as a _socksServer and close data channels and pcs.
  function shutdown() {
    console.log('Shutting down Peer client...');
    if (_socksServer) {
      _socksServer.disconnect();  // Disconnects internal TCP server.
      _socksServer = null;
    }
    for (var channelLabel in _conns) {
      onClose(channelLabel, _conns[channelLabel]);
      closeConnection(channelLabel);
    }
    _conns = {};
    if(_sctpPc) {
      _sctpPc.close();
      _sctpPc = null;
    }
    _signallingChannel = null;
    _peerId = null;
  };

  // Close a particular tcp-connection and data channel pair.
  function closeConnection(channelLabel) {
    if (_conns[channelLabel]) {
      _conns[channelLabel].disconnect();
      delete _conns[channelLabel];
    }
    if (_sctpPc) {
      // we may get closeConnection calls after shutdown (from TCP
      // disconnections).
      _sctpPc.closeDataChannel(channelLabel);
    }
  };

  // A simple wrapper function to send data to the peer.
  function _sendToPeer(channelLabel, buffer) {
    // console.log("_sendToPeer (buffer) to channelLabel: " + channelLabel);
    _sctpPc.send({'channelLabel': channelLabel, 'buffer': buffer});
  }

  // A SOCKS5 connection request has been received, setup the data channel and
  // start socksServering the corresponding tcp-connection to the data channel.
  function onConnection(conn, address, port, connectedCallback) {
    if (!_sctpPc) {
      console.error("onConnection called without a _sctpPc.");
      return;
    }

    // TODO: reuse channelLabels from a pool.
    var channelLabel = 'c' + Math.random();
    _conns[channelLabel] = conn.tcpConnection;

    // When the TCP-connection receives data, send it on the sctp peer
    // on the corresponding channelLabel
    conn.tcpConnection.on('recv', _sendToPeer.bind(null, channelLabel));

    // When the TCP-connection closes
    conn.tcpConnection.on('disconnect',
        closeConnection.bind(null, channelLabel));

    _sctpPc.send({'channelLabel' : channelLabel,
                  'text': JSON.stringify({host: address, port: port})});

    // TODO: we are not connected yet... should we have some message passing
    // back from the other end of the data channel to tell us when it has
    // happened, instead of just pretended?
    // TODO: determine if these need to be accurate.
    connectedCallback({ipAddrString: '127.0.0.1', port: 0});
  };

  function _createSCTPPeerConnection() {
    var pc = freedom['core.sctp-peerconnection']();
    pc.on('onReceived', function(message) {
      if (message.channelLabel) {
        if (message.buffer) {
          _conns[message.channelLabel].sendRaw(message.buffer);
        } else if (message.text) {
          // TODO: we should use text as a signalling/control channel, e.g. to
          // give back the actaul address that was connected to as per socks
          // official spec.
          _conns[message.channelLabel].sendRaw(message.text);
        } else {
          console.error("Message type isn't specified properly. Msg: "
            + JSON.stringify(message));
        }
      } else {
        console.error('Message received but missing channelLabel. Msg: '
            + JSON.stringify(message));
      }
    });
    // When WebRTC data-channel transport is closed, shut everything down.
    pc.on('onCloseDataChannel', closeConnection);
    return pc;
  }


  // Send any messages from coming from the peer via the signalling channel
  // handled by freedom, to the signalling channel input of the peer connection.
  // msg : {peerId : string, data : json-string}
  freedom.on('handleSignalFromPeer', function(msg) {
      console.log('client handleSignalFromPeer: ' + JSON.stringify(msg) +
                  ' with state ' + printSelf());
    if (_signallingChannel) {
      _signallingChannel.emit('message', msg.data);
    } else {
      _messageQueue.push(msg.data);
      //console.log("Couldn't route incoming signaling message");
    }
  });

  var printSelf = function () {
    var ret ='<failed to self-stringify.>';
    try {
      ret = JSON.stringify({ _socksServer: _socksServer,
                             _sctpPc: _sctpPc,
                             _peerId: _peerId,
                             _signallingChannel: _signallingChannel,
                             _conns: _conns});
    } catch (e) {}
    return ret;
  }

  // Attach freedom message handlers.
  freedom.on('start', start);
  freedom.on('stop', shutdown);
  console.log('socks-rtc Client initialized.');

  // Setup completed, now emit the ready message.
  freedom.emit('ready', {});
}


initClient();
