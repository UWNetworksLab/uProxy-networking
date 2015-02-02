/// <reference path='turn-frontend.d.ts' />
/// <reference path='messages.ts' />
/// <reference path='../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../freedom/typings/freedom.d.ts' />
/// <reference path='../logging/logging.d.ts' />
/// <reference path='../freedom/typings/udp-socket.d.ts' />
/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />

module Turn {

  var log :Logging.Log = new Logging.Log('TURN frontend');

  /**
   * A TURN server which delegates the creation and operation of relay sockets
   * to a separate "net" Freedom module. The separation is intended to
   * facilitate transformation of intra-process traffic, viz. obfuscation. The
   * intended use of this server is as a proxy for WebRTC traffic to provide,
   * when paired with a NAT-punching and obfuscated network transport, for
   * a hard-to-detect and hard-to-block peer-to-peer connection.
   *
   * Based on:
   *   http://www.ietf.org/rfc/rfc5766.txt
   *
   * While this server should behave as a regular TURN server, its normal
   * (and most tested!) configuration is as a relay for a single WebRTC data
   * channel, servicing just one client which is attempting to communicate
   * with a single remote host.
   *
   * As such, please note:
   *  - no attempt is made to model permissions (permission requests always
   *    succeed)
   *  - no attempt is made to model lifetime (allocations live for the
   *    lifetime of the server)
   *  - there's no support for channels (just send and data indications)
   *  - while the server does sign its responses with a MESSAGE-INTEGRITY
   *    attribute, it does not verify the client's signature
   *  - only the long-term credential mechanism is supported
   */
  export class Frontend {
    /** Socket on which the server is listening. */
    private socket_ :freedom_UdpSocket.Socket;

    // TODO: the following two maps are a code smell...needs a re-think

    /**
     * These are invoked when the remote side sends us a response
     * to a relay socket creation request.
     */
    private callbacks_:{[tag:string]:(response:Turn.StunMessage) => void} = {};

    /**
     * These are fulfilled when the callback is invoked.
     */
    private promises_:{[s:string]:Promise<Turn.StunMessage>} = {};

    // TODO: define a type for event dispatcher in freedom-typescript-api
    constructor (private dispatchEvent_ ?:(name:string, args:any) => void) {
      this.socket_ = freedom['core.udpsocket']();
    }

    /**
     * Returns a promise to create a socket, bind to the specified address, and
     * start listening for datagrams. Specify port zero to have the system
     * choose a free port.
     */
    public bind(address:string, port:number) : Promise<freedom_TurnFrontend.EndpointInfo> {
      return this.socket_.bind(address, port)
          .then((resultCode:number) => {
            if (resultCode != 0) {
              throw new Error('listen failed with result code ' + resultCode);
            }
            return resultCode;
          })
          .then(this.socket_.getInfo)
          .then((socketInfo:freedom_UdpSocket.SocketInfo) => {
            log.info('listening on ' + socketInfo.localAddress + ':' +
                socketInfo.localPort);
            this.socket_.on('onData', this.onData_);
            return {
              address: socketInfo.localAddress,
              port: socketInfo.localPort
            };
          });
    }

    /**
     * Called when data is received from a TURN client on our UDP socket.
     * Sends a response to the client, if one is required (send and data
     * indications are the exception). Note that the RFC states that any
     * message which cannot be handled or understood by the server should be
     * ignored.
     */
    private onData_ = (recvFromInfo:freedom_UdpSocket.RecvFromInfo) => {
      try {
        var stunMessage = Turn.parseStunMessage(new Uint8Array(recvFromInfo.data));
        var clientEndpoint = {
          address: recvFromInfo.address,
          port: recvFromInfo.port
        };
        this.handleStunMessage(stunMessage, clientEndpoint)
            .then((response ?:Turn.StunMessage) => {
              if (response) {
                var responseBytes = Turn.formatStunMessageWithIntegrity(response);
                this.socket_.sendTo(
                    responseBytes.buffer,
                    recvFromInfo.address,
                    recvFromInfo.port);
              }
            }, (e) => {
              log.error('error handling STUN message: ' + e.message);
            });
      } catch (e) {
        log.warn('failed to parse STUN message from ' +
            recvFromInfo.address  + ':' + recvFromInfo.port);
      }
    }

