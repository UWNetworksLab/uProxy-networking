/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import freedom_TransportToNet = require('./freedom-module.interface');
import handler = require('../../../third_party/uproxy-lib/handler/queue');
import signals = require('../../../third_party/uproxy-lib/webrtc/signals');

import TransportToNet = require('./transport-to-net.interface');
import ProxyConfig = require('./proxyconfig');


class TransportToNetClass implements TransportToNet {
  private freedomModule_ :freedom_TransportToNet;
  public onceStopped :Promise<void>;

  public signalsForPeer :handler.Queue<signals.Message, void>;
  public bytesReceivedFromPeer :handler.Queue<number, void>;
  public bytesSentToPeer :handler.Queue<number, void>;

  public startFromConfig(
      proxyConfig: ProxyConfig,
      transportConfig:freedom_RTCPeerConnection.RTCConfiguration,
      obfusacte:boolean) :Promise<void> {
    return this.freedomModule_.startFromConfig(proxyConfig,
        transportConfig, obfusacte);
  }

  public stop() :Promise<void> {
    return this.freedomModule_.stop();
  }

  public handleSignalFromPeer(message:signals.Message) :void {
    this.freedomModule_.handleSignalFromPeer(message);
  }

  constructor() {
    this.signalsForPeer = new handler.Queue<signals.Message,void>();
    this.bytesReceivedFromPeer = new handler.Queue<number,void>();
    this.bytesSentToPeer = new handler.Queue<number,void>();

    this.freedomModule_ = freedom['transportToNet']();
    this.freedomModule_.on('signalForPeer', this.signalsForPeer.handle);
    this.freedomModule_.on('bytesReceivedFromPeer', this.signalsForPeer.handle);
    this.freedomModule_.on('bytesSentToPeer', this.signalsForPeer.handle);
    this.onceStopped = new Promise<void>((F,R) => {
      this.freedomModule_.on('stopped', F);
    });
  }
}

export = TransportToNetClass;
