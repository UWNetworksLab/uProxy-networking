/// <reference path='rtc-to-net.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

var mockBoundEndpoint :Net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

var voidPromise = Promise.resolve<void>();

var mockProxyConfig :RtcToNet.ProxyConfig = {
  allowNonUnicast: false
};

var mockRemoteEndpoint :Net.Endpoint = {
  // This address and port are both reserved for testing.
  address: '192.0.2.111',
  port: 1023
};

var mockConnectionInfo :Tcp.ConnectionInfo = {
  bound: mockBoundEndpoint,
  remote: mockRemoteEndpoint
}

// Neither fulfills nor rejects.
// Useful in a bunch of tests where a promise must be returned
// for chaining purposes.
var noopPromise = new Promise<any>((F, R) => {});

describe('RtcToNet', function() {
  var server :RtcToNet.RtcToNet;

  var mockPeerconnection :WebRtc.PeerConnection;

  beforeEach(function() {
    server = new RtcToNet.RtcToNet();

    mockPeerconnection = <any>{
      dataChannels: {},
      negotiateConnection: jasmine.createSpy('negotiateConnection'),
      onceConnecting: noopPromise,
      onceConnected: noopPromise,
      onceDisconnected: noopPromise,
      peerOpenedChannelQueue: new Handler.Queue(),
      close: jasmine.createSpy('close')
    };
  });

  it('onceReady fulfills on peerconnection success', (done) => {
    mockPeerconnection.onceConnected = voidPromise;
    // We're not testing termination.

    server.start(mockProxyConfig, mockPeerconnection).then(done);
  });

  it('onceReady rejects on peerconnection setup failure', (done) => {
    mockPeerconnection.onceConnected =
        Promise.reject(new Error('failed to establish connection'));
    // We're not testing termination.

    server.start(mockProxyConfig, mockPeerconnection).catch(done);
  });

  it('onceClosed fulfills on peerconnection termination', (done) => {
    mockPeerconnection.onceConnected = voidPromise;
    mockPeerconnection.onceDisconnected = <any>Promise.resolve();

    server.start(mockProxyConfig, mockPeerconnection)
      .then(() => { return server.onceClosed; })
      .then(done);
  });

  it('onceClosed fulfills on call to stop', (done) => {
    mockPeerconnection.onceConnected = voidPromise;
    // Calling stop() alone should be sufficient to initiate shutdown.

    server.start(mockProxyConfig, mockPeerconnection)
      .then(server.close)
      .then(() => { return server.onceClosed; })
      .then(done);
  });
});

describe("RtcToNet session", function() {
  var session :RtcToNet.Session;

  var mockTcpConnection :Tcp.Connection;
  var mockDataChannel :WebRtc.DataChannel;
  var mockBytesReceived :Handler.Queue<number,void>;
  var mockBytesSent :Handler.Queue<number,void>;

  beforeEach(function() {
    mockTcpConnection = jasmine.createSpyObj('tcp connection', [
        'onceConnected',
        'onceClosed',
        'isClosed',
        'close',
        'send'
      ]);
    mockTcpConnection.dataFromSocketQueue = new Handler.Queue<ArrayBuffer,void>();
    (<any>mockTcpConnection.send).and.returnValue(Promise.resolve({ bytesWritten: 1 }));

    mockDataChannel = <any>{
      closeDataChannel: noopPromise,
      onceClosed: noopPromise,
      close: jasmine.createSpy('close'),
      getLabel: jasmine.createSpy('getLabel'),
      send: jasmine.createSpy('send')
    };
    mockDataChannel.dataFromPeerQueue = new Handler.Queue<ArrayBuffer,void>();
    (<any>mockDataChannel.send).and.returnValue(voidPromise);

    mockBytesReceived = new Handler.Queue<number, void>();
    mockBytesSent = new Handler.Queue<number, void>();
    session  = new RtcToNet.Session(
        mockDataChannel,
        mockProxyConfig,
        mockBytesReceived,
        mockBytesSent);
  });

  it('onceReady fulfills with listening endpoint on successful negotiation', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().then(done);
  });

  it('onceReady rejects and onceStopped fulfills on unsuccessful endpoint negotiation', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.reject(new Error('bad format')));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().catch(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on datachannel termination', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;
    mockDataChannel.onceClosed = Promise.resolve<void>();

    session.start().then(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on TCP connection termination', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = Promise.resolve(Tcp.SocketCloseKind.WE_CLOSED_IT);

    session.start().then(session.onceStopped).then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    session.start().then(session.stop).then(session.onceStopped).then(done);
  });

  it('bytes sent counter', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    var buffer = new Uint8Array([1,2,3]).buffer;
    session.start().then(() => {
      mockTcpConnection.dataFromSocketQueue.handle(buffer);
    });
    mockBytesSent.setSyncNextHandler((numBytes:number) => {
      expect(numBytes).toEqual(buffer.byteLength);
      done();
    });
  });

  it('bytes received counter', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    var message :WebRtc.Data = {
      buffer: new Uint8Array([1,2,3]).buffer
    };
    session.start().then(() => {
      mockDataChannel.dataFromPeerQueue.handle(message);
    });
    mockBytesReceived.setSyncNextHandler((numBytes:number) => {
      expect(numBytes).toEqual(message.buffer.byteLength);
      done();
    });
  });

  it('channel queue drains before termination', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = noopPromise;

    // The data channel is closed before the session starts.
    mockDataChannel.onceClosed = voidPromise;

    var message :WebRtc.Data = {
      buffer: new Uint8Array([1,2,3]).buffer
    };
    var onceMessageHandled = mockDataChannel.dataFromPeerQueue.handle(message);

    session.start().then(session.onceStopped).then(() => {
      return onceMessageHandled;
    }).then(() => {
      expect(mockDataChannel.dataFromPeerQueue.getLength()).toEqual(0);
      done();
    });
  });

  it('socket queue drains before termination', (done) => {
    spyOn(session, 'receiveEndpointFromPeer_').and.returnValue(Promise.resolve(mockRemoteEndpoint));
    spyOn(session, 'replyToPeer_').and.returnValue(Promise.resolve());
    spyOn(session, 'getTcpConnection_').and.returnValue(Promise.resolve(mockTcpConnection));

    // The TCP connection is closed before the session starts.
    mockTcpConnection.onceConnected = Promise.resolve(mockConnectionInfo);
    mockTcpConnection.onceClosed = Promise.resolve(Tcp.SocketCloseKind.WE_CLOSED_IT);
    (<any>mockTcpConnection.isClosed).and.returnValue(true);

    var buffer = new Uint8Array([1,2,3]).buffer;
    var onceMessageHandled = mockTcpConnection.dataFromSocketQueue.handle(buffer);

    session.start().then(session.onceStopped).then(() => {
      return onceMessageHandled;
    }).then(() => {
      expect(mockTcpConnection.dataFromSocketQueue.getLength()).toEqual(0);
      done();
    });
  });
});
