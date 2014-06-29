// DataPeer - a class that wraps peer connections and data channels.
//
// This class assumes WebRTC is available; this is provided by the cross-
// platform compatibility library webrtc-adaptor.js (from:
// https://code.google.com/p/webrtc/source/browse/stable/samples/js/base/adapter.js)

/// <reference path='../third_party/typings/es6-promises/es6-promises.d.ts' />
/// <reference path='../third_party/typings/webrtc/RTCPeerConnection.d.ts' />
/// <reference path='../handler/queue.ts' />

module WebRtc {

  // Messages may be limited to a 16KB length
  // http://tools.ietf.org/html/draft-ietf-rtcweb-data-channel-07#section-6.6
  var CHUNK_SIZE = 15000;
  // The maximum amount of bytes we should allow to get queued up in
  // peerconnection (250k), any more and we start queueing in JS.
  var PC_QUEUE_LIMIT = 1024 * 250;
  // Javascript has trouble representing integers larger than 2^53 exactly
  var MAX_MESSAGE_SIZE = Math.pow(2, 53);

  // Wrapper for a WebRtc Data Channels:
  // http://dev.w3.org/2011/webrtc/editor/webrtc.html#rtcdatachannel
  //
  //
  class DataChannel {
    public label :string;

    public fromPeerDataQueue      :Handler.Queue<Data>;
    // The toPeerDataQueue is chunked by the send call and conjection controlled
    // by the handler this class sets.
    public toPeerDataQueue        :Handler.Queue<Data>;

    public onceOpenned      :Promise<void>;
    public onceClosed       :Promise<void>;

    private wasOpenned_     :boolean;
    private rejectOpenned_  :() => void;

    // Wrapper for
    constructor(private rtcDataChannel_:RTCDataChannel) {
      this.label = this.rtcDataChannel_.label;
      this.onceOpenned = new Promise<void>((F,R) => {
          this.rejectOpenned_ = R;
          // RTCDataChannels created by a RTCDataChannelEvent have an initial
          // state of open, so the onopen event for the channel will not
          // fire. We need to fire the onOpenDataChannel event here
          // http://www.w3.org/TR/webrtc/#idl-def-RTCDataChannelState
          if (event.channel.readyState === 'open') { F(); }
          // Firefox channels do not have an initial state of 'open'
          // See https://bugzilla.mozilla.org/show_bug.cgi?id=1000478
          if (rtcDataChannel_.readyState === 'connecting') {
            rtcDataChannel_.onopen = F;
          }
        });
      this.onceClosed = new Promise((F,R) => {
          this.rtcDataChannel_.onclose = F;
        });
      this.rtcDataChannel_.onmessage = this.onDataFromPeer;
      this.rtcDataChannel_.onerror = console.error;

      // Make sure to reject the onceOpenned promise if state went from
      // |connecting| to |close|.
      this.onceOpenned.then(() => { this.wasOpenned_ = true; });
      this.onceClosed.then(() => {
          if(!this.wasOpenned_) { rejectOpenned_(); }
        });
    }

    // Handle data we get from the peer by putting it, appropriately wrapped, on
    // the queue of data from the peer.
    private onDataFromPeer_ = (dataObject : Object) {
      if (typeof dataObject === 'string') {
        this.fromPeerDataQueue.handle({string: dataObject});
      }
      if (typeof dataObject === 'ArrayBuffer') {
        this.fromPeerDataQueue.handle({buffer: dataObject});
      }
      console.error('Unexpected data from peer that has type: ' + dataObject);
    }

    // Promise completes once all the data has been sent. This is async because
    // there may be more data than fits in the buffer; we do chunking so that
    // data larger than the SCTP message size limit (about 16k) can be sent and
    // received reliably, and so that the internal buffer is not over-filled. If
    // data is too big we also fail.
    //
    // CONSIDER: We could support blob data by streaming into array-buffers.
    private send = (data:Data) : Promise<void> {
      if (!(data.string || data.buffer)) {
        return Promise.reject(new Error('data must have at least string or ' +
            'buffer set'));
      }

      var byteLength;
      if (data.string) {
        // JS strings are utf-16.
        // TODO: check this is really right.
        byteLength = data.string.length * 2;
      } else if (data.buffer) {
        byteLength = data.buffer.byteLength;
      }

      if(byteLength > MAX_MESSAGE_SIZE) {
        return Promise.reject(new Error('Data was too big to send, sorry. ' +
          'Need to wait for real Blob support.'));
      }

      if(data.string) {
        return ChunkStringOntoQueue_({string:data.string});
      } else if(data.buffer) {
        return ChunkBufferOntoQueue_({buffer:data.buffer});
      }
    }

    // TODO: add an issue for chunking strings, write issue number here, then
    // write the code and resolve the issue :-)
    private chunkStringOntoQueue_ = (data:StringData) : Promise<void> {
      this.toPeerDataQueue.handle(data);
    }

    private chunkBufferOntoQueue_ = (data:BufferData) : Promise<void> {
      var startByte :number = 0;
      var endByte :number;
      var promises :Promise<void>[] = [];
      while(startByte < data.buffer.byteLength) {
        endByte = Math.min(startByte + CHUNK_SIZE, data.buffer.byteLength);
        promises.push(this.toPeerDataQueue.handle(
            {buffer: dataView.slice(startByte, endByte)}));
        startByte += CHUNK_SIZE;
      }
      return Promise.all(promises).then(() => {return;});
    }

    // Assumes data is chunked.
    private handleSendDataToPeer_ = (data:Data) : Promise<void> => {
      this.rtcDataChannel_.send(data.string || data.buffer);
      this.conjestionControlSendHandler();
    }

    // TODO: make this timeout adaptive so that we keep the buffer as full
    // as we can without wasting timeout callbacks.
    private conjestionControlSendHandler = () : void {
      if(this.rtcDataChannel_.bufferedAmount + CHUNK_SIZE > PC_QUEUE_LIMIT) {
        if(this.toPeerDataQueue.isHandling()) {
          this.toPeerDataQueue.stopHandling();
        }
        setTimeout(this.conjestionControlSendHandler, 20);
      } else {
        if(!this.toPeerDataQueue.isHandling()) {
          this.toPeerDataQueue.setHandler(this.handleSendDataToPeer_);
        }
      }
    }

  }  // class DataChannel
}  // module
