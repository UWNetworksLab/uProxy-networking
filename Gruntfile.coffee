TaskManager = require './build/tools/taskmanager'

#-------------------------------------------------------------------------
# The top level tasks. These are the highest level grunt-tasks defined in terms
# of specific grunt rules below and given to grunt.initConfig
taskManager = new TaskManager.Manager();

taskManager.add 'default', [ 'base', 'samples', 'test' ]

taskManager.add 'base', [
  'copy:dev'
  'ts:devInModuleEnv'
  'ts:devInCoreEnv'
  'browserify:echoFreedomModule'
  'browserify:churnPipeFreedomModule'
  'browserify:simpleSocksFreedomModule'
]

taskManager.add 'test', [
  'base'
  'browserify:churnSpec'
  'browserify:tcpSpec'
  'browserify:simpleTransformersCaesarSpec'
  'browserify:socksCommonHeadersSpec'
  'browserify:socksToRtcSpec'
  'browserify:rtcToNetSpec'
  'browserify:turnFrontEndMessagesSpec'
  'browserify:turnFrontEndSpec'
  'jasmine'
]

taskManager.add 'integration', [
  'tcpIntegrationTest'
  'socksEchoIntegrationTest'
]

# -----------------------------------------------------------------------------
# Sample Apps

taskManager.add 'samples', [
  'base'
  'sampleCopyPasteChurnChatChromeApp'
  'sampleCopyPasteSocksChromeApp'
  'sampleEchoServerChromeApp'
  'sampleEchoServerFirefoxApp'
  'sampleFreedomModuleRunnerChromeApp'
  'sampleSimpleChurnChatChromeApp'
  'sampleSimpleSocksChromeApp'
  'sampleSimpleSocksFirefoxApp'
  'sampleSimpleChurnChatChromeApp'
  'sampleSimpleTurnChromeApp'
]

taskManager.add 'sampleSimpleSocksChromeApp', [
  'base'
  'copy:libsForSimpleSocksChromeApp'
  'browserify:simpleSocksChromeApp'
]

taskManager.add 'sampleEchoServerChromeApp', [
  'base'
  'copy:libsForEchoServerChromeApp'
  'browserify:echoServerChromeApp'
]

taskManager.add 'sampleSimpleSocksFirefoxApp', [
  'base'
  'copy:libsForSimpleSocksFirefoxApp'
]

taskManager.add 'sampleEchoServerFirefoxApp', [
  'base'
  'copy:libsForEchoServerFirefoxApp'
]

taskManager.add 'sampleCopyPasteChurnChatChromeApp', [
  'base'
  'copy:libsForCopyPasteChurnChatChromeApp'
  'browserify:copyPasteChurnChatFreedomModule'
  'browserify:copyPasteChurnChatChromeApp'
]

taskManager.add 'sampleCopyPasteSocksChromeApp', [
  'base'
  'copy:libsForCopyPasteSocksChromeApp'
  'vulcanize:sampleCopyPasteSocksChromeApp'
  'browserify:copyPasteSocksFreedomModule'
  'browserify:copyPasteSocksChromeApp'
]

taskManager.add 'sampleFreedomModuleRunnerChromeApp', [
  'base'
  'integrationTestModules'
  'copy:libsForFreedomModuleRunner'
  'browserify:freedomModuleRunnerChromeApp'
]

taskManager.add 'sampleSimpleChurnChatChromeApp', [
  'base'
  'copy:libsForSimpleChurnChatChromeApp'
  'browserify:simpleChurnChatFreedomModule'
  'browserify:simpleChurnChatChromeApp'
]

taskManager.add 'sampleSimpleTurnChromeApp', [
  'base'
  'copy:libsForSimpleTurnChromeApp'
  'browserify:simpleTurnFreedomModule'
  'browserify:simpleTurnChromeApp'
]

# -----------------------------------------------------------------------------
# Integration tests

