/*
  Server which handles socks connections over WebRTC datachannels.
*/
console.log('SOCKS5 server: ' + self.location.href);
declare var freedom:any;

/// <reference path='netclient.ts' />
/// <reference path='../interfaces/peerconnection.d.ts' />
/// <reference path='../interfaces/communications.d.ts' />

module RtcToNet {

  var fCore = freedom.core();

  /**
   * RtcToNet.Peer - serves net requests from WebRTC peer connections.
   */
  export class Peer {

    private signallingChannel:any = null;
    private sctpPc:PeerConnection;
    private netClients:{[channelLabel:string]:Net.Client} = {};
    private messageQueue:string[] = [];  // Remove with freedom 0.2.0

    constructor (public peerId:string) {
      console.log('New RtcToNet.Peer: ' + peerId);
      this.netClients = {};

      // Set up peer connection to tie data channels to Net.Clients.
      // There is a bijection between data channels and Net.Clients.
      this.sctpPc = freedom['core.sctp-peerconnection']();
      this.sctpPc.on('onReceived', this.passPeerDataToNet_);
      this.sctpPc.on('onCloseDataChannel', this.closeNetClient_);

      // Create a signalling channel.
      fCore.createChannel().done((chan) => {
        this.sctpPc.setup(chan.identifier, 'RtcToNet-' + this.peerId, false);
        chan.channel.done((channel) => {
          channel.on('message', (msg) => {
            freedom.emit('sendSignalToPeer', {
                peerId: this.peerId,
                data: msg
            });
          });
          // sctpPc will emit 'ready' when it is ready, and at that point we
          // have successfully initialised this peer connection and can set the
          // signalling channel and process any messages we have been sent.
          // setupPromise.done(function() {
          // TODO: remove once we're using freedom 0.2.0, where signalling
          // channels will automatically be ready.
          channel.on('ready', () => {
            this.signallingChannel = channel;
            while(this.messageQueue.length > 0) {
              this.signallingChannel.emit('message', this.messageQueue.shift());
            }
          });
        });
      });
    }

    /**
     * Send data over the peer's signalling channel, or queue if not ready.
     */
    public sendSignal = (data:string) => {
      if (!this.signallingChannel) {
        console.log('RtcToNet:Peer[' + this.peerId + '] signallingChannel ' +
                    'not yet ready. Adding to queue... ');
        this.messageQueue.push(data);
        return;
      }
      this.signallingChannel.emit('message', data);
    }

    /**
     * Close PeerConnection and all TCP sockets.
     */
    public close = () => {
      for (var i in this.netClients) {
        this.netClients[i].close();  // Will close its data channel.
      }
        this.sctpPc.close();
    }

    /**
     * Pass messages from peer connection to net.
     */
    private passPeerDataToNet_ = (message:Channel.Message) => {
      // TODO: This handler is also O(n) for ALL the data channels. Super
      // terrible. Maybe it's fixed after freedom 0.2?
      var label = message.channelLabel;
      if (!label) {
        console.error('Message received but missing channelLabel. Msg: ' +
                      JSON.stringify(message));
        return;
      }

      if (message.text) {
        // Text from the peer indicates request for a new destination.
        // Assumes |message.text| is a Net.Destination.
        console.log(label + ' <- new request: ' + message.text);
        if (label in this.netClients) {
          console.warn('Net.Client already exists for data channel: ' + label);
          return;
        }
        this.prepareNetChannelLifecycle_(label, JSON.parse(message.text));

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
    }

    /**
     * Return data from Net to Peer.
     */
    private serveDataToPeer_ = (channelLabel:string, data:ArrayBuffer) => {
      // TODO: peer connection is firing a response for *every* channelLabel.
      // There is no way to actualy distinguish.
      console.log('RtcToNet: replying with ' + data.byteLength + ' bytes '+
                  '-----> ' + channelLabel);
      this.sctpPc.send({
          'channelLabel': channelLabel,
          'buffer': data
      });
    }

    /**
     * Tie a Net.Client for Destination |dest| to data-channel |label|.
     */
    private prepareNetChannelLifecycle_ =
        (label:string, dest:Net.Destination) => {
      var netClient = this.netClients[label] = new Net.Client(
          (data) => { this.serveDataToPeer_(label, data); },  // onResponse
          dest);
      netClient.onceClosed()
          .then(() => { this.closeDataChannel_(label) });
    }

    /**
     * Close an individual Net.Client when its data channel closes.
     *
     * TODO: Figure out type for |arg|.
     */
    private closeNetClient_ = (arg) => {
      if (!(arg.channelId in this.netClients)) {
        console.warn('No Net.Client to close for ' + arg.channelId)
        return;
      }
      console.log('Net.Client: CLOSE! ' + arg.channelId);
      this.netClients[arg.channelId].close();
      delete this.netClients[arg.channelId];
    }

    /**
     * Close an individual data channel when its Net.Client closes.
     *
     * Data channels are created automatically in Peer Connection when a new
     * label is encountered, but must be explicitly closed here.
     * TODO: Re-use data channels from a pool.
     */
    private closeDataChannel_ = (channelLabel:string) => {
      this.sctpPc.closeDataChannel(channelLabel);
    }

  }  // class RtcToNet.Peer


  /**
   * RtcToNet.Server - signals and serves peers.
   */
  export class Server {

    // Maintain a mapping of peerIds to peers.
    private peers_:{[peerId:string]:Peer} = {};

    /**
     * Send PeerSignal over peer's signallin chanel.
     */
    public handleSignal = (signal:PeerSignal) => {
      if (!signal.peerId) {
        console.error('RtcToNet.Server: signal received with no peerId!');
        return;
      }
      // TODO: Check for access control?
      console.log('RtcToNet: sending signal to transport: ' + JSON.stringify(signal.data));
      var peer = this.fetchOrCreatePeer_(signal.peerId);
      peer.sendSignal(signal.data);
    }

    /**
     * Obtain, and possibly create, a RtcToNet.Peer for |peerId|.
     */
    private fetchOrCreatePeer_(peerId:string) {
      var peer = this.peers_[peerId];
      if (peer) {
        return peer;
      }
      this.peers_[peerId] = peer = new RtcToNet.Peer(peerId);
      return peer;
    }

    /**
     * Close all peers on this server.
     */
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
