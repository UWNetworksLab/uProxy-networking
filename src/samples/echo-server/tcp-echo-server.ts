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
    // This use of |receive| is contrived, but shows you how to use it to get
    // the first ArrayBuffer of data and treat handling it differently.
    conn.receive().then((data :ArrayBuffer) => {
      console.log('Received first data!');
      this.onData_(conn, data);
      // Now handle further data as we get it using |this.onData_|.
      conn.dataFromSocketQueue.setSyncHandler(this.onData_.bind(this, conn));
    });
  }

  private onData_ = (conn:Tcp.Connection, data :ArrayBuffer) : void => {
    console.log('Received: ' + data.byteLength + " bytes.");
    var hexStrOfData = ArrayBuffers.arrayBufferToHexString(data);
    console.log('Received data as hex-string: ' + hexStrOfData);
    if(hexStrOfData === TcpEchoServer.CTRL_D_HEX_STR_CODE) {
      conn.close();
      return;
    }
    conn.send(data);
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
