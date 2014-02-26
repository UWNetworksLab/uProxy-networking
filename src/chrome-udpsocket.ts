/**
 * Freedom UDP sockets over the Chrome APIs.
 */
/// <reference path='interfaces/udpsocket.d.ts' />

declare var chrome:any;

module UdpSocket {

  interface CreateSocketInfo {
    socketId:number;
  }

  export class Chrome implements UdpSocket.API {
    private socketId:number;

    constructor (
        private channel,
        private dispatchEvent:(event:string, data:any) => void) {
    }

    public bind = (address:string, port:number, continuation) => {
      // TODO(yangoon): throw error if socketId already set.
      chrome.socket.create('udp', {}, (createResult:CreateSocketInfo) => {
        // TODO(yangoon): can create() fail?
        this.socketId = createResult.socketId;
        chrome.socket.bind(this.socketId, address, port, (resultCode:number) => {
          dbg('socket ' + this.socketId + ' listening on ' + address + ':' + port);
          continuation(resultCode);
          if (resultCode >= 0) {
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
      chrome.socket.recvFrom(this.socketId, null, (recvFromInfo) => {
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

    public sendTo = (data:ArrayBuffer, address:string, port:number, continuation) => {
      // TODO(yangoon): throw error if socketId unset.
      chrome.socket.sendTo(this.socketId, data, address, port, (writeInfo) => {
        console.log(writeInfo);
      });
      continuation();
    }

    public destroy = (continuation) => {
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
