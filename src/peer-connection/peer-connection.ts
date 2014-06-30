// DataPeer - a class that wraps peer connections and data channels.
//
// This class assumes WebRTC is available; this is provided by the cross-
// platform compatibility library webrtc-adaptor.js (from:
// https://code.google.com/p/webrtc/source/browse/stable/samples/js/base/adapter.js)

/// <reference path='../arraybuffers/arraybuffers.ts' />
/// <reference path='../handler/queue.ts' />
/// <reference path="../third_party/promise/promise.d.ts" />
/// <reference path='../third_party/typings/webrtc/RTCPeerConnection.d.ts' />
/// <reference path='../third_party/typings/webcrypto/WebCrypto.d.ts' />

module WebRtc {

  export interface SignallingMessage {
    candidate ?:RTCIceCandidate;
    sdp ?:RTCSessionDescription;
  }

  export enum State {
    WAITING,      // Can move to CONNECTING.
    CONNECTING,   // Can move to CONNECTED or DISCONNECTED.
    CONNECTED,    // Can move to DISCONNECTED.
    DISCONNECTED  // End-state, cannot change.
  };

  // Small convenience wrapper for WebCrypto random Uint32.
  export var randomUint32 = () : number => {
    var randomArray = new Uint32Array(1);
    crypto.getRandomValues(randomArray);
    return randomArray[0];
  }

  // Super cheep simple hash function for comparison of SDP headers to choose
  // initiator.
  export var stringHash = (s:string, bytes:number) : string => {
    // Note: array creation always rounds down to nearest int.
    var array = new Uint16Array((bytes + 1) / 2);
    var i :number;
    for (i = 0; i < s.length; i++) {
        array[i % bytes] ^= s.charCodeAt(i);
    }
    return String.fromCharCode.apply(null, array);
  }

  // A wrapper for peer-connection and it's associated data channels.
  // The most important diagram is this one:
  // http://dev.w3.org/2011/webrtc/editor/webrtc.html#idl-def-RTCSignalingState
  export class PeerConnection {

    // Name for debugging.
    public peerName     :string;

    // The WebRtc peer connection.
    private pc_           :RTCPeerConnection;
    // All WebRtc data channels associated with this data peer.
    private pcDataChannels_     :{[channelLabel:string] : DataChannel};

    // Internal promise completion functions for the |onceConnected| and
    // |onceDisconnected| promises. These must only be called once.
    private fulfillConnected_     :() => void;
    private rejectConnected_      :(e:Error) => void;
    private fulfillDisconnected_  :() => void;

    // The current state of the data peer;
    public pcState        :State;
    // Fulfilled once we are connected to the peer. Rejected if connection fails
    // to be established.
    public onceConnected  :Promise<void>;
    // Fulfilled when disconnected. Will never reject.
    public onceDisconnected :Promise<void>;

    // Queue of channels opened up by the remote peer.
    public peerCreatedChannelQueue :Handler.Queue<DataChannel,void>;

    // Signals to be send to the remote peer by this peer.
    public toPeerSignalQueue :Handler.Queue<SignallingMessage,void>;
    // Signals from the remote peer to be handled by this peer.
    public fromPeerSignalQueue :Handler.Queue<SignallingMessage,void>;

    // if |createOffer| is true, the consturctor will immidiately initiate
    // negotiation.
    constructor(peerName:string, createOffer:boolean, stunServers:string[]) {
      this.peerName = this.peerName || 'unnamed-pc-' + randomUint32();

      this.onceConnected = new Promise<void>((F,R) => {
          this.fulfillConnected_ = F;
          this.rejectConnected_ = R;
        });
      this.onceDisconnected = new Promise<void>((F,R) => {
          this.fulfillDisconnected_ = F;
        });

      this.peerCreatedChannelQueue = new Handler.Queue<DataChannel,void>();

      this.toPeerSignalQueue = new Handler.Queue<SignallingMessage,void>();
      this.fromPeerSignalQueue = new Handler.Queue<SignallingMessage,void>();

      // This state variable is an abstraction of the PeerConnection state that
      // simplifies usage and management of state.
      this.pcState = State.WAITING;

      this.pcDataChannels_ = {};

      // WebRtc contraints and config for the peer connection.
      var pcConstraints :MediaConstraints = {
        optional: [{DtlsSrtpKeyAgreement: true}]
      };
      var pcConfig :RTCPeerConnectionConfig = {iceServers: []};
      // Add default STUN/TURN servers for setting up the peer connection.
      if(!stunServers) {
        stunServers = ([
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302"
        ]);
      }
      stunServers.map((stunServer) => {
          pcConfig.iceServers.push({ 'url' : stunServer });
        });

      this.pc_ = new RTCPeerConnection(pcConfig, pcConstraints);
      // Add basic event handlers.
      this.pc_.onicecandidate = ((event:RTCIceCandidateEvent) => {
          this.toPeerSignalQueue.handle({candidate: event.candidate});
        });
      this.pc_.onnegotiationneeded = (this.negotiateConnection_);
      this.pc_.ondatachannel = (this.onPeerStartedDataChannel_);
      this.pc_.onsignalingstatechange = (this.onSignallingStateChange_);

      if(createOffer) { this.negotiateConnection_(); }
    }

