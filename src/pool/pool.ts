/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />

import peerconnection = require('../../../third_party/uproxy-lib/webrtc/peerconnection');
import datachannel = require('../../../third_party/uproxy-lib/webrtc/datachannel');
import handler = require('../../../third_party/uproxy-lib/handler/queue');

import logging = require('../../../third_party/uproxy-lib/logging/logging');

var log :logging.Log = new logging.Log('pool');

// This is the only exported class in this module.  It mimics the data channel
// aspects of the PeerConnection interface.  Internally, it provides a pool
// of channels that keeps old channels for reuse instead of closing them, and
// makes new channels as needed when the pool runs dry.
export class Pool {
  public peerOpenedChannelQueue :handler.QueueHandler<datachannel.DataChannel, void>;

  private localPool_ :LocalPool;

  constructor(pc:peerconnection.PeerConnection<any>) {
    this.localPool_ = new LocalPool(pc);
    var remotePool = new RemotePool(pc);
    this.peerOpenedChannelQueue = remotePool.peerOpenedChannelQueue;
  }

  public openDataChannel = () : Promise<datachannel.DataChannel> => {
    return this.localPool_.openDataChannel();
  }
}

// Manages a pool of data channels opened by this peer.  The only public method
// is openDataChannel.
class LocalPool {
  private numberOfChannels_ :number = 0;
  private availableChannels_ = new handler.Queue<PoolChannel,PoolChannel>();
  // The first type should be void, or Undefined, but typescript
  // doesn't let you call a method of type (x:void) => ... and you
  // can't reference the Undefined type explicitly.
  private requests_ = new handler.Queue<string,PoolChannel>();

  constructor(private pc_:peerconnection.PeerConnection<any>) {
    this.requests_.setNextHandler(this.onRequest_);
  }

  public openDataChannel = () : Promise<PoolChannel> => {
    log.debug('Processing request for a channel');
    return this.requests_.handle('dummy');
  }

  private onRequest_ = (dummy:string) : Promise<PoolChannel> => {
    if (this.availableChannels_.getLength() === 0) {
      log.debug('No channels available');
      this.openNewChannel_();
    }

    return this.availableChannels_.setNextHandler(this.activateChannel_).then((poolChannel:PoolChannel) : PoolChannel => {
      this.requests_.setNextHandler(this.onRequest_);
      return poolChannel;
    });
  }

  private openNewChannel_ = () => {
    log.debug('Opening a new channel');
    this.numberOfChannels_++;
    this.pc_.openDataChannel('c' + this.numberOfChannels_).then(this.wrapChannel_).then(this.availableChannels_.handle);
  }

  private activateChannel_ = (poolChannel:PoolChannel) : Promise<PoolChannel> => {
    return poolChannel.open().then(() => {
      return poolChannel;
    });
  }

  private wrapChannel_ = (dc:datachannel.DataChannel) : Promise<PoolChannel> => {
    return dc.onceOpened.then(() => {
      var poolChannel = new PoolChannel(dc);
      poolChannel.onceClosed.then(() => {
        this.onChannelClosed_(poolChannel);
      });
      
      return poolChannel;
    });
  }

  private onChannelClosed_ = (poolChannel:PoolChannel) : void => {
    log.debug('Returning closed channel to the available pool');
    poolChannel.reset();
    poolChannel.onceClosed.then(() => {
      this.onChannelClosed_(poolChannel);
    });

    this.availableChannels_.handle(poolChannel);
  }
}

// Tracks a pool of channels that were opened by the remote peer.
class RemotePool {
  public peerOpenedChannelQueue = new handler.Queue<PoolChannel,void>();

  constructor(private pc_:peerconnection.PeerConnection<any>) {
    this.pc_.peerOpenedChannelQueue.setSyncHandler(this.onNewChannel_);
  }

  private onNewChannel_ = (dc:datachannel.DataChannel) => {
    log.debug('New channel event received');
    var poolChannel = new PoolChannel(dc);
    this.listenForOpenAndClose_(poolChannel);
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

// These are the three control messages used.  To distinguish control
// messages from application data, all string messages are encapsulated
// in a JSON layer.  (Binary messages are unaffected.)
var OPEN = "open";
var CLOSE = "close";
var CLOSE_ACK = "close-ack";

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

  public dataFromPeerQueue = new handler.Queue<datachannel.Data,void>();

  private isOpen_ :boolean;

  constructor(private dc_:datachannel.DataChannel) {
    this.reset();
    this.dc_.dataFromPeerQueue.setSyncHandler(this.onDataFromPeer_);
  }

  public reset = () => {
    this.onceOpened = new Promise<void>((F, R) => {
      this.fulfillOpened_ = F;
    });
    this.onceClosed = new Promise<void>((F, R) => {
      this.fulfillClosed_ = F;
    });

    this.isOpen_ = false;
    this.onceOpened.then(() => {
      this.isOpen_ = true;
    });
    this.onceClosed.then(() => {
      this.isOpen_ = false;
    });
  }

  public getLabel = () : string => {
    return this.dc_.getLabel();
  }

  public send = (data:datachannel.Data) : Promise<void> => {
    if (!this.isOpen_) {
      debugger;
      return Promise.reject(new Error('Can\'t send while closed'));
    }

    if (data.str) {
      return this.dc_.send({
        str: JSON.stringify({
          data: data.str
        })
      });
    }
    return this.dc_.send(data);
  }

  private sendControlMessage_ = (controlMessage:string) : Promise<void> => {
    log.debug('%1: sending control message: %2',
              this.getLabel(), controlMessage);
    return this.dc_.send({
      str: JSON.stringify({
        control: controlMessage
      })
    });
  }

  private onDataFromPeer_ = (data:datachannel.Data) : void => {
    if (data.str) {
      var msg = JSON.parse(data.str);
      if (typeof msg.data === 'string') {
        this.dataFromPeerQueue.handle({str: msg.data});
      } else if (typeof msg.control === 'string') {
        this.onControlMessage_(msg.control);
      } else {
        throw new Error('No data or control message found');
      }
      return;
    }
    this.dataFromPeerQueue.handle(data);
  }

  private onControlMessage_ = (controlMessage:string) : void => {
    log.debug('%1: received control message: %2',
              this.getLabel(), controlMessage);
    if (controlMessage === OPEN) {
      this.fulfillOpened_();
    } else if (controlMessage === CLOSE) {
      this.sendControlMessage_(CLOSE_ACK).then(this.fulfillClosed_);
    } else if (controlMessage === CLOSE_ACK) {
      this.fulfillClosed_();
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
    log.debug(this.getLabel() + ' open');
    if (this.isOpen_) {
      return Promise.reject(new Error('Channel is already open'));
    }

    this.dc_.onceOpened.then(() => {
      this.sendControlMessage_(OPEN);
      // Immediate open; there is no open-ack
      this.fulfillOpened_();
    });

    return this.onceOpened;
  }

  public close = () : Promise<void> => {
    log.debug('%1: close', this.getLabel());
    if (!this.isOpen_) {
      log.debug('Double close');
      return;
    }

    this.dc_.onceOpened.then(() => {
      this.sendControlMessage_(CLOSE);
    });

    return this.onceClosed;
  }

  public toString = () : string => {
    return "PoolChannel wrapping " + this.dc_.toString();
  }
}
