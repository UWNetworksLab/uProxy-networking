import signal = require('../../../third_party/uproxy-lib/webrtc/signal');
import net = require('../net/net.types');

// This file holds the common signalling message type that may be referenced
// from both module environment as well as the core environment.

export interface ChurnSignallingMessage {
  webrtcMessage ?:signal.Message;
  publicEndpoint ?:net.Endpoint;
}
