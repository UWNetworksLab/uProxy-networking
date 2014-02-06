/*
  Server which handles socks connections over WebRTC datachannels.
*/
console.log('SOCKS5 server: ' + self.location.href);
declare var freedom:any;

/// <reference path='netclient.ts' />


module RtcToNet {

  var FCore = freedom.core();

  interface PeerConnection {
    // TODO: Make these more typeful and probably shove into freedom.
    on:(event:string,f:any)=>void;
    setup:any;
    shutdown:any;
    send:any;
    closeDataChannel:any
  }

  /**
   * RtcToNet.Peer
   *
   * Serves requests from WebRTC peer connections.
   */
  export class Peer {

    private signallingChannel:any = null;
    private sctpPc:PeerConnection;
    private netClients:{[channelLabel:string]:Net.Client} = {};
    private messageQueue:any[];

    constructor (public peerId) {
      console.log('New RtcToNet.Peer: ' + peerId);
      this.netClients = {};
      this.messageQueue = [];

      // Set up the peer connection.
      this.sctpPc = freedom['core.sctp-peerconnection']();
      this.sctpPc.on('onReceived', (message) => {
        // console.log("Server got message: " + JSON.stringify(message));
        var label = message.channelLabel;
        if (!label) {
          console.error('Message received but missing channelLabel. Msg: ' +
                        JSON.stringify(message));
          return;
        }
        if (message.text) {
          // Text from the peer is used to set a new destination request.
          // Assumes "message.text" is a json of form:
          // { host: string, port: number }
          this.netClients[label] = new Net.Client(
              this.sendDataToPeer_.bind(this, label),
              this.closeClient_.bind(this, label),
              JSON.parse(message.text));
        } else if (message.buffer) {
          if(!(label in this.netClients)) {
            console.error('Message received for non-existent channel. Msg: ' +
              JSON.stringify(message));
            return;
          }
          // Buffer from the peer is data for the destination.
          this.netClients[label].send(message.buffer);
        } else {
          console.error('Message received but missing valid data field. Msg: ' +
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
    }

    // Send data over the peer's signalling channel, or queue if not ready.
    public sendSignal = (data:any) => {
      if (!this.signallingChannel) {
        console.log('RtcToNet:Peer[' + this.peerId + '] signallingChannel ' +
                    'not yet ready. Adding to queue... ');
        this.messageQueue.push(data);
        return;
      }
      this.signallingChannel.emit('message', data);
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
      if (close_client) {
        // console.log("Peer DataChannel " + labelnm + " closing NetClient socket..");
        // var num_clients_found = 0;
        // TODO: Do other peers actually share netclients with the same channel?
        // for (var i in peers_) {
          // if (peers_[i].netClients[label]) {
            // peers_[i].netClients[label].close();
            // delete peers_[i].netClients[label];
            // num_clients_found++;
          // }
        // }
        /* if (num_clients_found === 0){
          console.log("Peer DataChannel " + labelnm + " close: We don't seem to have " +
              "that channel.");
        } */
      }
    }

  }  // class RtcToNet.Peer


  export class Server {

    // Maintain a mapping of peerIds to peers.
    private peers_:{[peerId:string]:Peer} = {};

    /**
     * signal.peerId : of the peer sending the signal.
     * signal.data : message body from signalling channel, typically SDP headers.
     */
    public handleSignal = (signal) => {
      console.log('server handleSignalFromPeer:' + JSON.stringify(signal));
      if (!signal.peerId) {
        console.error('RtcToNet.Server: signal received with no peerId!');
        return;
      }
      // TODO: Check for access control?
      console.log('sending to transport: ' + JSON.stringify(signal.data));
      var peer = this.fetchPeer_(signal.peerId);
        // Send response to peer.
      peer.sendSignal(signal.data);
    }

    private fetchPeer_(peerId) {
      var peer = this.peers_[peerId];
      if (peer) {
        return peer;
      }
      // Create peer for this id if necessary.
      console.log('rtc-to-net.ts: new peer: ' + peerId);
      this.peers_[peerId] = peer = new RtcToNet.Peer(peerId);
      return peer;
    }

    /** Close all peers on this server. */
    public reset = () => {
      for (var contact in this.peers_) {
        this.peers_[contact].close();
        delete this.peers_[contact];
      }
      this.peers_ = {};
    }

  }  // class RtcToNet.Server

}  // module RtcToNet


function initServer() {
  var server = new RtcToNet.Server();
  freedom.on('start', () => {
    console.log('Starting server.');
    server.reset();  // Fresh start!
  });
  freedom.on('handleSignalFromPeer', server.handleSignal);
  freedom.on('stop', server.reset);
  freedom.emit('ready', {});
  console.log('socks-rtc Server initialized.');
}

initServer();
