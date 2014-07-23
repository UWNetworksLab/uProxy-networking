# How to build socks-rtc and its various demos.

# TODO: work out an automatic way to only the src we need rather than the whole
# library. Maybe have a separate Gruntfile in each subdirectory with some common
# rules for building a project accoridng to using a standard dir layout.

# Also: provide a way to specify needed modules, and when they are not there to
# give a sensible error.

TaskManager = require './node_modules/uproxy-build-tools/build/taskmanager/taskmanager'

#-------------------------------------------------------------------------
# Rule-making helper function that assume expected directory layout.
#
# Function to make a copy rule for a module directory, assuming standard
# layout. Copies all non (ts/sass) compiled files into the corresponding
# build directory.
Rule = require('uproxy-build-tools/Gruntfile.coffee').Rule;
Rule.copySrcModule = (name, dest) ->
    expand: true, cwd: 'src/'
    src: [name + '/**', '!' + name + '/**/*.ts', '!' + name + '/**/*.sass']
    dest: 'build'
Rule.copyBuiltModule = (name, dest) ->
    expand: true, cwd: 'build/'
    src: [name + '/**']
    dest: 'build/' + dest
Rule.copyLibForSample = (dest) ->
    expand: true, cwd: 'build'
    src: ['**/*', '!samples', '!typescript-src']
    dest: 'build/' + dest
# HACK: this overrides Rule's |noImplicitAny=false| to deal with inability to
# refer to `core.XXX` providers as members in JavaScript. See:
# https://github.com/freedomjs/freedom/issues/57
Rule.typeScriptSrc = (name) ->
    src: ['build/typescript-src/' + name + '/**/*.ts', '!**/*.d.ts']
    dest: 'build/'
    options:
      basePath: 'build/typescript-src/'
      ignoreError: false
      noImplicitAny: false
      sourceMap: true


