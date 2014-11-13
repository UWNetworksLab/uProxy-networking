/// <reference path='churn-pipe.d.ts' />
/// <reference path='../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../freedom/typings/udp-socket.d.ts' />
/// <reference path='../logging/logging.d.ts' />
/// <reference path='../utransformers/interfaces/utransformer.d.ts' />
/// <reference path='../utransformers/interfaces/utransformers.fte.d.ts' />
/// <reference path='../utransformers/interfaces/utransformers.rabbit.d.ts' />
/// <reference path='../simple-transformers/caesar.ts' />
/// <reference path='../simple-transformers/passthrough.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

module Churn {

  var log :Logging.Log = new Logging.Log('churn pipe');

  /**
   * Listens on a port for UDP datagrams -- emitting a Freedom message for each
   * datagram received -- and sends UDP datagrams to a destination, in response
   * to Freedom messages.
   *
   * Each incoming and outgoing message is first passed through an obfuscator.
   * The obfuscator is used via direct function calls rather than Freedom
   * message passing owing to the inelegance of receiving a response *back*
   * from a Freedom module.
   */
  export class Pipe {

    // Socket on which the server is listening.
    private socket_ :freedom_UdpSocket.Socket;

    // Obfuscates and deobfuscates messages.
    private transformer_ :UTransformers.Transformer;

    // Endpoint to which all messages are sent.
    private remoteAddress_ :string;
    private remotePort_ :number;

    // TODO: define a type for event dispatcher in freedom-typescript-api
    constructor (private dispatchEvent_ ?:(name:string, args:any) => void) {
      this.socket_ = freedom['core.udpsocket']();
    }

    /**
     * Returns a promise to create a socket, bind to the specified address, and
     * start listening for datagrams.
     */
    public bind = (
        localAddress :string,
        localPort :number,
        remoteAddress :string,
        remotePort :number,
        transformerName :string,
        key ?:ArrayBuffer,
        config ?:string)
        :Promise<void> => {
      // First, try to make our transformer.
      try {
        this.transformer_ = this.makeTransformer_(transformerName, key, config);
      } catch (e) {
        return Promise.reject(e);
      }

      // Next, bind to a socket.
      this.remoteAddress_ = remoteAddress;
      this.remotePort_ = remotePort;
      return this.socket_.bind(localAddress, localPort)
          .then((resultCode:number) => {
            if (resultCode != 0) {
              return Promise.reject(new Error(
                  'listen failed with result code ' + resultCode));
            }
            this.socket_.on('onData', this.onData_);
          });
    }

    private makeTransformer_ = (
        // Name of transformer to use, e.g. 'rabbit' or 'none'.
        name :string,
        // Key for transformer, if any.
        key ?:ArrayBuffer,
        // JSON-encoded configuration, if any.
        config ?:string)
        :UTransformers.Transformer => {
      var transformer :UTransformers.Transformer;
      if (name == 'rabbit') {
        transformer = new rabbit.Transformer();
      } else if (name == 'fte') {
        transformer = new fte.Transformer();
      } else if (name == 'caesar') {
        transformer = new Transformers.CaesarCipher();
      } else if (name == 'none') {
        transformer = new Transformers.PassThrough();
      } else {
        throw new Error('unknown transformer: ' + name);
      }
      if (key) {
        transformer.setKey(key);
      }
      if (config) {
        transformer.configure(config);
      }
      return transformer;
    }

    /**
     * Sends a message over the network to the remote side.
     * The message is obfuscated before it hits the wire.
     */
    public send = (buffer:ArrayBuffer) => {
      var transformedBuffer = this.transformer_.transform(buffer);
      return this.socket_.sendTo(
        transformedBuffer,
        this.remoteAddress_,
        this.remotePort_).then(() => {
          return Promise.resolve();
        });
    }

    public getLocalEndpoint = () : Promise<freedom_ChurnPipe.Endpoint> => {
      return this.socket_.getInfo().then((socketInfo:freedom_UdpSocket.SocketInfo) => {
        return {
          address: socketInfo.localAddress,
          port: socketInfo.localPort
        }
      });
    }

    /**
     * Called when a message is received over the network from the remote side.
     * The message is de-obfuscated before the Freedom message is emitted.
     */
    private onData_ = (recvFromInfo:freedom_UdpSocket.RecvFromInfo) => {
      var transformedBuffer = recvFromInfo.data;
      var buffer = this.transformer_.restore(transformedBuffer);
      this.dispatchEvent_('message', {
        data: buffer
      });
    }
  }

  if (typeof freedom !== 'undefined') {
    freedom.churnPipe().providePromises(Churn.Pipe);
  }
}
