/// <reference path='../../turn/turn.d.ts' />
/// <reference path='../../net/net.d.ts' />
/// <reference path='../../freedom/typings/freedom.d.ts' />
/// <reference path='../../freedom/coreproviders/uproxylogging.d.ts' />

var log :Freedom_UproxyLogging.Log = freedom['core.log']('top');

var turn :freedom_Turn = freedom.turn();

turn.bind('127.0.0.1', 9997).then(() => {
  var net :freedom_Net = freedom['net']();
  // Connect the TURN server with the net module.
  // Normally, these messages would traverse the internet
  // along an encrypted channel.
  turn.on('ipc', function(m:freedom_Turn.Ipc) {
    net.handleIpc(m.data).catch((e) => {
      log.error('net module failed to handle turn ipc: ' + e.message);
    });
  });
  net.on('ipc', function(m:freedom_Turn.Ipc) {
    turn.handleIpc(m.data).catch((e) => {
      log.error('turn module failed to handle turn ipc: ' + e.message);
    })
  });
}, (e) => {
  log.error('failed to start turn: ' + e.message);
});
