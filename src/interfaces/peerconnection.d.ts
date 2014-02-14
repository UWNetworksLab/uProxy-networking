// TODO: Make these actually typed, and probably shove into freedom.

// Reference:
// https://github.com/UWNetworksLab/freedom/blob/master/interface/core.js

interface PeerConnection {
  on:(event:string,f:any)=>void;
  setup:any;
  close:any;
  send:any;

  openDataChannel:(channelLabel:string)=>void;
  closeDataChannel:(channelLabel:string)=>void;

  // onOpenDataChannel:(handler:(channelLabel:string)=>void)=>void;
  // onCloseDataChannel:(handler:(channelLabel:string)=>void)=>void;
}
