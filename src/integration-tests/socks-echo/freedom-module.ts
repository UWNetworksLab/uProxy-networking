/// <reference path='../../../../third_party/freedom-typings/freedom-common.d.ts' />
/// <reference path='../../../../third_party/freedom-typings/freedom-module-env.d.ts' />

import ProxyIntegrationTest = require('proxy-integration-test');

freedom['loggingcontroller']().setConsoleFilter(['*:D']);

if (typeof freedom !== 'undefined') {
  freedom().providePromises(ProxyIntegrationTest);
}
