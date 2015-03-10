/// <reference path='../../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import ProxyIntegrationTest = require('./proxy-integration-test');

// Example of how to set custom logging level: we set everything to debug for
// testing echo server.
freedom['loggingcontroller']().setConsoleFilter(['*:D']);

if (typeof freedom !== 'undefined') {
  freedom().providePromises(ProxyIntegrationTest);
}
