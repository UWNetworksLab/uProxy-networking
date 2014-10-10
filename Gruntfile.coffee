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

      echoServerChromeApp: Rule.copyModule 'samples/echo-server-chromeapp'
      echoServerChromeAppLib: Rule.copySampleFiles 'samples/echo-server-chromeapp'

      simpleSocksChromeApp: Rule.copyModule 'samples/simple-socks-chromeapp'
      simpleSocksChromeAppLib: Rule.copySampleFiles 'samples/simple-socks-chromeapp'

      simpleSocksFirefoxApp: Rule.copyModule 'samples/simple-socks-firefoxapp'
      simpleSocksFirefoxAppLib: Rule.copySampleFiles 'samples/simple-socks-firefoxapp'

      copypasteSocksChromeApp: Rule.copyModule 'samples/copypaste-socks-chromeapp'
      copypasteSocksChromeAppLib: Rule.copySampleFiles 'samples/copypaste-socks-chromeapp'

      # Churn.
      sha1: Rule.copyModule 'sha1'
      turn: Rule.copyModule 'turn'
      net: Rule.copyModule 'net'
      utransformers: Rule.copyModule 'utransformers'
      regex2dfa: Rule.copyModule 'regex2dfa'
      transformers: Rule.copyModule 'transformers'
      pipe: Rule.copyModule 'pipe'
      churn: Rule.copyModule 'churn'

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
      rtcToNet: Rule.typescriptSrc 'rtc-to-net'

      echoServerChromeApp: Rule.typescriptSrc 'samples/echo-server-chromeapp/'
      simpleSocksChromeApp: Rule.typescriptSrc 'samples/simple-socks-chromeapp'
      simpleSocksFirefoxApp: Rule.typescriptSrc 'samples/simple-socks-firefoxapp'
      copypasteSocksChromeApp: Rule.typescriptSrc 'samples/copypaste-socks-chromeapp'

      # Churn.
      turn: Rule.typescriptSrc 'turn'
      turnSpecDecl: Rule.typescriptSpecDecl 'turn'

      net: Rule.typescriptSrc 'net'

      transformers: Rule.typescriptSrc 'transformers'
      transformersSpecDecl: Rule.typescriptSpecDecl 'transformers'

      pipe: Rule.typescriptSrc 'pipe'

      churn: Rule.typescriptSrc 'churn'
      churnSpecDecl: Rule.typescriptSpecDecl 'churn'

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
      turn:
        src: FILES.jasmine_helpers.concat([
          'build/turn/mocks.js'
          'build/turn/messages.js'
          'build/turn/turn.js'
          'build/arraybuffers/arraybuffers.js'
          'build/sha1/sha1.js'
        ])
        options:
          specs: 'build/turn/*.spec.js'
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
      transformers: Rule.jasmineSpec 'transformers'

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
    'socksCommon'
    'ts:socksToRtc'
    'copy:socksToRtc'
  ]

  taskManager.add 'ipaddrjs', [
    'base'
    'symlink:ipaddrjs'
    'copy:ipaddrjs'
  ]

  taskManager.add 'rtcToNet', [
    'base'
    'socksCommon'
    'ipaddrjs'
    'ts:rtcToNet'
    'copy:rtcToNet'
  ]

  taskManager.add 'socks', [
    'socksCommon'
    'socksToRtc'
    'rtcToNet'
  ]

  taskManager.add 'echoServerChromeApp', [
    'base'
    'tcp'
    'ts:echoServerChromeApp'
    'copy:echoServerChromeApp'
    'copy:echoServerChromeAppLib'
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

  taskManager.add 'sha1', [
    'base'
    'browserify:sha1'
    'copy:sha1'
  ]

  taskManager.add 'turn', [
    'base'
    'sha1'
    'ts:turn'
    'ts:turnSpecDecl'
    'copy:turn'
  ]

  taskManager.add 'net', [
    'base'
    'ts:net'
    'copy:net'
  ]

  taskManager.add 'utransformers', [
    'base'
    'copy:utransformers'
    'copy:regex2dfa'
  ]

  taskManager.add 'transformers', [
    'base'
    'utransformers'
    'ts:transformers'
    'ts:transformersSpecDecl'
    'copy:transformers'
  ]

  taskManager.add 'pipe', [
    'base'
    'transformers'
    'ts:pipe'
    'copy:pipe'
  ]

  taskManager.add 'churn', [
    'base'
    'turn'
    'net'
    'pipe'
    'ts:churn'
    'ts:churnSpecDecl'
    'copy:churn'
  ]

  taskManager.add 'simpleTurnChromeApp', [
    'base'
    'turn'
    'net'
    'ts:simpleTurnChromeApp'
    'copy:simpleTurnChromeApp'
    'copy:simpleTurnChromeAppLib'
  ]

  taskManager.add 'simpleChurnChatChromeApp', [
    'base'
    'turn'
    'net'
    'ts:simpleChurnChatChromeApp'
    'copy:simpleChurnChatChromeApp'
    'copy:simpleChurnChatChromeAppLib'
  ]

  taskManager.add 'copypasteChurnChatChromeApp', [
    'base'
    'turn'
    'net'
    'ts:copypasteChurnChatChromeApp'
    'copy:copypasteChurnChatChromeApp'
    'copy:copypasteChurnChatChromeAppLib'
  ]

  taskManager.add 'samples', [
    'echoServerChromeApp'
    'simpleSocksChromeApp'
    'simpleSocksFirefoxApp'
    'copypasteSocksChromeApp'
    'simpleTurnChromeApp'
    'simpleChurnChatChromeApp'
    'copypasteChurnChatChromeApp'
  ]

  taskManager.add 'build', [
    'tcp'
    'udp'
    'socks'
    'samples'
    'turn',
    'net',
    'transformers',
    'pipe',
    'churn',
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
