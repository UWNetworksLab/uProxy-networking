import echotest = require('socks-echo-base.integration.spec');

describe('proxy integration tests using churn', function() {
  echotest.socksEchoTestDescription(true);
});
