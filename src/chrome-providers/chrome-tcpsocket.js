/**
* Chrome sockets over freedom sockets.
*
* Implements: freedom-typescript-api/interfaces/tcp-socket.d.ts
*
* TODO: This should be refactored into freedom someday...
*/
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/tcp-socket.d.ts' />
/// <reference path='../../node_modules/freedom-typescript-api/interfaces/promise.d.ts' />

var Sockets;
(function (Sockets) {
    var TcpSocket = freedom.TcpSocket;

    

    /**
    * This class wraps the chrome socket API:
    *   (http://developer.chrome.com/apps/socket.html)
    * for the freedom interface.
    */
    var Chrome = (function () {
        function Chrome(channel, dispatchEvent) {
            var _this = this;
            this.channel = channel;
            this.dispatchEvent = dispatchEvent;
            this.create = chrome.socket.create;
            this.write = chrome.socket.write;
            this.getInfo = chrome.socket.getInfo;
            this.connect = function (socketId, hostname, port, continuation) {
                chrome.socket.connect(socketId, hostname, port, function (result) {
                    dbg('connecting ' + socketId + ' hostname=' + hostname + ' port=' + port);
                    continuation(result);
                    _this.doReadLoop_(socketId);
                });
            };
            this.listen = function (socketId, address, port, continuation) {
                chrome.socket.listen(socketId, address, port, null, function (result) {
                    continuation(result);
                    if (0 !== result) {
                        return;
                    }

                    // Begin accept-loop on this socket.
                    var acceptCallback = function (acceptInfo) {
                        if (0 === acceptInfo.resultCode) {
                            _this.dispatchEvent('onConnection', {
                                serverSocketId: socketId,
                                clientSocketId: acceptInfo.socketId
                            });
                            chrome.socket.accept(socketId, acceptCallback);
                            _this.doReadLoop_(acceptInfo.socketId);
                            // -15 is SOCKET_NOT_CONNECTED
                        } else if (-15 !== acceptInfo.resultCode) {
                            dbgErr('CODE ' + acceptInfo.resultCode + ' while trying to accept connection on socket ' + socketId);
                        }
                    };
                    chrome.socket.accept(socketId, acceptCallback);
                });
            };
            this.destroy = function (socketId, continuation) {
                chrome.socket.destroy(socketId);
                continuation();
            };
            this.disconnect = function (socketId, continuation) {
                chrome.socket.disconnect(socketId);
                dbg(socketId + ' locally disconnected.');
                continuation();
            };
            /*
            * Continuously reads data in from the given socket and dispatches the data to
            * the socket user.
            */
            this.doReadLoop_ = function (socketId) {
                var loop = function () {
                    return _this.promiseRead_(socketId).then(_this.checkResultCode_).then(function (data) {
                        // This still dispatches to *all* handlers attached to onData, and
                        // puts the responsibility on the user of this object to act only for
                        // the socket corresponding to |socketId|. Really bad.
                        // TODO: Make the events a bijection.
                        _this.dispatchEvent('onData', {
                            socketId: socketId,
                            data: data
                        });
                    }).then(loop);
                };
                var readLoop = loop().catch(function (e) {
                    dbgWarn(socketId + ': ' + e.message);
                    _this.dispatchEvent('onDisconnect', {
                        socketId: socketId,
                        error: e.message
                    });
                });
            };
            /**
            * Create a promise for a future reading of this socket.
            */
            this.promiseRead_ = function (socketId) {
                return new Promise(function (F, R) {
                    chrome.socket.read(socketId, null, F);
                });
            };
            /**
            * Check the result code of a read - if non-positive, reject the promise.
            * Otherwise, pass along read data.
            */
            this.checkResultCode_ = function (readInfo) {
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
            };
        }
        return Chrome;
    })();
    Sockets.Chrome = Chrome;

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
        '-106': 'INTERNET_DISCONNECTED'
    };

    var modulePrefix_ = '[socket] ';
    function dbg(msg) {
        console.log(modulePrefix_ + msg);
    }
    function dbgWarn(msg) {
        console.warn(modulePrefix_ + msg);
    }
    function dbgErr(msg) {
        console.error(modulePrefix_ + msg);
    }
})(Sockets || (Sockets = {}));
