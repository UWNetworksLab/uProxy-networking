/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

// TODO: add tests for IPv6 address parsing
describe("socks", function() {
  // A valid SOCKS5/IPV4 request.
  var ipv4RequestArray :Uint8Array;

  // A valid SOCKS5/UDP request.
  var udpMessageArray :Uint8Array;

  beforeEach(function() {
    ipv4RequestArray = new Uint8Array([
      Socks.VERSION5,
      Socks.Command.TCP_CONNECT,
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
      Socks.interpretRequestBuffer(new ArrayBuffer(8));
    }).toThrow();
  });

  it('compose ipv4 tcp request', () => {
    var request : Socks.Request = {
      version: Socks.VERSION5,
      command: Socks.Command.TCP_CONNECT,
      destination: {
        addressType: Socks.AddressType.IP_V4,
        endpoint: {
          address: '192.168.1.1',
          port: 1200
        },
        addressByteLength: 7
      }
    };
    var requestArray = Socks.composeRequest(request);
    expect(requestArray).toEqual(ipv4RequestArray);
  });

  it('parse ipv4 request', () => {
    var result :Socks.Request =
        Socks.interpretRequest(ipv4RequestArray);
    expect(result.version).toEqual(Socks.VERSION5);
    expect(result.command).toEqual(Socks.Command.TCP_CONNECT);
    expect(result.destination.addressType).toEqual(Socks.AddressType.IP_V4);
    expect(result.destination.endpoint.address).toEqual('192.168.1.1');
    expect(result.destination.endpoint.port).toEqual(1200);
  });

  it('roundtrip ipv6 tcp request', () => {
    var request : Socks.Request = {
      version: Socks.VERSION5,
      command: Socks.Command.TCP_CONNECT,
      destination: {
        addressType: Socks.AddressType.IP_V6,
        endpoint: {
          address: '2620::1003:1003:a84f:9831:df45:5420',
          port: 1200
        },
        addressByteLength: 19
      }
    };
    var requestArray = Socks.composeRequest(request);
    var requestAgain = Socks.interpretRequest(requestArray);
    expect(requestAgain).toEqual(request);
  });

  it('roundtrip DNS tcp request', () => {
    var request : Socks.Request = {
      version: Socks.VERSION5,
      command: Socks.Command.TCP_CONNECT,
      destination: {
        addressType: Socks.AddressType.DNS,
        endpoint: {
          address: 'www.example.com',
          port: 1200
        },
        addressByteLength: 19
      }
    };
    var requestArray = Socks.composeRequest(request);
    var requestAgain = Socks.interpretRequest(requestArray);
    expect(requestAgain).toEqual(request);
  });

  it('wrong socks version', () => {
    ipv4RequestArray[0] = 4;
    expect(function() {
      Socks.interpretRequest(ipv4RequestArray);
    }).toThrow();
  });

  it('unsupported command', () => {
    ipv4RequestArray[1] = Socks.Command.TCP_BIND;
    expect(function() {
      Socks.interpretRequest(ipv4RequestArray);
    }).toThrow();
  });

  it('parse destination', () => {
    var destination = Socks.interpretDestination(ipv4RequestArray.subarray(3));
    expect(destination.addressByteLength).toEqual(7);
    expect(destination.addressType).toEqual(Socks.AddressType.IP_V4);
    expect(destination.endpoint.address).toEqual('192.168.1.1');
    expect(destination.endpoint.port).toEqual(1200);
  });

  it('parse udp request', () => {
    var udpMessage = Socks.interpretUdpMessage(udpMessageArray);
    expect(udpMessage.frag).toEqual(0);
    expect(udpMessage.destination.addressType).toEqual(Socks.AddressType.IP_V4);
    expect(udpMessage.destination.endpoint.address).toEqual('192.168.1.1');
    expect(udpMessage.destination.endpoint.port).toEqual(1200);
    expect(udpMessage.data.byteLength).toEqual(2);
    expect(udpMessage.data[0]).toEqual(11);
    expect(udpMessage.data[1]).toEqual(12);
  });

  it('reject wrongly sized udp requests', () => {
    expect(() => {
      Socks.interpretUdpMessage(new Uint8Array(new ArrayBuffer(9)));
    }).toThrow();
  });

  it('reject fragmentation requests', () => {
    udpMessageArray[2] = 7;
    expect(() => { Socks.interpretUdpMessage(udpMessageArray); }).toThrow();
  });
});
