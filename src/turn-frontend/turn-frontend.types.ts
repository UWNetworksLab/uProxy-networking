/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />

// This module allocates a UDP socket which serves TURN clients.
// It delegates creation of relay sockets to turn-backend.

import net = require('../net/net.types');

interface Ipc {
  data: ArrayBuffer
}

interface freedom_TurnFrontend {
  bind(address :string, port :number) : Promise<net.Endpoint>;
  handleIpc(data :ArrayBuffer) : Promise<void>;

  on(t:'ipc', f:(message:Ipc) => void) : void;
  on(t:string, f:Function) : void;
}
