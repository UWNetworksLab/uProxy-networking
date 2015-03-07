/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/jasmine/jasmine.d.ts' />

import arraybuffers = require('../../../third_party/uproxy-lib/arraybuffers/arraybuffers');
import peerconnection = require('../../../third_party/uproxy-lib/webrtc/peerconnection');
import handler = require('../../../third_party/uproxy-lib/handler/queue');

import socks_to_rtc = require('./socks-to-rtc');
import net = require('../net/net.types');
import tcp = require('../net/tcp');
import socks = require('../socks-common/socks-headers');

import logging = require('../../../third_party/uproxy-lib/logging/logging');

var log :logging.Log = new logging.Log('socks-to-rtc spec');

var mockEndpoint :net.Endpoint = {
  address: '127.0.0.1',
  port: 1234
};

var voidPromise = Promise.resolve<void>();

// Neither fulfills nor rejects.
// Useful in a bunch of tests where a promise must be returned
// for chaining purposes.
var noopPromise = new Promise<void>((F, R) => {});

describe('SOCKS server', function() {
  var server :socks_to_rtc.SocksToRtc;
  var onceServerStopped :() => Promise<void>;

  var mockTcpServer :tcp.Server;
  var mockPeerConnection :peerconnection.PeerConnection<peerconnection.SignallingMessage>;

  beforeEach(function() {
    server = new socks_to_rtc.SocksToRtc();

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
    mockTcpServer.connectionsQueue = new handler.Queue<tcp.Connection, void>();

    mockPeerConnection = <any>{
      dataChannels: {},
      signalForPeerQueue: new handler.Queue<peerconnection.SignallingMessage, void>(),
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
      .then((result:net.Endpoint) => {
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
  var session :socks_to_rtc.Session;

  var mockBytesReceived :handler.Queue<number,void>;
  var mockBytesSent :handler.Queue<number,void>;
  var mockDataChannel :peerconnection.DataChannel;
  var mockDataFromPeerQueue :handler.Queue<peerconnection.Data,void>;
  var mockTcpConnection :tcp.Connection;

  beforeEach(function() {
    session = new socks_to_rtc.Session();

    mockTcpConnection = jasmine.createSpyObj('tcp connection', [
        'onceClosed',
        'close',
        'isClosed'
      ]);
    mockTcpConnection.dataFromSocketQueue = new handler.Queue<ArrayBuffer,void>();
    (<any>mockTcpConnection.close).and.returnValue(Promise.resolve(-1));
    mockTcpConnection.onceClosed = Promise.resolve(
        tcp.SocketCloseKind.REMOTELY_CLOSED);
    mockDataFromPeerQueue = new handler.Queue<peerconnection.Data,void>();

    mockDataChannel = <any>{
      close: jasmine.createSpy('close'),
      dataFromPeerQueue: mockDataFromPeerQueue,
      getLabel: jasmine.createSpy('getLabel').and.returnValue('mock label'),
      onceClosed: noopPromise,
      onceOpened: noopPromise,
      send: jasmine.createSpy('send')
    };

    (<any>mockDataChannel.send).and.returnValue(voidPromise);

    mockBytesReceived = new handler.Queue<number, void>();
    mockBytesSent = new handler.Queue<number, void>()
  });

  it('onceReady fulfills on successful negotiation', (done) => {
    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: socks.Reply.SUCCEEDED}));

    session.start(mockTcpConnection, mockDataChannel, mockBytesSent, mockBytesReceived).then(done);
  });

  it('onceReady rejects and onceStopped fulfills on unsuccessful negotiation', (done) => {
    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: socks.Reply.FAILURE}));

    session.start(mockTcpConnection, mockDataChannel, mockBytesSent, mockBytesReceived)
      .catch((e:Error) => { return session.onceStopped; }).then(done);
  });

  it('onceStopped fulfills on TCP connection termination', (done) => {
    mockTcpConnection.onceClosed = Promise.resolve();

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: socks.Reply.SUCCEEDED}));

    session.start(mockTcpConnection, mockDataChannel, mockBytesSent, mockBytesReceived)
      .then(() => { return session.onceStopped; }).then(done);
  });

  it('onceStopped fulfills on call to stop', (done) => {
    // Neither TCP connection nor datachannel close "naturally".
    mockTcpConnection.onceClosed = new Promise<tcp.SocketCloseKind>((F, R) => {});

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: socks.Reply.SUCCEEDED}));

    session.start(mockTcpConnection, mockDataChannel, mockBytesSent, mockBytesReceived)
      .then(session.stop).then(() => { return session.onceStopped; }).then(done);
  });

  it('bytes sent counter', (done) => {
    // Neither TCP connection nor datachannel close "naturally".
    mockTcpConnection.onceClosed = new Promise<tcp.SocketCloseKind>((F, R) => {});

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: socks.Reply.SUCCEEDED}));

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
    mockTcpConnection.onceClosed = new Promise<tcp.SocketCloseKind>((F, R) => {});

    spyOn(session, 'doAuthHandshake_').and.returnValue(Promise.resolve());
    spyOn(session, 'doRequestHandshake_').and.returnValue(
        Promise.resolve({reply: socks.Reply.SUCCEEDED}));

    var message :peerconnection.Data = {
      buffer: new Uint8Array([1,2,3]).buffer
    };
    session.start(
        mockTcpConnection,
        mockDataChannel,
        mockBytesSent,
        mockBytesReceived).then(() => {
      mockDataFromPeerQueue.handle(message);
    });
    mockBytesReceived.setSyncNextHandler((numBytes:number) => {
      expect(numBytes).toEqual(message.buffer.byteLength);
      done();
    });
  });
});
