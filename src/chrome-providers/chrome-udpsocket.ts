/**
 * Freedom UDP sockets over the Chrome APIs.
 * Implements: freedom-typescript-api/interfaces/udp-socket.d.ts
 */
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/udp-socket.d.ts' />

// TODO(yangoon): use DefinitelyTyped.
declare var chrome:any;

module UdpSocket {
  import UdpSocket = freedom.UdpSocket;

  // Type for the chrome.socket.create callback:
  //   http://developer.chrome.com/apps/socket#method-create
  interface CreateSocketInfo {
    socketId:number;
  }

  // Type for the chrome.socket.recvFrom callback:
  //   http://developer.chrome.com/apps/socket#method-recvFrom
  interface RecvFromInfo {
    resultCode:number;
    address:string;
    port:number;
    data:ArrayBuffer;
  }

  // Type for the chrome.socket.sendTo callback:
  //   http://developer.chrome.com/apps/socket#type-WriteInfo
  interface WriteInfo {
    bytesWritten:number;
  }

  export class Chrome implements UdpSocket.Implementation {
    private socketId:number;

    constructor (
        private channel,
        private dispatchEvent:(event:string, data:any) => void) {
    }

    public bind = (
        address:string,
        port:number,
        continuation: (result:number) => any) => {
      // TODO(yangoon): throw error if socketId already set.
      chrome.socket.create('udp', {}, (createResult:CreateSocketInfo) => {
        // TODO(yangoon): can create() fail?
        this.socketId = createResult.socketId;
        // Note how chrome.socket.bind's callback is just an integer:
        //   http://developer.chrome.com/apps/socket#method-bind
        chrome.socket.bind(this.socketId, address, port, (bindResult:number) => {
          dbg('socket ' + this.socketId + ' listening on ' + address + ':' + port);
          // TODO(yangoon): "proper" promises-style fail if bindResult < 0.
          continuation(bindResult);
          if (bindResult >= 0) {
            this.recvFromLoop();
          }
        });
      });
    }

    /**
     * Initialises an infinite read loop.
     * The socket must be successfully bound.
     */
    private recvFromLoop = () => {
      // TODO(yangoon): throw error if socketId unset.
      dbg('starting recvFrom loop for socket ' + this.socketId);
      chrome.socket.recvFrom(this.socketId, null, (recvFromInfo:RecvFromInfo) => {
        if (recvFromInfo.resultCode >= 0) {
          dbg('dispatching onData event for socket ' + this.socketId);
          this.dispatchEvent('onData', {
            resultCode: recvFromInfo.resultCode,
            address: recvFromInfo.address,
            port: recvFromInfo.port,
            data: recvFromInfo.data
          });
        } else {
          // TODO(yangoon): Give the client an opportunity to handle errors.
          dbgErr('code ' + recvFromInfo.resultCode +
              ' while trying to accept connection on socket ' + this.socketId);
        }
        this.recvFromLoop();
      });
    }

    public sendTo = (
        data:ArrayBuffer,
        address:string,
        port:number,
        continuation: (bytesWritten:number) => any) => {
      // TODO(yangoon): throw error if socketId unset.
      chrome.socket.sendTo(this.socketId, data, address, port, (writeInfo:WriteInfo) => {
        continuation(writeInfo.bytesWritten);
      });
    }

    public destroy = (continuation: () => any) => {
      if (this.socketId) {
        chrome.socket.destroy(this.socketId);
      }
      continuation();
    }
  }

  var modulePrefix_ = '[udp-socket] ';
  function dbg(msg:string) { console.log(modulePrefix_ + msg); }
  function dbgWarn(msg:string) { console.warn(modulePrefix_ + msg); }
  function dbgErr(msg:string) { console.error(modulePrefix_ + msg); }
}
