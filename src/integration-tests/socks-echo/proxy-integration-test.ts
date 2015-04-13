/// <reference path='../../../../third_party/freedom-typings/freedom-common.d.ts' />

import peerconnection = require('../../../../third_party/uproxy-lib/webrtc/peerconnection');

import rtc_to_net = require('../../rtc-to-net/rtc-to-net');
import socks_to_rtc = require('../../socks-to-rtc/socks-to-rtc');
import net = require('../../net/net.types');
import tcp = require('../../net/tcp');
import socks = require('../../socks-common/socks-headers');
import ProxyIntegrationTester = require('./proxy-integration-test.types');
import arraybuffers = require('../../../../third_party/uproxy-lib/arraybuffers/arraybuffers');

// This abstract class is converted into a real class by Freedom, which
// fills in the unimplemented on(...) method in the process of
// constructing a module.
class AbstractProxyIntegrationTest implements ProxyIntegrationTester {
  private socksToRtc_ :socks_to_rtc.SocksToRtc;
  private rtcToNet_ :rtc_to_net.RtcToNet;
  private socksEndpoint_ : Promise<net.Endpoint>;
  private echoServers_ :tcp.Server[] = [];
  private connections_ :{ [index:string]: tcp.Connection; } = {};
  private localhost_ :string = '127.0.0.1';
  private repeat_ :number = 1;

  constructor(private dispatchEvent_:(name:string, args:any) => void,
                                      denyLocalhost?:boolean,
                                      obfuscate?:boolean) {
    this.socksEndpoint_ = this.startSocksPair_(denyLocalhost, obfuscate);
  }

  public startEchoServer = () : Promise<number> => {
    var server = new tcp.Server({
      address: this.localhost_,
      port: 0
    });

    server.connectionsQueue.setSyncHandler((tcpConnection:tcp.Connection) => {
      tcpConnection.dataFromSocketQueue.setSyncHandler((buffer:ArrayBuffer) => {
        var multiBuffer :ArrayBuffer[] = []
        for (var i = 0; i < this.repeat_; ++i) {
          multiBuffer.push(buffer);
        }
        var concatenated = arraybuffers.concat(multiBuffer);
        tcpConnection.send(concatenated);
      });
    });

    // Discard endpoint info; we'll get it again later via .onceListening().
    this.echoServers_.push(server);
    return server.listen().then((endpoint:net.Endpoint) => { return endpoint.port; });
  }

  public setRepeat = (repeat:number) : Promise<void> => {
    this.repeat_ = repeat;
    return Promise.resolve<void>();
  };

  private startSocksPair_ = (denyLocalhost?:boolean, obfuscate?:boolean) : Promise<net.Endpoint> => {
    var socksToRtcEndpoint :net.Endpoint = {
      address: this.localhost_,
      port: 0
    };
    var rtcPcConfig :freedom_RTCPeerConnection.RTCConfiguration = {
      iceServers: [],
    };
    var rtcToNetProxyConfig :rtc_to_net.ProxyConfig = {
      allowNonUnicast: !denyLocalhost  // Allow RtcToNet to contact the localhost server.
    };

    this.socksToRtc_ = new socks_to_rtc.SocksToRtc();
    this.rtcToNet_ = new rtc_to_net.RtcToNet(rtcPcConfig, rtcToNetProxyConfig, obfuscate);
    this.socksToRtc_.on('signalForPeer', this.rtcToNet_.handleSignalFromPeer);
    this.rtcToNet_.signalsForPeer.setSyncHandler(this.socksToRtc_.handleSignalFromPeer);
    return this.socksToRtc_.start(socksToRtcEndpoint, rtcPcConfig, obfuscate);
  }

  // Assumes webEndpoint is IPv4.
  private connectThroughSocks_ = (socksEndpoint:net.Endpoint, webEndpoint:net.Endpoint) : Promise<tcp.Connection> => {
    var connection = new tcp.Connection({endpoint: socksEndpoint});
    var authRequest = socks.composeAuthHandshakeBuffer([socks.Auth.NOAUTH]);
    connection.send(authRequest);
    var connected = new Promise<tcp.ConnectionInfo>((F, R) => {
      connection.onceConnected.then(F);
      connection.onceClosed.then(R);
    });
    var firstBufferPromise :Promise<ArrayBuffer> = connection.receiveNext();
    return connected.then((i:tcp.ConnectionInfo) => {
      return firstBufferPromise;
    }).then((buffer:ArrayBuffer) : Promise<ArrayBuffer> => {
      var auth = socks.interpretAuthResponse(buffer);
      if (auth != socks.Auth.NOAUTH) {
        throw new Error('SOCKS server returned unexpected AUTH response.  ' +
                        'Expected NOAUTH (' + socks.Auth.NOAUTH + ') but got ' + auth);
      }

      var request :socks.Request = {
        command: socks.Command.TCP_CONNECT,
        endpoint: webEndpoint,
      };
      connection.send(socks.composeRequestBuffer(request));
      return connection.receiveNext();
    }).then((buffer:ArrayBuffer) : Promise<tcp.Connection> => {
      var response = socks.interpretResponseBuffer(buffer);
      if (response.reply != socks.Reply.SUCCEEDED) {
        // TODO: Fix bad style: reject should only and always be an error.
        // We should be resolving with result status.
        return Promise.reject(response);
      }
      return Promise.resolve(connection);
    });
  }

  public connect = (port:number, address?:string) : Promise<string> => {
    try {
      return this.socksEndpoint_.then((socksEndpoint:net.Endpoint) : Promise<tcp.Connection> => {
        var echoEndpoint :net.Endpoint = {
          address: address || this.localhost_,
          port: port
        };
        return this.connectThroughSocks_(socksEndpoint, echoEndpoint);
      }).then((connection:tcp.Connection) => {
        this.connections_[connection.connectionId] = connection;
        return connection.connectionId;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  public echo = (connectionId:string, content:ArrayBuffer) : Promise<ArrayBuffer> => {
    return this.echoMultiple(connectionId, [content])
        .then((responses:ArrayBuffer[]) : ArrayBuffer => {
          return arraybuffers.concat(responses);
        });
  }

  public echoMultiple = (connectionId:string, contents:ArrayBuffer[]) : Promise<ArrayBuffer[]> => {
    try {
      var connection = this.connections_[connectionId];
      contents.forEach(connection.send);

      var received :ArrayBuffer[] = [];
      var bytesReceived :number = 0;
      var bytesToSend :number = 0;
      contents.forEach((content:ArrayBuffer) => {
        bytesToSend += content.byteLength;
      });
      return new Promise<ArrayBuffer[]>((F, R) => {
        connection.dataFromSocketQueue.setSyncHandler((echo:ArrayBuffer) => {
          received.push(echo);
          bytesReceived += echo.byteLength;
          if (bytesReceived == bytesToSend) {
            F(received);
          }
        });
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  public ping = (connectionId:string, content:ArrayBuffer) : Promise<void> => {
    try {
      var connection = this.connections_[connectionId];
      connection.send(content);
      connection.dataFromSocketQueue.setSyncHandler((response:ArrayBuffer) => {
        this.dispatchEvent_('pong', {
          connectionId: connectionId,
          response: response
        });
      });
      return Promise.resolve<void>();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  public on = (name:string, listener:(event:any) => void) : void => {
    throw new Error('Placeholder function to keep Typescript happy');
  }
}

export = AbstractProxyIntegrationTest;
