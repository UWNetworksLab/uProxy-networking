/// <reference path='../../peer-connection/peer-connection.d.ts' />
/// <reference path='../../peer-connection/data-channel.d.ts' />
/// <reference path='../../third_party/typings/angularjs/angular.d.ts' />

//------------------------------------------------------------------------------
interface Channel {
  state :string; // 'open', 'connecting', 'closed'
}

interface WebrtcPcControllerScope extends ng.IScope {
  state :string;  // 'WAITING.', 'CONNECTING...', 'CONNECTED!', 'DISCONNECTED.'
  error :string;
  connectInfo :string;

  localInfo :string;
  remoteInfo :string;

  newChannelLabel :string;

  channels : {[channelLabel:string] : Channel};

  // User actions
  initiateConnection :() => void;
  processRemoteSignallingMessages :() => void;

  createChannel :(channelLabel:string) => void;
  send :(channelLabel:string, message:string) => void;

  // Callback from pc
  onLocalSignallingMessage :(signal:WebRtc.SignallingMessage) => void;
}

//------------------------------------------------------------------------------
// Create a new peer connection.
var pcConfig :WebRtc.PeerConnectionConfig = {
    webrtcPcConfig: {
      iceServers: [{url: 'stun:stun.l.google.com:19302'},
                   {url: 'stun:stun1.l.google.com:19302'},
                   {url: 'stun:stun2.l.google.com:19302'},
                   {url: 'stun:stun3.l.google.com:19302'},
                   {url: 'stun:stun4.l.google.com:19302'}],
    },
    webrtcMediaConstraints: {
      optional: [{DtlsSrtpKeyAgreement: true}]
    }
  };
var pc :WebRtc.PeerConnection = new WebRtc.PeerConnection(pcConfig);

//------------------------------------------------------------------------------
var webrtcPcApp = angular.module('webrtcPcApp', []);
webrtcPcApp.controller('webrtcPcController',
    ($scope :WebrtcPcControllerScope) => {
  //----------------------------------------------------------------------------
  $scope.state = 'WAITING.';
  $scope.error = '';
  $scope.connectInfo = '';

  $scope.localInfo = '';
  $scope.remoteInfo = '';

  $scope.newChannelLabel = 'test-channel-label';

  //----------------------------------------------------------------------------
  // Promise completion callbacks
  pc.onceConnecting.then(() => {
      $scope.$apply(() => { $scope.state = 'CONNECTING...'; });
    });
  pc.onceConnected.then((addresses) => {
      $scope.$apply(() => {
        $scope.state = 'CONNECTED!';
        $scope.connectInfo = JSON.stringify(addresses);
      });
    }).catch((e) => {
      $scope.$apply(() => { $scope.error = e.toString(); });
    });
  pc.onceDisconnected.then(() => {
      $scope.$apply(() => { $scope.state = 'DISCONNECTED.'; });
    });

  // called when the start button is clicked. Only called on the initiating
  // side.
  $scope.initiateConnection = () =>  {
    console.log('initiateConnection');
    pc.negotiateConnection();
  };

  // Adds a signal text to the copy box. Callback from pc.
  $scope.onLocalSignallingMessage = (signal:WebRtc.SignallingMessage) => {
    $scope.$apply(() => {
      console.log('onLocalSignallingMessage');
      $scope.localInfo = $scope.localInfo.trim() + '\n' +
        JSON.stringify(signal);
    });
  };
  pc.toPeerSignalQueue.setSyncHandler($scope.onLocalSignallingMessage);

  // Handles each line in the received 'paste' box which are messages from the
  // remote peer via the signalling channel.
  $scope.processRemoteSignallingMessages = () => {
    console.log('onRemoteSignallingMessages');
    var messages = $scope.remoteInfo.split('\n');
    for (var i = 0; i < messages.length; i++) {
      var s:string = messages[i];
      var signal:WebRtc.SignallingMessage = JSON.parse(s);
      pc.handleSignalMessage(signal);
    }
  }

  $scope.createChannel = (channelLabel) => {
    $scope.$apply(() => {
      var dataChannel = pc.openDataChannel(channelLabel);
      $scope.channels[channelLabel] = { state: dataChannel.getState() };
      dataChannel.onceOpenned.then(() => {
          $scope.$apply(() => {
              $scope.channels[channelLabel].state = dataChannel.getState();
            });
        });
      dataChannel.onceClosed.then(() => {
          $scope.$apply(() => {
              $scope.channels[channelLabel].state = dataChannel.getState();
            });
        });
    });
  }

  $scope.send = (channelLabel:string, channelMessage:string) => {
    console.log('send: ' + channelLabel + ' : ' + channelMessage);
  }
});

/* webrtcPcApp.controller('dataChannelPcController',
    ($scope :WebrtcPcControllerScope) => {

});
*/
