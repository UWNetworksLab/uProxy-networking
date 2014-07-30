/// <reference path='socks-to-rtc.ts' />

/*

    // TODO: these should be parameterized/editable from the uProxy UI/consumer
    // of this class.
    private stunServers_ : string[] =
      [ "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302" ];

// This is what is avauilable to Freedom.
function initClient() {
  // Create local socks-to-rtc class instance and attach freedom message
  // handlers, then emit |ready|.  TODO: in freedom v0.5, we can/should use an
  // interface and drop this explicit module-to-class linking.
  freedom.on('handleSignalFromPeer', socksToRtc.handlePeerSignal.handle);
  freedom.on('start', socksToRtc.start);
  freedom.on('stop', socksToRtc.stop);
  freedom.emit('ready', {});
}

module SocksToRtc {

  export class FreedomSocksClass {
    // Freedom channel to use for sending signalling messages to .
    private signallingChannelSpecifier_ :freedom.ChannelSpecifier<string,string> = null;
    private onceSignallingChannelReady_
        :Promise<freedom.ChannelSpecifier<string,string>>;

    private socksToRtc_ :SocksToRtc;

    constructor() {
      this.socksToRtc_ = new SocksToRtc();
    }

    // This will emit a socksToRtcSuccess signal when the peer connection is
    // esablished, or a socksToRtcFailure signal if there is an error openeing
    // the peer connection. TODO: update this to return a promise that
    // fulfills/rejects, after freedom v0.5 is ready.
    public start() : Promise<Net.Endpoint> {
      this.onceSignallingChannelReady_ = this.prepareSignallingChannel_()
      var ready :Promise<Net.Endpoint> = this.socksToRtc_.start();
      return this.onceSignallingChannelReady_
        .then(() => { return ready; })
        .then((endpoint) => {
            dbg('SocksToRtc:socksToRtcSuccess');
            freedom.emit('socksToRtcSuccess');
            // this.startPingPong_();
            this.socksToRtc_.signalsToPeer.setHandler(this.sendSignalToPeer_);
            return Promise.resolve(endpoint);
          })
        .catch<Net.Endpoint>((e) => {
            dbgErr('SocksToRtc:socksToRtcFailure: ' + e);
            freedom.emit('socksToRtcFailure');
            return Promise.reject(new Error(''));
          });
    }

    public stop() {
      if (this.signallingChannel_) {
        this.signallingChannel_.channel.close();
        this.signallingChannel_ = null;
      }
    }

    // Starts preparing the signalling channel
    private prepareSignallingChannel_ =
        () : Promise<freedom.ChannelSpecifier> => {
      return new Promise((F,R) => {
        fCore.createChannel().then((chan) => {
            chan.on('message', this.signalsFromPeer_.handle);
            this.signallingChannelSpecifier_ = chan;
            F();
            return this.signallingChannelSpecifier_.identifier;
          });  // fCore.createChannel
        });
    }

    private sendSignalToPeer_ = (signal:) : void => {
      chan.emit('message', message);
    }

    // Signalling channel messages are batched and dispatched each second.
    // TODO: kill this loop!
    // TODO: size limit on batched message
    // TODO: this code is completely common to rtc-to-net (growing need for
    //       shared lib)
    private startSendingQueuedMessages_ = () : void => {
      this.queuedMessages_ = [];
      setInterval(() => {
        if (this.queuedMessages_.length > 0) {
          dbg('dispatching signalling channel messages...');
          freedom.emit('sendSignalToPeer',
            JSON.stringify({
              version: 1,
              messages: this.queuedMessages_
            }));
          this.queuedMessages_ = [];
        }
      }, 1000);
    }

  }

}  // module SocksToRtc

*/
