/*
  Server which handles socks connections over WebRTC datachannels.
*/
console.log('SOCKS5 server: ' + self.location.href);
declare var freedom:any;

/// <reference path='netclient.ts' />

module RTCToNet {

  var FCore = freedom.core();

  /**
   * RTCToNet.Peer
   *
   * Serves requests from WebRTC peer connections.
   */
  export class Peer {

    sctpPc:any;
    netClients:{[channelLabel:string]:Net.Client} = {};
    signallingChannel:any = null;
    messageQueue:any[];

    constructor (public peerId) {
      console.log('New Peer created ' + peerId);
      this.netClients = {};
      this.messageQueue = [];

      // Set up the peer connection.
      this.sctpPc = freedom['core.sctp-peerconnection']();
      this.sctpPc.on('onReceived', (message) => {
        // console.log("Server got message: " + JSON.stringify(message));
        var cL = message.channelLabel;
        if (!cL) {
          console.error("Message received but missing channelLabel. Msg: " +
              JSON.stringify(message));
          return;
        }
        if (message.text) {
          // Text from the peer is used to set a new destination request.
          // Assumes "message.text" is a json of form:
          // { host: string, port: number }
          this.netClients[cL] = new Net.Client(
              this.sendDataToPeer_.bind(this, cL),
              this.closeClient_.bind(this, cL),
              JSON.parse(message.text));
        } else if (message.buffer) {
          if(!(cL in this.netClients)) {
            console.error("Message received for non-existent channel. Msg: " +
              JSON.stringify(message));
            return;
          }
          // Buffer from the peer is data for the destination.
          this.netClients[cL].send(message.buffer);
        } else {
          console.error("Message received but missing valid data field. Msg: " +
              JSON.stringify(message));
        }
      });
      this.sctpPc.on('onCloseDataChannel', (arg) => {
        this.closePeer_(true, arg.channelId);
      });

      // Create a signalling channel.
      FCore.createChannel().done((chan) => {
        this.sctpPc.setup(chan.identifier, 'server-for-' + this.peerId, false);
        chan.channel.done((channel) => {
          // console.log("Server channel to sctpPc created");
          channel.on('message', (msg) => {
            freedom.emit('sendSignalToPeer', {
                peerId: this.peerId,
                data: msg
            });
          });
          // sctpPc will emit 'ready' when it is ready, and at that point we
          // have successfully initialised this peer connection and can set the
          // signalling channel and process any messages we have been sent.
          //setupPromise.done(function() {
          channel.on('ready', () => {
            // console.log("Server channel to sctpPc ready.");
            this.signallingChannel = channel;
            while(this.messageQueue.length > 0) {
              this.signallingChannel.emit('message', this.messageQueue.shift());
            }
          });
        });
      });
      console.log('_initPeer(' + peerId + ') complete.');
    }

    // Close peer connection and all tcp sockets open for this peer.
    public close = () => {
      //conn.disconnect();
      for (var i in this.netClients) {
        this.netClients[i].close();
      }
      this.sctpPc.shutdown();
    }

    private sendDataToPeer_ = (channelLabel, data) => {
      this.sctpPc.send({
          'channelLabel': channelLabel,
          'buffer': data
      });
    }

    private closeClient_ = (channelLabel) => {
      var cl = channelLabel;
      // console.log('Closing DC ' + channelLabel);
      this.closePeer_(false, cl);
      this.sctpPc.closeDataChannel(cl);
    }

    private closePeer_ = (close_client, label) => {
      var labelnm = label;
      if ('{}' === labelnm) {
        /*var err = new Error();
        console.log("server.js: closePeer_: got a bad label.  Stack trace: " +
            err.stack); */
      }
      // console.log("Peer DataChannel " + labelnm + " closed.");
      if (close_client) {
        // console.log("Peer DataChannel " + labelnm + " closing NetClient socket..");
        // var num_clients_found = 0;
        // TODO: Why is this checking the netclients on other peers?
        // for (var i in _peers) {
          // if (_peers[i].netClients[label]) {
            // _peers[i].netClients[label].close();
            // delete _peers[i].netClients[label];
            // num_clients_found++;
          // }
        // }
        /* if (num_clients_found === 0){
          console.log("Peer DataChannel " + labelnm + " close: We don't seem to have " +
              "that channel.");
        } */
      }
    }

  }  // class RTCToNet.Peer

  export class Server {
  }  // class RTCToNet.Server

}  // module RTCToNet

function initServer() {

  // Maintain a mapping of peerIds to peers.
  var _peers:{[peerId:string]:any} = {};
  var _active:boolean = true;  // this variable can only make things worse.

  function resetServer() {
    for (var contact in _peers) {
      _peers[contact].close();
      delete _peers[contact];
    }
    _peers = {};
    _active = false;
  }

  function initPeer(peerId) {
    console.log('rtc-to-net.ts: initPeer(' + peerId + ')'); //  _peers = " +
    if (!_peers[peerId]) {
      _peers[peerId] = new RTCToNet.Peer(peerId);
    }
  }

  freedom.on('start', function() {
    console.log("Starting server.");
    resetServer();
    _active = true;
  });

  // msg.peerId : string of the clientId for the peer being sent a message.
  // msg.data : message body received peerId signalling channel, typically
  //            contains SDP headers.
  //
  freedom.on('handleSignalFromPeer', function(msg) {
    console.log("server handleSignalFromPeer:" + JSON.stringify(msg));
    if (!_active) {
      console.log("server is not active, returning");
      return;
    }
    if (!msg.peerId) {
      console.error('No peer ID provided!.')
      return;
    }
    // TODO: Check for access control?
    console.log("sending to transport: " + JSON.stringify(msg.data));
    // Make a peer for this id if it doesn't already exist.
    if (!_peers[msg.peerId]) {
      initPeer(msg.peerId);
    }
    if (_peers[msg.peerId].signallingChannel){
      // Send response to peer.
      console.log('SENDING!!!!! ' + JSON.stringify(msg.data));
      //window.tmp = _peers[msg.peerId];
      _peers[msg.peerId].signallingChannel.emit('message', msg.data);
    } else {
      console.log('signallingChannel not yet ready. Adding to queue... ' + msg.peerId + ' ... ' + _peers);
      _peers[msg.peerId].messageQueue.push(msg.data);
    }
  });

  freedom.on('stop', resetServer);
  freedom.emit('ready', {});

  console.log('socks-rtc Server initialized.');
}

initServer();
