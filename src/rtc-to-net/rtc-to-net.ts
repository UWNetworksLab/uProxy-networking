/*
  Server which handles socks connections over WebRTC datachannels.
*/
/// <reference path='netclient.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/transport.d.ts' />
/// <reference path='../common/arraybuffers.ts' />
/// <reference path='../interfaces/communications.d.ts' />

console.log('WEBWORKER - RtcToNet: ' + self.location.href);

module RtcToNet {

  var fCore = freedom.core();

  /**
   * RtcToNet.Peer - serves net requests from WebRTC peer connections.
   */
  export class Peer {

    private signallingChannel:any = null;
    private transport:freedom.Transport = null;
    private netClients:{[tag:string]:Net.Client} = {};

    // Static initialiser which returns a promise to create a new Peer
    // instance complete with a signalling channel for NAT piercing.
    static CreateWithChannel = (peerId:string) : Promise<Peer> => {
      return fCore.createChannel().then((channel) => {
        return new Peer(peerId, channel);
      });
    }

    constructor (public peerId:string, channel) {
      dbg('created new peer: ' + peerId);
      // peerconnection's data channels biject ot Net.Clients.
      this.transport = freedom['transport']();
      this.transport.on('onData', this.passPeerDataToNet_);
      this.transport.on('onClose', this.closeNetClient_);
      this.transport.setup('RtcToNet-' + peerId, channel.identifier);
      this.signallingChannel = channel.channel;
      this.signallingChannel.on('message', (msg) => {
        freedom.emit('sendSignalToPeer', {
            peerId: peerId,
            data: msg
        });
      });
      dbg('signalling channel to SCTP peer connection ready.');
    }

    /**
     * Send data over the peer's signalling channel, or queue if not ready.
     */
    // TODO(yagoon): rename this handleSignal()
    public sendSignal = (data:string) => {
      if (!this.signallingChannel) {
        dbgErr('signalling channel missing!');
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
      this.transport.close();
    }

    /**
     * Pass messages from peer connection to net.
     */
    private passPeerDataToNet_ = (message:freedom.Transport.IncomingMessage) => {
      // TODO: This handler is also O(n) for ALL the data channels. Super
      // terrible. Maybe it's fixed after freedom 0.2?
      if (!message.tag) {
        dbgErr('received message without datachannel tag!: ' + JSON.stringify(message));
        return;
      }

      if (message.tag == 'control') {
        var commandText = ArrayBuffers.arrayBufferToString(message.data);
        var command:any = JSON.parse(commandText);
        if (command.command == 'SOCKS-CONNECT') {
          if (command.tag in this.netClients) {
            dbgWarn('Net.Client already exists for datachannel: ' + command.tag);
            return;
          }
          var dest:Net.Destination = JSON.parse(commandText);
          this.prepareNetChannelLifecycle_(command.tag, dest);
        }
      } else {
        dbg(message.tag + ' <--- received ' + JSON.stringify(message));
        if(!(message.tag in this.netClients)) {
          dbgErr('[RtcToNet] non-existent channel! Msg: ' + JSON.stringify(message));
          return;
        }
        // Buffer from the peer is data for the destination.
        dbg('forwarding ' + message.data.byteLength + ' bytes from datachannel ' + message.tag);
        this.netClients[message.tag].send(message.data);
      }
    }

    /**
     * Return data from Net to Peer.
     */
    private serveDataToPeer_ = (tag:string, data:ArrayBuffer) => {
      dbg('reply ' + data.byteLength + ' bytes ---> ' + tag);
      this.transport.send(tag, data);
    }

    /**
     * Tie a Net.Client for Destination |dest| to data-channel |tag|.
     */
    private prepareNetChannelLifecycle_ =
        (tag:string, dest:Net.Destination) => {
      var netClient = this.netClients[tag] = new Net.Client(
          (data) => { this.serveDataToPeer_(tag, data); },  // onResponse
          dest);
      // Send NetClient remote disconnections back to SOCKS peer, then shut the
      // data channel locally.
      netClient.onceDisconnected().then(() => {
        var commandText = JSON.stringify({
          command: 'NET-DISCONNECTED',
          tag: tag
        });
        var buffer = ArrayBuffers.stringToArrayBuffer(commandText);
        this.transport.send('control', buffer);
        dbg('send NET-DISCONNECTED ---> ' + tag);
      });
    }

    /**
     * Close an individual Net.Client when its data channel closes.
     */
    private closeNetClient_ = (channelData:Channel.CloseData) => {
      var channelId = channelData.channelId;
      if (!(channelId in this.netClients)) {
        dbgWarn('no Net.Client to close for ' + channelId)
        return;
      }
      dbg('closing Net.Client for closed datachannel ' + channelId);
      this.netClients[channelId].close();
      delete this.netClients[channelId];
    }
  }  // class RtcToNet.Peer


  /**
   * RtcToNet.Server - signals and serves peers.
   */
  export class Server {

    // Mapping from peerIds to Peer-creation promises.
    // Store promises because creating Peer objects is an asynchronous process.
    private peers_:{[peerId:string]:Promise<Peer>} = {};

    /**
     * Send PeerSignal over peer's signallin chanel.
     */
    public handleSignal = (signal:PeerSignal) => {
      if (!signal.peerId) {
        dbgErr('signal received with no peerId!');
        return;
      }
      // TODO: Check for access control?
      // dbg('sending signal to transport: ' + JSON.stringify(signal.data));
      this.fetchOrCreatePeer_(signal.peerId).then((peer) => {
        peer.sendSignal(signal.data);
      });
    }

    /**
     * Obtain, and possibly create, a RtcToNet.Peer for |peerId|.
     */
    private fetchOrCreatePeer_(peerId:string) : Promise<Peer>{
      if (peerId in this.peers_) {
        return this.peers_[peerId];
      }
      var peer = RtcToNet.Peer.CreateWithChannel(peerId);
      this.peers_[peerId] = peer;
      return peer;
    }

    /**
     * Close all peers on this server.
     */
    public reset = () => {
      for (var contact in this.peers_) {
        this.peers_[contact].then((peer) => {
          peer.close();
        });
        delete this.peers_[contact];
      }
      this.peers_ = {};
    }

  }  // class RtcToNet.Server

  var modulePrefix_ = '[RtcToNet] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

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
