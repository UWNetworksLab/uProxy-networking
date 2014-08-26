// For testing just the TCP server portion (see src/client/tcp.ts)

/// <reference path='../arraybuffers/arraybuffers.d.ts' />
/// <reference path='../freedom/coreproviders/uproxylogging.d.ts' />
/// <reference path='../networking-typings/communications.d.ts' />
/// <reference path='../tcp/tcp.d.ts' />

class TcpEchoServer {
  public server :Tcp.Server;

  // '4' is the char-code for control-D which we use to close the TCP
  // connection.
  public static CTRL_D_HEX_STR_CODE = '4'

  constructor(public endpoint:Net.Endpoint) {
    log.info('Starting TcpEchoServer(' + JSON.stringify(endpoint) + ')...');
    this.server = new Tcp.Server(endpoint, this.onConnection_);

    this.server.listen().then((listeningEndpoint) => {
      log.info('TCP echo server listening on ' +
          JSON.stringify(listeningEndpoint));
    })
    .catch((e:Error) => {
      log.info('Failed to listen to: ' + JSON.stringify(endpoint) +
          e.toString);
      this.server.shutdown();
    });
  }

  private onConnection_ = (conn:Tcp.Connection) : void => {
    log.info('New TCP Connection: ' + conn.toString());
    // The onceConnected is fulfilled by onConnection (in practice, but not
    // specified by the freedom TCP interface)
    conn.onceConnected.then((endpoint) => {
      log.info(' Connection resolved to: ' + JSON.stringify(endpoint));
    });
    // This use of |receive| is contrived, but shows you how to use it to get
    // the first ArrayBuffer of data and treat handling it differently.
    conn.receive().then((data :ArrayBuffer) => {
      log.info('Received first data!');
      this.onData_(conn, data);
      // Now handle further data as we get it using |this.onData_|.
      conn.dataFromSocketQueue.setSyncHandler(this.onData_.bind(this, conn));
    });
  }

  private onData_ = (conn:Tcp.Connection, data :ArrayBuffer) : void => {
    log.info('Received: ' + data.byteLength + " bytes.");

    var hexStrOfData = ArrayBuffers.arrayBufferToHexString(data);
    log.info('Received data as hex-string: ' + hexStrOfData);

    // This shows how you handle some data and close the connection.
    if(hexStrOfData === TcpEchoServer.CTRL_D_HEX_STR_CODE) {
      conn.close();
      return;
    }
    conn.send(data);
  }
}
