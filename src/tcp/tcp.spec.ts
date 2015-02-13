/// <reference path='tcp.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

describe('Tcp', function() {
  it('conversion of a connected endpoint info', () => {
    var input :freedom_TcpSocket.SocketInfo = {
      localAddress: '127.0.0.1',
      localPort: 1234,
      peerAddress: '192.0.2.111',
      peerPort: 1023,
      connected: true
    };

    var output :Tcp.ConnectionInfo = {
      bound: {
        address: '127.0.0.1',
        port: 1234
      },
      remote: {
        address: '192.0.2.111',
        port: 1023
      }
    };

    expect(Tcp.endpointOfSocketInfo(input)).toEqual(output);
  });

  it('conversion of a closed endpoint info', () => {
    var input :freedom_TcpSocket.SocketInfo = {
      connected: false
    };

    var output :Tcp.ConnectionInfo = {};

    expect(Tcp.endpointOfSocketInfo(input)).toEqual(output);
  });
});