    /**
     * Resolves to the response which should be sent to the client, or undefined
     * if none is required, e.g. for send indications. Rejects if the STUN
     * method is unsupported or there is an error handling the message.
     * Public for testing.
     */
    public handleStunMessage = (
        stunMessage:Turn.StunMessage,
        clientEndpoint:Endpoint) : Promise<Turn.StunMessage> => {
      if (stunMessage.method == Turn.MessageMethod.ALLOCATE) {
        return this.handleAllocateRequest_(stunMessage, clientEndpoint);
      } else if (stunMessage.method == Turn.MessageMethod.CREATE_PERMISSION) {
        return this.handleCreatePermissionRequest_(stunMessage);
      } else if (stunMessage.method == Turn.MessageMethod.REFRESH) {
        return this.handleRefreshRequest_(stunMessage);
      } else if (stunMessage.method == Turn.MessageMethod.SEND) {
        return this.handleSendIndication_(stunMessage, clientEndpoint);
      }
      return Promise.reject(new Error('unsupported STUN method ' +
          (Turn.MessageMethod[stunMessage.method] || stunMessage.method)));
    }

    /**
     * Resolves to a success response. Since we don't actually track
     * permissions, this is pretty straightforward.
     */
    private handleCreatePermissionRequest_ = (
        request:Turn.StunMessage) : Promise<Turn.StunMessage> => {
      return Promise.resolve({
        method: Turn.MessageMethod.CREATE_PERMISSION,
        clazz: Turn.MessageClass.SUCCESS_RESPONSE,
        transactionId: request.transactionId,
        attributes: <Turn.StunAttribute[]>[]
      });
    }

    /**
     * Resolves to a success response. REFRESH messages don't seem to be
     * required by Chrome (at least for establishing data channels) but are
     * required by turnutils_uclient.
     */
    private handleRefreshRequest_ = (
        request:Turn.StunMessage) : Promise<Turn.StunMessage> => {
      return Promise.resolve({
        method: Turn.MessageMethod.REFRESH,
        clazz: Turn.MessageClass.SUCCESS_RESPONSE,
        transactionId: request.transactionId,
        attributes: [{
            type: Turn.MessageAttribute.LIFETIME,
            value: new Uint8Array([0x00, 0x00, 600 >> 8, 600 & 0xff]) // 600 = ten mins
          }]
      });
    }

    /**
     * Resolves to an ALLOCATE response, which will be a FAILURE_RESPONSE or
     * SUCCESS_RESPONSE depending on whether the request includes a username
     * attribute and whether a relay socket can be created on the remote side.
     *
     * Note that there are two classes of ALLOCATE requests:
     *  1. The first is the very first request sent by the client to a TURN
     *     server to which the server should always respond with a *failure*
     *     response which *also* contains attributes (notably realm) which
     *     the client can include in subsequent ALLOCATE requests.
     *  2. In the second case, the client includes REALM, USERNAME, and
     *     MESSAGE-INTEGRITY attributes and the server creates a relay socket
     *     before responding to the client.
     *
     * Right now, the server has no real notion of usernames and realms so we
     * are just performing the dance that TURN clients expect, using the
     * presence of a USERNAME attribute to distinguish the first case from the
     * second.
     *
     * Section 10.2 outlines the precise behaviour required:
     *   http://tools.ietf.org/html/rfc5389#section-10.2
     */
    private handleAllocateRequest_ = (
        request:Turn.StunMessage,
        clientEndpoint:Endpoint) : Promise<Turn.StunMessage> => {
      // If no USERNAME attribute is present then assume this is the client's
      // first interaction with the server and respond immediately with a
      // failure message, including REALM information for subsequent requests.
      try {
        Turn.findFirstAttributeWithType(
            Turn.MessageAttribute.USERNAME,
            request.attributes);
      } catch (e) {
        return Promise.resolve({
          method: Turn.MessageMethod.ALLOCATE,
          clazz: Turn.MessageClass.FAILURE_RESPONSE,
          transactionId: request.transactionId,
          attributes: [{
            type: Turn.MessageAttribute.ERROR_CODE,
            value: Turn.formatErrorCodeAttribute(401, 'not authorised')
          }, {
            type: Turn.MessageAttribute.NONCE,
            value: new Uint8Array(ArrayBuffers.stringToArrayBuffer('nonce'))
          }, {
            type: Turn.MessageAttribute.REALM,
            value: new Uint8Array(ArrayBuffers.stringToArrayBuffer(Turn.REALM))
          }]
        });
      }

      // If we haven't already done so, create a callback which will be invoked
      // when the remote side sends us a response to our relay socket request.
      var tag = clientEndpoint.address + ':' + clientEndpoint.port;
      var promise :Promise<Turn.StunMessage>;
      if (tag in this.promises_) {
        promise = this.promises_[tag];
      } else {
        promise = new Promise((F,R) => {
          this.callbacks_[tag] = (response:Turn.StunMessage) => {
            if (response.clazz === Turn.MessageClass.SUCCESS_RESPONSE) {
              log.debug('relay socket allocated for TURN client ' +
                  clientEndpoint.address + ':' + clientEndpoint.port);
              F(response);
            } else {
              R(new Error('could not allocate relay socket for TURN client ' +
                  clientEndpoint.address + ':' + clientEndpoint.port));
            }
          };
        });
        this.promises_[tag] = promise;
      }

      // Request a new relay socket.
      // TODO: minimise the number of attributes sent
      this.emitIpc_(request, clientEndpoint);

      // Fulfill, once our relay socket callback has been invoked.
      return promise;
    }

