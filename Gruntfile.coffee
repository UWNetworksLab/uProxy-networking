# How to build socks-rtc and its various demos.

# TODO: work out an automatic way to only the src we need rather than the whole
# library. Maybe have a separate Gruntfile in each subdirectory with some common
# rules for building a project accoridng to using a standard dir layout.

# Also: provide a way to specify needed modules, and when they are not there to
# give a sensible error.

TaskManager = require 'uproxy-build-tools/build/taskmanager/taskmanager'

#-------------------------------------------------------------------------
# Rule-making helper function that assume expected directory layout.
#
# Function to make a copy rule for a module directory, assuming standard
# layout. Copies all non (ts/sass) compiled files into the corresponding
# build directory.
Rule = require('uproxy-build-tools/Gruntfile.coffee').Rule;
# Copy all source that is not typescript to the module's build directory.
Rule.copySrcModule = (name, dest) ->
  expand: true, cwd: 'src/'
  src: [name + '/**', '!' + name + '/**/*.ts', '!' + name + '/**/*.sass']
  dest: 'build'
  onlyIf: 'modified'
# Copy all libraries (but not samples and typescript src) into the desitination
# directory (typically a sample app)
Rule.copyAllModulesTo = (dest) ->
  files: [
    {  # Copy all modules in the build directory to the sample
      expand: true, cwd: 'build'
      src: ['**/*', '!samples/**', '!typescript-src/**',
            '!samples', '!typescript-src']
      dest: 'build/' + dest
      onlyIf: 'modified'
    }
    {  # Useful to support the map files
      expand: true, cwd: 'build'
      src: ['typescript-src/**/*']
      dest: 'build/' + dest
      onlyIf: 'modified'
    }
  ]
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
          expand: true, cwd: 'node_modules/uproxy-build-tools/build'
          src: ['**']
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

      thirdPartyTypeScript: { files: [
        # Copy any typescript from the third_party directory
        {
          expand: true,
          src: ['third_party/**/*.ts']
          dest: 'build/typescript-src/'
          onlyIf: 'modified'
        },
        # freedom-typescript-api interfaces.
        {
          expand: true, cwd: 'node_modules/freedom-typescript-api'
          src: ['interfaces/**/*.ts']
          dest: 'build/typescript-src/freedom-typescript-api/'
          onlyIf: 'modified'
        }
      ]}

      # All module's typescript should be in the standard place for all
      # typescript code: build/typescript-src/
      typeScriptSrc: { files: [ {
        expand: true, cwd: 'src/'
        src: ['**/*.ts']
        dest: 'build/typescript-src/' } ] }

      # Individual modules.
      tcp: Rule.copySrcModule 'udp'
      udp: Rule.copySrcModule 'tcp'
      peerConnection: Rule.copySrcModule 'peer-connection'
      socksToRtc: Rule.copySrcModule 'socks-to-rtc'
      rtcToNet: Rule.copySrcModule 'rtc-to-net'

      # Sample Apps
      #
      # Echo server Chrome App
      echoServer: Rule.copySrcModule 'samples/echo-server'
      libForEchoServer: Rule.copyAllModulesTo 'samples/echo-server'
      # WebRtc peer-connection Webpage
      webrtcPc: Rule.copySrcModule 'samples/webrtc-pc'
      libForWebrtcPc: Rule.copyAllModulesTo 'samples/webrtc-pc'
      # ChromeApp
      chromeApp: Rule.copySrcModule 'samples/chrome-app'
      libForChromeApp: Rule.copyAllBuildModulesTo 'samples/chrome-app/'

      freedomForChromeApp: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-chrome/'
        src: ['freedom-for-chrome.js', 'freedom.map']
        dest: 'build/samples/chrome-app/' } ] }

      freedomProvidersChrome: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/chrome-app/freedom-providers' } ] }

      echoServer_Chrome: Rule.copyBuiltModule 'echo-server', 'chrome-app/'
      socksToRtc_Chrome: Rule.copyBuiltModule 'socks-to-rtc', 'chrome-app/'
      arraybuffers_Chrome: Rule.copyBuiltModule 'arraybuffers', 'chrome-app/'
      rtcToNet_Chrome: Rule.copyBuiltModule 'rtc-to-net', 'chrome-app/'
      handler_Chrome: Rule.copyBuiltModule 'handler', 'chrome-app/'
      tcp_Chrome: Rule.copyBuiltModule 'tcp', 'chrome-app/'
      udp_Chrome: Rule.copyBuiltModule 'udp', 'chrome-app/'

      freedomProvidersBuild: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/freedom-providers' } ] }

      freedomFirefox: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-firefox/'
        src: ['freedom-for-firefox.jsm', 'freedom.map']
        dest: 'build/samples/firefox-app/data' } ] }

      firefoxApp: Rule.copySrcModule 'samples/firefox-app'
      libForFirefoxApp: Rule.copyAllBuildModulesTo 'samples/firefox-app/data/'

      # ? what more... ?
    }  # copy

    #-------------------------------------------------------------------------
    # All typescript compiles to locations in `build/`
    typescript: {
      # From build-tools
      arraybuffers: Rule.typeScriptSrc 'arraybuffers'
      handler: Rule.typeScriptSrc 'handler'
      # Modules
      tcp: Rule.typeScriptSrc 'tcp'
      udp: Rule.typeScriptSrc 'udp'
      peerConnection: Rule.typeScriptSrc 'peer-connection'
      socksToRtc: Rule.typeScriptSrc 'socks-to-rtc'
      rtcToNet: Rule.typeScriptSrc 'rtc-to-net'
      # Sample Apps
      webrtcPc: Rule.typeScriptSrc 'samples/webrtc-pc'
      echoServer: Rule.typeScriptSrc 'samples/echo-server'
      chromeApp: Rule.typeScriptSrc 'samples/chrome-app'
      firefoxApp: Rule.typeScriptSrc 'samples/firefox-app'
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

  taskManager.add 'copyModulesSrc', [
    'copy:tcp'
    'copy:udp'
    'copy:peerConnection'
    'copy:rtcToNet'
    'copy:socksToRtc'
  ]

  taskManager.add 'base', [
    # copy modules from buildToolsBuild to build/
    'copy:buildToolsBuild'
    # copy all typescript to build/typescript-src
    'copy:thirdPartyTypeScript'
    'copy:typeScriptSrc'
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
