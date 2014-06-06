/*
  For testing just the TCP server portion (see src/client/tcp.ts)
*/
/// <reference path='../node_modules/freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../src/interfaces/communications.d.ts' />
/// <reference path='../src/socks-to-rtc/tcp.ts' />

class TcpEchoServer {
  public server :TCP.Server;

  constructor(public address:string, public port:number) {
    console.log('Starting TcpEchoServer(' + address + ', ' + port + ')');
    this.server = new TCP.Server(address, port, this.onConnection_);

    this.server.listen().then(() => {
      console.log('Listening on ' + address + ':' + port);
    });
  }

  private onConnection_ = (conn:TCP.Connection) : void => {
    console.log('New TCP Connection: ' + conn.toString());
    conn.dataHandlerQueue.setHandler((buffer) => {
      conn.sendRaw(buffer);
    });
  }
}

freedom.on('start', (addressAndPort: AddressAndPort) => {
  new TcpEchoServer(addressAndPort.address, addressAndPort.port);
});

console.log('TcpEchoServer installed');
