/*
  Server which handles socks connections over WebRTC datachannels.
*/

/// <reference path='../socks/socks-headers.ts' />
/// <reference path='../freedom/coreproviders/uproxypeerconnection.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../handler/queue.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../tcp/tcp.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

console.log('WEBWORKER - RtcToNet: ' + self.location.href);

module RtcToNet {

  import PcLib = freedom_UproxyPeerConnection;

  // The |RtcToNet| class holds a peer-connection and all its associated
  // proxied connections.
  export class RtcToNet {
    // Message handler queues to/from the peer.
    public signalsForPeer   :Handler.Queue<WebRtc.SignallingMessage, void> =
        new Handler.Queue<WebRtc.SignallingMessage,void>();

    // This promise is fulfilled once the peer connection is stablished and
    // this module is ready to start making tcp connections.
    public onceReady :Promise<void>;
    // Fulfilled when the peer connection is closed.
    public onceClosed :Promise<void>;

    // The connection to the peer that is acting as a proxy client.
    private peerConnection_  :PcLib.Pc = null;
    // The |sessions_| map goes from WebRTC data-channel labels to the Session.
    // Most of the wiring to manage this relationship happens via promises. We
    // need this only for data being received from a peer-connection data
    // channel get raised with data channel label. TODO:
    // https://github.com/uProxy/uproxy/issues/315 when closed allows
    // DataChannel and PeerConnection to be used directly and not via a freedom
    // interface. Then all work can be done by promise binding and this can be
    // removed.
    private sessions_ :{ [channelLabel:string] : Session }

    // SocsToRtc server is given a localhost transport address (endpoint) to
    // start a socks server listening to, and a config for setting up a peer-
    // connection. If the given port is zero, platform chooses a port and this
    // listening port is returned by the promise.
    //
    // TODO: add checking of fingerprints.
    constructor(pcConfig:WebRtc.PeerConnectionConfig) {
      // Messages received via signalling channel must reach the remote peer
      // through something other than the peerconnection. (e.g. XMPP). This is
      // the Freedom channel object to sends signalling messages to the peer.
      // SOCKS sessions biject to peerconnection datachannels.
      this.sessions_ = {};
      this.peerConnection_ = freedom['core.uproxypeerconnection'](pcConfig);
      this.peerConnection_.on('dataFromPeer', this.onDataFromPeer_);
      this.peerConnection_.on('peerOpenedChannel', (channelLabel:string) => {
        this.sessions_[channelLabel] =
            new Session(this.peerConnection_, channelLabel);
      });
      this.peerConnection_.on('signalForPeer',
          this.signalsForPeer.handle);
      this.onceReady = this.peerConnection_.onceConnected().then(() => {});
      this.onceClosed = this.peerConnection_.onceDisconnected();
      // TODO: add checking that the peer's fingerprint matches the provided
      // fingerprint.
    }

    // Close the peer-connection (and hence all data channels) and all
    // associated TCP connections. Note: once closed, cannot be openned again.
    private close = () => {
      this.peerConnection_.close();
      // CONSIDER: will peerConnection's closing of channels make this un-
      // needed? is it better to include this anyway?
      var channelLabel :string;
      for (channelLabel in this.sessions_) {
        this.sessions_[channelLabel].close();
        this.removeSession_(channelLabel);
      }
    }

    // Remove a session if it exists. May be called more than once, e.g. by
    // both tcpConnection closing, or by data channel closing.
    private removeSession_ = (channelLabel:string) : void => {
      delete this.sessions_[channelLabel];
    }

    public handleSignalFromPeer = (signal:WebRtc.SignallingMessage)
        : void => {
      this.peerConnection_.handleSignalMessage(signal);
    }

    // Data from the remote peer over WebRtc gets sent to the socket that
    // corresponds to the channel label, or used to make a new TCP connection.
    private onDataFromPeer_ = (rtcData:PcLib.LabelledDataChannelMessage)
        : void => {
      if(!(rtcData.channelLabel in this.sessions_)) {
        dbgErr('onDataFromPeer_: no such channel to send data to: ' +
            rtcData.channelLabel);
        return;
      }
      this.sessions_[rtcData.channelLabel].handleWebRtcDataFromPeer(
          rtcData.message);
    }

    public toString = () : string => {
      var ret :string;
      var sessionsAsStrings = [];
      var label :string;
      for (label in this.sessions_) {
        sessionsAsStrings.push(this.sessions_[label].toString());
      }
      ret = JSON.stringify({ sessions_: sessionsAsStrings });
      return ret;
    }

  }  // class RtcToNet


