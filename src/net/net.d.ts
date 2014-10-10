/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

// TODO: rename once https://github.com/Microsoft/TypeScript/issues/52 is fixed
declare module freedom_Net {
  interface Ipc {
    data: ArrayBuffer
  }
}

// TODO: uncomment once https://github.com/Microsoft/TypeScript/issues/52 is fixed
// declare module freedom {
  interface freedom_Net {
    handleIpc(data :ArrayBuffer) : Promise<void>;

    on(t:string, f:Function) : void;
    on(t:'ipc', f:(message:freedom_Net.Ipc) => any) : void;

    providePromises(provider:any) : void;
  }
// }

interface Freedom {
  net() : freedom_Net;
}