    /**
     * Makes a request to the remote side to send a datagram on the client's
     * relay socket.
     */
    private handleSendIndication_ = (
        request:Turn.StunMessage,
        clientEndpoint:Endpoint) : Promise<Turn.StunMessage> => {
      this.emitIpc_(request, clientEndpoint);
      return Promise.resolve(undefined);
    }

    /**
     * Emits a Freedom message which should be relayed to the remote side.
     * The message is a STUN message, as received from a TURN client but with
     * the addition of an IPC_TAG attribute identifying the TURN client.
     */
    private emitIpc_ = (
        stunMessage:Turn.StunMessage,
        clientEndpoint:Endpoint) : void => {
      stunMessage.attributes.push({
        type: Turn.MessageAttribute.IPC_TAG,
        value: Turn.formatXorMappedAddressAttribute(
            clientEndpoint.address, clientEndpoint.port)
      });
      this.dispatchEvent_('ipc', {
        data: Turn.formatStunMessage(stunMessage).buffer
      });
    }

    /**
     * Handles a Freedom message from the remote side.
     */
    public handleIpc = (data :ArrayBuffer) : Promise<void> => {
      var stunMessage :Turn.StunMessage;
      try {
        stunMessage = Turn.parseStunMessage(new Uint8Array(data));
      } catch (e) {
        return Promise.reject(new Error(
            'failed to parse STUN message from IPC channel'));
      }

      // With which client is this message associated?
      var clientEndpoint :Turn.Endpoint;
      try {
        var ipcAttribute = Turn.findFirstAttributeWithType(
            Turn.MessageAttribute.IPC_TAG,
            stunMessage.attributes);
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

      if (stunMessage.method == Turn.MessageMethod.ALLOCATE) {
        // A response from one of our relay socket creation requests.
        // Invoke the relevant callback.
        // TODO: check callback exists
        var callback = this.callbacks_[tag];
        callback(stunMessage);
      } else if (stunMessage.method == Turn.MessageMethod.DATA) {
        // The remote side received data on a relay socket.
        // Forward it to the relevant client.
        // TODO: consider removing the IPC_TAG attribute
        this.socket_.sendTo(
          data,
          clientEndpoint.address,
          clientEndpoint.port);
      } else {
        return Promise.reject(new Error(
            'unsupported IPC method: ' + stunMessage.method));
      }
      return Promise.resolve<void>();
    }
  }

  if (typeof freedom !== 'undefined') {
    freedom.turnFrontend().providePromises(Turn.Frontend);
  }
}
