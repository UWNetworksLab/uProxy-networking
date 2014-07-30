/*
  Server which handles socks connections over WebRTC datachannels.
*/
/// <reference path='../freedom-declarations/freedom.d.ts' />
/// <reference path='../freedom-declarations/transport.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path='../tcp/tcp.ts' />
/// <reference path='../socks/socks-headers.d.ts' />

console.log('WEBWORKER - RtcToNet: ' + self.location.href);

module RtcToNet {

  import PcLib = freedom_UproxyPeerConnection;

  interface Session {
    onceReady      :Promise<void>;
    tcpConnection ?:Tcp.Connection;
  }

  // The |RtcToNet| class holds a peer-connection and all its associated
  // proxied connections.
  export class RtcToNet {
    // Message handler queues to/from the peer.
    public signalsToPeer   :Handler.Queue<string, void> =
        new Handler.Queue<string,void>();

    // The connection to the peer that is acting as a proxy client.
    private peerConnection_  :PcLib.Pc = null;
    // From WebRTC data-channel labels to their TCP connections. Most of the
    // wiring to manage this relationship happens via promises of the
    // TcpConnection. We need this only for data being received from a peer-
    // connection data channel get raised with data channel label.  TODO:
    // https://github.com/uProxy/uproxy/issues/315 when closed allows
    // DataChannel and PeerConnection to be used directly and not via a freedom
    // interface. Then all work can be done by promise binding and this can be
    // removed.
    private tcpSessions_ :{ [channelLabel:string] : Session }

    // SocsToRtc server is given a localhost transport address (endpoint) to
    // start a socks server listening to, and a config for setting up a peer-
    // connection. If the given port is zero, platform chooses a port and this
    // listening port is returned by the promise.
    constructor(pcConfig:WebRtc.PeerConnectionConfig) {
      var oncePeerConnectionReady :Promise<WebRtc.ConnectionAddresses>;

      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP). This is
      // the Freedom channel object to sends signalling messages to the peer.
      oncePeerConnectionReady = this.setupPeerConnection_(pcConfig);
    }

    // Close the peer-connection (and hence all data channels) and all
    // associated TCP connections.
    private stop = () => {
      this.signalsToPeer.clear();
      this.peerConnection_.close();
      // CONSIDER: will peerConnection's closing of channels cause double-
      // attempts to close?
      var channelLabel :string;
      for (channelLabel in this.tcpSessions_) {
        this.tcpSessions_[channelLabel].close();
        delete this.tcpSessions_[channelLabel];
      }
    }

    private setupPeerConnection_ = (pcConfig:WebRtc.PeerConnectionConfig)
        : Promise<WebRtc.ConnectionAddresses> => {
      // SOCKS sessions biject to peerconnection datachannels.
      this.peerConnection_ = freedom['core.uproxypeerconnection']();
      this.peerConnection_.on('dataFromPeer', this.onDataFromPeer_);
      this.peerConnection_.on('peerClosedChannel', this.removeSession_);
      this.peerConnection_.on('peerOpenedChannel', (channelLabel:string) => {
        tcpSessions_[channelLabel] = {};
      });
      this.peerConnection_.on('signalMessageToPeer',
          this.signalsToPeer.handle);
      return this.peerConnection_.negotiateConnection(pcConfig);
    }

    // Remove a session if it exists. May be called more than once, e.g. by
    // both tcpConnection closing, or by data channel closing.
    private removeSession_ = (channelLabel:string) : void => {
      if(!(channelLabel in this.tcpSessions_)) { return; }
      var tcpConnection = this.tcpSessions_[channelLabel];
      if(!tcpConnection.isClosed()) { tcpConnection.close(); }
      this.peerConnection_.closeDataChannel(channelLabel);
      delete this.tcpSessions_[channelLabel];
    }

    private onSignalFromPeer_ = (signal:WebRtc.SignallingMessage) : void => {
      this.peerConnection_.handleSignalMessage(signal);
    }

    // Data from the remote peer over WebRtc gets sent to the socket that
    // corresponds to the channel label, or used to make a new TCP connection.
    private onDataFromPeer_ = (rtcData:PcLib.LabelledDataChannelMessage)
        : void => {
      if(!(rtcData.channelLabel in this.tcpSessions_ &&
         rtcData.message.buffer)) {
        dbgErr('onDataFromPeer_: no such channel to send data to: ' +
            rtcData.channelLabel);
        return;
      }

      // Control messages are sent as strings.
      if(rtcData.message.str) {
        var request :Socks.Request;
        try {
          request = JSON.parse(rtcData.message.str);
        } catch (e) {
          if(request.command === Socks.Command.TCP_CONNECT) {
            this.startNewTcpSession_(rtcData.channelLabel,
                                     request.destination.endpoint);
          } else {
            dbgErr('Unsupported command in SOCKS request: ' +
                JSON.stringify(rtcData.message.str));
            return;
          }
        }
      }

      // Data for TCP connection is send as buffers.
      if(rtcData.message.buffer) {
        this.tcpSessions_[rtcData.channelLabel]
          .send(rtcData.message.buffer);
      }
    }


    private startNewTcpSession_ = (channelLabel:string, endpoint: Net.Endpoint)
        : void => {
      var tcpConnection = new Tcp.Connection({ endpoint: endpoint});
      this.tcpSessions_[channelLabel] =
        { tcpConnection: tcpConnection,
          onceReady: tcpConnection.onceConnected };

      tcpConnection.onceClosed.then(() => {
        this.removeSession_(channelLabel);
        // TODO: should we send a message on the data channel to say it should
        // be closed? (For Chrome < 37, where close messages don't propegate
        // properly).
      });
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

  var modulePrefix_ = '[RtcToNet] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module RtcToNet
