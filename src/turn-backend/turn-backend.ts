/// <reference path='turn-backend.d.ts' />
/// <reference path='../turn-frontend/messages.ts' />
/// <reference path='../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../logging/logging.d.ts' />
/// <reference path='../freedom/typings/udp-socket.d.ts' />
/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />

module Turn {

  var log :Logging.Log = new Logging.Log('TURN backend');

  /**
   * Represents a client known to the server. One of these objects is created
   * in response to each ALLOCATE request.
   */
  class Allocation {
    /** Socket on which we are relaying datagrams for the client. */
    socket:freedom_UdpSocket.Socket;
  }

  /**
   * Freedom module which handles relay sockets for the TURN server.
   */
  export class Backend {
    /**
     * All clients currently known to the server, indexed by tag.
     * Note that this map is essentially the (extremely inaccurately) named
     * "5-tuple" introduced in section 2.2 of the TURN RFC:
     *   http://tools.ietf.org/html/rfc5766#section-2.2
     */
    private allocations_:{[s:string]:Promise<Allocation>} = {};

    // TODO: define a type for event dispatcher in freedom-typescript-api
    constructor (private dispatchEvent_ ?:(name:string, args:any) => void) {
      log.debug('TURN backend module created');
    }

    public handleIpc = (data :ArrayBuffer) : Promise<void> => {
      var request :Turn.StunMessage;
      try {
        request = Turn.parseStunMessage(new Uint8Array(data));
      } catch (e) {
        return Promise.reject(new Error(
            'failed to parse STUN message from IPC channel'));
      }

      // With which client is this message associated?
      var clientEndpoint :Turn.Endpoint;
      try {
        var ipcAttribute = Turn.findFirstAttributeWithType(
            Turn.MessageAttribute.IPC_TAG,
            request.attributes);
        try {
          clientEndpoint = Turn.parseXorMappedAddressAttribute(
              ipcAttribute.value);
        } catch (e) {
          return Promise.reject(new Error(
              'could not parse address in IPC_TAG attribute: ' + e.message));
        }
      } catch (e) {
        return Promise.reject(new Error(
            'message received on IPC channel without IPC_TAG attribute'));
      }
      var tag = clientEndpoint.address + ':' + clientEndpoint.port;

      if (request.method == Turn.MessageMethod.ALLOCATE) {
        this.makeAllocation_(clientEndpoint).then((allocation:Allocation) => {
          allocation.socket.getInfo().then((socketInfo:freedom_UdpSocket.SocketInfo) => {
            this.emitIpc_({
              method: Turn.MessageMethod.ALLOCATE,
              clazz: Turn.MessageClass.SUCCESS_RESPONSE,
              transactionId: request.transactionId,
              attributes: [{
                // Endpoint on which the new socket is listening.
                // This is really the whole point of the thing.
                type: Turn.MessageAttribute.XOR_RELAYED_ADDRESS,
                value: Turn.formatXorMappedAddressAttribute(
                    socketInfo.localAddress,
                    socketInfo.localPort)
              }, {
                // Endpoint from which the client appears to us.
                // This is essentially a STUN response and is generally
                // provided as a convenience to TURN clients.
                type: Turn.MessageAttribute.XOR_MAPPED_ADDRESS,
                value: Turn.formatXorMappedAddressAttribute(
                    clientEndpoint.address, clientEndpoint.port)
              }, {
                // Lifetime.
                type: Turn.MessageAttribute.LIFETIME,
                value: new Uint8Array([0x00, 0x00, 600 >> 8, 600 & 0xff]) // 600 = ten mins
              }]
            }, clientEndpoint);
          });
        }, (e) => {
          // Send error response (failed to make allocation).
          this.emitIpc_({
            method: Turn.MessageMethod.ALLOCATE,
            clazz: Turn.MessageClass.FAILURE_RESPONSE,
            transactionId: request.transactionId,
            attributes: []
          }, clientEndpoint);
        });
      } else if (request.method == Turn.MessageMethod.SEND) {
        // Extract the destination address and payload.
        var destinationAttribute :Turn.StunAttribute;
        var dataAttribute :Turn.StunAttribute;
        try {
          destinationAttribute = Turn.findFirstAttributeWithType(
              Turn.MessageAttribute.XOR_PEER_ADDRESS,
              request.attributes);
          dataAttribute = Turn.findFirstAttributeWithType(
              Turn.MessageAttribute.DATA,
              request.attributes);
        } catch (e) {
          return Promise.reject(new Error(
              'no address or data attribute in SEND indication'));
        }

        var remoteEndpoint = Turn.parseXorMappedAddressAttribute(
            destinationAttribute.value);
        var payload = Turn.Backend.bytesToArrayBuffer_(dataAttribute.value);

        if (!(tag in this.allocations_)) {
          return Promise.reject(new Error(
              'received SEND indication for client without allocation'));
        }

        this.allocations_[tag].then((allocation:Allocation) => {
          allocation.socket.sendTo(
            payload,
            remoteEndpoint.address,
            remoteEndpoint.port);
        });
      } else {
        return Promise.reject(new Error(
            'unsupported IPC method: ' + request.method));
      }
      return Promise.resolve<void>();
    }