#-------------------------------------------------------------------------
module.exports = (grunt) ->
  path = require('path');

  #-------------------------------------------------------------------------
  grunt.initConfig {
    pkg: grunt.file.readJSON('package.json')

    #-------------------------------------------------------------------------
    copy: {
      # TODO: provide a warning if local project overrides a build-tools
      # directory?
      # Copy all the built stuff from build-tools
      buildToolsBuild: { files: [ {
          expand: true, cwd: 'node_modules/uproxy-build-tools/build',
          src: ['**'],
          dest: 'build'
        } ] }
      thirdPartyTypeScript: { files: [
        # Copy any typescript from the third_party directory
        {
          expand: true,
          src: ['third_party/**/*.ts']
          dest: 'build/typescript-src/'
        },
        # freedom-typescript-api interfaces.
        {
          expand: true, cwd: 'node_modules'
          src: ['freedom-typescript-api/interfaces/**/*.ts']
          dest: 'build/typescript-src'
        }
      ]}
      # Generic freedom providers we need.
      freedomProvidersBuild: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['**']
        dest: 'build/freedom-providers/' } ] }
      # This project's typescript should be in the standard place for all
      # typescript code: build/typescript-src/
      typeScriptSrc: { files: [ {
        expand: true, cwd: 'src/'
        src: ['**/*.ts']
        dest: 'build/typescript-src/' } ] }

      # Individual modules.
      echoServer: Rule.copySrcModule 'echo-server'
      socksToRtc: Rule.copySrcModule 'socks-to-rtc'
      rtcToNet: Rule.copySrcModule 'rtc-to-net'
      peerConnection: Rule.copySrcModule 'peer-connection'

      # Sample peer-connection App
      pcSampleApp: Rule.copySrcModule 'samples/peer-connection'
      libForPcSampleApp: Rule.copyLibForSample 'samples/peer-connection'

      # Chrome App
      chromeApp: Rule.copySrcModule 'samples/chrome-app'
      freedomForChromeApp: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-chrome/'
        src: ['freedom-for-chrome.js', 'freedom.map']
        dest: 'build/samples/chrome-app/' } ] }
      libForChromeApp: Rule.copyLibForSample 'chrome-app/'

      echoServer_Chrome: Rule.copyBuiltModule 'echo-server', 'chrome-app/'
      socksToRtc_Chrome: Rule.copyBuiltModule 'socks-to-rtc', 'chrome-app/'
      arraybuffers_Chrome: Rule.copyBuiltModule 'arraybuffers', 'chrome-app/'
      rtcToNet_Chrome: Rule.copyBuiltModule 'rtc-to-net', 'chrome-app/'
      handler_Chrome: Rule.copyBuiltModule 'handler', 'chrome-app/'
      tcp_Chrome: Rule.copyBuiltModule 'tcp', 'chrome-app/'
      udp_Chrome: Rule.copyBuiltModule 'udp', 'chrome-app/'

      # Firefox App
      freedomProvidersBuild: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/freedom-providers' } ] }
      freedomProvidersChrome: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
      firefoxApp: Rule.copySrcModule 'samples/firefox-app'
        dest: 'build/chrome-app/freedom-providers' } ] }
      freedomFirefox: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-firefox/'
        src: ['freedom-for-firefox.jsm', 'freedom.map']
        dest: 'build/samples/firefox-app/data' } ] }
      libForFirefoxApp: Rule.copyLibForSample 'firefox-app/data/'

      # ? what more... ?
    }  # copy

    #-------------------------------------------------------------------------
    # All typescript compiles to build/ initially.
    typescript: {
      peerConnection: Rule.typeScriptSrc 'peer-connection'
      arraybuffers: Rule.typeScriptSrc 'arraybuffers'
      handler: Rule.typeScriptSrc 'handler'
      tcp: Rule.typeScriptSrc 'tcp'
      udp: Rule.typeScriptSrc 'udp'
      echoServer: Rule.typeScriptSrc 'echo-server'
      socksToRtc: Rule.typeScriptSrc 'socks-to-rtc'
      rtcToNet: Rule.typeScriptSrc 'rtc-to-net'
      chromeApp: Rule.typeScriptSrc 'chrome-app'
      firefoxApp: Rule.typeScriptSrc 'firefox-app'
    }

    #-------------------------------------------------------------------------
    jasmine: {
      socksToRtc_socksHeader:
        src: ['build/socks-to-rtc/socks-headers.js',
              'build/socks-to-rtc/socks.js']
        options:
          specs: 'build/socks-to-rtc/socks-headers.spec.js'
          outfile: 'build/socks-to-rtc/_SpecRunner.html'
          keepRunner: true
    }

    env: {
      jasmine_node: {
        # Will be available to tests as process.env['CHROME_EXTENSION_PATH'].
        CHROME_EXTENSION_PATH: path.resolve('build/chrome-app')
      }
    }

    jasmine_node:
      # Match only specs whose filenames begin with endtoend.
      options: {
        match: 'endtoend.*'
      }
      projectRoot: 'build/chrome-app'

    clean: ['build/**']

    ccaPath: 'node_modules/cca/src/cca.js'
    ccaCwd: 'build/cca-app'
    exec: {
      adbLog: {
        command: 'adb logcat *:I | grep CONSOLE'
      }
      adbPortForward: {
        command: 'adb forward tcp:10000 tcp:9998'
        exitCode: [0,1]
      }
      ccaCreate: {
        command: '<%= ccaPath %> create build/cca-app --link-to=build/chrome-app/manifest.json'
        exitCode: [0,1]
      }
      ccaEmulate: {
        command: '../../<%= ccaPath %> emulate android'
        cwd: '<%= ccaCwd %>'
      }
    }
  }  # grunt.initConfig

  #-------------------------------------------------------------------------
  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-typescript'
  grunt.loadNpmTasks 'grunt-jasmine-node'
  grunt.loadNpmTasks 'grunt-env'
  grunt.loadNpmTasks 'grunt-exec'

  #-------------------------------------------------------------------------
  # Define the tasks
  taskManager = new TaskManager.Manager();

  taskManager.add 'base', [
    'copy:buildToolsBuild'
    'copy:thirdPartyTypeScript'
    'copy:freedomProvidersBuild'
    'copy:typeScriptSrc'
  ]

  taskManager.add 'peerConnection', [
    'base'
    'copy:peerConnection'
    'typescript:peerConnection'
  ]

  taskManager.add 'echoServer', [
    'base'
    'copy:echoServer'
    'typescript:echoServer'
  ]

  taskManager.add 'socksToRtc', [
    'base'
    'copy:socksToRtc'
    'typescript:socksToRtc'
  ]

  taskManager.add 'rtcToNet', [
    'base'
    'copy:rtcToNet'
    'typescript:rtcToNet'
  ]

  taskManager.add 'tcp', [
    'base'
    'typescript:tcp'
  ]

  taskManager.add 'handler', [
    'base'
    'typescript:handler'
  ]

  taskManager.add 'udp', [
    'base'
    'typescript:udp'
  ]

  taskManager.add '', [
    ''

  taskManager.add 'chromeApp', [
    'base'
    'handler'
    'tcp'
    'udp'
    'echoServer'
    'socksToRtc'
    'rtcToNet'
    'copy:handler_Chrome'
    'copy:udp_Chrome'
    'copy:tcp_Chrome'
    'copy:arraybuffers_Chrome'
    'copy:echoServer_Chrome'
    'copy:socksToRtc_Chrome'
    'copy:rtcToNet_Chrome'
    'copy:freedomChrome'
    'copy:freedomProvidersChrome'
    'typescript:chromeApp'
    'copy:chromeApp'
  ]

  taskManager.add 'firefoxApp', [
    'base'
    'copy:firefoxApp'
    'typescript:firefoxApp'
    'copy:freedomFirefox'
    'copy:freedomProvidersFirefox'
    'echoServer'
    'copy:echoServer_Firefox'
    'socksToRtc'
    'copy:socksToRtc_Firefox'
    'rtcToNet'
    'copy:rtcToNet_Firefox'
  ]

  taskManager.add 'build', [
    'base'
    'peerConnection'
    'echoServer'
    'socksToRtc'
    'rtcToNet'
    'chromeApp'
    'firefoxApp'
  ]

  # This is the target run by Travis. Targets in here should run locally
  # and on Travis/Sauce Labs.
  taskManager.add 'test', [
    'build'
    'jasmine:socksToRtc_socksHeader'
  ]

  # TODO(yangoon): Figure out how to run our Selenium tests on Sauce Labs and
  #                move this to the test target.
  # TODO(yangoon): Figure out how to spin up Selenium server automatically.
  taskManager.add 'endtoend', [
    'build'
    'env'
    'jasmine_node'
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

module.exports.Rule = Rule;
