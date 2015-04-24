/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import freedomMocker = require('../../../third_party/uproxy-lib/freedom/mocks/mock-freedom-in-module-env');
freedom = freedomMocker.makeMockFreedomInModuleEnv();

import peerconnection = require('../../../third_party/uproxy-lib/webrtc/peerconnection');
import handler = require('../../../third_party/uproxy-lib/handler/queue');
import Pool = require('./pool');

describe('pool', function() {
  var mockPeerConnection :peerconnection.PeerConnection<Object>;
  var pool :Pool;
  var mockDataChannels :peerconnection.DataChannel[];

  var createMockDataChannel = (label:string) : peerconnection.DataChannel => {
    var fulfillClosed :() => void;
    return <any>{
      getLabel: () => { return label; },
      onceOpened: Promise.resolve(),
      onceClosed: new Promise<void>((F, R) => { fulfillClosed = F; }),
      dataFromPeerQueue: new handler.Queue<peerconnection.Data, void>(),
      send: jasmine.createSpy('send'),
      close: jasmine.createSpy('close').and.callFake(() => { fulfillClosed(); })
    };
  }

  beforeEach(function() {
    mockDataChannels = [];

    var noopPromise = new Promise<void>((F, R) => {});
    mockPeerConnection = <any>{
      openDataChannel: jasmine.createSpy('openDataChannel').and.callFake(() => {
        var mockDataChannel = createMockDataChannel('foo' + mockDataChannels.length);
        mockDataChannels.push(mockDataChannel);
        return Promise.resolve(mockDataChannel);
      }),
      peerOpenedChannelQueue: new handler.Queue<peerconnection.DataChannel, void>()
    };
      
    pool = new Pool(mockPeerConnection, 'test');
  });

  it('check a single open and close sequence', (done) => {
    pool.openDataChannel().then((poolChannel:peerconnection.DataChannel) => {
      expect(mockDataChannels[0].send).toHaveBeenCalledWith({
        str: JSON.stringify({control: 'OPEN'})
      });
      var realChannel = <any>(mockDataChannels[0]);
      realChannel.send.calls.reset();

      poolChannel.send({str: 'foo'});
      expect(realChannel.send).toHaveBeenCalledWith({
        str: JSON.stringify({data: 'foo'})
      });
      realChannel.send.calls.reset();

      var buffer = new Uint8Array(0).buffer;
      poolChannel.send({buffer: buffer});
      expect(realChannel.send).toHaveBeenCalledWith({buffer: buffer});
      realChannel.send.calls.reset();

      var closeAcked = false;
      poolChannel.close().then(() => {
        expect(closeAcked).toBe(true);
        expect(realChannel.close).not.toHaveBeenCalled();
        done();
      });

      expect(realChannel.send).toHaveBeenCalledWith({
        str: JSON.stringify({control: 'CLOSE'})
      });
      realChannel.send.calls.reset();

      // Send the ACK
      closeAcked = true;
      realChannel.dataFromPeerQueue.handle({str: JSON.stringify({control: 'CLOSE'})});
    });
  });
  
  it('check that an underlying close propagates', (done) => {
    pool.openDataChannel().then((poolChannel:peerconnection.DataChannel) => {
      poolChannel.onceClosed.then(done);
    });
    mockDataChannels[0].close();
  });
});
