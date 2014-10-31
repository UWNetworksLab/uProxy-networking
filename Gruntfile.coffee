TaskManager = require 'uproxy-lib/tools/taskmanager'
Rule = require 'uproxy-lib/tools/common-grunt-rules'

path = require('path');

uproxyLibPath = path.dirname(require.resolve('uproxy-lib/package.json'))
ipaddrjsPath = path.dirname(require.resolve('ipaddr.js/package.json'))
utransformersPath = path.dirname(require.resolve('utransformers/package.json'))
regex2dfaPath = path.dirname(require.resolve('regex2dfa/package.json'))
ccaPath = path.dirname(require.resolve('cca/package.json'))

FILES =
  # Help Jasmine's PhantomJS understand promises.
  jasmine_helpers: [
    'node_modules/es6-promise/dist/promise-*.js',
    '!node_modules/es6-promise/dist/promise-*amd.js',
    '!node_modules/es6-promise/dist/promise-*.min.js'
  ]

#-------------------------------------------------------------------------
module.exports = (grunt) ->
  grunt.initConfig {
    pkg: grunt.file.readJSON 'package.json'

    # TODO: Replace a common-grunt-rules function, when available.
    symlink:
      # Symlink each source file under src/ under build/.
      build:
        files: [
          expand: true
          cwd: 'src/'
          src: ['**/*']
          filter: 'isFile'
          dest: 'build/'
        ]

      # Symlink each directory under third_party/ under build/third_party/.
      thirdParty:
        files: [
          expand: true,
          cwd: 'third_party/'
          src: ['*']
          filter: 'isDirectory'
          dest: 'build/third_party/'
        ]

      # Symlink each file under uproxy-lib's dist/ under build/.
      # Exclude the samples/ directory.
      uproxyLibBuild:
        files: [
          expand: true
          cwd: path.join(uproxyLibPath, 'dist/')
          src: ['**/*', '!samples/**']
          filter: 'isFile'
          dest: 'build/'
        ]

      # Symlink each directory under uproxy-lib's third_party/ under build/third_party/.
      uproxyLibThirdParty:
        files: [
          expand: true
          cwd: path.join(uproxyLibPath, 'third_party/')
          src: ['*']
          filter: 'isDirectory'
          dest: 'build/third_party/'
        ]

      # Symlink each .d.ts and .js file under utransformers' src/ directory
      # under build/utransformers/.
      utransformers:
        files: [
          expand: true
          cwd: path.join(utransformersPath, 'src/')
          src: ['**/*.d.ts', '**/*.js']
          dest: 'build/utransformers/'
        ]

      # There's only one relevant file in this repo: regex2dfa.js.
      regex2dfa:
        files: [
          expand: true
          cwd: regex2dfaPath
          src: ['**/*.js']
          dest: 'build/regex2dfa/'
        ]

      # There's only one relevant file in this repo: ipaddr.min.js.
      ipaddrjs:
        files: [
          expand: true
          cwd: ipaddrjsPath
          src: ['ipaddr.min.js']
          dest: 'build/ipaddrjs/'
        ]

    copy:
      # SOCKS.
      tcp: Rule.copyModule 'udp'
      udp: Rule.copyModule 'tcp'
      socksCommon: Rule.copyModule 'socks-common'
      socksToRtc: Rule.copyModule 'socks-to-rtc'
      ipaddrjs: Rule.copyModule 'ipaddrjs'
      rtcToNet: Rule.copyModule 'rtc-to-net'
      benchmark: Rule.copyModule 'benchmark'
      echo: Rule.copyModule 'echo'

      echoServerChromeApp: Rule.copyModule 'samples/echo-server-chromeapp'
      echoServerChromeAppLib: Rule.copySampleFiles 'samples/echo-server-chromeapp'

      echoServerFirefoxApp: Rule.copyModule 'samples/echo-server-firefoxapp'
      echoServerFirefoxAppLib: Rule.copySampleFiles 'samples/echo-server-firefoxapp/data'

      simpleSocksChromeApp: Rule.copyModule 'samples/simple-socks-chromeapp'
      simpleSocksChromeAppLib: Rule.copySampleFiles 'samples/simple-socks-chromeapp'

      simpleSocksFirefoxApp: Rule.copyModule 'samples/simple-socks-firefoxapp'
      simpleSocksFirefoxAppLib: Rule.copySampleFiles 'samples/simple-socks-firefoxapp'

      copypasteSocksChromeApp: Rule.copyModule 'samples/copypaste-socks-chromeapp'
      copypasteSocksChromeAppLib: Rule.copySampleFiles 'samples/copypaste-socks-chromeapp'

      # Churn.
      sha1: Rule.copyModule 'sha1'
      turnFrontend: Rule.copyModule 'turn-frontend'
      turnBackend: Rule.copyModule 'turn-backend'
      utransformers: Rule.copyModule 'utransformers'
      regex2dfa: Rule.copyModule 'regex2dfa'
      simpleTransformers: Rule.copyModule 'simple-transformers'
      churn: Rule.copyModule 'churn'
      churnPipe: Rule.copyModule 'churn-pipe'

      simpleTurnChromeApp: Rule.copyModule 'samples/simple-turn-chromeapp'
      simpleTurnChromeAppLib: Rule.copySampleFiles 'samples/simple-turn-chromeapp'

      simpleChurnChatChromeApp: Rule.copyModule 'samples/simple-churn-chat-chromeapp'
      simpleChurnChatChromeAppLib: Rule.copySampleFiles 'samples/simple-churn-chat-chromeapp'

      copypasteChurnChatChromeApp: Rule.copyModule 'samples/copypaste-churn-chat-chromeapp'
      copypasteChurnChatChromeAppLib: Rule.copySampleFiles 'samples/copypaste-churn-chat-chromeapp'

    ts:
      # SOCKS.
      tcp: Rule.typescriptSrc 'tcp'
      udp: Rule.typescriptSrc 'udp'

      socksCommon: Rule.typescriptSrc 'socks-common'
      socksCommonSpecDecl: Rule.typescriptSpecDecl 'socks-common'

      socksToRtc: Rule.typescriptSrc 'socks-to-rtc'
      socksToRtcSpecDecl: Rule.typescriptSpecDecl 'socks-to-rtc'

      rtcToNet: Rule.typescriptSrc 'rtc-to-net'
      # Benchmark
      benchmark: Rule.typescriptSrc 'benchmark'
      options: {
          module: 'commonjs',
          sourceMap: true,
          declaration: true
      }

      echo: Rule.typescriptSrc 'echo'

      echoServerChromeApp: Rule.typescriptSrc 'samples/echo-server-chromeapp/'
      echoServerFirefoxApp: Rule.typescriptSrc 'samples/echo-server-firefoxapp/'

      simpleSocksChromeApp: Rule.typescriptSrc 'samples/simple-socks-chromeapp'
      simpleSocksFirefoxApp: Rule.typescriptSrc 'samples/simple-socks-firefoxapp'
      copypasteSocksChromeApp: Rule.typescriptSrc 'samples/copypaste-socks-chromeapp'

      # Churn.
      turnFrontend: Rule.typescriptSrc 'turn-frontend'
      turnFrontendSpecDecl: Rule.typescriptSpecDecl 'turn-frontend'

      turnBackend: Rule.typescriptSrc 'turn-backend'

      simpleTransformers: Rule.typescriptSrc 'simple-transformers'
      simpleTransformersSpecDecl: Rule.typescriptSpecDecl 'simple-transformers'

      churn: Rule.typescriptSrc 'churn'
      churnSpecDecl: Rule.typescriptSpecDecl 'churn'

      churnPipe: Rule.typescriptSrc 'churn-pipe'

      simpleTurnChromeApp: Rule.typescriptSrc 'samples/simple-turn-chromeapp'
      simpleChurnChatChromeApp: Rule.typescriptSrc 'samples/simple-churn-chat-chromeapp'

      copypasteTurnChromeApp: Rule.typescriptSrc 'samples/copypaste-turn-chromeapp'
      copypasteChurnChatChromeApp: Rule.typescriptSrc 'samples/copypaste-churn-chat-chromeapp'

    browserify:
      sha1:
        src: [require.resolve('crypto/sha1')]
        dest: 'build/sha1/sha1.js'
        options:
          browserifyOptions:
            standalone: 'sha1'

    jasmine:
      socksCommon: Rule.jasmineSpec 'socks-common'
      # TODO: turn tests require arraybuffers
      #       https://github.com/uProxy/uproxy/issues/430
      turnFrontend:
        src: FILES.jasmine_helpers.concat([
          'build/turn-frontend/mocks.js'
          'build/turn-frontend/messages.js'
          'build/turn-frontend/turn-frontend.js'
          'build/arraybuffers/arraybuffers.js'
          'build/sha1/sha1.js'
        ])
        options:
          specs: 'build/turn-frontend/*.spec.js'
      # TODO: churn tests require peerconnection
      #       https://github.com/uProxy/uproxy/issues/430
      churn:
        src: FILES.jasmine_helpers.concat([
          'build/churn/mocks.js'
          'build/churn/churn.js'
          'build/peerconnection/*.js'
        ]),
        options:
          specs: 'build/churn/*.spec.js'
      simpleTransformers: Rule.jasmineSpec 'simple-transformers'

      # TODO: socksToRtc tests require a bunch of other modules
      #       https://github.com/uProxy/uproxy/issues/430
      socksToRtc:
        src: FILES.jasmine_helpers.concat([
          'build/handler/queue.js'
          'build/socks-to-rtc/mocks.js'
          'build/socks-to-rtc/socks-to-rtc.js'
        ])
        options:
          specs: 'build/socks-to-rtc/*.spec.js'

    clean: ['build/', 'dist/', '.tscache/']

    ccaJsPath: path.join(ccaPath, 'src/cca.js')
    ccaCwd: 'build/cca-app'
    exec: {
      adbLog: {
        command: 'adb logcat *:I | grep CONSOLE'
      }
      adbPortForward: {
        command: 'adb forward tcp:10000 tcp:9999'
        exitCode: [0,1]
      }
      ccaCreate: {
        command: '<%= ccaJsPath %> create build/cca-app --link-to=build/samples/simple-socks-chromeapp/manifest.json'
        exitCode: [0,1]
      }
      ccaEmulate: {
        cwd: '<%= ccaCwd %>'
        command: '<%= ccaJsPath %> emulate android'
      }
    }
  }  # grunt.initConfig

  #-------------------------------------------------------------------------
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-contrib-symlink'
  grunt.loadNpmTasks 'grunt-ts'
  grunt.loadNpmTasks('grunt-browserify');

  #-------------------------------------------------------------------------
  # Define the tasks
  taskManager = new TaskManager.Manager();

  taskManager.add 'base', [
    'symlink:build'
    'symlink:thirdParty'
    'symlink:uproxyLibBuild'
    'symlink:uproxyLibThirdParty'
    'symlink:utransformers'
    'symlink:regex2dfa'
  ]

  taskManager.add 'tcp', [
    'base'
    'ts:tcp'
    'copy:tcp'
  ]

  taskManager.add 'udp', [
    'base'
    'ts:udp'
    'copy:udp'
  ]

  taskManager.add 'socksCommon', [
    'base'
    'ts:socksCommon'
    'ts:socksCommonSpecDecl'
    'copy:socksCommon'
  ]

  taskManager.add 'socksToRtc', [
    'base'
    'tcp'
    'socksCommon'
    'churn'
    'ts:socksToRtc'
    'ts:socksToRtcSpecDecl'
    'copy:socksToRtc'
  ]

  taskManager.add 'ipaddrjs', [
    'base'
    'symlink:ipaddrjs'
    'copy:ipaddrjs'
  ]

  taskManager.add 'rtcToNet', [
    'base'
    'tcp'
    'socksCommon'
    'ipaddrjs'
    'ts:rtcToNet'
    'copy:rtcToNet'
  ]

  taskManager.add 'socks', [
    'socksCommon'
    'socksToRtc'
    'rtcToNet'
    'tcp'
  ]

  taskManager.add 'echo', [
    'base'
    'tcp'
    'ts:echo'
    'copy:echo'
  ]
  taskManager.add 'echoServerChromeApp', [
    'base'
    'echo'
    'ts:echoServerChromeApp'
    'copy:echoServerChromeApp'
    'copy:echoServerChromeAppLib'
  ]

  taskManager.add 'echoServerFirefoxApp', [
    'base'
    'echo'
    'ts:echoServerFirefoxApp'
    'copy:echoServerFirefoxApp'
    'copy:echoServerFirefoxAppLib'
  ]

  taskManager.add 'echoServer', [
    'echoServerChromeApp'
    'echoServerFirefoxApp'
  ]

  taskManager.add 'simpleSocksChromeApp', [
    'base'
    'socks'
    'ts:simpleSocksChromeApp'
    'copy:simpleSocksChromeApp'
    'copy:simpleSocksChromeAppLib'
  ]

  taskManager.add 'simpleSocksFirefoxApp', [
    'base'
    'socks'
    'ts:simpleSocksFirefoxApp'
    'copy:simpleSocksFirefoxApp'
    'copy:simpleSocksFirefoxAppLib'
  ]

  taskManager.add 'copypasteSocksChromeApp', [
    'base'
    'socks'
    'ts:copypasteSocksChromeApp'
    'copy:copypasteSocksChromeApp'
    'copy:copypasteSocksChromeAppLib'
  ]

  # TODO: Use end-to-end's sha1:
  #         https://github.com/uProxy/uproxy/issues/507
  taskManager.add 'sha1', [
    'base'
    'browserify:sha1'
    'copy:sha1'
  ]

  taskManager.add 'turnFrontend', [
    'base'
    'sha1'
    'ts:turnFrontend'
    'ts:turnFrontendSpecDecl'
    'copy:turnFrontend'
  ]

  taskManager.add 'turnBackend', [
    'base'
    'ts:turnBackend'
    'copy:turnBackend'
  ]

  taskManager.add 'turn', [
    'turnFrontend'
    'turnBackend'
  ]

  taskManager.add 'utransformers', [
    'base'
    'copy:utransformers'
    'copy:regex2dfa'
  ]

  taskManager.add 'simpleTransformers', [
    'base'
    'utransformers'
    'ts:simpleTransformers'
    'ts:simpleTransformersSpecDecl'
    'copy:simpleTransformers'
  ]

  taskManager.add 'transformers', [
    'utransformers'
    'simpleTransformers'
  ]

  taskManager.add 'churnPipe', [
    'base'
    'transformers'
    'ts:churnPipe'
    'copy:churnPipe'
  ]

  taskManager.add 'churn', [
    'base'
    'turn'
    'churnPipe'
    'ts:churn'
    'ts:churnSpecDecl'
    'copy:churn'
  ]

  taskManager.add 'simpleTurnChromeApp', [
    'base'
    'turn'
    'ts:simpleTurnChromeApp'
    'copy:simpleTurnChromeApp'
    'copy:simpleTurnChromeAppLib'
  ]

  taskManager.add 'simpleChurnChatChromeApp', [
    'base'
    'churn'
    'ts:simpleChurnChatChromeApp'
    'copy:simpleChurnChatChromeApp'
    'copy:simpleChurnChatChromeAppLib'
  ]

  taskManager.add 'copypasteChurnChatChromeApp', [
    'base'
    'churn'
    'ts:copypasteChurnChatChromeApp'
    'copy:copypasteChurnChatChromeApp'
    'copy:copypasteChurnChatChromeAppLib'
  ]

  taskManager.add 'samples', [
    'echoServer'
    'simpleSocksChromeApp'
    'simpleSocksFirefoxApp'
    'copypasteSocksChromeApp'
    'simpleTurnChromeApp'
    'simpleChurnChatChromeApp'
    'copypasteChurnChatChromeApp'
  ]

  #-------------------------------------------------------------------------
  # Tasks for Tools
  taskManager.add 'benchmark', [
    'base'
    'copy:benchmark'
    'ts:benchmark'
  ]

  #-------------------------------------------------------------------------
  taskManager.add 'build', [
    'tcp'
    'udp'
    'benchmark'
    'socks'
    'samples'
    'turn'
    'churn'
  ]

  taskManager.add 'test', [
    'build'
    'jasmine'
  ]

  taskManager.add 'default', [
    'build'
  ]

  taskManager.add 'cca', [
    'build'
    'exec:ccaCreate'
    'exec:ccaEmulate'
  ]

  #-------------------------------------------------------------------------
  # Register the tasks
  taskManager.list().forEach((taskName) =>
    grunt.registerTask taskName, (taskManager.get taskName)
  );
