/// <reference path='../../../socks-to-rtc/socks-to-rtc.ts' />
/// <reference path='../../../rtc-to-net/rtc-to-net.ts' />

/// <reference path='../../../peerconnection/peerconnection.d.ts' />

/// <reference path='../../../echo-server/tcp-echo-server.ts' />
/// <reference path='../../../freedom-declarations/freedom.d.ts' />
/// <reference path='../../../networking-typings/communications.d.ts' />


//-----------------------------------------------------------------------------
var localhostEndpoint:Net.Endpoint = { address: '127.0.0.1', port:9999 };
var pcConfig :WebRtc.PeerConnectionConfig = {
    webrtcPcConfig: {
      iceServers: [{url: 'stun:stun.l.google.com:19302'},
                   {url: 'stun:stun1.l.google.com:19302'},
                   {url: 'stun:stun2.l.google.com:19302'},
                   {url: 'stun:stun3.l.google.com:19302'},
                   {url: 'stun:stun4.l.google.com:19302'}]
    },
    webrtcMediaConstraints: {
      optional: [{DtlsSrtpKeyAgreement: true}]
    }
  };

//-----------------------------------------------------------------------------
var socksRtc = new SocksToRtc.SocksToRtc(localhostEndpoint, pcConfig);
var rtcNet = new RtcToNet.RtcToNet(pcConfig);
