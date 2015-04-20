/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />

// This module provides a pool for managing data channels.  It mimics the
// interface for creating data channels in uproxy-lib's PeerConnection,
// but the channel objects it produces are actually "virtual channels",
// which wrap an actual DataChannel.  The key difference is that when the
// virtual channel is closed, the underlying DataChannel remains open, and
// is returned to the pool, to be released again upon a later call to
// CreateDataChannel.

// This class was written principally as a workaround for bugs related to
// RTCDataChannel.close behavior, such as https://crbug.com/474688.
// However, it should also help to reduce startup latency, by removing a
// roundtrip from each connection request (waiting for the "open ack").
// It may therefore be worth preserving even after any platform bugs are
// resolved.

import peerconnection = require('../../../third_party/uproxy-lib/webrtc/peerconnection');
import datachannel = require('../../../third_party/uproxy-lib/webrtc/datachannel');
import handler = require('../../../third_party/uproxy-lib/handler/queue');
import queue = require('../../../third_party/uproxy-lib/queue/queue');

import logging = require('../../../third_party/uproxy-lib/logging/logging');

var log :logging.Log = new logging.Log('pool');

// This is the only exported class in this module.  It mimics the data channel
// aspects of the PeerConnection interface.  Internally, it provides a pool
// of channels that keeps old channels for reuse instead of closing them, and
// makes new channels as needed when the pool runs dry.  Crucially, the local
// and remote pools do not interfere with each other, even if they use the
// same labels, because the browser ensures that data channels created by each
// peer are drawn from separate ID spaces (odd vs. even).
class Pool {
  public peerOpenedChannelQueue
      :handler.QueueHandler<datachannel.DataChannel, void>;

  private localPool_ :LocalPool;

  constructor(
      pc:peerconnection.PeerConnection<any>,
      name_:string) {
    this.localPool_ = new LocalPool(pc, name_);
    var remotePool = new RemotePool(pc, name_);
    this.peerOpenedChannelQueue = remotePool.peerOpenedChannelQueue;
  }

  public openDataChannel = () : Promise<datachannel.DataChannel> => {
    return this.localPool_.openDataChannel();
  }
}

// Manages a pool of data channels opened by this peer.  The only public method
// is openDataChannel.
class LocalPool {
  private numChannels_ = 0;

  // Channels which have been closed, and may be re-opened.
  private pool_ = new queue.Queue<PoolChannel>();

  constructor(
      private pc_:peerconnection.PeerConnection<any>,
      private name_:string) {}

  public openDataChannel = () : Promise<PoolChannel> => {
    return this.reuseOrCreate_().then((channel:PoolChannel) => {
      return channel.open().then(() => {
        // When this channel closes, reset it and return it to the pool.
        channel.onceClosed.then(() => {
          this.onChannelClosed_(channel);
        });
        return channel;
      });
    });
  }

  private reuseOrCreate_ = () : Promise<PoolChannel> => {
    // If there are no channels available right now, open a new one.
    // TODO: limit the number of channels (probably should be <=256).
    if (this.pool_.length > 0) {
      var channel = this.pool_.shift();
      log.debug('%1: channel requested, pulled %2 from pool (%3 remaining)',
          this.name_, channel.getLabel(), this.pool_.length);
      return Promise.resolve(channel);
    } else {
      log.debug('%1: channel requested, creating new', this.name_);
      return this.openNewChannel_();
    }
  }

  // Creates and returns a new channel, wrapping it.
  private openNewChannel_ = () : Promise<PoolChannel> => {
    return this.pc_.openDataChannel('p' + this.numChannels_++).
        then((dc:datachannel.DataChannel) => {
          return dc.onceOpened.then(() => {
            return new PoolChannel(dc);
          });
        });
  }

  // Resets the channel, making it ready for use again, and adds it
  // to the pool.
  private onChannelClosed_ = (poolChannel:PoolChannel) : void => {
    poolChannel.reset();
    this.pool_.push(poolChannel);
    log.debug('%1: returned channel %2 to the pool (new size: %3)',
        this.name_, poolChannel.getLabel(), this.pool_.length);
  }
}

// Tracks a pool of channels that were opened by the remote peer.
class RemotePool {
  public peerOpenedChannelQueue = new handler.Queue<PoolChannel,void>();

  constructor(
      private pc_:peerconnection.PeerConnection<Object>,
      private name_:string) {
    this.pc_.peerOpenedChannelQueue.setSyncHandler(this.onNewChannel_);
  }

  private onNewChannel_ = (dc:datachannel.DataChannel) => {
    log.debug('%1: remote side created new channel: %2',
        this.name_, dc.getLabel());
    dc.onceOpened.then(() => {
      var poolChannel = new PoolChannel(dc);
      this.listenForOpenAndClose_(poolChannel);
    });
  }

  private listenForOpenAndClose_ = (poolChannel:PoolChannel) : void => {
    poolChannel.onceOpened.then(() => {
      this.peerOpenedChannelQueue.handle(poolChannel);
    });
    poolChannel.onceClosed.then(() => {
      poolChannel.reset();
      this.listenForOpenAndClose_(poolChannel);
    });
  }
}

// These are the three control messages used.  To help debugging, and
// improve forward-compatibility, we send the string name on the wire,
// not the numerical enum value.  Therefore, these names are part of
// the normative protocol, and will break compatibility if changed.
enum ControlMessage {
  open,
  close,
  close_ack
}

enum State {
  open,
  closing,  // Waiting for CLOSE_ACK
  closed
}