    // Promise wrappers for async WebRtc calls that return the session
    // description that should be set as the local description and sent to the
    // peer.
    private createOffer_ = () : Promise<RTCSessionDescription> => {
      return new Promise((F,R) => { this.pc_.createOffer(F, R); });
    }
    private createAnswer_ = () : Promise<RTCSessionDescription> => {
      return new Promise((F,R) => { this.pc_.createAnswer(F, R); });
    }
    // Setting the description provides a SDP message signalling message to send
    // to the peer.
    private setLocalDescription_ = (d:RTCSessionDescription)
        : Promise<SignallingMessage> => {
      return new Promise((F,R) => {
          this.pc_.setLocalDescription(d, F.bind(this,{sdp:d}), R);
        });
    }
    private setRemoteDescription_ = (d:RTCSessionDescription)
        : Promise<SignallingMessage> => {
      return new Promise((F,R) => {
          this.pc_.setRemoteDescription(d, F.bind(this,{sdp:d}), R);
        });
    }

    // For debugging: prints the state of the peer connection including all
    // associated data channels.
    public toString = () : string => {
      var s :string = this.peerName + ' (' + this.pc_.signalingState +
          '): { \n';
      var channelLabel :string;
      for (channelLabel in this.pcDataChannels_) {
        s += '  ' + channelLabel + ': ' +
            this.pcDataChannels_[channelLabel].toString();
      }
      s += '}';
      return s;
    }

    // Close the peer connection. This function is idempotent.
    public close = () : void => {
      //console.log(this.peerName + ': ' + 'close');

      // This may happen because calling close will invoke pc_.close, which
      // may call |onSignallingStateChange_| with |this.pc_.signalingState ===
      // 'closed'|.
      if (this.pcState === State.DISCONNECTED) { return; }

      if (this.pcState === State.CONNECTING) {
        this.rejectConnected_(new Error('close was called while connecting.'));
      }

      this.pcState = State.DISCONNECTED;
      this.fulfillDisconnected_();

      if (this.pc_.signalingState !== 'closed') {
        // Note is expected to invoke |onSignallingStateChange_|
        this.pc_.close();
      }
    }

    // The RTCPeerConnection signalingState has changed. This state change is
    // the result of either setLocalDescription() or setRemoteDescription()
    // being invoked. Or it can happen when the peer connection gets
    // unexpectedly closed down.
    private onSignallingStateChange_ = () : void => {
      if (this.pc_.signalingState === 'closed') {
        this.close();
        return;
      }

      // Non-close signalling state changes should only be happening when state
      // is |CONNECTING|, otherwise this is an error.
      if (this.pcState !== State.CONNECTING) {
        // Something unexpected happened, better close down properly.
        console.error(this.peerName + ': ' +
              'Unexpected onSignallingStateChange: ' +
              this.pc_.signalingState);
        this.close();
        return;
      }

      // The only change we care about is getting to stable, which means we are
      // connected. Assumes: |this.pcState === State.CONNECTING| (from above)
      if (this.pc_.signalingState === 'stable') {
        this.pcState = State.CONNECTED;
        this.fulfillConnected_();
      }
    }

