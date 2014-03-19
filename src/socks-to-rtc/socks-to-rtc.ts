/*
  SocksToRTC.Peer passes socks requests over WebRTC datachannels.
*/
/// <reference path='socks.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/transport.d.ts' />
/// <reference path='../common/arraybuffers.ts' />
/// <reference path='../interfaces/communications.d.ts' />

// TODO replace with a reference to freedom ts interface once it exists.
console.log('WEBWORKER SocksToRtc: ' + self.location.href);

module SocksToRTC {

  var fCore = freedom.core();

  /**
   * SocksToRTC.Peer
   *
   * Contains a local SOCKS server which passes requests remotely through
   * WebRTC peer connections.
   */
  export class Peer {

    private socksServer:Socks.Server = null;  // Local SOCKS server.
    private signallingChannel:any = null;     // NAT piercing route.
    private transport:freedom.Transport = null;     // For actual proxying.

    // Active SOCKS sessions, by datachannel tag name.
    private socksSessions:{[tag:string]:Socks.Session} = {};
    private peerId:string = null;         // Of the remote rtc-to-net peer.

    // Connection callbacks, by datachannel tag name.
    // TODO: figure out a more elegant way to store these callbacks
    private static connectCallbacks:{[tag:string]:(response:Channel.NetConnectResponse) => void} = {};

    /**
     * Start the Peer, based on the remote peer's info.
     */
    public start = (remotePeer:PeerInfo) => {
      this.reset();  // Begin with fresh components.
      dbg('starting - target peer: ' + JSON.stringify(remotePeer));
      // Bind peerID to scope so promise can work.
      var peerId = this.peerId = remotePeer.peerId;
      if (!peerId) {
        dbgErr('no Peer ID provided! cannot connect.');
        return false;
      }
      // SOCKS sessions biject to peerconnection datachannels.
      this.transport = freedom['transport']();
      this.transport.on('onData', this.onDataFromPeer);
      this.transport.on('onClose', this.closeConnectionToPeer);
      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP)
      fCore.createChannel().then((chan) => {
        this.transport.setup('SocksToRtc-' + peerId, chan.identifier);
        this.signallingChannel = chan.channel;
        this.signallingChannel.on('message', function(msg) {
          freedom.emit('sendSignalToPeer', {
              peerId: peerId,
              data: msg
          });
        });
        dbg('signalling channel to SCTP peer connection ready.');
      });  // fCore.createChannel

      // Create SOCKS server and start listening.
      this.socksServer = new Socks.Server(remotePeer.host, remotePeer.port,
                                          this.onConnection_);
      this.socksServer.listen();
    }

    /**
     * Stop SOCKS server and close data channels and peer connections.
     */
    public reset = () => {
      dbg('resetting peer...');
      if (this.socksServer) {
        this.socksServer.disconnect();  // Disconnects internal TCP server.
        this.socksServer = null;
      }
      for (var tag in this.socksSessions) {
        this.closeConnectionToPeer(tag);
      }
      this.socksSessions = {};
      if(this.transport) {
        this.transport.close();
        this.transport = null;
      }
      if (this.signallingChannel) {  // TODO: is this actually right?
        this.signallingChannel.emit('close');
      }
      this.signallingChannel = null;
      this.peerId = null;
    }

    /**
     * Setup new data channel and tie to corresponding SOCKS5 session.
     * Returns: IP and port of destination.
     */
    private onConnection_ = (session:Socks.Session, address, port, protocol)
        :Promise<Channel.EndpointInfo> => {
      // We don't have a way to pipe UDP traffic through the datachannel
      // just yet so, for now, just exit early in the UDP case.
      // TODO(yangoon): pipe UDP traffic through the datachannel
      // TODO(yangoon): serious refactoring needed here!
      if (protocol == 'udp') {
        return Promise.resolve({ ipAddrString: '127.0.0.1', port: 0 });
      }

      if (!this.transport) {
        dbgWarn('transport not ready');
        return;
      }

      // Generate a name for this connection and associate it with the SOCKS session.
      var tag = obtainTag();
      this.tieSessionToChannel_(session, tag);

      // This gets a little funky: ask the peer to establish a connection to
      // the remote host and register a callback for when it gets back to us
      // on the control channel.
      // TODO: how to add a timeout, in case the remote end never replies?
      return new Promise((F,R) => {
        Peer.connectCallbacks[tag] = (response:Channel.NetConnectResponse) => {
          if (response.address) {
            F({
              ipAddrString: response.address,
              port: response.port
            });
          } else {
            R(new Error('could not create datachannel'));
          }
        }
        var request:Channel.NetConnectRequest = {
          protocol: 'tcp',
          address: address,
          port: port
        };
        var command:Channel.Command = {
            type: 'NetConnectRequest',
            tag: tag,
            data: JSON.stringify(request)
        };
        this.transport.send('control', ArrayBuffers.stringToArrayBuffer(
            JSON.stringify(command)));
      });
    }

