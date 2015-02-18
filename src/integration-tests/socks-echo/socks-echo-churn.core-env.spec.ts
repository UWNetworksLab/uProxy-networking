import echotest = require('socks-echo-base.core-env.spec');

describe('proxy integration tests using churn', function() {
  echotest.socksEchoTestDescription(true);
});
