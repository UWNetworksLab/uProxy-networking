/**
 * Chrome sockets over freedom sockets.
 * TODO: This should be refactored into freedom someday...
 */

declare var chrome:any;


// Platform independent interface. TODO: Put somewhere so firefox can use it.
interface ISockets {
  create:any;
  listen:any;
  connect:any;
  write:any;
  getInfo:any;
  disconnect:any;
  destroy:any;
  on?:any;
}


// http://developer.chrome.com/apps/socket.html
class ChromeSockets implements ISockets {

  sid = null;
  constructor (public channel) {}

  public create = chrome.socket.create;
  public write = chrome.socket.write;
  public getInfo = chrome.socket.getInfo;

  public connect = (socketId, hostname, port, callback) => {
    chrome.socket.connect(socketId, hostname, port, (result) => {
      console.log('connect socketId: ' + socketId + ' hostname=' + hostname + ' port=' + port)
      callback(result);
      readSocket.call(this, socketId);
    });
  }

  public listen = (socketId, address, port, callback) => {
    chrome.socket.listen(socketId, address, port, null, (result) => {
      callback(result);
      if (0 === result) {
        var acceptCallback = function (acceptInfo) {
          if (0 === acceptInfo.resultCode) {
            this.dispatchEvent('onConnection', {
                serverSocketId: socketId,
                clientSocketId: acceptInfo.socketId});
            chrome.socket.accept(socketId, acceptCallback);
            readSocket.call(this, acceptInfo.socketId);
          // -15 is SOCKET_NOT_CONNECTED
          } else if (-15 !== acceptInfo.resultCode) {
            console.error('Error ' + acceptInfo.resultCode
            + ' while trying to accept connection on socket '
                + socketId);
          }
        }.bind(this);
        chrome.socket.accept(socketId, acceptCallback);
      }
    });
  }

  public destroy = (socketId, continuation) => {
    if (chrome && chrome.socket) {
      chrome.socket.destroy(socketId);
    }
    continuation();
  }

  public disconnect = (socketId, continuation) => {
    if (chrome && chrome.socket) {
      chrome.socket.disconnect(socketId);
    }
    continuation();
  }

}  // class ChromeSockets


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
  var dataRead = (readInfo) => {
    if (readInfo.resultCode > 0) {
      var arg = {socketId: socketId, data: readInfo.data};
      this.dispatchEvent('onData', arg);
      chrome.socket.read(socketId, null, dataRead);
    } else if (0 === readInfo.resultCode) {
      console.log('socket ' + socketId + ' has been closed.')
      this.dispatchEvent('onDisconnect', { socketId: socketId, error: msg });
    } else {
      var msg = '' + readInfo.resultCode;
      if (msg in ERROR_MAP) {
          msg = ERROR_MAP[msg];
      }
      console.error('When reading from socket ' + socketId + ', return encounter error ' + msg);
      this.dispatchEvent('onDisconnect', { socketId: socketId, error: msg });
    };
  };
  chrome.socket.read(socketId, null, dataRead);
};
