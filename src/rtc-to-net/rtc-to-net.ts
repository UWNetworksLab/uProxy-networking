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
        var command:Channel.Command = JSON.parse(
            ArrayBuffers.arrayBufferToString(message.data));
        if (command.type == 'NetConnectRequest') {
          var request:Channel.NetConnectRequest = JSON.parse(command.data);
          if (command.tag in this.netClients) {
            dbgWarn('Net.Client already exists for datachannel: ' + command.tag);
            return;
          }
          var dest:Net.Destination = {
            host: request.address,
            port: request.port
          };
          // This is what we'll send to the client.
          var response:Channel.NetConnectResponse = {};
          this.prepareNetChannelLifecycle_(command.tag, dest)
              .then((endpointInfo:Channel.EndpointInfo) => {
                response.address = endpointInfo.ipAddrString;
                response.port = endpointInfo.port;
              }, (e) => {
                // Just want to catch any errors -- think of the next thennable
                // as a poor man's finally block.
              })
              .then(() => {
                var out:Channel.Command = {
                    type: 'NetConnectResponse',
                    tag: command.tag,
                    data: JSON.stringify(response)
                }
                this.transport.send('control', ArrayBuffers.stringToArrayBuffer(
                    JSON.stringify(out)));
              });
        } else {
          // TODO: support SocksDisconnected command
          dbgWarn('unsupported control command: ' + command.type);
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
     * Returns a promise to tie a Net.Client for Destination |dest| to
     * data-channel |tag|.
     */
    private prepareNetChannelLifecycle_ =
        (tag:string, dest:Net.Destination) : Promise<Channel.EndpointInfo> => {
      var netClient = new Net.Client(
          (data) => { this.transport.send(tag, data); },  // onResponse
          dest);
      return netClient.create().then((endpointInfo:Channel.EndpointInfo) => {
        this.netClients[tag] = netClient;
        // Send NetClient remote disconnections back to SOCKS peer, then shut the
        // data channel locally.
        netClient.onceDisconnected().then(() => {
          var command:Channel.Command = {
              type: 'NetDisconnected',
              tag: tag
          };
          this.transport.send('control', ArrayBuffers.stringToArrayBuffer(
              JSON.stringify(command)));
          dbg('send NET-DISCONNECTED ---> ' + tag);
        });
        return endpointInfo;
      });
    }

    // TODO: it's not clear what to do here
    private closeNetClient_ = () => {
      dbg('transport closed');
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