    // Called when openDataChannel is called to and we have not yet negotiated
    // our connection, or called when some WebRTC internal event requires
    // renegotiation of SDP headers.
    private negotiateConnection_ = () : void => {
      //console.log(this.peerName + ': ' + 'negotiateConnection_', this._pc, e);
      if (this.pcState === State.DISCONNECTED) {
        console.error(this.peerName + ': ' + 'negotiateConnection_ called on ' +
            'DISCONNECTED state.');
        return;
      }

      // TODO: fix/remove this when Chrome issue is fixed. This code is a hack
      // to simply reset the same local and remote description which will
      // trigger the appropriate data channel open event. This can happen in
      // State.CONNECTING to State.CONNECTED.
      //
      // Negotiation messages are falsely requested for new data channels.
      //   https://code.google.com/p/webrtc/issues/detail?id=2431
      if (this.pc_.localDescription && this.pc_.remoteDescription) {
          this.pc_.setLocalDescription(this.pc_.localDescription,
                                       () => {}, console.error);
          this.pc_.setRemoteDescription(this.pc_.remoteDescription,
                                        () => {}, console.error);
          return;
      }

      // CONSIDER: might we ever need to re-create an onAnswer? Exactly how/when
      // do onnegotiation events get raised? Do they get raised on both sides?
      // Or only for the initiator?
      if (this.pcState === State.WAITING) {
        this.createOffer_()
          .then(this.setLocalDescription_)
          .then(this.toPeerSignalQueue.handle)
          .catch((e) => {
              console.error('Failed to set local description: ' + e.toString());
              this.close();
            });
      }
    }

    // Provide nice function for public access to queuing of messages.
    public handlerSignalMessage = (signal:SignallingMessage)
        : Promise<void> => {
      return this.fromPeerSignalQueue.handle(signal);
    }

    // Handle a message sent on the signalling channel (form the other peer) to
    // this peer.
    private signalMessageHandler_ = (signal :SignallingMessage) => {
      //console.log(this.peerName + ': ' + 'handleSignalMessage: \n' + messageText);
      if (signal.sdp) {
        // If we are offering and they are also offerring at the same time, pick
        // the one who has the lower hash value for their description: this is
        // equivalent to having a special random id, but voids the need for an
        // extra random number. TODO: instead of hash, we could use the IP/port
        // candidate list which is guarenteed to be unique for 2 peers.
        if (signal.sdp.type == 'offer' &&
            this.pc_.signalingState == 'have-local-offer' &&
            stringHash(JSON.stringify(signal.sdp), 4) <
                stringHash(JSON.stringify(this.pc_.localDescription), 4)) {
          // TODO: implement reset and use their offer.
          console.error('Simultainious offers not not yet implemented.');
          this.close();
          return;
        }
        this.setRemoteDescription_(signal.sdp)
            .then(this.toPeerSignalQueue.handle)
            .catch((e) => {
                console.error('Failed to set remote description: ' + e.toString());
                this.close();
              });
      } else if (signal.candidate) {
        // Add remote ice candidate.
        var ice_candidate = new RTCIceCandidate(signal.candidate);
        //console.log(this.peerName + ': Adding ice candidate: ' + JSON.stringify(signal.candidate));
        this.pc_.addIceCandidate(ice_candidate);
      } else {
        console.warn(this.peerName + ': ' +
            'handleSignalMessage got unexpected message: ' +
            JSON.stringify(signal));
      }
    }

    // Open a new data channel with the peer.
    public openDataChannel = (channelLabel:string,
                              options:RTCDataChannelInit={})
        : DataChannel => {
      // Firefox does not fire the |'negotiationneeded'| event, so we need to
      // negotate here if we are not connected. See
      // https://bugzilla.mozilla.org/show_bug.cgi?id=840728
      // TODO: Remove when Firefox supports it.
      if (typeof mozRTCPeerConnection !== 'undefined' &&
          this.pcState === State.WAITING) {
        this.negotiateConnection_();
      }

      var rtcDataChannel = this.pc_.createDataChannel(channelLabel, options);
      var dataChannel = this.addRtcDataChannel_(rtcDataChannel);
      return dataChannel;
    }

    // When a peer creates a data channel, this function is called with the
    // |RTCDataChannelEvent|. We then create the data channel wrapper and add
    // the new |DataChannel| to the |this.peerCreatedChannelQueue| to be
    // handled.
    private onPeerStartedDataChannel_ =
        (rtcDataChannelEvent:RTCDataChannelEvent) : void => {
      this.peerCreatedChannelQueue.handle(
          this.addRtcDataChannel_(rtcDataChannelEvent.channel));
    }

    // Add a rtc data channel and return the it wrapped as a DataChannel
    private addRtcDataChannel_ = (rtcDataChannel:RTCDataChannel)
        : DataChannel => {
      var dataChannel = new DataChannel(dataChannel);
      this.pcDataChannels_[dataChannel.label] = dataChannel;
      dataChannel.onceClosed.then(() => {
          delete this.pcDataChannels_[dataChannel.label];
        });
      return dataChannel;
    }

  }  // class DataPeer

}  // module WebRtcPc
