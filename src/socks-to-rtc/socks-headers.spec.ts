/// <reference path='../third_party/DefinitelyTyped/jasmine/jasmine.d.ts' />

// TODO: add tests for IPv6 address parsing
describe("socks", function() {
  // A valid SOCKS5/IPV4 request.
  var ipv4Request;

  // A valid SOCKS5/UDP request.
  var udpRequest;

  beforeEach(function() {
    ipv4Request = new Uint8Array([
      Socks.VERSION5,
      Socks.REQUEST_CMD.CONNECT,
      0, // reserved
      Socks.ATYP.IP_V4,
      192, 168, 1, 1, // IP: 192.168.1.1
      1200 >> 8, 1200 & 0xFF]); // port: 1200

    udpRequest = new Uint8Array([
      0, // reserved
      0, // reserved
      0, // frag
      Socks.ATYP.IP_V4,
      192, 168, 1, 1, // IP: 192.168.1.1
      1200 >> 8, 1200 & 0xFF, // port: 1200
      11, // message (byte 1/2)
      12]); // datagram (byte 2/2)
  });

  it('reject wrongly sized requests', function() {
    expect(function() {
      Socks.interpretSocksRequestBuffer(new ArrayBuffer(8));
    }).toThrow();
  });

  it('parse ipv4 request', function() {
    //TODO: fix typing.
    var result :Socks.SocksRequest =
        Socks.interpretSocksRequest(ipv4Request);
    expect(result.version).toEqual(Socks.VERSION5);
    expect(result.cmd).toEqual(Socks.REQUEST_CMD.CONNECT);
    expect(result.atyp).toEqual(Socks.ATYP.IP_V4);
    expect(result.addressString).toEqual('192.168.1.1');
    expect(result.port).toEqual(1200);
    expect(result.protocol).toEqual('tcp');
  });

  it('wrong socks version', function() {
    ipv4Request[0] = 4;
    expect(function() {
      Socks.interpretSocksRequest(ipv4Request);
    }).toThrow();
  });

  it('unsupported command', function() {
    ipv4Request[1] = Socks.REQUEST_CMD.BIND;
    expect(function() {
      Socks.interpretSocksRequest(ipv4Request);
    }).toThrow();
  });

  it('parse destination', function() {
    //TODO: fix type.
    var result :Socks.SocksRequest = new Object();
    var length = Socks.interpretSocksAddress(ipv4Request.subarray(3), result);
    expect(length).toEqual(7);
    expect(result.atyp).toEqual(Socks.ATYP.IP_V4);
    expect(result.addressString).toEqual('192.168.1.1');
    expect(result.port).toEqual(1200);
  });

  it('parse udp request', function() {
    var result :Socks.UdpRequest = new Object();
    Socks.interpretUdpRequest(udpRequest, result);
    expect(result.frag).toEqual(0);
    expect(result.atyp).toEqual(Socks.ATYP.IP_V4);
    expect(result.addressString).toEqual('192.168.1.1');
    expect(result.port).toEqual(1200);
    var message = result.data;
    expect(message.byteLength).toEqual(2);
    expect(message[0]).toEqual(11);
    expect(message[1]).toEqual(12);
  });

  it('reject wrongly sized udp requests', function() {
    expect(function() {
      Socks.interpretUdpRequest(
        new Uint8Array(new ArrayBuffer(9)), {});
    }).toThrow();
  });

  it('reject fragmentation requests', function() {
    udpRequest[2] = 7;
    expect(function() {
      Socks.interpretUdpRequest(udpRequest, {});
    }).toThrow();
  });
});
