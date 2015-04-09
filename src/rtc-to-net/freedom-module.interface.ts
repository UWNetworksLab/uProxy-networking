/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import signals = require('../../../third_party/uproxy-lib/webrtc/signals');

import ProxyConfig = require('./proxyconfig');

interface freedom_TransportToNet {
  startFromConfig(
      proxyConfig: ProxyConfig,
      transportConfig:freedom_RTCPeerConnection.RTCConfiguration,
      obfusacte:boolean) :Promise<void>;
  stop() :Promise<void>;
  handleSignalFromPeer(message:signals.Message) :Promise<void>;

  on(t:string, f:(...args:Object[])=>void) :void;
  on(t:'signalForPeer', f:(message:signals.Message) => void) :void;
  on(t:'bytesReceivedFromPeer', f:(byteCount:number) => void) :void;
  on(t:'bytesSentToPeer', f:(byteCount:number) => void) :void;
  on(t:'stopped', f:() => void) :void;
}

export = freedom_TransportToNet