taskManager.add 'socksEchoIntegrationTestModule', [
  'base'
  'copy:libsForIntegrationSocksEcho'
  'browserify:integrationSocksEchoFreedomModule'
  'browserify:integrationSocksEchoChurnSpec'
  'browserify:integrationSocksEchoNochurnSpec'
  'browserify:integrationSocksEchoSlowSpec'
]

taskManager.add 'socksEchoIntegrationTest', [
  'socksEchoIntegrationTestModule'
  'jasmine_chromeapp:socksEcho'
]

taskManager.add 'tcpIntegrationTestModule', [
  'base'
  'copy:libsForIntegrationTcp'
  'browserify:integrationTcpFreedomModule'
  'browserify:integrationTcpSpec'
]

taskManager.add 'tcpIntegrationTest', [
  'tcpIntegrationTestModule'
  'jasmine_chromeapp:tcp'
]

taskManager.add 'integrationTestModules', [
  'tcpIntegrationTestModule'
  'socksEchoIntegrationTestModule'
]



#-------------------------------------------------------------------------
rules = require './build/tools/common-grunt-rules'
# Location of where src is copied into and compiled.
devBuildPath = 'build/dev/uproxy-networking'
# Location of where to copy/build third_party source/libs.
thirdPartyBuildPath = 'build/third_party'
# This path is the path-extension for libraries from this repository to be
# copied into in sample-apps.
localLibsDestPath = 'uproxy-networking'
# Setup our build rules/tools
Rule = new rules.Rule({
  # The path where code in this repository should be built in.
  devBuildPath: devBuildPath,
  # The path from where third party libraries should be copied. e.g. as used by
  # sample apps.
  thirdPartyBuildPath: thirdPartyBuildPath,
  # The path to copy modules from this repository into. e.g. as used by sample
  # apps.
  localLibsDestPath: localLibsDestPath
});

path = require('path');

browserifyIntegrationTest = (path) ->
  Rule.browserifySpec(path, {
    browserifyOptions: { standalone: 'browserified_exports' }
  });

#-------------------------------------------------------------------------
freedomForChromePath = path.dirname(require.resolve('freedom-for-chrome/package.json'))
uproxyLibPath = path.dirname(require.resolve('uproxy-lib/package.json'))
#ipaddrjsPath = path.dirname(require.resolve('ipaddr.js/package.json'))
# TODO(ldixon): update utransformers package to uproxy-obfuscators
# uproxyObfuscatorsPath = path.dirname(require.resolve('uproxy-obfuscators/package.json'))
uproxyObfuscatorsPath = path.dirname(require.resolve('utransformers/package.json'))
regex2dfaPath = path.dirname(require.resolve('regex2dfa/package.json'))
# Cordova testing
ccaPath = path.dirname(require.resolve('cca/package.json'))
pgpPath = path.dirname(require.resolve('freedom-pgp-e2e/package.json'))

