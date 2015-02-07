/// <reference path='../../build/third_party/typings/es6-promise/es6-promise.d.ts' />

// TODO: rename once https://github.com/Microsoft/TypeScript/issues/52 is fixed

import Net = require('../networking-typings/net.types');

export interface Message {
  data: ArrayBuffer
  source: net.Endpoint
}

// TODO: uncomment once https://github.com/Microsoft/TypeScript/issues/52 is fixed
// declare module freedom {
// TODO: Can the freedom.json be generated from this using the IDL compiler?
export interface freedom_ChurnPipe {
  bind(localAddress :string,
       localPort :number,
       remoteAddress :string,
       remotePort :number,
       transformerName :string,
       key ?:ArrayBuffer,
       config ?:string) : Promise<void>;
  send(buffer :ArrayBuffer) : Promise<void>;
  sendTo(buffer :ArrayBuffer, to :freedom_ChurnPipe.Endpoint) : Promise<void>;

  getLocalEndpoint() : Promise<freedom_ChurnPipe.Endpoint>;

  on(t:'message', f:(message:freedom_ChurnPipe.Message) => any) : void;
  on(t:string, f:Function) : void;

  providePromises(provider:any) : void;
}
// }

// TODO: adding to the freedom object would have to be done in a separate file
// that is loaded by typescript when compiling freedom.

// interface Freedom {
//  churnPipe() : freedom_ChurnPipe;
// }
