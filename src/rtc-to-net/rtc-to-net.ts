/*
  Server which handles socks connections over WebRTC datachannels.
*/

/// <reference path='../socks/socks-headers.ts' />
/// <reference path='../coreproviders/providers/uproxypeerconnection.d.ts' />
/// <reference path='../freedom-declarations/freedom.d.ts' />
/// <reference path='../handler/queue.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path='../peerconnection/datachannel.d.ts' />
/// <reference path='../peerconnection/peerconnection.d.ts' />
/// <reference path='../tcp/tcp.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

console.log('WEBWORKER - RtcToNet: ' + self.location.href);

module RtcToNet {

  import PcLib = freedom_UproxyPeerConnection;

  interface Session {
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
      // CONSIDER: will peerConnection's closing of channels make this un-
      // needed? is it better to include this anyway?
      var channelLabel :string;
      for (channelLabel in this.tcpSessions_) {
        this.removeSession_(channelLabel);
      }
    }

    private setupPeerConnection_ = (pcConfig:WebRtc.PeerConnectionConfig)
        : Promise<WebRtc.ConnectionAddresses> => {
      // SOCKS sessions biject to peerconnection datachannels.
      this.peerConnection_ = freedom['core.uproxypeerconnection'](pcConfig);
      this.peerConnection_.on('dataFromPeer', this.onDataFromPeer_);
      this.peerConnection_.on('peerClosedChannel', this.removeSession_);
      this.peerConnection_.on('peerOpenedChannel', (channelLabel:string) => {
        this.tcpSessions_[channelLabel] = {};
      });
      this.peerConnection_.on('signalForPeer',
          this.signalsToPeer.handle);
      return this.peerConnection_.negotiateConnection();
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
        this.tcpSessions_[rtcData.channelLabel].tcpConnection
          .send(rtcData.message.buffer);
      }
    }

    private startNewTcpSession_ = (channelLabel:string, endpoint: Net.Endpoint)
        : void => {
      this.peerConnection_.onceDataChannelClosed(channelLabel).then(() => {
          this.removeSession_(channelLabel);
      });
      var tcpConnection = new Tcp.Connection({ endpoint: endpoint});
      this.tcpSessions_[channelLabel].tcpConnection = tcpConnection;

      tcpConnection.onceClosed.then(() => {
        this.removeSession_(channelLabel);
        // TODO: should we send a message on the data channel to say it should
        // be closed? (For Chrome < 37, where close messages don't propegate
        // properly).
      });
    }
  }  // class RtcToNet

  var modulePrefix_ = '[RtcToNet] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module RtcToNet
