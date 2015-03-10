/// <reference path='socks-to-rtc.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

/// <reference path='../socks-common/socks-headers.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />
/// <reference path='../handler/queue.d.ts' />
/// <reference path='../webrtc/datachannel.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />

var mockEndpoint :Net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

var voidPromise = Promise.resolve<void>();

// Neither fulfills nor rejects.
// Useful in a bunch of tests where a promise must be returned
// for chaining purposes.
var noopPromise = new Promise<void>((F, R) => {});

describe('SOCKS server', function() {
  var server :SocksToRtc.SocksToRtc;
  var onceServerStopped :() => Promise<void>;

  var mockTcpServer :Tcp.Server;
  var mockPeerConnection :WebRtc.PeerConnection;

  beforeEach(function() {
    server = new SocksToRtc.SocksToRtc();

    var serverStopped = new Promise<void>((F, R) => {
      server.on('stopped', F);
    });
    onceServerStopped = () => { return serverStopped; };

    // TODO: create named more fleshed out TcpServer and PeerConnection mock
    // classes for testing. e.g. failing to listen mock, listen & gets
    // connection, listen and connection drops, etc.
    mockTcpServer = jasmine.createSpyObj('tcp server', [
        'on',
        'onceListening',
        'shutdown',
        'onceShutdown',
        'isShutdown'
      ]);
    // TODO: make a real mock of listen; this one is frgaile to implementation
    // changes and tests that might call onceListening before listen.
    mockTcpServer.listen = () => { return mockTcpServer.onceListening(); }
    mockTcpServer.connectionsQueue = new Handler.Queue<Tcp.Connection, void>();

    mockPeerConnection = <any>{
      dataChannels: {},
      signalForPeerQueue: new Handler.Queue<WebRtc.SignallingMessage, void>(),
      negotiateConnection: jasmine.createSpy('negotiateConnection'),
      onceConnecting: noopPromise,
      onceConnected: noopPromise,
      onceDisconnected: noopPromise,
      close: jasmine.createSpy('close')
    };
  });

  it('onceReady fulfills with server endpoint on server and peerconnection success', (done) => {
    (<any>mockTcpServer.onceListening).and.returnValue(Promise.resolve(mockEndpoint));
    mockPeerConnection.onceConnected = voidPromise;
    // We're not testing termination.
    (<any>mockTcpServer.onceShutdown).and.returnValue(noopPromise);

    server.startInternal(mockTcpServer, mockPeerConnection)
      .then((result:Net.Endpoint) => {
        expect(result.address).toEqual(mockEndpoint.address);
        expect(result.port).toEqual(mockEndpoint.port);
      })
      .then(done);
  });

  it('onceReady rejects and \'stopped\' fires on socket setup failure', (done) => {
    (<any>mockTcpServer.onceListening)
        .and.returnValue(Promise.reject(new Error('could not allocate port')));
    (<any>mockTcpServer.onceShutdown).and.returnValue(Promise.resolve());

    server.startInternal(mockTcpServer, mockPeerConnection).catch(onceServerStopped).then(done);
  });

  it('\'stopped\' fires, and start fails, on early peerconnection termination', (done) => {
    (<any>mockTcpServer.onceListening).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockTcpServer.onceShutdown).and.returnValue(voidPromise);
    mockPeerConnection.onceConnected = voidPromise;
    mockPeerConnection.onceDisconnected = voidPromise;

    server.startInternal(mockTcpServer, mockPeerConnection).catch(onceServerStopped).then(done);
  });

  it('\'stopped\' fires on peerconnection termination', (done) => {
    var terminate :() => void;
    var terminatePromise = new Promise<void>((F, R) => {
      terminate = F;
    });

    (<any>mockTcpServer.onceListening).and.returnValue(Promise.resolve(mockEndpoint));
    (<any>mockTcpServer.onceShutdown).and.returnValue(terminatePromise);
    mockPeerConnection.onceConnected = voidPromise;
    mockPeerConnection.onceDisconnected = terminatePromise;

    server.startInternal(mockTcpServer, mockPeerConnection).then(onceServerStopped).then(done);
    terminate();
  });

  it('\'stopped\' fires on call to stop', (done) => {
    (<any>mockTcpServer.onceListening).and.returnValue(Promise.resolve(mockEndpoint));
    mockPeerConnection.onceConnected = voidPromise;
    // Neither TCP connection nor datachannel close "naturally".
    (<any>mockTcpServer.onceShutdown).and.returnValue(noopPromise);

    server.startInternal(mockTcpServer, mockPeerConnection).then(
        server.stop).then(onceServerStopped).then(done);
  });

  it('stop works before the PeerConnection or TcpServer connects', (done) => {
    (<any>mockTcpServer.onceListening).and.returnValue(noopPromise);
    // PeerConnection never connects.
    mockPeerConnection.onceConnected = noopPromise;
    // Neither TCP connection nor datachannel close "naturally".
    (<any>mockTcpServer.onceShutdown).and.returnValue(noopPromise);

    var onceStartFailed :Promise<void> = new Promise<void>((F, R) => {
      server.startInternal(mockTcpServer, mockPeerConnection).then(R, F);
    });
    Promise.all([onceStartFailed, server.stop()]).then(done);
  });
});

