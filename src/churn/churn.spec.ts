/// <reference path='churn.ts' />
/// <reference path='../pipe/pipe.d.ts' />
/// <reference path='../webrtc/peerconnection.d.ts' />
/// <reference path='../third_party/typings/jasmine/jasmine.d.ts' />

describe("filterCandidatesFromSdp", function() {
  it('with candidates', () => {
    var sdp = 'o=- 3055156452807570418 3 IN IP4 127.0.0.1\n' +
              'a=group:BUNDLE audio data\n' +
              'a=rtcp:40762 IN IP4 172.26.108.25\n' +
              'a=candidate:9097 1 udp 4175 127.0.0.1 50840 typ relay raddr 172.26.108.25 rport 56635\n' +
              'a=candidate:129713316 2 udp 2122129151 172.26.108.25 40762 typ host generation 0\n' +
              'a=ice-ufrag:ETnQpTTSTgfXZ6HZ\n';
    expect(Churn.Provider.filterCandidatesFromSdp(sdp)).toEqual(
        'o=- 3055156452807570418 3 IN IP4 127.0.0.1\n' +
        'a=group:BUNDLE audio data\n' +
        'a=rtcp:40762 IN IP4 172.26.108.25\n' +
        'a=ice-ufrag:ETnQpTTSTgfXZ6HZ\n');
  });
});

describe("extractEndpointFromCandidateLine", function() {
  it('garbage test', () => {
    expect(function() {
      Churn.Provider.extractEndpointFromCandidateLine('abc def');
    }).toThrow();
  });

  it('reject non-host candidates', () => {
    expect(function() {
      Churn.Provider.extractEndpointFromCandidateLine(
        'a=candidate:9097 1 udp 4175 127.0.0.1 50840 typ relay raddr 172.26.108.25 rport 56635');
    }).toThrow();
  });

  it('reject invalid port numbers', () => {
    expect(function() {
      Churn.Provider.extractEndpointFromCandidateLine(
        'a=candidate:9097 1 udp 4175 xxx yyy typ host generation 0');
    }).toThrow();
  });

  it('simple valid test', () => {
    var endpoint = Churn.Provider.extractEndpointFromCandidateLine(
      'a=candidate:129713316 2 udp 2122129151 172.26.108.25 40762 typ host generation 0');
    expect(endpoint.address).toEqual('172.26.108.25');
    expect(endpoint.port).toEqual(40762);
  });
});

describe("setCandidateLineEndpoint", function() {
  var endpoint :freedom_Pipe.Endpoint = {
    address: '127.0.0.1',
    port: 5000
  };

  it('garbage test', () => {
    var endpoint :freedom_Pipe.Endpoint = {
      address: '127.0.0.1',
      port: 5000
    };
    expect(function() {
      Churn.Provider.setCandidateLineEndpoint('abc def', endpoint);
    }).toThrow();
  });

  it('reject non-host candidates', () => {
    expect(function() {
      Churn.Provider.setCandidateLineEndpoint(
        'a=candidate:9097 1 udp 4175 127.0.0.1 50840 typ relay raddr 172.26.108.25 rport 56635',
        endpoint);
    }).toThrow();
  });

  it('simple valid test', () => {
    var candidate = Churn.Provider.setCandidateLineEndpoint(
      'a=candidate:129713316 2 udp 2122129151 172.26.108.25 40762 typ host generation 0',
      endpoint);
    expect(candidate).toEqual(
        'a=candidate:129713316 2 udp 2122129151 127.0.0.1 5000 typ host generation 0');
  });
});
