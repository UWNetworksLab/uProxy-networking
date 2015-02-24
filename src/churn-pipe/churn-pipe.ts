/// <reference path='../../build/third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../build/third_party/freedom-typings/udp-socket.d.ts' />

// TODO(ldixon): update to a require-style inclusion.
// e.g.
// import Transformer = require('../../build/third_party/uproxy-obfuscators/utransformer');
// import Rabbit = require('../../build/third_party/uproxy-obfuscators/utransformers.rabbit');
// import Fte = require('../../build/third_party/uproxy-obfuscators/utransformers.fte');
/// <reference path='../../build/third_party/uproxy-obfuscators/utransformer.d.ts' />
/// <reference path='../../build/third_party/uproxy-obfuscators/utransformers.fte.d.ts' />
/// <reference path='../../build/third_party/uproxy-obfuscators/utransformers.rabbit.d.ts' />

import Transformer = UTransformers.Transformer;
import Rabbit = fte.Transformer;
import Fte = rabbit.Transformer;

import PassThrough = require('../simple-transformers/passthrough');
import CaesarCipher = require('../simple-transformers/caesar');

import logging = require('../../build/dev/logging/logging');

import net = require('../net/net.types');

import churn_pipe_types = require('./freedom-module.interface');
import Message = churn_pipe_types.Message;

var log :logging.Log = new logging.Log('churn pipe');

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
class Pipe {

  // Socket on which the server is listening.
  private socket_ :freedom_UdpSocket.Socket;

  // Obfuscates and deobfuscates messages.
  private transformer_ :Transformer;

  // Endpoint to which all messages are sent.
  private remoteEndpoint_ :net.Endpoint;

  // TODO: define a type for event dispatcher in freedom-typescript-api
  constructor (private dispatchEvent_
      :(name:string, args:Message) => void) {
    // TODO: clean up udp sockets
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
    this.remoteEndpoint_ = {
      address: remoteAddress,
      port: remotePort
    };
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
      : Transformer => {
    var transformer :Transformer;
    if (name == 'rabbit') {
      transformer = new Rabbit();
    } else if (name == 'fte') {
      transformer = new Fte();
    } else if (name == 'caesar') {
      transformer = new CaesarCipher();
    } else if (name == 'none') {
      transformer = new PassThrough();
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
    return this.sendTo(buffer, this.remoteEndpoint_);
  }

  /**
   * Sends a message over the network to the specified destination.
   * The message is obfuscated before it hits the wire.
   */
  public sendTo = (buffer:ArrayBuffer, to:net.Endpoint) => {
    var transformedBuffer = this.transformer_.transform(buffer);
    return this.socket_.sendTo(
      transformedBuffer,
      to.address,
      to.port).then(() => {
        return Promise.resolve();
      });
  }

  public getLocalEndpoint = () : Promise<net.Endpoint> => {
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
      data: buffer,
      source: {
        address: recvFromInfo.address,
        port: recvFromInfo.port
      }
    });
  }
}

export = Pipe;
