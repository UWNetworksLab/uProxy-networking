import echotest = require('./base-spec.core-env');

xdescribe('proxy integration tests using churn', function() {
  echotest.socksEchoTestDescription(true);
});
