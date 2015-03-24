interface ProxyIntegrationTester {
  startEchoServer() :Promise<number>;
  connect(port:number, address?:string) :Promise<string>;
  echo(connectionId:string, content:ArrayBuffer) :Promise<ArrayBuffer>;
  echoMultiple(connectionId:string, contents:ArrayBuffer[]) :Promise<ArrayBuffer[]>;
  ping(connectionId:string, content:ArrayBuffer) :Promise<void>;
  notifyClose(connectionId:string) : Promise<void>;
  closeEchoConnections() : Promise<void>;
}

export = ProxyIntegrationTester;
