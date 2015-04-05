/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import signal = require('../../../third_party/uproxy-lib/webrtc/signal');

import rtc_to_net = require('./rtc-to-net');

import TransportToNet = require('./transport-to-net.interface');
import ProxyConfig = require('./proxyconfig');

// Freedom class for TransportToNet to wrap up freedom-style message passing.
// Ince day this will be auto-generatable from the transport-to-net interface
// file by the IDL compiler.
class TransportToNetFreedomClass {
  private rtcToNet_ :TransportToNet;

  constructor(private dispatchEvent_?:(t:string, x?:Object) => void) {
    this.rtcToNet_ = new rtc_to_net.RtcToNet();
  }

  public handleSignalFromPeer(message:signal.Message) :void{
    this.rtcToNet_.handleSignalFromPeer(message);
  }

  public startFromConfig(
      proxyConfig: ProxyConfig,
      transportConfig:freedom_RTCPeerConnection.RTCConfiguration,
      obfusacte:boolean) :Promise<void> {
    return this.rtcToNet_.startFromConfig(proxyConfig,
      transportConfig, obfusacte).then(() => {
        this.rtcToNet_.signalsForPeer.setSyncHandler((message) => {
          this.dispatchEvent_('signalForPeer', message);
        });
        // TODO: we probably want to throttle/time-limit the byte-count messages.
        // Else we'll get a lot more messages between web-workers.
        this.rtcToNet_.bytesReceivedFromPeer.setSyncHandler((byteCount) => {
          this.dispatchEvent_('bytesReceivedFromPeer', byteCount);
        });
        this.rtcToNet_.bytesSentToPeer.setSyncHandler((byteCount) => {
          this.dispatchEvent_('bytesSentToPeer', byteCount);
        });
        this.rtcToNet_.onceStopped.then(() => {
          this.dispatchEvent_('stopped');
        });
      });
  }

  public stop() :Promise<void> {
    return this.rtcToNet_.stop();
  }
}

freedom['transportToNet']().providePomises(TransportToNetFreedomClass);
