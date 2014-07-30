// SocksToRtc.Peer passes socks requests over WebRTC datachannels.

/// <reference path='../socks/socks-headers.ts' />
/// <reference path='../coreproviders/providers/uproxypeerconnection.d.ts' />
/// <reference path='../freedom-declarations/freedom.d.ts' />
/// <reference path='../handler/queue.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path='../peerconnection/datachannel.d.ts' />
/// <reference path='../peerconnection/peerconnection.d.ts' />
/// <reference path='../tcp/tcp.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

console.log('WEBWORKER SocksToRtc: ' + self.location.href);

module SocksToRtc {

  var tagNumber_ = 0;
  function obtainTag() {
    return 'c' + (tagNumber_++);
  }

  import PcLib = freedom_UproxyPeerConnection;


  interface Session {
    onceReady      :Promise<void>;
    tcpConnection  :Tcp.Connection;
  }

  // The |SocksToRtc| class runs a SOCKS5 proxy server which passes requests
  // remotely through WebRTC peer connections.
  export class SocksToRtc {
    // Holds the IP/port that the localhost socks server is listeneing to.
    public onceReady : Promise<Net.Endpoint>;
    // Message handler queues to/from the peer.
    public signalsToPeer   :Handler.Queue<string, void> =
        new Handler.Queue<string,void>();

    // Tcp server that is listening for SOCKS connections.
    private tcpServer_       :Tcp.Server = null;
    // The connection to the peer that is acting as the endpoint for the proxy
    // connection.
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
    constructor(endpoint:Net.Endpoint, pcConfig:WebRtc.PeerConnectionConfig) {
      // The |onceTcpServerReady| promise holds the address and port that the
      // tcp-server is listening on.
      var onceTcpServerReady :Promise<Net.Endpoint>;
      var oncePeerConnectionReady :Promise<WebRtc.ConnectionAddresses>;

      // Create SOCKS server and start listening.
      this.tcpServer_ = new Tcp.Server(endpoint, this.makeTcpToRtcSession_);
      // TODO: when |endpoint| uses a 0 port number, a dynamic port is assigned,
      // this should be returned by the underlying TCP listen call, and also
      // passed back so we don't just re-use input port.
      onceTcpServerReady = this.tcpServer_.listen().then(() => {
          return endpoint;
        });

      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP). This is
      // the Freedom channel object to sends signalling messages to the peer.
      oncePeerConnectionReady = this.setupPeerConnection_(pcConfig);

      // Make sure both promises are ready & we have the tcp-server endpoint.
      this.onceReady = oncePeerConnectionReady
        .then(() => { return onceTcpServerReady; });
    }

    // Stop SOCKS server and close peer-connection (and hence all data
    // channels).
    private stop = () => {
      this.signalsToPeer.clear();
      this.tcpServer_.shutdown();
      this.peerConnection_.close();
      this.tcpSessions_ = {};
    }

    private setupPeerConnection_ = (pcConfig:WebRtc.PeerConnectionConfig)
        : Promise<WebRtc.ConnectionAddresses> => {
      // SOCKS sessions biject to peerconnection datachannels.
      this.peerConnection_ = freedom['core.uproxypeerconnection']();
      this.peerConnection_.on('dataFromPeer', this.onDataFromPeer_);
      this.peerConnection_.on('peerClosedChannel', this.removeSession_);
      this.peerConnection_.on('peerOpenedChannel', (channelLabel:string) => {
        dbgErr('unexpected peerOpenedChannel event: ' +
            JSON.stringify(channelLabel));
      });
      this.peerConnection_.on('signalMessageToPeer',
          this.signalsToPeer.handle);
      return this.peerConnection_.negotiateConnection(pcConfig);
    }

    // Remove a session if it exists. May be called more than once, e.g. by
    // both tcpConnection closing, or by data channel closing.
    private removeSession_ = (channelLabel:string) : void => {
      if(!(channelLabel in this.tcpSessions_)) { return; }
      var tcpConnection = this.tcpSessions_[channelLabel].tcpConnection;
      if(!tcpConnection.isClosed()) { tcpConnection.close(); }
      this.peerConnection_.closeDataChannel(channelLabel);
      delete this.tcpSessions_[channelLabel];
    }

    // Setup a SOCKS5 TCP-to-rtc session from a tcp connection.
    private makeTcpToRtcSession_ = (tcpConnection:Tcp.Connection) : void => {
      var onceRequestReveiced :Promise<Socks.Request>;
      var onceChannelOpenned :Promise<void>;
      var onceReady :Promise<void>;
      var channelLabel :string;

      // Start data channel with the peer.
      channelLabel = obtainTag();
      onceChannelOpenned = this.peerConnection_.openDataChannel(channelLabel);

      // Handle a socks TCP request. Assumes: the first TCP packet is the socks-
      // request (assuming no packet fragmentation)
      onceRequestReveiced =
        new Promise<ArrayBuffer>((F,R) => {
          return tcpConnection.dataFromSocketQueue.setSyncNextHandler(F);
        })
        .then(Socks.interpretRequestBuffer);
      // The session is ready when the channel is open and we have sent the
      // request to the peer.
      onceReady = onceChannelOpenned
        .then(() => { return onceRequestReveiced; })
        .then((request:Socks.Request) => {
          this.peerConnection_.send(channelLabel,
                                    { str: JSON.stringify(request) });
          // TODO: this should be the real end-point send back by on rtc
          // channel
          tcpConnection.send(Socks.composeSocksResponse(request.destination));
          // Any further data just goes to the target site.
          tcpConnection.dataFromSocketQueue.setSyncHandler(
              (data:ArrayBuffer) => {
            this.peerConnection_.send(channelLabel,
                { buffer: new Uint8Array(data) });
          });
        })
        .catch((e) => {
          dbgWarn('TCP Server and peer connection failed to be created ' +
              'linked: ' + e +
              '; ' + tcpConnection.toString());
          this.removeSession_(channelLabel);
        });

      // After we have both a request and a data channel, send the request to
      // the peer and set the tcp datat handler for future traffic.
      this.tcpSessions_[channelLabel] =
        { tcpConnection: tcpConnection,
          onceReady: onceReady };

      tcpConnection.onceClosed.then(() => {
        this.removeSession_(channelLabel);
        // TODO: should we send a message on the data channel to say it should
        // be closed? (For Chrome < 37, where close messages don't propegate
        // properly).
      });
    }

    private onSignalFromPeer_ = (signal:WebRtc.SignallingMessage) : void => {
      this.peerConnection_.handleSignalMessage(signal);
    }

    // Data from the remote peer over WebRtc gets sent to the
    // socket that corresponds to the channel label.
    private onDataFromPeer_ = (rtcData:PcLib.LabelledDataChannelMessage)
        : void => {
      if(!(rtcData.channelLabel in this.tcpSessions_)) {
        dbgErr('onDataFromPeer_: no such channel: ' + rtcData.channelLabel);
        return;
      }
      if(!rtcData.message.buffer) {
        dbgErr('onDataFromPeer_: is not a buffer: ' + JSON.stringify(rtcData));
        return;
      }

      this.tcpSessions_[rtcData.channelLabel].tcpConnection
        .send(rtcData.message.buffer);
    }

    public toString = () : string => {
      var ret ='<SocksToRtc: failed toString()>';
      ret = JSON.stringify({ tcpServer_: this.tcpServer_.toString(),
                             tcpSessions_: this.tcpSessions_ });
      return ret;
    }
  }  // class SocksToRtc

  var modulePrefix_ = '[SocksToRtc] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module SocksToRtc