// Each PoolChannel wraps an actual DataChannel, and provides behavior
// that is intended to be indistinguishable to the caller.  However,
// close() does not actually close the underlying channel.  Instead,
// it sends an in-band control message indicating the close, and the
// channel is returned to the pool of inactive channels, ready for
// reuse when the client asks for a new channel.
class PoolChannel implements datachannel.DataChannel {
  private fulfillOpened_ :() => void;
  public onceOpened : Promise<void>;

  private fulfillClosed_ :() => void;
  public onceClosed : Promise<void>;

  // Every call to dataFromPeerQueue.handle() must also set
  // lastDataFromPeerHandled_ to the new return value, so that we can
  // tell when all pending data from the peer has been drained.
  public dataFromPeerQueue :handler.Queue<datachannel.Data,void>;
  private lastDataFromPeerHandled_ : Promise<void>;

  private state_ :State;

  // dc_.onceOpened must already have resolved
  constructor(private dc_:datachannel.DataChannel) {
    this.reset();
    this.dc_.dataFromPeerQueue.setSyncHandler(this.onDataFromPeer_);
  }

  public reset = () => {
    this.dataFromPeerQueue = new handler.Queue<datachannel.Data,void>();
    this.lastDataFromPeerHandled_ = Promise.resolve<void>();
    this.onceOpened = new Promise<void>((F, R) => {
      this.fulfillOpened_ = F;
    });
    this.onceClosed = new Promise<void>((F, R) => {
      this.fulfillClosed_ = F;
    });

    this.state_ = State.closed;
    this.onceOpened.then(() => {
      this.state_ = State.open;
    });
    this.onceClosed.then(() => {
      this.state_ = State.closed;
    });
  }

  public getLabel = () : string => {
    return this.dc_.getLabel();
  }

  public send = (data:datachannel.Data) : Promise<void> => {
    if (this.state_ !== State.open) {
      return Promise.reject(new Error('Can\'t send while closed'));
    }

    // To distinguish control messages from application data, all string
    // messages are encapsulated in a JSON layer. Binary messages are unaffected.
    if (data.str) {
      return this.dc_.send({
        str: JSON.stringify({
          data: data.str
        })
      });
    }
    return this.dc_.send(data);
  }

  private sendControlMessage_ = (controlMessage:ControlMessage) : Promise<void> => {
    log.debug('%1: sending control message: %2',
              this.getLabel(), ControlMessage[controlMessage]);
    return this.dc_.send({
      str: JSON.stringify({
        control: ControlMessage[controlMessage]
      })
    });
  }

  private onDataFromPeer_ = (data:datachannel.Data) : void => {
    if (data.str) {
      try {
        var msg = JSON.parse(data.str);
      } catch (e) {
        log.error('%1: Got non-JSON string: %2', this.getLabel(), data.str);
        return;
      }
      if (typeof msg.data === 'string') {
        this.lastDataFromPeerHandled_ =
            this.dataFromPeerQueue.handle({str: msg.data});
      } else if (typeof msg.control === 'string') {
        this.onControlMessage_(msg.control);
      } else {
        log.error('No data or control message found');
      }
      return;
    }
    this.lastDataFromPeerHandled_ = this.dataFromPeerQueue.handle(data);
  }

  private onControlMessage_ = (controlMessage:string) : void => {
    log.debug('%1: received control message: %2',
              this.getLabel(), controlMessage);
    if (controlMessage === ControlMessage[ControlMessage.open]) {
      if (this.state_ === State.open) {
        log.warn('%1: Got redundant open message', this.getLabel());
      }
      this.fulfillOpened_();
    } else if (controlMessage === ControlMessage[ControlMessage.close]) {
      if (this.state_ === State.closed) {
        log.warn('%1: Got redundant close message', this.getLabel());
      }
      this.lastDataFromPeerHandled_.then(() => {
        return this.sendControlMessage_(ControlMessage.close_ack);
      }).then(this.fulfillClosed_);
    } else if (controlMessage === ControlMessage[ControlMessage.close_ack]) {
      if (this.state_ !== State.closing) {
        log.warn('%1: Got unexpected CLOSE_ACK', this.getLabel());
        // We return immediately in this case to handle the following situation:
        // A: send close
        // B: send close (simultaneous close; this is allowed)
        // A: receive close (change state to closed), send close_ack
        // B: receive close (change state to closed), send close_ack
        // B: channel is reused, send open
        // B: receive close_ack from A
        // At this point we want to ignore this late close_ack.
        return;
      }
      this.fulfillClosed_();
    } else {
      log.error('%1: unknown control message: %2',
          this.getLabel(), controlMessage);
    }
  }

  public getBrowserBufferedAmount = () : Promise<number> => {
    return this.dc_.getBrowserBufferedAmount();
  }

  public getJavascriptBufferedAmount = () : number => {
    return this.dc_.getJavascriptBufferedAmount();
  }

  public isInOverflow = () : boolean => {
    return this.dc_.isInOverflow();
  }

  public setOverflowListener = (listener:(overflow:boolean) => void) : void => {
    this.dc_.setOverflowListener(listener);
  }

  // New method for PoolChannel, not present in the DataChannel interface.
  public open = () : Promise<void> => {
    log.debug(this.getLabel() + ': open');
    if (this.state_ === State.open) {
      return Promise.reject(new Error('channel is already open'));
    }

    this.sendControlMessage_(ControlMessage.open);
    // Immediate open; there is no open-ack
    this.fulfillOpened_();

    return this.onceOpened;
  }

  public close = () : Promise<void> => {
    log.debug('%1: close', this.getLabel());
    if (this.state_ !== State.open) {
      return;
    }
    this.state_ = State.closing;

    this.sendControlMessage_(ControlMessage.close);
    return this.onceClosed;
  }

  public toString = () : string => {
    return "PoolChannel wrapping " + this.dc_.toString();
  }
}

export = Pool;