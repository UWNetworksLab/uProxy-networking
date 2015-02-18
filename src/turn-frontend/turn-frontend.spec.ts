/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../build/third_party/typings/jasmine/jasmine.d.ts' />

import turn_frontend = require('./turn-frontend.ts');

describe("turn frontend", function() {

  // Returns an array of 12 bytes, suuitable for use as a STUN/TURN
  // transaction ID.
  function getTransactionIdBytes() : Uint8Array {
    return new Uint8Array([
          0x2f, 0x68, 0x65, 0x79, 0x6b, 0x6b,
          0x31, 0x54, 0x46, 0x32, 0x36, 0x57]);
  }

  var frontend:Turn.Frontend;
  var endpoint:net.Endpoint;

  beforeEach(function() {
    frontend = new Turn.Frontend();
    endpoint = {
      address: '127.0.0.1',
      port: 10000
    };
  });

  // Unsupported requests should reject.
  it('reject unsupported request', (done) => {
    var request = {
      method: 999, // unsupported!
      clazz: Turn.MessageClass.REQUEST,
      transactionId: getTransactionIdBytes(),
      attributes: <Turn.StunAttribute[]>[]
    };
    frontend.handleStunMessage(request, endpoint).catch(done);
  });

  // Treat any ALLOCATE requests without a USERNAME attribute
  // as the "initial ALLOCATE request" which should return a
  // failure, with NONCE and REALM attributes.
  it('initial allocate request', (done) => {
    var request = {
      method: Turn.MessageMethod.ALLOCATE,
      clazz: Turn.MessageClass.REQUEST,
      transactionId: getTransactionIdBytes(),
      attributes: [{
        type: Turn.MessageAttribute.REQUESTED_TRANSPORT
      }]
    };
    frontend.handleStunMessage(request, endpoint).then((response) => {
      expect(response.method).toEqual(Turn.MessageMethod.ALLOCATE);
      expect(response.clazz).toEqual(Turn.MessageClass.FAILURE_RESPONSE);
      // TODO: inspect these attributes
      Turn.findFirstAttributeWithType(Turn.MessageAttribute.ERROR_CODE, response.attributes);
      Turn.findFirstAttributeWithType(Turn.MessageAttribute.NONCE, response.attributes);
      Turn.findFirstAttributeWithType(Turn.MessageAttribute.REALM, response.attributes);
    }).then(done);
  });

  // TODO: test second allocate request (requires socket mocks)

  // TODO: test repeat ALLOCATE requests, verify just one allocation

  // TODO: test socket creation failure

  // TODO: test create permission returns success
});