#-------------------------------------------------------------------------
module.exports = (grunt) ->
  grunt.initConfig {
    pkg: grunt.file.readJSON 'package.json'

    copy:
      # Copy all needed third party libraries to appropriate locations.
      thirdParty:
        files: [
          # Copy local |third_party| files into dev: so that the third_party
          # dependencies are always in the common |build/third_party| location.
          # This allows path to reference typescript definitions for ambient
          # contexts to always be found, even in generated `.d.ts` files..
          {
              nonull: true,
              expand: true,
              cwd: 'third_party'
              src: ['**/*'],
              dest: thirdPartyBuildPath,
          }
          # Copy distribution directory of uproxy-lib so all paths can always
          # find their dependencies. Note that this also requires uproxy-lib
          # references to find those in |build/third_party/|. These paths
          # are delicate.
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyLibPath, 'build/dist'),
              src: ['**/*'],
              dest: path.join(thirdPartyBuildPath, 'uproxy-lib/'),
          },
          # Use the third_party definitions from uproxy-lib. Copied to the same
          # location relative to their compiled location in uproxy-lib so they
          # have the same relative path to the created `.d.ts` files from
          # |build/dev|.
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyLibPath, 'build/third_party'),
              src: ['freedom-typings/**/*', 'promise-polyfill.js'],
              dest: thirdPartyBuildPath
          },
          # Copy the relevant files from the build directory to create a
          # third_party folder for freedom-pgp-e2e.
          {
              nonull: true,
              expand: true,
              cwd: path.join(pgpPath, 'build'),
              src: ['**/*', '!demo', '!freedom.js', '!*.spec.js', '!playground'],
              dest: path.join(thirdPartyBuildPath, 'freedom-pgp-e2e'),
          }
        ]

      # Copy releveant non-typescript src files to dev build.
      dev:
        files: [
          {
              nonull: true,
              expand: true,
              cwd: 'src/',
              src: ['**/*'],
              dest: devBuildPath,
              onlyIf: 'modified'
          }
        ]

      # Copy releveant files for distribution.
      dist:
        files: [
          {
              nonull: true,
              expand: true,
              cwd: devBuildPath,
              src: ['**/*',
                    '!**/*.spec.js',
                    '!**/*.spec.*.js'],
              dest: 'build/dist/',
              onlyIf: 'modified'
          }
        ]

      # Copy: Sample Apps
      libsForCopyPasteChurnChatChromeApp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome']
          pathsFromDevBuild: ['churn-pipe']
          pathsFromThirdPartyBuild: [
            'uproxy-lib/loggingprovider'
            'uproxy-obfuscators'
          ]
          localDestPath: 'samples/copypaste-churn-chat-chromeapp/'
      libsForCopyPasteSocksChromeApp:
        Rule.copyLibs
          npmLibNames: [
            'freedom-for-chrome'
          ]
          pathsFromDevBuild: ['churn-pipe']
          pathsFromThirdPartyBuild: [
            'uproxy-lib/loggingprovider'
            'uproxy-obfuscators'
            'i18n'
            'bower/polymer'
            'freedom-pgp-e2e'
          ]
          localDestPath: 'samples/copypaste-socks-chromeapp/'
      libsForEchoServerChromeApp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome']
          pathsFromDevBuild: ['echo']
          pathsFromThirdPartyBuild: ['uproxy-lib/loggingprovider']
          localDestPath: 'samples/echo-server-chromeapp/'
      libsForEchoServerFirefoxApp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-firefox']
          pathsFromDevBuild: ['echo']
          pathsFromThirdPartyBuild: ['uproxy-lib/loggingprovider']
          localDestPath: 'samples/echo-server-firefoxapp/lib/'
      libsForSimpleSocksChromeApp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome']
          pathsFromDevBuild: ['simple-socks', 'churn-pipe']
          pathsFromThirdPartyBuild: [
            'uproxy-lib/loggingprovider'
            'uproxy-obfuscators'
          ]
          localDestPath: 'samples/simple-socks-chromeapp/'
      libsForSimpleSocksFirefoxApp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-firefox']
          pathsFromDevBuild: ['simple-socks', 'churn-pipe']
          pathsFromThirdPartyBuild: [
            'uproxy-lib/loggingprovider'
            'uproxy-obfuscators'
          ]
          localDestPath: 'samples/simple-socks-firefoxapp/lib/'
      libsForSimpleChurnChatChromeApp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome']
          pathsFromDevBuild: ['churn-pipe']
          pathsFromThirdPartyBuild: ['uproxy-lib/loggingprovider']
          localDestPath: 'samples/simple-socks-chromeapp/'
      libsForSimpleTurnChromeApp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome']
          pathsFromDevBuild: ['turn-frontend', 'turn-backend']
          pathsFromThirdPartyBuild: ['uproxy-lib/loggingprovider']
          localDestPath: 'samples/simple-turn-chromeapp/'
      libsForFreedomModuleRunner:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome']
          pathsFromDevBuild: [
            'churn-pipe'
            'echo'
            'integration-tests'
            'simple-socks'
            'turn-backend'
            'turn-frontend'
            'samples'
          ]
          pathsFromThirdPartyBuild: [
            'uproxy-lib'
            'uproxy-obfuscators'
          ]
          localDestPath: 'samples/freedom-module-runner-chromeapp/'

      # Copy: Integration Tests
      libsForIntegrationTcp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome']
          pathsFromThirdPartyBuild: ['uproxy-lib/loggingprovider']
          localDestPath: 'integration-tests/tcp'
      libsForIntegrationSocksEcho:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome']
          pathsFromDevBuild: [
            'churn-pipe'
          ]
          pathsFromThirdPartyBuild: [
            'uproxy-lib/loggingprovider'
          ]
          localDestPath: 'integration-tests/socks-echo'

    # Typescript compilation rules
    ts:
      # Compile all non-sample typescript code into the development build
      # directory.
      devInModuleEnv:
        src: [
          devBuildPath + '/**/*.ts'
          '!' + devBuildPath + '/**/*.d.ts'
          '!' + devBuildPath + '/**/*.core-env.ts'
          '!' + devBuildPath + '/**/*.core-env.spec.ts'
        ]
        options:
          target: 'es5'
          comments: true
          noImplicitAny: true
          sourceMap: false
          declaration: true
          module: 'commonjs'
          fast: 'always'

      devInCoreEnv:
        src: [
          devBuildPath + '/**/*.core-env.spec.ts'
          devBuildPath + '/**/*.core-env.ts'
        ]
        options:
          target: 'es5'
          comments: true
          noImplicitAny: true
          sourceMap: false
          declaration: true
          module: 'commonjs'
          fast: 'always'

    jasmine:
      churn: Rule.jasmineSpec 'churn'
      net: Rule.jasmineSpec 'net'
      rtcToNet: Rule.jasmineSpec 'rtc-to-net'
      simpleTransformers: Rule.jasmineSpec 'simple-transformers'
      socksCommon: Rule.jasmineSpec('socks-common',
        [path.join(thirdPartyBuildPath, 'ipaddr/ipaddr.js')]);
      socksToRtc: Rule.jasmineSpec 'socks-to-rtc'

    browserify:
      # Unit test specs
      churnSpec: Rule.browserifySpec 'churn/churn'
      rtcToNetSpec: Rule.browserifySpec 'rtc-to-net/rtc-to-net'
      simpleTransformersCaesarSpec: Rule.browserifySpec 'simple-transformers/caesar'
      socksCommonHeadersSpec: Rule.browserifySpec 'socks-common/socks-headers'
      socksToRtcSpec: Rule.browserifySpec 'socks-to-rtc/socks-to-rtc'
      tcpSpec: Rule.browserifySpec 'net/tcp'
      turnFrontEndMessagesSpec: Rule.browserifySpec 'turn-frontend/messages'
      turnFrontEndSpec: Rule.browserifySpec 'turn-frontend/turn-frontend'

      # Freedom Modules
      churnPipeFreedomModule: Rule.browserify(
          'churn-pipe/freedom-module',
          {
            # Emscripten, used to compile FTE and Rabbit to JS has unused
            # require statements for `ws` and for `path` that need to be
            # ignored.
            ignore: ['ws', 'path']
            browserifyOptions: { standalone: 'browserified_exports' }
          })
      copyPasteChurnChatFreedomModule: Rule.browserify 'samples/copypaste-churn-chat-chromeapp/freedom-module'
      copyPasteSocksFreedomModule: Rule.browserify 'samples/copypaste-socks-chromeapp/freedom-module'
      echoFreedomModule: Rule.browserify 'echo/freedom-module'
      simpleChurnChatFreedomModule: Rule.browserify 'samples/simple-churn-chat-chromeapp/freedom-module'
      simpleSocksFreedomModule: Rule.browserify 'simple-socks/freedom-module'
      simpleTurnFreedomModule: Rule.browserify 'samples/simple-turn/freedom-module'
      turnBackendFreedomModule: Rule.browserify 'turn-backend/freedom-module'
      turnFrontendFreedomModule: Rule.browserify 'turn-frontend/freedom-module'

      # Sample app mains
      copyPasteChurnChatChromeApp: Rule.browserify 'samples/copypaste-churn-chat-chromeapp/main.core-env'
      copyPasteSocksChromeApp: Rule.browserify 'samples/copypaste-socks-chromeapp/main.core-env'
      echoServerChromeApp: Rule.browserify 'samples/echo-server-chromeapp/background.core-env'
      freedomModuleRunnerChromeApp: Rule.browserify 'samples/freedom-module-runner-chromeapp/background.core-env'
      simpleChurnChatChromeApp: Rule.browserify 'samples/simple-churn-chat-chromeapp/main.core-env'
      simpleSocksChromeApp: Rule.browserify 'samples/simple-socks-chromeapp/background.core-env'
      simpleTurnChromeApp: Rule.browserify 'samples/simple-turn-chromeapp/background.core-env'

      # Integration tests: tcp
      integrationTcpFreedomModule:
        Rule.browserify 'integration-tests/tcp/freedom-module'
      integrationTcpSpec:
        browserifyIntegrationTest 'integration-tests/tcp/tcp.core-env'

      # Integration tests: socks-echo
      integrationSocksEchoFreedomModule:
        Rule.browserify 'integration-tests/socks-echo/freedom-module'
      integrationSocksEchoChurnSpec:
        browserifyIntegrationTest 'integration-tests/socks-echo/churn.core-env'
      integrationSocksEchoNochurnSpec:
        browserifyIntegrationTest 'integration-tests/socks-echo/nochurn.core-env'
      integrationSocksEchoSlowSpec:
        browserifyIntegrationTest 'integration-tests/socks-echo/slow.core-env'
      # Browserify sample apps main freedom module and core environments

    vulcanize:
      sampleCopyPasteSocksChromeApp:
        options:
          inline: true
          csp: true
        files: [
          {
            src: path.join(devBuildPath, 'samples/copypaste-socks-chromeapp/polymer-components/root.html')
            dest: path.join(devBuildPath, 'samples/copypaste-socks-chromeapp/polymer-components/vulcanized.html')
          }
        ]

    jasmine_chromeapp:
      tcp:
        files: [
          {
            cwd: devBuildPath + '/integration-tests/tcp/',
            src: ['**/*', '!jasmine_chromeapp/**/*']
            dest: './',
            expand: true
          }
        ]
        scripts: [
          'freedom-for-chrome/freedom-for-chrome.js'
          'tcp.core-env.spec.static.js'
        ]
        options:
          outDir: devBuildPath + '/integration-tests/tcp/jasmine_chromeapp/'
          keepRunner: true
      socksEcho:
        files: [
          {
            cwd: devBuildPath + '/integration-tests/socks-echo/',
            src: ['**/*', '!jasmine_chromeapp/**/*']
            dest: './',
            expand: true
          }
        ]
        scripts: [
          'freedom-for-chrome/freedom-for-chrome.js'
          'nochurn.core-env.spec.static.js'
          'churn.core-env.spec.static.js'
        ]
        options:
          outDir: devBuildPath + '/integration-tests/socks-echo/jasmine_chromeapp/'
          keepRunner: true
      socksEchoSlow:
        files: [
          {
            cwd: devBuildPath + '/integration-tests/socks-echo/',
            src: ['**/*', '!jasmine_chromeapp']
            dest: '/uproxy-networking/',
            expand: true
          }
        ]
        scripts: [
          'freedom-for-chrome/freedom-for-chrome.js'
          'slow.core-env.spec.static.js'
        ]
        options:
          outDir: devBuildPath + '/integration-tests/socks-echo/jasmine_chromeapp_slow/'
          keepRunner: true

    clean:
      build: [ 'build/dev', 'build/dist', '.tscache/' ]
  }  # grunt.initConfig

  #-------------------------------------------------------------------------
  grunt.loadNpmTasks 'grunt-browserify'
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-contrib-symlink'
  grunt.loadNpmTasks 'grunt-jasmine-chromeapp'
  grunt.loadNpmTasks 'grunt-ts'
  grunt.loadNpmTasks 'grunt-vulcanize'

  #-------------------------------------------------------------------------
  # Register the tasks
  taskManager.list().forEach((taskName) =>
    grunt.registerTask taskName, (taskManager.get taskName)
  );
