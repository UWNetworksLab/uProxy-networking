/*

  // RtcToNet.Server - signals and serves peers.
  export class Server {

    // Mapping from peerIds to Peer-creation promises.
    // Store promises because creating Peer objects is an asynchronous process.
    private peers_:{[peerId:string]:Promise<Peer>} = {};

    // The peer has send us a message via the signalling channel.
    public handleSignal = (signal:PeerSignal) => {
      if (!signal.peerId) {
        dbgErr('signal received with no peerId!');
        return;
      }
      // TODO: Check for access control?
      // dbg('sending signal to transport: ' + JSON.stringify(signal.data));
      this.fetchOrCreatePeer_(signal.peerId).then((peer) => {
        // TODO: this code is completely common to rtc-to-net (growing need for shared lib)
        try {
          var batchedMessages :Channel.BatchedMessages = JSON.parse(signal.data);
          if (batchedMessages.version != 1) {
            throw new Error('only version 1 batched messages supported');
          }
          for (var i = 0; i < batchedMessages.messages.length; i++) {
            var message = batchedMessages.messages[i];
            dbg('received signalling channel message: ' + message);
            peer.handleSignalFromPeer(message);
          }
        } catch (e) {
          dbgErr('could not parse batched messages: ' + e.message);
        }
      });
    }

    // Obtain, and possibly create, a RtcToNet.Peer for |peerId|.
    private fetchOrCreatePeer_(peerId:string) : Promise<Peer>{
      if (peerId in this.peers_) {
        return this.peers_[peerId];
      }
      var peer = RtcToNet.Peer.CreateWithChannel(peerId);
      this.peers_[peerId] = peer;
      return peer;
    }

    // Remove a peer from the server.  This should be called after the peer
    // closes its transport.
    public removePeer(peerId :string) : void {
      if (!(peerId in this.peers_)) {
        dbgWarn('removePeer: peer not found ' + peerId);
        return;
      }

      this.peers_[peerId].then((peer) => {
        // Verify that peer's transport is closed before deleting.
        if (!peer.isClosed()) {
          dbgErr('Cannot remove unclosed peer, ' + peerId);
          return;
        }
        dbg('Removing peer: ' + peerId);
        delete this.peers_[peerId];
      }).catch((e) => { dbgErr('Error closing peer ' + peerId + ', ' + e); });
    }

    // Close all peers on this server.
    public reset = () => {
      for (var contact in this.peers_) {
        this.peers_[contact].then((peer) => {
          peer.close();
        });
        delete this.peers_[contact];
      }
      this.peers_ = {};
    }

  }  // class RtcToNet.Server

*/
