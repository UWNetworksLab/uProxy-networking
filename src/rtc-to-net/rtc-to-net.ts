/*
  Server which handles socks connections over WebRTC datachannels.
*/
/// <reference path='../udp/udpclient.ts' />
/// <reference path='../freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../freedom-typescript-api/interfaces/transport.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />
/// <reference path='../interfaces/communications.d.ts' />
/// <reference path='../tcp/tcp.ts' />

console.log('WEBWORKER - RtcToNet: ' + self.location.href);

module RtcToNet {

  var fCore = freedom.core();

  //
  interface Connection {
    // 'tcp' or 'udp'.
    kind     :Channel.kind;
    // Address on which we connected to the remote server.
    endpoint :Net.Endpoint;
    // TCP connection to the endpoint
    conn     ?:Tcp.Connection;
  }

  /**
   * RtcToNet.Peer - serves net requests from WebRTC peer connections.
   */
  export class Peer {

    private signallingChannel_:any = null;
    private transport_:freedom.Transport = null;
    // TODO: this is messy...a common superclass would help
    private netClients:{[tag:string]:Tcp.Connection} = {};
    private udpClients:{[tag:string]:Net.UdpClient} = {};

    // Private state kept for ping-pong (heartbeat and ack).
    private pingPongCheckIntervalId_ :number = null;
    private lastPingPongReceiveDate_ :Date = null;

    // Static initialiser which returns a promise to create a new Peer
    // instance complete with a signalling channel for NAT piercing.
    static CreateWithChannel = (peerId :string)
        : Promise<Peer> => {
      return fCore.createChannel().then((channel) => {
        return new Peer(peerId, channel, server);
      });
    }

    constructor (public peerId:string, channel:freedom.ChannelSpecifier) {
      dbg('created new peer: ' + peerId);
      // peerconnection's data channels biject ot Net.Clients.
      this.transport_ = freedom['transport']();
      // TODO: rename: pass peer-data to net?
      this.transport_.on('onData', this.handleTransportData_);
      this.transport_.on('onClose', this.onCloseHandler_);
      this.transport_.setup('RtcToNet-' + peerId, channel.identifier).then(
        // TODO: emit signals when peer-to-peer connections are setup or fail.
        () => {
          dbg('RtcToNet transport.setup succeeded');
          // this.startPingPong_();
        },
        (e) => { dbgErr('RtcToNet transport.setup failed ' + e); }
      );
      // Signalling channel messages are batched and dispatched each second.
      // TODO: kill this loop!
      // TODO: size limit on batched message
      // TODO: this code is completely common to socks-to-rtc (growing need for shared lib)
      // TODO: https://github.com/uProxy/uProxy/issues/230
      var queuedMessages = [];
      setInterval(() => {
        if (queuedMessages.length > 0) {
          dbg('dispatching signalling channel messages...');
          freedom.emit('sendSignalToPeer', {
            peerId: peerId,
            data: JSON.stringify({
              version: 1,
              messages: queuedMessages
            })
          });
          queuedMessages = [];
        }
      }, 1000);

      this.signallingChannel_ = channel.channel;
      this.signallingChannel_.on('message', (msg) => {
        dbg('signalling channel message: ' + msg);
        queuedMessages.push(msg);
      });
      dbg('signalling channel to SCTP peer connection ready.');
    }

    // Handle a message we have received from the peer, which just involves
    // passing it to the transport provider.
    //
    // CONSIDER: when freedom supports better signalling, we be passing around
    // mechanisms to speak to signalling channel directly and avoid some of the
    // freedom-root module communication.
    public handleSignalFromPeer = (data:string) => {
      if (!this.signallingChannel_) {
        dbgErr('signalling channel missing!');
        return;
      }
      this.signallingChannel_.emit('message', data);
    }

    /**
     * Close PeerConnection and all TCP sockets.
     */
    private onCloseHandler_ = () => {
      dbg('transport closed with peerId ' + this.peerId);
      this.stopPingPong_();
      for (var i in this.netClients) {
        this.netClients[i].close();
      }
      for (var i in this.udpClients) {
        this.udpClients[i].close();
      }
      freedom.emit('rtcToNetConnectionClosed', this.peerId);
      // Set transport to null to ensure this object won't be accidentally
      // used again.
      this.transport_ = null;
    }

    public isClosed = () : boolean => {
      return this.transport_ === null;
    }

