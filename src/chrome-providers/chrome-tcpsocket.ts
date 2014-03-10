/**
 * Chrome sockets over freedom sockets.
 *
 * Implements: freedom-typescript-api/interfaces/tcp-socket.d.ts
 *
 * TODO: This should be refactored into freedom someday...
 */
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/tcp-socket.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/promise.d.ts' />

declare var chrome:any;

module Sockets {

  import TcpSocket = freedom.TcpSocket;

  // https://developer.chrome.com/apps/socket.html#method-read
  interface ChromeReadInfo {
    resultCode:number;
    data:ArrayBuffer
  }

  /**
   * This class wraps the chrome socket API:
   *   (http://developer.chrome.com/apps/socket.html)
   * for the freedom interface.
   */
  export class Chrome implements TcpSocket.Implementation {

    constructor (
        private channel,
        private dispatchEvent:(event:string,data:Object)=>void) {
    }

    public create: (type:string, options:TcpSocket.SocketOptions,
                     continuation:(createInfo:TcpSocket.CreateInfo) => void)
                    => void
        = chrome.socket.create;
    public write: (socketId:number, data:ArrayBuffer,
                    continuation:(writeInfo:TcpSocket.WriteInfo) => void)
                  => void
        = chrome.socket.write;
    public getInfo: (socketId:number,
                     continuation:(result:TcpSocket.SocketInfo) => void)
                    => void
        = chrome.socket.getInfo;

    public connect = (socketId, hostname, port, continuation) => {
      chrome.socket.connect(socketId, hostname, port, (result) => {
        dbg('connecting ' + socketId + ' hostname=' + hostname + ' port=' + port)
        continuation(result);
        this.doReadLoop_(socketId);
      });
    }

    public listen = (socketId, address, port,
        continuation:(result:number) => void) => {
      chrome.socket.listen(socketId, address, port, null, (result) => {
        continuation(result);
        if (0 !== result) { return; }
        // Begin accept-loop on this socket.
        var acceptCallback = (acceptInfo) => {
          if (0 === acceptInfo.resultCode) {
            this.dispatchEvent('onConnection', {
                serverSocketId: socketId,
                clientSocketId: acceptInfo.socketId
            });
            chrome.socket.accept(socketId, acceptCallback);
            this.doReadLoop_(acceptInfo.socketId);
          // -15 is SOCKET_NOT_CONNECTED
          } else if (-15 !== acceptInfo.resultCode) {
            dbgErr('CODE ' + acceptInfo.resultCode
            + ' while trying to accept connection on socket '
                + socketId);
          }
        };
        chrome.socket.accept(socketId, acceptCallback);
      });
    }

    public destroy = (socketId:number, continuation) => {
      chrome.socket.destroy(socketId);
      continuation();
    }

    public disconnect = (socketId:number, continuation) => {
      chrome.socket.disconnect(socketId);
      dbg(socketId + ' locally disconnected.');
      continuation();
    }

    /*
     * Continuously reads data in from the given socket and dispatches the data to
     * the socket user.
     */
    private doReadLoop_ = (socketId:number) => {
      var loop = () => {
        return this.promiseRead_(socketId)
            .then(this.checkResultCode_)
            .then((data) => {
              // This still dispatches to *all* handlers attached to onData, and
              // puts the responsibility on the user of this object to act only for
              // the socket corresponding to |socketId|. Really bad.
              // TODO: Make the events a bijection.
              this.dispatchEvent('onData', {
                socketId: socketId,
                data: data
              });
            })
            .then(loop);
      }
      var readLoop = loop()
            .catch((e) => {
              dbgWarn(socketId + ': ' + e.message);
              this.dispatchEvent('onDisconnect', {
                  socketId: socketId,
                  error: e.message
              });
            })
    }

    /**
     * Create a promise for a future reading of this socket.
     */
    private promiseRead_ = (socketId:number):Promise<ChromeReadInfo> => {
      return new Promise((F, R) => { chrome.socket.read(socketId, null, F); });
    }

    /**
     * Check the result code of a read - if non-positive, reject the promise.
     * Otherwise, pass along read data.
     */
    private checkResultCode_ = (readInfo:ChromeReadInfo) => {
      var code = readInfo.resultCode;
      if (0 === code) {
        return Promise.reject(new Error('remotely closed.'));
      }
      if (code < 0) {
        var msg = '' + code;
        if (msg in ERROR_MAP) {
          msg = ERROR_MAP[msg];
        }
        return Promise.reject(new Error(msg));
      }
      return Promise.resolve(readInfo.data);
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

  var modulePrefix_ = '[socket] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }

}  // module Sockets
