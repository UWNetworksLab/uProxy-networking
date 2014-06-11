// This is a selenium demo end-to-end spec. But it currently doesn't actually
// test anything we care about.

/// <reference path='../third_party/DefinitelyTyped/jasmine/jasmine.d.ts' />

// TODO: use real types.
declare var require :any;
declare var process :any;

var webdriverjs = require('webdriverjs');

describe('end-to-end smoke test', function() {
  // TODO: add ral type.
  var client :any = {};
  jasmine['DEFAULT_TIMEOUT_INTERVAL'] = 30000;

  // Setup the client variable to control chrome via webdriver.
  beforeEach(function() {
    client = webdriverjs.remote({
      desiredCapabilities: {
        browserName: 'chrome',
        chromeOptions: {
          args: [
            // ChromeDriver doesn't know about SOCKS proxies.
            // (see its webdriver_capabilities_parser.cc)
            '--proxy-server=socks5://localhost:9999',
            '--load-extension=' + process.env['CHROME_EXTENSION_PATH']
          ]
        }
      }
    });
    client.init();
  });

  // Asks the browser to go to example.com and verifies the page title.
  it('example.com', function(done) {
    client
      .url('http://example.com/')
      .getTitle(function(err, title) {
        expect(err).toBe(null);
        expect(title).toBe('Example Domain');
      })
      .call(done);
   });

  // Asks the browser to go to www.guardian.co.uk and verifies the page title.
  it('guardian.co.uk', function(done) {
    client
      .url('http://www.guardian.co.uk/')
      .getTitle(function(err, title) {
        expect(err).toBe(null);
        expect(title).toContain('The Guardian');
      })
      .call(done);
   });

  // Cleanup after each test by closing chrome.
  afterEach(function(done) {
    client.end(done);
  });
});
