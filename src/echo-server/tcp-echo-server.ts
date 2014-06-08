/*
  For testing just the TCP server portion (see src/client/tcp.ts)
*/
/// <reference path='../freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../interfaces/communications.d.ts' />
/// <reference path='../tcp/tcp.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />

class TcpEchoServer {
  public server :TCP.Server;

  constructor(public address:string, public port:number) {
    console.log('Starting TcpEchoServer(' + address + ', ' + port + ')...');
    this.server = new TCP.Server(address, port, this.onConnection_);

    this.server.listen().then(() => {
      console.log('TCP echo server listening on ' + address + ':' + port);
    });
  }

  private onConnection_ = (conn:TCP.Connection) : void => {
    console.log('New TCP Connection: ' + conn.toString());
    conn.receive().then((data :ArrayBuffer) => {
      console.log('The first data was ' + data.byteLength + " bytes.");
      conn.sendRaw(data);

      // From now on just send the data back.
      conn.dataHandlerQueue.setHandler((moreData :ArrayBuffer) => {
        console.log('More data: ' + data.byteLength + " bytes.");
        var hexStrOfData = ArrayBuffers.arrayBufferToHexString(moreData);
        console.log('data as hex-string: ' + hexStrOfData);
        if(hexStrOfData === '4') {
          conn.close();
          return
        }
        conn.sendRaw(moreData);
      });
    });

  }
}

var tcpServer :TcpEchoServer;

// TODO: smarter encapsulation logic for echo server.
freedom.on('start', (addressAndPort: Net.AddressAndPort) => {
  if(tcpServer) { tcpServer.server.closeAll(); }
  tcpServer = new TcpEchoServer(addressAndPort.address, addressAndPort.port);
});

freedom.on('stop', () => {
  if(tcpServer) { tcpServer.server.closeAll(); tcpServer = null; }
});

console.log('TcpEchoServer installed');
