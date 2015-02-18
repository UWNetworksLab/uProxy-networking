
// This module manages relay sockets on behalf of turn-frontend.
// TURN clients do not interact directly with this module.

interface IpcEventMessage {
  data: ArrayBuffer
}

interface freedom_TurnBackend {
  handleIpc(data :ArrayBuffer) : Promise<void>;

  on(t:'ipc', f:(message:IpcEventMessage) => void) : void;
  on(t:string, f:Function) : void;
}
