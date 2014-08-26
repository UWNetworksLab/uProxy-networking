// Types for communications between socks-to-rtc and rtc-to-net.


// Useful abbreviation for this common interface.
declare module Net {
  // TODO: Rename this to TransportAddress.
  export interface Endpoint {
    address:string;  // TODO: rename to IpAddress
    port:number;
  }

}