  // A Tcp connection and its data-channel on the peer connection.
  //
  // CONSIDER: when we have a lightweight webrtc provider, we can use the
  // DataChannel class directly here instead of the awkward pairing of
  // peerConnection with chanelLabel.
  //
  // CONSIDER: this and the socks-rtc session are similar: maybe abstract
  // common parts into a super-class this inherits from?
  export class Session {
    public tcpConnection:Tcp.Connection;

    public onceReady :Promise<void>;
    public onceClosed :Promise<void>;

    // These are used to avoid double-closure of data channels. We don't need
    // this for tcp connections because that class already holds the open/
    // closed state. TODO: once we have a real DataChannel object (e.g. done by
    // low-level WebRtc provider), then refer to dataChannel.isClosed directly.
    private isClosed_ :boolean;

    // Getters.
    public channelLabel = () : string => { return this.channelLabel_; }
    public isClosed = () : boolean => { return this.isClosed_; }

    constructor(
        private peerConnection_:PcLib.Pc,
        // The channel Label is a unique id for this data channel and session.
        private channelLabel_:string) {
      this.isClosed_ = false;
      // Open a data channel to the peer. The session is ready when the channel
      // is open.
      this.onceReady = this.peerConnection_.openDataChannel(
          this.channelLabel_);
      // Note: A TCP connection may or may not exist. If a TCP connection does,
      // exist, then onceDataChannelClosed will then close it (bound by
      // setTcpConnection). When a TCP stream closes, it also closes the data
      // channel, so it does suffice to consider a session closed when the data
      // channel is closed.
      this.onceClosed = this.peerConnection_
          .onceDataChannelClosed(this.channelLabel_);
      this.onceClosed.then(() => {
        this.isClosed_ = true;
      });
    }

    public close = () : void => {
      this.isClosed_ = true;
      this.peerConnection_.closeDataChannel(this.channelLabel_);
    }

    public handleWebRtcDataFromPeer = (webrtcData:WebRtc.Data) : void => {
      // Control messages are sent as strings.
      if(webrtcData.str) {
        this.handleWebRtcControlMessage_(webrtcData.str);
      } else if (webrtcData.buffer && this.tcpConnection) {
        // Note: tcpConnection is smart: it buffers and only sends when it is
        // ready.
        this.tcpConnection.send(webrtcData.buffer);
      } else {
        dbgErr('handleWebRtcDataFromPeer: Bad rtcData: ' +
            JSON.stringify(webrtcData));
      }
    }

    private handleWebRtcControlMessage_ = (controlMessage:string) : void => {
      var request :Socks.Request;
      try {
        request = JSON.parse(controlMessage);
      } catch (e) {
        if(request.command === Socks.Command.TCP_CONNECT
           && !this.tcpConnection) {
          this.startTcpConnection_(request.destination.endpoint)
            .then((connectedToEndpoint:Net.Endpoint) => {
              // TODO: send back to peer.
              dbg('Connected to ' + JSON.stringify(connectedToEndpoint));
            });
        } else {
          dbgErr('Unsupported control message: ' +
              controlMessage + '; in state: ' +
              this.toString());
          return;
        }
      }
    }

    private startTcpConnection_ = (endpoint:Net.Endpoint)
        : Promise<Net.Endpoint> => {
      this.tcpConnection = new Tcp.Connection({endpoint: endpoint});
      // Make sure that closing the TCP connection closes the peer connection
      // and visa-versa. CONSIDER: should we send a message on the data channel
      // to say it should be closed? (For Chrome < 37, where close messages
      // don't propegate properly).
      this.tcpConnection.onceClosed.then(() => {
        if(!this.isClosed_) {
          this.peerConnection_.closeDataChannel(this.channelLabel_);
        }
      });
      this.onceClosed.then(() => {
        if(!this.tcpConnection.isClosed()) {
          this.tcpConnection.close();
        }
      });
      return this.tcpConnection.onceConnected;
    }

    // For logging/debugging.
    public toString = () : string => {
      return JSON.stringify({
        channelLabel_: this.channelLabel_,
        isClosed_: this.isClosed_,
        tcpConnection: this.tcpConnection.toString()
      });
    }
  }  // Session


  var modulePrefix_ = '[RtcToNet] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module RtcToNet
