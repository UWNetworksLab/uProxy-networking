/// <reference path='../freedom/coreproviders/uproxypeerconnection.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

declare module Churn {
  // Adds the notion of a stage (first or second) to signalling messages.
  interface ChurnSignallingMessage extends WebRtc.SignallingMessage {
    churnStage :number;
  }
}

declare module freedom_UproxyPeerConnection {
  interface Pc {
    handleSignalMessage(signal:Churn.ChurnSignallingMessage) : Promise<void>;

    providePromises(provider:any) : void;
  }
}

interface Freedom {
  // config is optional for calls to providePromises.
  churn(config?:WebRtc.PeerConnectionConfig) : freedom_UproxyPeerConnection.Pc;
}