describe("SOCKS session", function() {
  var session :SocksToRtc.Session;

  var mockTcpConnection :Tcp.Connection;
  var mockDataChannel :WebRtc.DataChannel;
  var mockBytesReceived :Handler.Queue<number,void>;
  var mockBytesSent :Handler.Queue<number,void>;

  beforeEach(function() {
    session = new SocksToRtc.Session();

    mockTcpConnection = jasmine.createSpyObj('tcp connection', [
        'onceClosed',
        'close',
        'isClosed',
        'send'
      ]);
    mockTcpConnection.dataFromSocketQueue = new Handler.Queue<ArrayBuffer,void>();
    (<any>mockTcpConnection.close).and.returnValue(Promise.resolve(-1));
    mockTcpConnection.onceClosed = Promise.resolve(
        Tcp.SocketCloseKind.REMOTELY_CLOSED);
    (<any>mockTcpConnection.send).and.returnValue(Promise.resolve({ bytesWritten: 1 }));

    mockDataChannel = <any>{
      getLabel: jasmine.createSpy('getLabel').and.returnValue('mock label'),
      onceOpened: noopPromise,
      onceClosed: noopPromise,
      dataFromPeerQueue: new Handler.Queue(),
      send: jasmine.createSpy('send'),
      close: jasmine.createSpy('close')
    };
    mockDataChannel.dataFromPeerQueue = new Handler.Queue<ArrayBuffer,void>();
    (<any>mockDataChannel.send).and.returnValue(voidPromise);

    mockBytesReceived = new Handler.Queue<number, void>();
    mockBytesSent = new Handler.Queue<number, void>()
  });

  it('onceReady fulfills on successful negotiation', (done) => {
    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: Socks.Reply.SUCCEEDED}));

    session.start(mockTcpConnection, mockDataChannel, mockBytesSent, mockBytesReceived).then(done);
  });

  it('onceReady rejects and onceStopped fulfills on unsuccessful negotiation', (done) => {
    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: Socks.Reply.FAILURE}));

    session.start(mockTcpConnection, mockDataChannel, mockBytesSent, mockBytesReceived)
      .catch((e:Error) => { return session.onceStopped; }).then(done);
  });

  it('onceStopped fulfills on TCP connection termination', (done) => {
    mockTcpConnection.onceClosed = Promise.resolve();

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: Socks.Reply.SUCCEEDED}));

    session.start(mockTcpConnection, mockDataChannel, mockBytesSent, mockBytesReceived)
      .then(() => { return session.onceStopped; }).then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    // Neither TCP connection nor datachannel close "naturally".
    mockTcpConnection.onceClosed = new Promise<Tcp.SocketCloseKind>((F, R) => {});

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: Socks.Reply.SUCCEEDED}));

    session.start(mockTcpConnection, mockDataChannel, mockBytesSent, mockBytesReceived)
      .then(session.stop).then(() => { return session.onceStopped; }).then(done);
  });

  it('bytes sent counter', (done) => {
    // Neither TCP connection nor datachannel close "naturally".
    mockTcpConnection.onceClosed = new Promise<Tcp.SocketCloseKind>((F, R) => {});

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: Socks.Reply.SUCCEEDED}));

    var buffer = new Uint8Array([1,2,3]).buffer;
    session.start(
        mockTcpConnection,
        mockDataChannel,
        mockBytesSent,
        mockBytesReceived).then(() => {
      mockTcpConnection.dataFromSocketQueue.handle(buffer);
    });
    mockBytesSent.setSyncNextHandler((numBytes:number) => {
      expect(numBytes).toEqual(buffer.byteLength);
      done();
    });
  });

  it('bytes received counter', (done) => {
    // Neither TCP connection nor datachannel close "naturally".
    mockTcpConnection.onceClosed = new Promise<Tcp.SocketCloseKind>((F, R) => {});

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: Socks.Reply.SUCCEEDED}));

    var message :WebRtc.Data = {
      buffer: new Uint8Array([1,2,3]).buffer
    };
    session.start(
        mockTcpConnection,
        mockDataChannel,
        mockBytesSent,
        mockBytesReceived).then(() => {
      mockDataChannel.dataFromPeerQueue.handle(message);
    });
    mockBytesReceived.setSyncNextHandler((numBytes:number) => {
      expect(numBytes).toEqual(message.buffer.byteLength);
      done();
    });
  });

  it('channel queue drains before termination', (done) => {
    // TCP connection doesn't close "naturally" but the data
    // channel is already closed when the session is started.
    mockTcpConnection.onceClosed = new Promise<Tcp.SocketCloseKind>((F, R) => {});
    mockDataChannel.onceClosed = voidPromise;

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: Socks.Reply.SUCCEEDED}));

    var message :WebRtc.Data = {
      buffer: new Uint8Array([1,2,3]).buffer
    };
    mockDataChannel.dataFromPeerQueue.handle(message);
    mockDataChannel.dataFromPeerQueue.handle(message);

    session.start(
        mockTcpConnection,
        mockDataChannel,
        mockBytesSent,
        mockBytesReceived);
    session.onceStopped.then(() => {
      expect(mockDataChannel.dataFromPeerQueue.getLength()).toEqual(0);
      done();
    });
  });
});
