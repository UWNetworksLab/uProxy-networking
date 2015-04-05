// The typescript description of the stub that is provided for a consumer of
// freedom-module.json

/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import signal = require('../../../third_party/uproxy-lib/webrtc/signal');
import net = require('../net/net.types');
import handler = require('../../../third_party/uproxy-lib/handler/queue');

import ProxyConfig = require('./proxyconfig');

interface TransportToNet {
  startFromConfig(
      proxyConfig:ProxyConfig,
      transportConfig:freedom_RTCPeerConnection.RTCConfiguration,
      obfuscate:boolean)
    :Promise<void>;
  stop() :Promise<void>;

  handleSignalFromPeer(signal:signal.Message) :void;
  signalsForPeer :handler.QueueHandler<signal.Message, void>;

  bytesReceivedFromPeer :handler.QueueHandler<number, void>;
  bytesSentToPeer :handler.QueueHandler<number, void>;

  onceStopped :Promise<void>;
}

export = TransportToNet;
