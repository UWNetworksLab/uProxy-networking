

// _signallingChannel is a channel for emitting events back to the freedom Hub.
class FreedomPeerConnection {


  constructor (portModule :PortModule, dispatchEvent :EventDispatchFn) {
    // The Core object for managing channels.
    portModule.once('core', (Core) => {
      this.core = new Core();
    });
    portModule.emit(portModule.controlChannel, {
      type: 'core request delegated to peerconnection',
      request: 'core'
    });

    // Setup link between Freedom messaging and _peer's signalling.
    // Note: the signalling channel should only be sending receiveing strings.
    this.core.bindChannel(signallingChannelId, function (channel) {
      this.signallingChannel = channel;
      this.peer.setSendSignalMessage(function (msg) {
        this.signallingChannel.emit('message', msg);
      }.bind(this));
      this.signallingChannel.on('message',
          this.peer.handleSignalMessage.bind(this.peer));
      this.signallingChannel.emit('ready');
      continuation();
    }.bind(this));
  }

  // The |portModule| (defined in freedom/src/port-app.js) provides a way to
  // communicate with another freedom module.
  constructor (signallingChannel :OnAndEmit<SignallingMessage,
                                            SignallingMessage>) {

    // This is the a channel to send signalling messages.
    this.signallingChannel_ = signallingChannel;

    // a (hopefully unique) ID for debugging.
    this.peerName_ = 'p' + Math.random();
    this.peer_ = new SimpleDataPeer(this.peerName_, this.stunServers_);
  }

// Start a peer connection using the given freedomChannelId as the way to
// communicate with the peer. The argument |freedomChannelId| is a way to speak
// to an identity provide to send them SDP headers negotiate the address/port to
// setup the peer to peerConnection.
//
// options: {
//   peerName: string,   // For pretty printing messages about this peer.
//   debug: boolean           // should we add extra
// }
public setup = (channelLabel:string, peerName:string, stunServers:stringp[]) : Promise<void> {

  var dataChannelCallbacks = {
    // onOpenFn is called at the point messages will actually get through.
    onOpenFn: function (dataChannel, info) {
      self.dispatchEvent('onOpenDataChannel',
                         info.label);
    },
    onCloseFn: function (dataChannel, info) {
      self.dispatchEvent('onCloseDataChannel',
                         { channelId: info.label});
    },
    // Default on real message prints it to console.
    onMessageFn: function (dataChannel, info, event) {
      if (event.data instanceof ArrayBuffer) {
        self.dispatchEvent('onReceived', {
          'channelLabel': info.label,
          'buffer': event.data
        });
      } else if (event.data instanceof Blob) {
        self.dispatchEvent('onReceived', {
          'channelLabel': info.label,
          'binary': event.data
        });
      } else if (typeof (event.data) === 'string') {
        self.dispatchEvent('onReceived', {
          'channelLabel': info.label,
          'text': event.data
        });
      }
    },
    // Default on error, prints it.
    onErrorFn: function (dataChannel, info, err) {
      console.error(dataChannel.peerName + ': dataChannel(' +
                    dataChannel.dataChannel.label + '): error: ', err);
    }
  };

};

// TODO: delay continuation until the open callback from _peer is called.
PeerConnection.prototype.openDataChannel = function (channelId, continuation) {
  this.peer.openDataChannel(channelId, continuation);
};

PeerConnection.prototype.closeDataChannel = function (channelId, continuation) {
  this.peer.closeChannel(channelId);
  continuation();
};

// Called to send a message over the given datachannel to a peer. If the data
// channel doesn't already exist, the DataPeer creates it.
PeerConnection.prototype.send = function (sendInfo, continuation) {
  var objToSend = sendInfo.text || sendInfo.buffer || sendInfo.binary;
  if (typeof objToSend === 'undefined') {
    console.error('No valid data to send has been provided.', sendInfo);
    return;
  }
  //DEBUG
  // objToSend = new ArrayBuffer(4);
  //DEBUG
  this.peer.send(sendInfo.channelLabel, objToSend, continuation);
};

PeerConnection.prototype.getBufferedAmount = function (channelId, continuation) {
  continuation(this.peer.getBufferedAmount(channelId));
};

PeerConnection.prototype.close = function (continuation) {
  this.peer.close();
  continuation();
  this.dispatchEvent('onClose');
};

fdom.apis.register('core.peerconnection', PeerConnection);
