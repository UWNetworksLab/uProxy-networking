/**
 * A FreeDOM interface to Chrome sockets
 * TODO(willscott): Refactor into freedom-chrome.
 * @constructor
 * @private
 */
var Socket_chrome = function(channel) {
  this.appChannel = channel;
  this.sid = null;
  // http://developer.chrome.com/apps/socket.html
  this.create = chrome.socket.create;
  this.write = chrome.socket.write;
  this.getInfo = chrome.socket.getInfo;
};

// Error codes can be found at:
// https://code.google.com/p/chromium/codesearch#chromium/src/net/base/net_error_list.h

var ERROR_MAP = {
  '-1': 'IO_PENDING',
  '-2': 'FAILED',
  '-3': 'ABORTED',
  '-4': 'INVALID_ARGUMENT',
  '-5': 'INVALID_HANDLE',
  '-7': 'TIMED_OUT',
  '-13': 'OUT_OF_MEMORY',
  '-15': 'SOCKET_NOT_CONNECTED',
  '-21': 'NETWORK_CHANGED',
  '-23': 'SOCKET_IS_CONNECTED',
  '-100': 'CONNECTION_CLOSED',
  '-101': 'CONNECTION_RESET',
  '-102': 'CONNECTION_REFUSED',
  '-103': 'CONNECTION_ABORTED',
  '-104': 'CONNECTION_FAILED',
  '-105': 'NAME_NOT_RESOLVED',
  '-106': 'INTERNET_DISCONNECTED',
};

/*
 * Continuously reads data in from the given socket and dispatches the data to
 * the socket user.
 */
var readSocket = function(socketId) {
  var saved_socketId = socketId;
  var dataRead = function (readInfo) {
    if (readInfo.resultCode > 0) {
      var arg = {socketId: socketId, data: readInfo.data};
      this.dispatchEvent('onData', arg);
      chrome.socket.read(socketId, null, dataRead);
    } else if (readInfo.resultCode === 0) {
      console.error('socket ' + socketId + ' has been closed.')
      this.dispatchEvent('onDisconnect', {socketId: socketId, error: msg});
    } else {
      var msg = '' + readInfo.resultCode;
      if (msg in ERROR_MAP) {
          msg = ERROR_MAP[msg];
      }
      console.error('When reading from socket ' + socketId + ', return encounter error ' + msg);
      this.dispatchEvent('onDisconnect', {socketId: socketId, error: msg});
    };
  }.bind(this);
  chrome.socket.read(socketId, null, dataRead);
};

Socket_chrome.prototype.connect = function(socketId, hostname, port, callback) {
  chrome.socket.connect(socketId, hostname, port, function connectCallback(result) {
    console.log('connect socketId: ' + socketId + ' hostname=' + hostname + ' port=' + port)
    callback(result);
    readSocket.call(this, socketId);
  }.bind(this));
};

Socket_chrome.prototype.listen = function(socketId, address, port, callback) {
  chrome.socket.listen(socketId, address, port, null, function listenCallback(result) {
    callback(result);
    if (result === 0) {
      var acceptCallback = function (acceptInfo) {
        if (acceptInfo.resultCode === 0) {
          this.dispatchEvent('onConnection',
                         {serverSocketId: socketId,
                          clientSocketId: acceptInfo.socketId});
          chrome.socket.accept(socketId, acceptCallback);
          readSocket.call(this, acceptInfo.socketId);
        } else if (acceptInfo.resultCode !== -15) {
          console.error('Error ' + acceptInfo.resultCode
          + ' while trying to accept connection on socket '
              + socketId);
        }
      }.bind(this);
      chrome.socket.accept(socketId, acceptCallback);
    }
  }.bind(this));
};

Socket_chrome.prototype.destroy = function(socketId, continuation) {
  if (chrome && chrome.socket) {
    chrome.socket.destroy(socketId);
  }
  continuation();
};

Socket_chrome.prototype.disconnect = function(socketId, continuation) {
  if (chrome && chrome.socket) {
    chrome.socket.disconnect(socketId);
  }
  continuation();
};