    /**
     * Emits a Freedom message which should be relayed to the remote side.
     * The message is a STUN message, as received from a TURN client but with
     * the addition of an IPC_TAG attribute identifying the TURN client.
     */
    private emitIpc_ = (
        stunMessage:Turn.StunMessage,
        clientEndpoint:Turn.Endpoint) : void => {
      // Add an IPC_TAG attribute.
      stunMessage.attributes.push({
        type: Turn.MessageAttribute.IPC_TAG,
        value: Turn.formatXorMappedAddressAttribute(
            clientEndpoint.address, clientEndpoint.port)
      });
      this.dispatchEvent_('ipc', {
        data: Turn.formatStunMessage(stunMessage).buffer
      });
    }

    /** Promises to allocate a socket, wrapped in an Allocation. */
    private makeAllocation_ = (
        clientEndpoint:Turn.Endpoint) : Promise<Allocation> => {
      var tag = clientEndpoint.address + ':' + clientEndpoint.port;
      if (tag in this.allocations_) {
        return this.allocations_[tag];
      }

      var socket = freedom['core.udpsocket']();
      var promise = socket.bind('127.0.0.1', 0)
          .then((resultCode:number) => {
            if (resultCode != 0) {
              return Promise.reject(new Error(
                  'could not create socket -- error code ' + resultCode));
            }
            socket.getInfo().then((socketInfo:freedom_UdpSocket.SocketInfo) => {
              log.info('allocated socket for ' + tag + ' on ' +
                  socketInfo.localAddress + ':' + socketInfo.localPort);
            });
            return Promise.resolve({
              socket: socket
            });
          });

        socket.on('onData', (recvFromInfo:freedom_UdpSocket.RecvFromInfo) => {
          this.emitIpc_({
            method: Turn.MessageMethod.DATA,
            clazz: Turn.MessageClass.INDICATION,
            transactionId: Turn.Backend.getRandomTransactionId_(),
            attributes: [{
              type: Turn.MessageAttribute.XOR_PEER_ADDRESS,
              value: Turn.formatXorMappedAddressAttribute(
                  recvFromInfo.address,
                  recvFromInfo.port)
            }, {
              type: Turn.MessageAttribute.DATA,
              value: new Uint8Array(recvFromInfo.data)
            }]
          }, clientEndpoint);
        });

      this.allocations_[tag] = promise;
      return promise;
    }

    /**
     * Copies a Uint8Array into a new ArrayBuffer. Useful when the array
     * has been constructed from a subarray of the buffer, in which case
     * bytes.buffer is a much larger array than you are expecting.
     * TODO: be smarter about using slice in these instances
     */
    private static bytesToArrayBuffer_ = (bytes:Uint8Array) : ArrayBuffer => {
      var buffer = new ArrayBuffer(bytes.length);
      var view = new Uint8Array(buffer);
      for (var i = 0; i < bytes.length; i++) {
        view[i] = bytes[i];
      }
      return buffer;
    }

    private static getRandomTransactionId_ = () : Uint8Array => {
      var bytes = new Uint8Array(20);
      for (var i = 0; i < 20; i++) {
        bytes[i] = Math.random() * 255;
      }
      return bytes;
    }
  }

  if (typeof freedom !== 'undefined') {
    freedom.turnBackend().providePromises(Turn.Backend);
  }
}
