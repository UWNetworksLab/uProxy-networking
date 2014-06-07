/*
  Server which handles socks connections over WebRTC datachannels.
*/
/// <reference path='../tcp/netclient.ts' />
/// <reference path='../udp/udpclient.ts' />
/// <reference path='../freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../freedom-typescript-api/interfaces/transport.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />
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
    // TODO: this is messy...a common superclass would help
    private netClients:{[tag:string]:Net.Client} = {};
    private udpClients:{[tag:string]:Net.UdpClient} = {};
    private server_ :Server = null;

    // Private state kept for ping-pong (heartbeat and ack).
    private pingPongCheckIntervalId_ :number = null;
    private lastPingPongReceiveDate_ :Date = null;

    // Static initialiser which returns a promise to create a new Peer
    // instance complete with a signalling channel for NAT piercing.
    static CreateWithChannel = (peerId :string, server :Server)
        : Promise<Peer> => {
      return fCore.createChannel().then((channel) => {
        return new Peer(peerId, channel, server);
      });
    }

    constructor (public peerId:string, channel, server) {
      dbg('created new peer: ' + peerId);
      // peerconnection's data channels biject ot Net.Clients.
      this.server_ = server;
      this.transport = freedom['transport']();
      this.transport.on('onData', this.passPeerDataToNet_);
      this.transport.on('onClose', this.onCloseHandler_);
      this.transport.setup('RtcToNet-' + peerId, channel.identifier).then(
        // TODO: emit signals when peer-to-peer connections are setup or fail.
        () => {
          dbg('RtcToNet transport.setup succeeded');
          this.startPingPong_();
        },
        (e) => { dbgErr('RtcToNet transport.setup failed ' + e); }
      );

      // Signalling channel messages are batched and dispatched each second.
      // TODO: kill this loop!
      // TODO: size limit on batched message
      // TODO: this code is completely common to socks-to-rtc (growing need for shared lib)
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

      this.signallingChannel = channel.channel;
      this.signallingChannel.on('message', (msg) => {
        dbg('signalling channel message: ' + msg);
        queuedMessages.push(msg);
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
      this.transport = null;
      this.server_.removePeer(this.peerId);
    }

    public isClosed = () : boolean => {
      return this.transport === null;
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
        if (command.type === Channel.COMMANDS.NET_CONNECT_REQUEST) {
          var request:Channel.NetConnectRequest = JSON.parse(command.data);
          if ((command.tag in this.netClients) ||
              (command.tag in this.udpClients)) {
            dbgWarn('Net.Client already exists for datachannel: ' + command.tag);
            return;
          }
          this.prepareNetChannelLifecycle_(command.tag, request)
              .then((endpoint:Net.AddressAndPort) => {
                return endpoint;
              }, (e) => {
                dbgWarn('could not create netclient: ' + e.message);
                return undefined;
              })
              .then((endpoint?:Net.AddressAndPort) => {
                var response:Channel.NetConnectResponse = {};
                if (endpoint) {
                  response.address = endpoint.address;
                  response.port = endpoint.port;
                }
                var out:Channel.Command = {
                    type: Channel.COMMANDS.NET_CONNECT_RESPONSE,
                    tag: command.tag,
                    data: JSON.stringify(response)
                }
                this.transport.send('control',
                    ArrayBuffers.stringToArrayBuffer(JSON.stringify(out)));
              });
        } else if (command.type === Channel.COMMANDS.HELLO) {
          // Hello command is used to establish communication from socks-to-rtc,
          // just ignore it.
          dbg('received hello from peerId ' + this.peerId);
          freedom.emit('rtcToNetConnectionEstablished', this.peerId);
        }  else if (command.type === Channel.COMMANDS.PING) {
          this.lastPingPongReceiveDate_ = new Date();
          var command :Channel.Command = {type: Channel.COMMANDS.PONG};
          this.transport.send('control', ArrayBuffers.stringToArrayBuffer(
              JSON.stringify(command)));
        } else {
          // TODO: support SocksDisconnected command
          dbgWarn('unsupported control command: ' + JSON.stringify(command));
        }
      } else {
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
          dbgErr('[RtcToNet] non-existent channel! Msg: ' + JSON.stringify(message));
        }
      }
    }

    /**
     * Returns a promise to tie a Net.Client for Destination |dest| to
     * data-channel |tag|.
     */
    private prepareNetChannelLifecycle_ =
        (tag:string, request:Channel.NetConnectRequest) : Promise<Net.AddressAndPort> => {
      if (request.protocol == 'tcp') {
        var dest:Net.AddressAndPort = {
          address: request.address,
          port: request.port
        };
        var netClient = new Net.Client(
            (data) => { this.transport.send(tag, data); },  // onResponse
            dest);
        return netClient.create().then((endpoint:Net.AddressAndPort) => {
          this.netClients[tag] = netClient;
          // Send NetClient remote disconnections back to SOCKS peer, then shut the
          // data channel locally.
          netClient.onceDisconnected().then(() => {
            var command:Channel.Command = {
                type: Channel.COMMANDS.NET_DISCONNECTED,
                tag: tag
            };
            this.transport.send('control', ArrayBuffers.stringToArrayBuffer(
                JSON.stringify(command)));
            dbg('send NET-DISCONNECTED ---> ' + tag);
          });
          return endpoint;
        });
      } else {
        // UDP.
        var client = new Net.UdpClient(
            request.address,
            request.port,
            (data:ArrayBuffer) => { this.transport.send(tag, data); });
        return client.bind()
            .then((endpoint:Net.AddressAndPort) => {
              dbg('udp socket is bound!');
              this.udpClients[tag] = client;
              return endpoint;
            });
      }
    }

    public close = () => {
      // Just call this.transport.close, then let onCloseHandler_ do
      // the rest of the cleanup.
      this.transport.close();
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
          this.transport.close();
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
        // TODO: this code is completely common to rtc-to-net (growing need for shared lib)
        try {
          var batchedMessages :Channel.BatchedMessages = JSON.parse(signal.data);
          if (batchedMessages.version != 1) {
            throw new Error('only version 1 batched messages supported');
          }
          for (var i = 0; i < batchedMessages.messages.length; i++) {
            var message = batchedMessages.messages[i];
            dbg('received signalling channel message: ' + message);
            peer.sendSignal(message);
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
      var peer = RtcToNet.Peer.CreateWithChannel(peerId, this);
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
