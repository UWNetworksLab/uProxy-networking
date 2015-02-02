/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />

// This module manages relay sockets on behalf of turn-frontend.
// TURN clients do not interact directly with this module.

// TODO: rename once https://github.com/Microsoft/TypeScript/issues/52 is fixed
declare module freedom_TurnBackend {
  interface Ipc {
    data: ArrayBuffer
  }
}

// TODO: uncomment once https://github.com/Microsoft/TypeScript/issues/52 is fixed
// declare module freedom {
  interface freedom_TurnBackend {
    handleIpc(data :ArrayBuffer) : Promise<void>;

    on(t:'ipc', f:(message:freedom_TurnBackend.Ipc) => any) : void;
    on(t:string, f:Function) : void;

    providePromises(provider:any) : void;
  }
// }

interface Freedom {
  turnBackend() : freedom_TurnBackend;
}
