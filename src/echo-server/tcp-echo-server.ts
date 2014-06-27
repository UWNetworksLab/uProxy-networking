/*
  For testing just the TCP server portion (see src/client/tcp.ts)
*/
/// <reference path='../freedom-typescript-api/interfaces/freedom.d.ts' />
/// <reference path='../interfaces/communications.d.ts' />
/// <reference path='../tcp/tcp.ts' />
/// <reference path='../arraybuffers/arraybuffers.ts' />

class TcpEchoServer {
  public server :Tcp.Server;

  // '4' is the char-code for control-D which we use to close the TCP
  // connection.
  public static CTRL_D_HEX_STR_CODE = '4'

  constructor(public endpoint:Net.Endpoint) {
    console.log('Starting TcpEchoServer(' + JSON.stringify(endpoint) + ')...');
    this.server = new Tcp.Server(endpoint, this.onConnection_);

    this.server.listen().then(() => {
      console.log('TCP echo server listening on ' + JSON.stringify(endpoint));
    });
  }

  private onConnection_ = (conn:Tcp.Connection) : void => {
    console.log('New TCP Connection: ' + conn.toString());
    conn.onceConnected.then((endpoint) => {
      console.log(' Connection resolved to: ' + JSON.stringify(endpoint));
    });
    conn.receive().then((data :ArrayBuffer) => {
      console.log('The first data was ' + data.byteLength + " bytes.");
      conn.send(data);

      // From now on just send the data back.
      conn.dataFromSocketQueue.setHandler((moreData :ArrayBuffer) => {
        console.log('More data: ' + data.byteLength + " bytes.");
        var hexStrOfData = ArrayBuffers.arrayBufferToHexString(moreData);
        console.log('data as hex-string: ' + hexStrOfData);
        if(hexStrOfData === TcpEchoServer.CTRL_D_HEX_STR_CODE) {
          conn.close();
          return
        }
        conn.send(moreData);
      });
    });

  }
}

var tcpServer :TcpEchoServer;

// TODO: smarter encapsulation logic for echo server.
freedom.on('start', (endpoint:Net.Endpoint) => {
  if(tcpServer) { tcpServer.server.closeAll(); }
  tcpServer = new TcpEchoServer(endpoint);
});

freedom.on('stop', () => {
  if(tcpServer) { tcpServer.server.closeAll(); tcpServer = null; }
});

console.log('TcpEchoServer installed');
