/**
 * Configure Freedom
 **/

/// <reference path='../../node_modules/freedom-typescript-api/interfaces/freedom.d.ts' />

// Defined in src/chrome-providers/*.ts
declare module UdpSocket { class Chrome {} }

// Configure variable used by Freedom to register custom providers
window.freedomcfg = function(register) {
  // Setup Freedom to use our providers (in src/chrome-providers)
  register('core.udpsocket', UdpSocket.Chrome);
}
