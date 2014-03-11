// White-box test for the Chrome APIs implementation of
// Freedom's UDP socket provider.
// Modeled on Freedom's social.loopback.unit.spec.js.
describe("chrome-udpsocket", function() {
  var provider;
  // Supplied as an argument to the mock chrome.socket.create callback.
  var createResult;
  // Supplied as an argument to the mock chrome.socket.bind callback.
  var bindResult;
  // Supplied as an argument to the mock chrome.socket.sendTo callback.
  var sendToResult;
  var continuation = jasmine.createSpy('continuation');

  beforeEach(function() {
    provider = new UdpSocket.Chrome(
        jasmine.createSpy('channel'),
        jasmine.createSpy('dispatchEvent'));

    chrome = {
      socket: {
        create: function(protocol, args, callback) {
          callback(createResult);
        },
        bind: function(socketId, address, port, callback) {
          callback(bindResult);
        },
        sendTo: function(socketId, data, address, port, callback) {
          callback(sendToResult);
        }
      }
    };

    spyOn(chrome.socket, 'create').and.callThrough();
    spyOn(chrome.socket, 'bind').and.callThrough();
    spyOn(chrome.socket, 'sendTo').and.callThrough();
  });

  it('bind', function() {
    createResult = { socketId: 1025 };
    bindResult = -1, // failure! don't want an infinite loop.
    provider.bind('localhost', 5000, continuation);
    expect(chrome.socket.create).toHaveBeenCalledWith(
        'udp',
        jasmine.any(Object),
        jasmine.any(Function));
    expect(chrome.socket.bind).toHaveBeenCalledWith(
        createResult.socketId,
        'localhost',
        5000,
        jasmine.any(Function));
    expect(continuation).toHaveBeenCalled();
  });

  it('sendTo', function() {
    createResult = { socketId: 1025 };
    bindResult = -1, // failure! don't want an infinite loop.
    sendToResult = {
      bytesWritten: 4
    };
    provider.bind('localhost', 5000, continuation);
    provider.sendTo(new ArrayBuffer(), 'localhost', 7000, continuation);
    expect(chrome.socket.sendTo).toHaveBeenCalledWith(
        createResult.socketId,
        jasmine.any(ArrayBuffer),
        'localhost',
        7000,
        jasmine.any(Function));
    expect(continuation).toHaveBeenCalledWith(sendToResult.bytesWritten);
  });

  // TODO(yangoon): test for recvFrom
});
