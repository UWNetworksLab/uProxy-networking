# How to build socks-rtc and its various demos.

# TODO: work out an automatic way to only the src we need rather than the whole
# library. Maybe have a separate Gruntfile in each subdirectory with some common
# rules for building a project accoridng to using a standard dir layout.

# Also: provide a way to specify needed modules, and when they are not there to
# give a sensible error.

TaskManager = require 'uproxy-lib/build/taskmanager/taskmanager'

#-------------------------------------------------------------------------
# Rule-making helper function that assume expected directory layout.
#
# Function to make a copy rule for a module directory, assuming standard
# layout. Copies all non (ts/sass) compiled files into the corresponding
# build directory.
Rule = require('uproxy-lib/Gruntfile.coffee').Rule;
# HACK: this overrides Rule's |noImplicitAny=false| to deal with inability to
# refer to `core.XXX` providers as members in JavaScript. See:
# https://github.com/freedomjs/freedom/issues/57
Rule.typescriptSrc = (name) ->
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

    symlink:
      # Symlink all module directories in `src` into typescript-src
      typescriptSrc: { files: [ {
        expand: true,
        overwrite: true,
        cwd: 'src',
        src: ['*'],
        dest: 'build/typescript-src/' } ] }
      # Symlink third_party into typescript-src
      thirdPartyTypescriptSrc: { files: [ {
        expand: true,
        overwrite: true,
        cwd: '.',
        src: ['third_party'],
        dest: 'build/typescript-src/' } ] }
      # Symlink third_party into typescript-src
      uproxyLibTypescriptSrc: { files: [ {
        expand: true,
        overwrite: true,
        cwd: 'node_modules/uproxy-lib/src/',
        src: ['**/*'],
        dest: 'build/typescript-src/' } ] }

    #-------------------------------------------------------------------------
    copy: {
      # TODO: provide a warning if local project overrides directory?
      #
      # Copy all the built stuff from uproxy-lib
      uproxyLibBuild: { files: [ {
          expand: true, cwd: 'node_modules/uproxy-lib/build'
          src: ['**', '!**/typescript-src/**']
          dest: 'build'
          onlyIf: 'modified'
        } ] }
      # Generic freedom things to copy into build/
      freedomProviders: { files: [ {
          expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
          src: ['**']
          dest: 'build/freedom-providers/'
          onlyIf: 'modified'
        } ] }
      freedomForChrome: { files: [ {
          expand: true, cwd: 'node_modules/freedom-for-chrome'
          src: ['freedom-for-chrome.js', 'freedom.map']
          dest: 'build/freedom-for-chrome/'
          onlyIf: 'modified'
        } ] }
      freedomForFirefox: { files: [ {
          expand: true, cwd: 'node_modules/freedom-for-firefox'
          src: ['freedom-for-firefox.jsm', 'freedom.map']
          dest: 'build/freedom-for-firefox/'
          onlyIf: 'modified'
        } ] }

      # Copy any JavaScript from the third_party directory
      thirdPartyJavaScript: { files: [ {
          expand: true,
          src: ['third_party/**/*.js']
          dest: 'build/'
          onlyIf: 'modified'
        } ] }

      # Individual modules.
      tcp: Rule.copyModule 'udp'
      udp: Rule.copyModule 'tcp'
      socksToRtc: Rule.copyModule 'socks-to-rtc'
      rtcToNet: Rule.copyModule 'rtc-to-net'

      # Sample Apps
      #
      # Echo server Chrome App
      echoServer: Rule.copySampleFiles 'tcp/samples/echo-server', 'lib'

      freedomForChromeApp: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-chrome/'
        src: ['freedom-for-chrome.js', 'freedom.map']
        dest: 'build/samples/chrome-app/' } ] }

      freedomProvidersChrome: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/chrome-app/freedom-providers' } ] }

      freedomProvidersBuild: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/freedom-providers' } ] }

      freedomFirefox: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-firefox/'
        src: ['freedom-for-firefox.jsm', 'freedom.map']
        dest: 'build/samples/firefox-app/data' } ] }

      socksRtcNetChromeApp: Rule.copySampleFiles 'socks-rtc-net/samples/socks-rtc-net-chrome-app', 'lib'
      socksRtcNetFirefoxApp: Rule.copySampleFiles 'socks-rtc-net/samples/socks-rtc-net-firefoxapp/data/', 'lib'

      # ? what more... ?
    }  # copy

    #-------------------------------------------------------------------------
    # All typescript compiles to locations in `build/`
    typescript: {
      # From build-tools
      arraybuffers: Rule.typescriptSrc 'arraybuffers'
      handler: Rule.typescriptSrc 'handler'
      # Modules
      tcp: Rule.typescriptSrc 'tcp'
      udp: Rule.typescriptSrc 'udp'
      socksToRtc: Rule.typescriptSrc 'socks-to-rtc'
      rtcToNet: Rule.typescriptSrc 'rtc-to-net'
      # Sample Apps
      echoServerChromeApp: Rule.typescriptSrc 'echo-server/samples/echo-server-chromeapp'
      socksRtcNetChromeApp: Rule.typescriptSrc 'socks-rtc-net/samples/socks-rtc-net-chromeapp'
      socksRtcNetFirefoxApp: Rule.typescriptSrc 'socks-rtc-net/samples/socks-rtc-net-firefoxapp'
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
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-contrib-symlink'
  grunt.loadNpmTasks 'grunt-env'
  grunt.loadNpmTasks 'grunt-exec'
  grunt.loadNpmTasks 'grunt-jasmine-node'
  grunt.loadNpmTasks 'grunt-typescript'

  #-------------------------------------------------------------------------
  # Define the tasks
  taskManager = new TaskManager.Manager();

  taskManager.add 'copyModulesSrc', [
    'copy:tcp'
    'copy:udp'
    'copy:rtcToNet'
    'copy:socksToRtc'
  ]

  taskManager.add 'base', [
    # copy modules from uproxyLibBuild to build/
    'copy:uproxyLibBuild'
    # symlink all modules with typescript src to build/typescript-src
    'symlink:uproxyLibTypescriptSrc',
    'symlink:thirdPartyTypescriptSrc'
    'symlink:typescriptSrc'
    # third party JS
    'copy:thirdPartyJavaScript'
    # Copy freedom modules to build/
    'copy:freedomProviders'
    'copy:freedomForChrome'
    'copy:freedomForFirefox'
    # Copy all source modules non-ts files
    'copyModulesSrc'
  ]

  taskManager.add 'tcp', [
    'base'
    'typescript:tcp'
  ]

  taskManager.add 'udp', [
    'base'
    'typescript:udp'
  ]

  taskManager.add 'peerConnection', [
    'base'
    'typescript:peerConnection'
  ]

  taskManager.add 'socksToRtc', [
    'base'
    'typescript:socksToRtc'
  ]

  taskManager.add 'rtcToNet', [
    'base'
    'typescript:rtcToNet'
  ]

  #-------------------------------------------------------------------------
  # tasks for sample apps
  taskManager.add 'sample-webrtcPc', [
    'base'
    'peerConnection'
    'typescript:webrtcPc'
    'copy:webrtcPc'
    'copy:libForWebrtcPc'
  ]

  taskManager.add 'sample-echoServer', [
    'base'
    'tcp'
    'udp'
    'typescript:echoServer'
    'copy:echoServer'
    'copy:libForEchoServer'
  ]

  taskManager.add 'sample-chromeApp', [
    'base'
    'tcp'
    'udp'
    'socksToRtc'
    'rtcToNet'
    'typescript:chromeApp'
    'copy:chromeApp'
    'copy:libForChromeApp'
  ]

  taskManager.add 'sample-firefoxApp', [
    'base'
    'tcp'
    'udp'
    'socksToRtc'
    'rtcToNet'
    'typescript:firefoxApp'
    'copy:firefoxApp'
    'copy:libForFirefoxApp'
  ]

  #-------------------------------------------------------------------------
  taskManager.add 'build', [
    'base'
    # Modules in socks-rtc
    'tcp'
    'udp'
    'peerConnection'
    'socksToRtc'
    'rtcToNet'
    # Sample Apps in socks-rtc
    'sample-webrtcPc'
    'sample-echoServer'
    'sample-chromeApp'
    'sample-firefoxApp'
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
