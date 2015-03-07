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

taskManager.add 'samples', [
  'sampleFreedomModuleRunnerChromeApp'
  'sampleSimpleSocks'
  'sampleEchoServer'
  'sampleCopyPasteChurnChatChromeApp'
]

taskManager.add 'test', [
  'browserify:churnSpec'
  'browserify:tcpSpec'
  'browserify:simpleTransformersCaesarSpec'
  'copy:libsForSocksCommonSpec'
  'browserify:socksCommonHeadersSpec'
  'browserify:socksToRtcSpec'
  'browserify:rtcToNetSpec'
  'browserify:turnFrontEndMessagesSpec'
  'browserify:turnFrontEndSpec'
  'jasmine'
]

taskManager.add 'integration', [
  'tcpIntegrationTest'
]

taskManager.add 'sampleSimpleSocks', [
  'base'
  'copy:libsForSimpleSocksChromeApp'
  'browserify:simpleSocksChromeApp'
]

taskManager.add 'sampleEchoServer', [
  'base'
  'copy:libsForSampleEchoServerChromeApp'
  'browserify:sampleEchoServerChromeApp'
]

# TODO: fix.
taskManager.add 'sampleCopyPasteChurnChatChromeApp', [
  'base'
  'copy:libsForCopyPasteChurnChatChromeApp'
  'browserify:copyPasteChurnChatChromeAppMain'
  'browserify:copyPasteChurnChatChromeAppFreedomModule'
]

