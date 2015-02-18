/// <reference path='../../../build/third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../build/third_party/freedom-typings/.d.ts' />

/// <reference path='../../turn-frontend/turn-frontend.d.ts' />
/// <reference path='../../turn-backend/turn-backend.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../logging/logging.d.ts' />

freedom['loggingprovider']().setConsoleFilter(['*:I']);

var log :Logging.Log = new Logging.Log('simple TURN');

var frontend :freedom_TurnFrontend = freedom['turnFrontend']();
var backend :freedom_TurnBackend = freedom['turnBackend']();

frontend.bind('127.0.0.1', 9997).then(() => {
  // Connect the TURN server with the net module.
  // Normally, these messages would traverse the internet
  // along an encrypted channel.
  frontend.on('ipc', function(m:freedom_TurnFrontend.Ipc) {
    backend.handleIpc(m.data).catch((e) => {
      log.error('backend failed to handle ipc: ' + e.message);
    });
  });
  backend.on('ipc', function(m:freedom_TurnBackend.Ipc) {
    frontend.handleIpc(m.data).catch((e) => {
      log.error('frontend failed to handle ipc: ' + e.message);
    })
  });
}, (e) => {
  log.error('failed to start TURN frontend: ' + e.message);
});
