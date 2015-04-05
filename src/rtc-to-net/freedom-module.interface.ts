/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import signal = require('../../../third_party/uproxy-lib/webrtc/signal');

import ProxyConfig = require('./proxyconfig');

interface freedom_TransportToNet {
  startFromConfig(
      proxyConfig: ProxyConfig,
      transportConfig:freedom_RTCPeerConnection.RTCConfiguration,
      obfusacte:boolean) :Promise<void>;
  stop() :Promise<void>;
  handleSignalFromPeer(message:signal.Message) :Promise<void>;

  on(t:string, f:(...args:Object[])=>void) :void;
  on(t:'signalForPeer', f:(message:signal.Message) => void) :void;
  on(t:'bytesReceivedFromPeer', f:(byteCount:number) => void) :void;
  on(t:'bytesSentToPeer', f:(byteCount:number) => void) :void;
  on(t:'stopped', f:() => void) :void;
}

export = freedom_TransportToNet