    // handle a request to create a new P2P network connection.
    private handleNetConnectRequest_ =
        (tag:string, request:Channel.NetConnectRequest) : void => {
      if ((tag in this.netClients) || (tag in this.udpClients)) {
        dbgErr('Net.Client already exists for datachannel: ' + tag);
        return;
      }
      this.connectClientToNet_(tag, request)
          .then((endpoint:Net.Endpoint) => {
            return endpoint;
          }, (e) => {
            dbgWarn('could not create netclient: ' + e.message);
            return undefined;
          })
          .then((endpoint?:Net.Endpoint) => {
            var response:Channel.NetConnectResponse = {};
            if (endpoint) {
              response.address = endpoint.address;
              response.port = endpoint.port;
            }
            var out:Channel.Command = {
                type: Channel.COMMANDS.NET_CONNECT_RESPONSE,
                tag: tag,
                data: JSON.stringify(response)
            }
            this.transport_.send('control',
                ArrayBuffers.stringToArrayBuffer(JSON.stringify(out)));
          });
    }

    private handleControlCommand_ = (command:Channel.Command) : void => {
      if (command.type === Channel.COMMANDS.NET_CONNECT_REQUEST) {
        var request:Channel.NetConnectRequest = JSON.parse(command.data);
        this.handleNetConnectRequest_(command.tag, request);
      } else if (command.type === Channel.COMMANDS.HELLO) {
        // Hello command is used to establish communication from socks-to-rtc,
        // just ignore it.
        dbg('received hello from peerId ' + this.peerId);
        freedom.emit('rtcToNetConnectionEstablished', this.peerId);
      }  else if (command.type === Channel.COMMANDS.PING) {
        this.lastPingPongReceiveDate_ = new Date();
        var command :Channel.Command = {type: Channel.COMMANDS.PONG};
        this.transport_.send('control', ArrayBuffers.stringToArrayBuffer(
            JSON.stringify(command)));
      } else if (command.type === Channel.COMMANDS.SOCKS_DISCONNECTED) {
        dbg('received SOCKS_DISCONNECTED with tag = ' + command.tag);
        if(command.tag in this.netClients) {
          this.netClients[command.tag].close();
        } else {
          dbg('failed to find netClient with tag = ' + command.tag);
        }
      } else {
        // TODO: support SocksDisconnected command
        dbgErr('Unsupported control command: ' + JSON.stringify(command));
      }
    }

    // Handle data sent transport.
    private handleTransportData_ =
        (message:freedom.Transport.IncomingMessage) : void => {
      if (!message.tag) {
        dbgErr('received message without datachannel tag!: ' + JSON.stringify(message));
        return;
      }
      if (message.tag == 'control') {
        var command:Channel.Command = JSON.parse(
          ArrayBuffers.arrayBufferToString(message.data));
        this.handleControlCommand_(command);
      } else {
        // Pass messages from peer connection to net.
        dbg(message.tag + ' <--- received ' + JSON.stringify(message));
        if(message.tag in this.netClients) {
          dbg('forwarding ' + message.data.byteLength +
              ' tcp bytes from datachannel ' + message.tag);
          this.netClients[message.tag].send(message.data);
        } else if (message.tag in this.udpClients) {
          dbg('forwarding ' + message.data.byteLength +
              ' udp bytes from datachannel ' + message.tag);
          this.udpClients[message.tag].send(message.data);
        } else {
          dbgErr('[RtcToNet] non-existent channel! Msg: ' +
                 JSON.stringify(message));
        }
      }
    }

    // connect a new TCP client to the destination and setup handling of being
    // disconnected and handling of data.
    private connectTcpClient_ = (tag :string, endpoint :Net.Endpoint)
        : Promise<Net.Endpoint> => {
      var netClient = new Tcp.Connection({ destination: endpoint });
      this.netClients[tag] = netClient;
      netClient.dataFromSocketQueue.setHandler((data) => {
        this.transport_.send(tag, data);
      });
      netClient.onceDisconnected.then(() => {
        var command:Channel.Command = {
            type: Channel.COMMANDS.NET_DISCONNECTED,
            tag: tag
        };
        this.transport_.send('control', ArrayBuffers.stringToArrayBuffer(
            JSON.stringify(command)));
        delete this.netClients[tag];
        dbg('send NET-DISCONNECTED ---> ' + tag);
      });
      return netClient.onceConnected;
    }

