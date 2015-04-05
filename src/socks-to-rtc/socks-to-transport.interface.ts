// The typescript description of the stub that is provided for a consumer of
// freedom-module.json

/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import signal = require('../../../third_party/uproxy-lib/webrtc/signal');
import net = require('../net/net.types');

interface SocksToTransport {
  startFromConfig(
    localSocksServerEndpoint :net.Endpoint,
    transportConfig :freedom_RTCPeerConnection.RTCConfiguration,
    obfuscate ?:boolean) :Promise<net.Endpoint>;
  stop() :Promise<void>;

  handleSignalFromPeer(message:signal.Message) :void;

  on(t:string, f:(...args:Object[]) => void) :void;
  on(t:'signalForPeer', f:(message:signal.Message) => void) :void;
  on(t:'bytesSentToPeer', f:(n:number) => void) :void;
  on(t:'bytesReceivedFromPeer', f:(n:number) => void) :void;
  on(t:'stopped', f:() => void) :void;
}

export = SocksToTransport;
