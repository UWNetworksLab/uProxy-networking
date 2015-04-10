interface ProxyIntegrationTester {
  startEchoServer() :Promise<number>;
  connect(port:number, address?:string) :Promise<string>;
  setRepeat(repeat:number) :Promise<void>;
  echo(connectionId:string, content:ArrayBuffer) :Promise<ArrayBuffer>;
  echoMultiple(connectionId:string, contents:ArrayBuffer[]) :Promise<ArrayBuffer[]>;
  ping(connectionId:string, content:ArrayBuffer) :Promise<void>;
  on(name:'pong', listener:(event:{connectionId:string; response:ArrayBuffer}) => void) :void;
  on(name:string, listener:(event:Object) => void) :void;
}

export = ProxyIntegrationTester;
