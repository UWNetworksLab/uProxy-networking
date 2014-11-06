/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

declare module Churn {
  // Adds the notion of a stage (first or second) to signalling messages.
  interface ChurnSignallingMessage extends WebRtc.SignallingMessage {
    churnStage :number;
  }

  class Connection implements WebRtc.PeerConnectionInterface {
    constructor(config:WebRtc.PeerConnectionConfig);
  }
}
