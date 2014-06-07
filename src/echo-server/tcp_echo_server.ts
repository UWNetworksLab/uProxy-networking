/*
  For testing just the TCP server portion (see src/client/tcp.ts)
*/
/// <reference path='../freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../interfaces/communications.d.ts' />
/// <reference path='../tcp/tcp.ts' />

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
    conn.receive().then((data :ArrayBuffer) => {
      console.log('The first data array was ' + data.byteLength + " bytes.");
      console.log('Now echoing it back...');
      conn.sendRaw(data);

      // From now on just send the data back.
      conn.dataHandlerQueue.setHandler((moreData :ArrayBuffer) => {
        conn.sendRaw(moreData);
      });
    });

  }
}

freedom.on('start', (addressAndPort: AddressAndPort) => {
  new TcpEchoServer(addressAndPort.address, addressAndPort.port);
});

console.log('TcpEchoServer installed');
