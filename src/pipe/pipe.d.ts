/// <reference path='../freedom/typings/udp-socket.d.ts' />
/// <reference path='../third_party/typings/es6-promise/es6-promise.d.ts' />

// TODO: rename once https://github.com/Microsoft/TypeScript/issues/52 is fixed
declare module freedom_Pipe {
  interface Message {
    data: ArrayBuffer
  }

  interface Endpoint {
    address: string;
    port: number;
  }
}

// TODO: uncomment once https://github.com/Microsoft/TypeScript/issues/52 is fixed
// declare module freedom {
  interface freedom_Pipe {
    bind(
        localAddress :string,
        localPort :number,
        remoteAddress :string,
        remotePort :number,
        transformerName :string,
        key ?:ArrayBuffer,
        config ?:string) : Promise<void>;
    send(buffer :ArrayBuffer) : Promise<void>;

    getLocalEndpoint() : Promise<freedom_Pipe.Endpoint>;

    on(t:string, f:Function) : void;
    on(t:'message', f:(message:freedom_Pipe.Message) => any) : void;

    providePromises(provider:any) : void;
  }
// }

interface Freedom {
  pipe() : freedom_Pipe;
}
