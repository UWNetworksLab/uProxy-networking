/// <reference path='../third_party/DefinitelyTyped/jasmine/jasmine.d.ts' />

// TODO: add tests for IPv6 address parsing
describe("socks", function() {
  // A valid SOCKS5/IPV4 request.
  var ipv4RequestArray :Uint8Array;

  // A valid SOCKS5/UDP request.
  var udpMessageArray :Uint8Array;

  beforeEach(function() {
    ipv4RequestArray = new Uint8Array([
      Socks.VERSION5,
      Socks.Command.CONNECT,
      0, // reserved
      Socks.AddressType.IP_V4,
      192, 168, 1, 1, // IP: 192.168.1.1
      1200 >> 8, 1200 & 0xFF]); // port: 1200

    udpMessageArray = new Uint8Array([
      0, // reserved
      0, // reserved
      0, // frag
      Socks.AddressType.IP_V4,
      192, 168, 1, 1, // IP: 192.168.1.1
      1200 >> 8, 1200 & 0xFF, // port: 1200
      11, // message (byte 1/2)
      12]); // datagram (byte 2/2)
  });

  it('reject wrongly sized requests', () => {
    expect(() => {
      Socks.interpretSocksRequestBuffer(new ArrayBuffer(8));
    }).toThrow();
  });

  it('parse ipv4 request', () => {
    //TODO: fix typing.
    var result :Socks.Request =
        Socks.interpretRequest(ipv4RequestArray);
    expect(result.version).toEqual(Socks.VERSION5);
    expect(result.command).toEqual(Socks.Command.CONNECT);
    expect(result.addressType).toEqual(Socks.ATYP.IP_V4);
    expect(result.endpoint.address).toEqual('192.168.1.1');
    expect(result.endpoint.port).toEqual(1200);
  });

  it('wrong socks version', () => {
    ipv4RequestArray[0] = 4;
    expect(function() {
      Socks.interpretRequest(ipv4RequestArray);
    }).toThrow();
  });

  it('unsupported command', () => {
    ipv4RequestArray[1] = Socks.Command.BIND;
    expect(function() {
      Socks.interpretRequest(ipv4RequestArray);
    }).toThrow();
  });

  it('parse destination', () => {
    var destination = Socks.interpretDestination(ipv4RequestArray.subarray(3));
    expect(destination.byteLength).toEqual(7);
    expect(destination.addressType).toEqual(Socks.ATYP.IP_V4);
    expect(destination.endpoint.address).toEqual('192.168.1.1');
    expect(destination.endpoint.port).toEqual(1200);
  });

  it('parse udp request', () => {
    var udpMessage = Socks.interpretUdpMessage(udpMessageArray);
    expect(udpMessage.frag).toEqual(0);
    expect(udpMessage.addressType).toEqual(Socks.AddressType.IP_V4);
    expect(udpMessage.endpoint.address).toEqual('192.168.1.1');
    expect(udpMessage.endpoint.port).toEqual(1200);
    expect(udpMessage.data.byteLength).toEqual(2);
    expect(udpMessage.data[0]).toEqual(11);
    expect(udpMessage.data[1]).toEqual(12);
  });

  it('reject wrongly sized udp requests', () => {
    expect(() => {
      Socks.interpretUdpMessage(
        new Uint8Array(new ArrayBuffer(9)), {});
    }).toThrow();
  });

  it('reject fragmentation requests', () => {
    udpMessageArray[2] = 7;
    expect(() => {
      Socks.interpretUdpMessage(udpMessageArray, {});
    }).toThrow();
  });
});
