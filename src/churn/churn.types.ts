import peerconnection = require('../../../third_party/uproxy-lib/webrtc/peerconnection');
import net = require('../net/net.types');

// This file holds the common signalling message type that may be referenced
// from both module environment as well as the core environment.

export interface ChurnSignallingMessage {
  webrtcMessage ?:peerconnection.SignallingMessage;
  publicEndpoint ?:net.Endpoint;
}
