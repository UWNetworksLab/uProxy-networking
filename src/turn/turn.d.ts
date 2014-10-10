/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

// TODO: rename once https://github.com/Microsoft/TypeScript/issues/52 is fixed
declare module freedom_Turn {
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
  interface freedom_Turn {
    bind(address :string, port :number) : Promise<freedom_Turn.EndpointInfo>;
    handleIpc(data :ArrayBuffer) : Promise<void>;

    on(t:string, f:Function) : void;
    on(t:'ipc', f:(message:freedom_Turn.Ipc) => any) : void;

    providePromises(provider:any) : void;
  }
// }

interface Freedom {
  turn() : freedom_Turn;
}
