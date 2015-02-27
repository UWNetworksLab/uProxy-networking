TaskManager = require './build/tools/taskmanager'

#-------------------------------------------------------------------------
# The top level tasks. These are the highest level grunt-tasks defined in terms
# of specific grunt rules below and given to grunt.initConfig
taskManager = new TaskManager.Manager();

taskManager.add 'default', [ 'dev', 'samples', 'test' ]

taskManager.add 'dev', [
  'symlink:typescriptSrc'
  'copy:dev'
  'ts:devInModuleEnv'
  'ts:devInCoreEnv'
  'browserify:echoFreedomModule'
  'browserify:churnPipeFreedomModule'
]

taskManager.add 'samples', [
  'sampleEchoServer',
  'sampleCopyPasteChurnChatChromeApp'
]

taskManager.add 'test', [
  'tcpIntegrationTest'
]

taskManager.add 'sampleEchoServer', [
  'dev'
  'copy:libsForSampleEchoServerChromeApp'
  'browserify:sampleEchoServerChromeApp'
]

taskManager.add 'sampleCopyPasteChurnChatChromeApp', [
  'dev'
  'copy:libsForCopyPasteChurnChatChromeApp'
  'browserify:copyPasteChurnChatChromeAppMain'
  'browserify:copyPasteChurnChatChromeAppFreedomModule'
]

taskManager.add 'tcpIntegrationTest', [
  'dev'
  'browserify:integrationTcpFreedomModule'
  'browserify:integrationTcpSpec'
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
  devBuildPath: devBuildPath,
  thirdPartyBuildPath: thirdPartyBuildPath,
  localLibsDestPath: localLibsDestPath
});

path = require('path');

#-------------------------------------------------------------------------

freedomForChromePath = path.dirname(require.resolve('freedom-for-chrome/package.json'))
uproxyLibPath = path.dirname(require.resolve('uproxy-lib/package.json'))
ipaddrjsPath = path.dirname(require.resolve('ipaddr.js/package.json'))
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

    symlink:
      typescriptSrc:
        files: [{
          expand: true
          overwrite: true
          cwd: 'src'
          src: ['**/*.ts']
          dest: devBuildPath
        }]

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
              src: ['third_party/**/*'],
              dest: 'build/',
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
              dest: 'build/third_party/uproxy-lib',
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
              dest: 'build/third_party/',
              onlyIf: 'modified'
          },
          # Copy in the uproxy-obfuscators typescript interfaces
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyObfuscatorsPath, 'src/interfaces/'),
              src: ['**/*'],
              dest: 'build/third_party/uproxy-obfuscators',
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
              src: ['**/*', '!**/*.ts'],
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
        Rule.copyLibs ['freedom-for-chrome/freedom-for-chrome.js'],
          ['echo'],
          ['uproxy-lib/loggingprovider'],
          'samples/echo-server-chromeapp/'
      libsForCopyPasteChurnChatChromeApp:
        Rule.copyLibs ['freedom-for-chrome/freedom-for-chrome.js'],
          ['churn-pipe'],
          ['uproxy-lib/loggingprovider'],
          'samples/copypaste-churn-chat-chromeapp/'

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
      arraybuffers: Rule.jasmineSpec 'arraybuffers'
      buildTools: Rule.jasmineSpec 'build-tools'
      handler: Rule.jasmineSpec 'handler'
      logging: Rule.jasmineSpec 'logging'
      loggingProvider: Rule.jasmineSpec 'loggingprovider'
      webrtc: Rule.jasmineSpec 'webrtc'

    browserify:
      # Browserify freedom-modules in the library
      churnPipeFreedomModule: Rule.browserify 'churn-pipe/freedom-module'
      echoFreedomModule: Rule.browserify 'echo/freedom-module'
      sampleEchoServerChromeApp: Rule.browserify 'samples/echo-server-chromeapp/background.core-env'
      copyPasteChurnChatChromeAppMain: Rule.browserify 'samples/copypaste-churn-chat-chromeapp/main.core-env'
      copyPasteChurnChatChromeAppFreedomModule: Rule.browserify 'samples/copypaste-churn-chat-chromeapp/freedom-module'

      # Browserify specs
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

    # TODO: debug this, why doesn't it work? TODO: File issue for when a file
    # can't be found: some sensible error should be produced.
    jasmine_chromeapp:
      tcp:
        src: [ devBuildPath + '/integration-tests/tcp/freedom-module.static.js' ]
        options:
          paths: [
            # TODO: one this is released in freedom: https://github.com/freedomjs/freedom-for-chrome/commit/22acf21069092e71789bf68d5f433afd1ab97fb1
            # Then we can just do: require.resolve('freedom-for-chrome')
            require.resolve('freedom-for-chrome/freedom-for-chrome.js')
            devBuildPath + '/integration-tests/tcp/tcp.core-env.static.js'
          ]
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
