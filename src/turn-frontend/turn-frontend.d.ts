/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

// This module allocates a UDP socket which serves TURN clients.
// It delegates creation of relay sockets to turn-backend.

// TODO: rename once https://github.com/Microsoft/TypeScript/issues/52 is fixed
declare module freedom_TurnFrontend {
  interface EndpointInfo {
    address :string;
    port :number;
  }

  interface Ipc {
    data: ArrayBuffer
  }
}

// TODO: uncomment once https://github.com/Microsoft/TypeScript/issues/52 is fixed
// declare module freedom {
  interface freedom_TurnFrontend {
    bind(address :string, port :number) : Promise<freedom_TurnFrontend.EndpointInfo>;
    handleIpc(data :ArrayBuffer) : Promise<void>;

    on(t:string, f:Function) : void;
    on(t:'ipc', f:(message:freedom_TurnFrontend.Ipc) => any) : void;

    providePromises(provider:any) : void;
  }
// }

interface Freedom {
  turnFrontend() : freedom_TurnFrontend;
}