taskManager.add 'integrationTestModules', [
  'tcpIntegrationTestModule'
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

taskManager.add 'sampleFreedomModuleRunnerChromeApp', [
  'base'
  'integrationTestModules'
  'copy:libsForFreedomModuleRunner'
  'browserify:sampleFreedomModuleRunnerMain'
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
        # Copy local |third_party| files into dev: so that the third_party
        # dependencies are always in the common |build/third_party| location. This
        # allows path to reference typescript definitions for ambient contexts to
        # always be found, even in generated `.d.ts` files..
        files: [
          {
              nonull: true,
              expand: true,
              cwd: 'third_party'
              src: ['**/*'],
              dest: thirdPartyBuildPath,
              onlyIf: 'modified'
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
              onlyIf: 'modified'
          },
          # Use the third_party definitions from uproxy-lib. Copied to the same
          # location relative to their compiled location in uproxy-lib so they
          # have the same relative path to the created `.d.ts` files from
          # |build/dev|.
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyLibPath, 'build/third_party'),
              src: ['freedom-typings/**/*'],
              dest: thirdPartyBuildPath
              onlyIf: 'modified'
          },
          # Copy in the uproxy-obfuscators typescript interfaces
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyObfuscatorsPath, 'src/'),
              src: ['interfaces/**/*',
                    'transformers/uTransformers.rabbit.js',
                    'transformers/uTransformers.fte.js'],
              dest: path.join(thirdPartyBuildPath, 'uproxy-obfuscators/'),
              onlyIf: 'modified'
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

      # Copy the freedom output file to sample apps
      libsForSampleEchoServerChromeApp:
        Rule.copyLibs
          npmLibNames: ['freedom-for-chrome/freedom-for-chrome.js']
          pathsFromDevBuild: ['echo']
          pathsFromThirdPartyBuild: ['uproxy-lib/loggingprovider']
          localDestPath: 'samples/echo-server-chromeapp/'
      libsForCopyPasteChurnChatChromeApp:
        Rule.copyLibs
          npmLibNames: [
            'freedom-for-chrome/freedom-for-chrome.js'
          ]
          pathsFromDevBuild: ['churn-pipe']
          pathsFromThirdPartyBuild: [
            'uproxy-lib/loggingprovider'
            'uproxy-obfuscators'
          ]
          localDestPath: 'samples/copypaste-churn-chat-chromeapp/'
      libsForSimpleSocksChromeApp:
        Rule.copyLibs
          npmLibNames: [
            'freedom-for-chrome/freedom-for-chrome.js'
          ]
          pathsFromDevBuild: ['simple-socks', 'churn-pipe']
          pathsFromThirdPartyBuild: [
            'uproxy-lib/loggingprovider'
            'uproxy-obfuscators'
          ]
          localDestPath: 'samples/simple-socks-chromeapp/'
      libsForIntegrationTcp:
        Rule.copyLibs
          npmLibNames: [
            'freedom-for-chrome/freedom-for-chrome.js'
          ]
          pathsFromThirdPartyBuild: [
            'uproxy-lib/loggingprovider'
          ]
          localDestPath: 'integration-tests/tcp'
      libsForFreedomModuleRunner:
        Rule.copyLibs
          npmLibNames: [
            'freedom-for-chrome/freedom-for-chrome.js'
          ]
          pathsFromDevBuild: [
            'churn-pipe'
            'echo'
            'integration-tests'
            'simple-socks'
            'turn-backend'
            'turn-frontend'
          ]
          pathsFromThirdPartyBuild: [
            'uproxy-lib'
            'uproxy-obfuscators'
          ]
          localDestPath: 'samples/freedom-module-runner-chromeapp/'
      libsForSocksCommonSpec:
        Rule.copyLibs
          npmLibNames: ['ipaddr.js']
          localDestPath: 'samples/simple-socks-chromeapp/'


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
      tcpSpec: Rule.browserifySpec 'net/tcp'
      churnSpec: Rule.browserifySpec 'churn/churn'
      simpleTransformersCaesarSpec: Rule.browserifySpec 'simple-transformers/caesar'
      socksCommonHeadersSpec: Rule.browserifySpec 'socks-common/socks-headers'
      rtcToNetSpec: Rule.browserifySpec 'rtc-to-net/rtc-to-net'
      socksToRtcSpec: Rule.browserifySpec 'socks-to-rtc/socks-to-rtc'
      turnFrontEndMessagesSpec: Rule.browserifySpec 'turn-frontend/messages'
      turnFrontEndSpec: Rule.browserifySpec 'turn-frontend/turn-frontend'

      # Sample app mains
      sampleFreedomModuleRunnerMain: Rule.browserify 'samples/freedom-module-runner-chromeapp/main.core-env'

      # Browserify freedom-modules in the library

      churnPipeFreedomModule: Rule.browserify 'churn-pipe/freedom-module'

      echoFreedomModule: Rule.browserify 'echo/freedom-module'
      sampleEchoServerChromeApp: Rule.browserify 'samples/echo-server-chromeapp/background.core-env'

      simpleSocksFreedomModule: Rule.browserify 'simple-socks/freedom-module'
      simpleSocksChromeApp: Rule.browserify 'samples/simple-socks-chromeapp/background.core-env'

      copyPasteChurnChatChromeAppMain: Rule.browserify 'samples/copypaste-churn-chat-chromeapp/main.core-env'
      copyPasteChurnChatChromeAppFreedomModule: Rule.browserify 'samples/copypaste-churn-chat-chromeapp/freedom-module'

      # Browserify Integration
      integrationTcpFreedomModule:
        Rule.browserify 'integration-tests/tcp/freedom-module'
      integrationTcpSpec:
        Rule.browserifySpec 'integration-tests/tcp/tcp.core-env'
      integrationSocksEchoFreedomModule:
        Rule.browserify 'integration-tests/socks-echo/freedom-module'
      integrationSocksEchoChurnSpec:
        Rule.browserifySpec 'integration-tests/socks-echo/churn.core-env'
      integrationSocksEchoNochurnSpec:
        Rule.browserifySpec 'integration-tests/socks-echo/nochurn.core-env'
      integrationSocksEchoSlowSpec:
        Rule.browserifySpec 'integration-tests/socks-echo/slow.core-env'
      # Browserify sample apps main freedom module and core environments

    jasmine_chromeapp:
      tcp:
        src: [
          thirdPartyBuildPath + '/uproxy-lib/loggingprovider/freedom-module.static.js'
          thirdPartyBuildPath + '/uproxy-lib/loggingprovider/freedom-module.json'
          devBuildPath + '/integration-tests/tcp/freedom-module.static.js'
          devBuildPath + '/integration-tests/tcp/freedom-module.json'
          freedomForChromePath + '/freedom-for-chrome.js'
          devBuildPath + '/integration-tests/tcp/tcp.core-env.spec.static.js'
        ]
        options:
          paths: [
            freedomForChromePath + '/freedom-for-chrome.js'
            devBuildPath + '/integration-tests/tcp/tcp.core-env.spec.static.js'
          ]
          outfile: devBuildPath + '/integration-tests/tcp/jasmine_chromeapp/'
          keepRunner: true

    clean:
      build:
        [ 'build/dev', 'build/dist'
          # Note: '.tscache/' is created by grunt-ts.
          '.tscache/' ]
  }  # grunt.initConfig

  #-------------------------------------------------------------------------
  grunt.loadNpmTasks 'grunt-browserify'
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-symlink'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-jasmine-chromeapp'

  grunt.loadNpmTasks 'grunt-ts'

  #-------------------------------------------------------------------------
  # Register the tasks
  taskManager.list().forEach((taskName) =>
    grunt.registerTask taskName, (taskManager.get taskName)
  );