    /**
     * Create one-to-one relationship between a SOCKS session and a datachannel.
     */
    private tieSessionToChannel_ = (session:Socks.Session, tag:string) => {
      this.socksSessions[tag] = session;
      // When the TCP-connection receives data, send to sctp peer.
      // When it disconnects, clear the |tag|.
      session.onRecv((buf) => { this.sendToPeer_(tag, buf); });
      session.onceDisconnected().then(() => {
        var command:Channel.Command = {
            type: 'SocksDisconnected',
            tag: tag
        };
        this.transport.send('control', ArrayBuffers.stringToArrayBuffer(
            JSON.stringify(command)));
      });
    }

    /**
     * Receive replies proxied back from the remote RtcToNet.Peer and pass them
     * back across underlying SOCKS session / TCP socket.
     */
    private onDataFromPeer = (msg:freedom.Transport.IncomingMessage) => {
      dbg(msg.tag + ' <--- received ' + msg.data.byteLength);
      if (!msg.tag) {
        dbgErr('received message without datachannel tag!: ' + JSON.stringify(msg));
        return;
      }

      if (msg.tag == 'control') {
        var command:Channel.Command = JSON.parse(
            ArrayBuffers.arrayBufferToString(msg.data));

        if (command.type == 'NetConnectResponse') {
          var response:Channel.NetConnectResponse = JSON.parse(command.data);
          Peer.connectCallbacks[command.tag](response);
        } else if (command.type == 'NetDisconnected') {
          // Receiving a disconnect on the remote peer should close SOCKS.
          dbg(command.tag + ' <--- received NET-DISCONNECTED');
          this.closeConnectionToPeer(command.tag);
        } else {
          dbgWarn('unsupported control command: ' + command.type);
        }
      } else {
        if (!(msg.tag in this.socksSessions)) {
          dbgErr('unknown datachannel ' + msg.tag);
          return;
        }
        var session = this.socksSessions[msg.tag];
        session.sendData(msg.data);
      }
    }

    /**
     * Close a particular SOCKS session.
     */
    private closeConnectionToPeer = (tag:string) => {
      dbg('datachannel ' + tag + ' has closed. ending SOCKS session for channel.');
      this.socksServer.endSession(this.socksSessions[tag]);
      delete this.socksSessions[tag];
    }

    /**
     * Send data over SCTP to peer, via data channel |tag|.
     *
     * Side note: When Transport encounters a 'new' |tag|, it
     * implicitly creates a new data channel.
     */
    private sendToPeer_ = (tag:string, buffer:ArrayBuffer) => {
      if (!this.transport) {
        dbgWarn('transport not ready');
        return;
      }
      dbg('send ' + buffer.byteLength + ' bytes on datachannel ' + tag);
      this.transport.send(tag, buffer);
    }

    /**
     * Pass any messages coming from remote peer through the signalling channel
     * handled by freedom, which goes to the signalling channel input of the
     * peer connection.
     */
    public handlePeerSignal = (msg:PeerSignal) => {
      // dbg('client handleSignalFromPeer: ' + JSON.stringify(msg) +
                  // ' with state ' + this.toString());
      if (!this.signallingChannel) {
        dbgErr('signalling channel missing!');
        return;
      }
      this.signallingChannel.emit('message', msg.data);
    }

    public toString = () => {
      var ret ='<SocksToRTC.Peer: failed toString()>';
      try {
        ret = JSON.stringify({ socksServer: this.socksServer,
                               transport: this.transport,
                               peerId: this.peerId,
                               signallingChannel: this.signallingChannel,
                               socksSessions: this.socksSessions });
      } catch (e) {}
      return ret;
    }

  }  // SocksToRTC.Peer

  // TODO: reuse tag names from a pool.
  function obtainTag() {
    return 'c' + Math.random();
  }

  var modulePrefix_ = '[SocksToRtc] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module SocksToRTC


function initClient() {

  // Create local peer and attach freedom message handlers, then emit |ready|.
  var peer = new SocksToRTC.Peer();
  freedom.on('handleSignalFromPeer', peer.handlePeerSignal);
  freedom.on('start', peer.start);
  freedom.on('stop', peer.reset);
  freedom.emit('ready', {});
}


initClient();
