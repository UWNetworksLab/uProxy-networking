// DataPeer - a class that wraps peer connections and data channels.
//
// This class assumes WebRTC is available; this is provided by the cross-
// platform compatibility library webrtc-adaptor.js (from:
// https://code.google.com/p/webrtc/source/browse/stable/samples/js/base/adapter.js)

/// <reference path='../handler/queue.ts' />
/// <reference path="../third_party/promise/promise.d.ts" />
/// <reference path='../third_party/typings/webrtc/RTCPeerConnection.d.ts' />

module WebRtc {

  // Messages may be limited to a 16KB length
  // http://tools.ietf.org/html/draft-ietf-rtcweb-data-channel-07#section-6.6
  var CHUNK_SIZE = 15000;
  // The maximum amount of bytes we should allow to get queued up in
  // peerconnection (250k), any more and we start queueing in JS.
  var PC_QUEUE_LIMIT = 1024 * 250;
  // Javascript has trouble representing integers larger than 2^53 exactly
  var MAX_MESSAGE_SIZE = Math.pow(2, 53);

  // Data sent to or received from a peer on a data channel in the peer
  // connection.
  export interface Data {
    str ?:string;
    buffer ?:Uint8Array;
    // TODO: add when supported by WebRtc in Chrome and FF.
    // https://code.google.com/p/webrtc/issues/detail?id=2276
    //
    // bufferView ?:ArrayBufferView;
    // blob  ?:Blob
    // domString  ?:DOMString
  }
  export interface StringData {
    str :string;
  }
  export interface BufferData {
    buffer :Uint8Array;
  }

  // Wrapper for a WebRtc Data Channels:
  // http://dev.w3.org/2011/webrtc/editor/webrtc.html#rtcdatachannel
  //
  //
  class DataChannel {
    public label :string;

    public fromPeerDataQueue      :Handler.Queue<Data,void>;
    // The toPeerDataQueue is chunked by the send call and conjection controlled
    // by the handler this class sets.
    public toPeerDataQueue        :Handler.Queue<Data,void>;

    public onceOpenned      :Promise<void>;
    public onceClosed       :Promise<void>;

    private wasOpenned_     :boolean;
    private rejectOpenned_  :(e:Error) => void;

    // Wrapper for
    constructor(private rtcDataChannel_:RTCDataChannel) {
      this.label = this.rtcDataChannel_.label;
      this.onceOpenned = new Promise<void>((F,R) => {
          this.rejectOpenned_ = R;
          // RTCDataChannels created by a RTCDataChannelEvent have an initial
          // state of open, so the onopen event for the channel will not
          // fire. We need to fire the onOpenDataChannel event here
          // http://www.w3.org/TR/webrtc/#idl-def-RTCDataChannelState
          if (rtcDataChannel_.readyState === 'open') { F(); }
          // Firefox channels do not have an initial state of 'open'
          // See https://bugzilla.mozilla.org/show_bug.cgi?id=1000478
          if (rtcDataChannel_.readyState === 'connecting') {
            rtcDataChannel_.onopen = (e:Event) => { F(); };
          }
        });
      this.onceClosed = new Promise<void>((F,R) => {
          this.rtcDataChannel_.onclose = (e:Event) => { F(); };
        });
      this.rtcDataChannel_.onmessage = this.onDataFromPeer_;
      this.rtcDataChannel_.onerror = console.error;

      // Make sure to reject the onceOpenned promise if state went from
      // |connecting| to |close|.
      this.onceOpenned.then(() => { this.wasOpenned_ = true; });
      this.onceClosed.then(() => {
          if(!this.wasOpenned_) { this.rejectOpenned_(new Error(
              'Failed to open; closed while trying to open.')); }
        });
    }

    // Handle data we get from the peer by putting it, appropriately wrapped, on
    // the queue of data from the peer.
    private onDataFromPeer_ = (messageEvent : RTCMessageEvent) : void => {
      if (typeof messageEvent.data === 'string') {
        this.fromPeerDataQueue.handle({string: messageEvent.data});
      }
      if (typeof messageEvent.data === 'ArrayBuffer') {
        this.fromPeerDataQueue.handle({buffer: messageEvent.data});
      }
      console.error('Unexpected data from peer that has type: ' +
          JSON.stringify(messageEvent));
    }

    // Promise completes once all the data has been sent. This is async because
    // there may be more data than fits in the buffer; we do chunking so that
    // data larger than the SCTP message size limit (about 16k) can be sent and
    // received reliably, and so that the internal buffer is not over-filled. If
    // data is too big we also fail.
    //
    // CONSIDER: We could support blob data by streaming into array-buffers.
    private send = (data:Data) : Promise<void> => {
      if (!(data.str || data.buffer)) {
        return Promise.reject<void>(new Error(
            'data must have at least string or buffer set'));
      }

      var byteLength;
      if (data.str) {
        // JS strings are utf-16.
        // TODO: check this is really right.
        byteLength = data.str.length * 2;
      } else if (data.buffer) {
        byteLength = data.buffer.byteLength;
      }

      if(byteLength > MAX_MESSAGE_SIZE) {
        return Promise.reject<void>(new Error(
            'Data was too big to send, sorry. ' +
            'Need to wait for real Blob support.'));
      }

      if(data.str) {
        return this.chunkStringOntoQueue_({str:data.str});
      } else if(data.buffer) {
        return this.chunkBufferOntoQueue_({buffer:data.buffer});
      }
    }

    // TODO: add an issue for chunking strings, write issue number here, then
    // write the code and resolve the issue :-)
    private chunkStringOntoQueue_ = (data:StringData) : Promise<void> => {
      return this.toPeerDataQueue.handle(data);
    }

    private chunkBufferOntoQueue_ = (data:BufferData) : Promise<void> => {
      var buffer = new Uint8Array(data.buffer);
      var startByte :number = 0;
      var endByte :number;
      var promises :Promise<void>[] = [];
      while(startByte < buffer.byteLength) {
        endByte = Math.min(startByte + CHUNK_SIZE, data.buffer.byteLength);
        promises.push(this.toPeerDataQueue.handle(
            {buffer: data.buffer.subarray(startByte, endByte)}));
        startByte += CHUNK_SIZE;
      }

      // CONSIDER: can we change the interface to support not having the dummy
      // extra return at the end?
      return Promise.all(promises)
          .then<void>((_) => { return; });
    }

    // Assumes data is chunked.
    private handleSendDataToPeer_ = (data:Data) : Promise<void> => {
      if(data.str) {
        this.rtcDataChannel_.send(data.str);
      } else if(data.buffer) {
        this.rtcDataChannel_.send(data.buffer);
      } else {
        return Promise.reject<void>(new Error(
            'Bad data: ' + JSON.stringify(data)));
      }
      this.conjestionControlSendHandler();
      return Promise.resolve();
    }

    // TODO: make this timeout adaptive so that we keep the buffer as full
    // as we can without wasting timeout callbacks.
    private conjestionControlSendHandler = () : void => {
      if(this.rtcDataChannel_.bufferedAmount + CHUNK_SIZE > PC_QUEUE_LIMIT) {
        if(this.toPeerDataQueue.isHandling()) {
          this.toPeerDataQueue.stopHandling();
        }
        setTimeout(this.conjestionControlSendHandler, 20);
      } else {
        if(!this.toPeerDataQueue.isHandling()) {
          this.toPeerDataQueue.setAsyncHandler(this.handleSendDataToPeer_);
        }
      }
    }

  }  // class DataChannel
}  // module