    /**
     * Returns a promise to tie a Net.Client for Destination |dest| to
     * data-channel |tag|.
     */
    // TODO: use endpoint everywhere and avoid having to construct/deconstruct
    // it.
    private connectClientToNet_ =
        (tag:string, request:Channel.NetConnectRequest)
        : Promise<Net.Endpoint> => {
      if (request.protocol === 'tcp') {
        return this.connectTcpClient_(tag, { address: request.address,
                                             port: request.port });
      } else {
        // UDP.
        var client = new Net.UdpClient(
            request.address,
            request.port,
            (data:ArrayBuffer) => { this.transport_.send(tag, data); });
        return client.bind()
            .then((endpoint:Net.Endpoint) => {
              dbg('udp socket is bound!');
              this.udpClients[tag] = client;
              return endpoint;
            });
      }
    }

    public close = () => {
      // Just call this.transport_.close, then let onCloseHandler_ do
      // the rest of the cleanup.
      this.transport_.close();
      dbg('RtcToNet.close: expect closing of all netclients shortly.');
    }

    /**
     * Sets up ping-pong (heartbearts and acks) with socks-to-rtc client.
     * This is necessary to detect disconnects from the other peer, since
     * WebRtc does not yet notify us if the peer disconnects (to be fixed
     * Chrome version 37), at which point we should be able to remove this code.
     */
    private startPingPong_ = () => {
      // PONGs from rtc-to-net will be returned to socks-to-rtc immediately
      // after PINGs are received, so we only need to set an interval to
      // check for PINGs received.
      var PING_PONG_CHECK_INTERVAL_MS :number = 10000;
      this.pingPongCheckIntervalId_ = setInterval(() => {
        var nowDate = new Date();
        if (!this.lastPingPongReceiveDate_ ||
            (nowDate.getTime() - this.lastPingPongReceiveDate_.getTime()) >
             PING_PONG_CHECK_INTERVAL_MS) {
          dbgWarn('no ping-pong detected, closing peer');
          this.transport_.close();
        }
      }, PING_PONG_CHECK_INTERVAL_MS);
    }

    private stopPingPong_ = () => {
      // Stop setInterval functions.
      if (this.pingPongCheckIntervalId_ !== null) {
        clearInterval(this.pingPongCheckIntervalId_);
        this.pingPongCheckIntervalId_ = null;
      }
      this.lastPingPongReceiveDate_ = null;
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
     * The peer has send us a message via the signalling channel.
     */
    public handleSignal = (signal:PeerSignal) => {
      if (!signal.peerId) {
        dbgErr('signal received with no peerId!');
        return;
      }
      // TODO: Check for access control?
      // dbg('sending signal to transport: ' + JSON.stringify(signal.data));
      this.fetchOrCreatePeer_(signal.peerId).then((peer) => {
        // TODO: this code is completely common to rtc-to-net (growing need for shared lib)
        try {
          var batchedMessages :Channel.BatchedMessages = JSON.parse(signal.data);
          if (batchedMessages.version != 1) {
            throw new Error('only version 1 batched messages supported');
          }
          for (var i = 0; i < batchedMessages.messages.length; i++) {
            var message = batchedMessages.messages[i];
            dbg('received signalling channel message: ' + message);
            peer.handleSignalFromPeer(message);
          }
        } catch (e) {
          dbgErr('could not parse batched messages: ' + e.message);
        }
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
     * Remove a peer from the server.  This should be called after the peer
     * closes its transport.
     */
    public removePeer(peerId :string) : void {
      if (!(peerId in this.peers_)) {
        dbgWarn('removePeer: peer not found ' + peerId);
        return;
      }

      this.peers_[peerId].then((peer) => {
        // Verify that peer's transport is closed before deleting.
        if (!peer.isClosed()) {
          dbgErr('Cannot remove unclosed peer, ' + peerId);
          return;
        }
        dbg('Removing peer: ' + peerId);
        delete this.peers_[peerId];
      }).catch((e) => { dbgErr('Error closing peer ' + peerId + ', ' + e); });
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
    server.reset();  // Fresh start!
    console.log('(re)started RtcToNet.');
  });
  freedom.on('handleSignalFromPeer', server.handleSignal);
  freedom.on('stop', server.reset);
  freedom.emit('ready', {});
  console.log('socks-rtc Server initialized.');
}

initServer();
