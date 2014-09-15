# How to build socks-rtc and its various demos.

# TODO: work out an automatic way to only the src we need rather than the whole
# library. Maybe have a separate Gruntfile in each subdirectory with some common
# rules for building a project accoridng to using a standard dir layout.

# Also: provide a way to specify needed modules, and when they are not there to
# give a sensible error.

TaskManager = require 'uproxy-lib/tools/taskmanager'

#-------------------------------------------------------------------------
# Rule-making helper function that assume expected directory layout.
#
# Function to make a copy rule for a module directory, assuming standard
# layout. Copies all non (ts/sass) compiled files into the corresponding
# build directory.
Rule = require 'uproxy-lib/tools/common-grunt-rules'

Path = require('path');

uproxyLibPath = Path.dirname(require.resolve('uproxy-lib/package.json'))
ipaddrPath = Path.dirname(require.resolve('ipaddr.js/package.json'))
churnPath = Path.dirname(require.resolve('uproxy-churn/package.json'))
ccaPath = Path.dirname(require.resolve('cca/package.json'))

#-------------------------------------------------------------------------
module.exports = (grunt) ->
  #-------------------------------------------------------------------------
  grunt.initConfig {
    pkg: grunt.file.readJSON('package.json')

    symlink:
      options:
        # We should have overwirte set to true, but there is a bug:
        # https://github.com/gruntjs/grunt-contrib-symlink/issues/12 This stops
        # us from being able to sym-link into node_modules and have building
        # work correctly.
        overwrite: false
      # Symlink all module directories in `src` into typescript-src
      typescriptSrc: { files: [ {
        expand: true,
        cwd: 'src',
        src: ['**/*.ts'],
        dest: 'build/typescript-src/' } ] }
      # Symlink third_party into typescript-src
      thirdPartyTypescriptSrc: { files: [ {
        expand: true,
        cwd: 'third_party',
        src: ['**/*.ts'],
        dest: 'build/typescript-src/third_party/' } ] }
      # Symlink third_party into typescript-src
      uproxyLibThirdPartyTypescriptSrc: { files: [ {
        expand: true,
        cwd: Path.join(uproxyLibPath, 'third_party'),
        src: ['**/*.ts'],
        dest: 'build/typescript-src/third_party/' } ] }
      uproxyLibTypescriptSrc: { files: [ {
        expand: true,
        cwd: Path.join(uproxyLibPath, 'src'),
        src: ['**/*.ts'],
        dest: 'build/typescript-src/' } ] }
      churnTypescriptSrc: { files: [ {
        expand: true,
        cwd: Path.join(churnPath, 'src'),
        src: ['**/*.ts'],
        dest: 'build/typescript-src/' } ] }

    #-------------------------------------------------------------------------
    copy: {
      # TODO: provide a warning if local project overrides directory?
      #
      # Copy all the built stuff from uproxy-lib
      uproxyLibBuild: { files: [ {
          expand: true, cwd: Path.join(uproxyLibPath, 'build')
          src: ['**', '!**/typescript-src/**']
          dest: 'build'
          onlyIf: 'modified'
        } ] }

      # Copy any JavaScript from the third_party directory
      thirdPartyJavaScript: { files: [ {
          expand: true,
          src: ['third_party/**/*.js']
          dest: 'build/'
          onlyIf: 'modified'
        } ] }

      # Copy the ipaddr.js library into the build directory
      ipAddrJavaScript: { files: [ {
          expand: true, cwd: ipaddrPath
          src: ['ipaddr.min.js']
          dest: 'build/ipaddr/'
          onlyIf: 'modified'
        } ] }

      churnBuild: { files: [ {
          expand: true, cwd: Path.join(churnPath, 'build')
          src: ['**', '!**/typescript-src/**']
          dest: 'build'
          onlyIf: 'modified'
        } ] }

      # Individual modules.
      tcp: Rule.copyModule 'udp'
      udp: Rule.copyModule 'tcp'
      socksCommon: Rule.copyModule 'socks-common'
      socksToRtc: Rule.copyModule 'socks-to-rtc'
      rtcToNet: Rule.copyModule 'rtc-to-net'

      # Sample Apps
      echoServerChromeApp: Rule.copySampleFiles 'tcp/samples/echo-server-chromeapp', 'lib'

      socksSamples: Rule.copyModule 'socks-server'
      simpleSocksChromeApp: Rule.copySampleFiles 'socks-server/samples/simple-socks-chromeapp', 'lib'
      simpleSocksFirefoxApp: Rule.copySampleFiles 'socks-server/samples/simple-socks-firefoxapp/data/', 'lib'
      copypasteSocksChromeApp: Rule.copySampleFiles 'socks-server/samples/copypaste-socks-chromeapp', 'lib'
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
      socksCommon: Rule.typescriptSrc 'socks-common'
      socksToRtc: Rule.typescriptSrc 'socks-to-rtc'
      rtcToNet: Rule.typescriptSrc 'rtc-to-net'
      # Echo server sample app.
      echoServerChromeApp: Rule.typescriptSrc 'tcp/samples/echo-server-chromeapp'
      # SOCKS server sample apps.
      socksSamples: Rule.typescriptSrc 'socks-server'
      simpleSocksChromeApp: Rule.typescriptSrc 'socks-server/samples/simple-socks-chromeapp'
      simpleSocksFirefoxApp: Rule.typescriptSrc 'socks-server/samples/simple-socks-firefoxapp'
      copypasteSocksChromeApp: Rule.typescriptSrc 'socks-server/samples/copypaste-socks-chromeapp'
    }

    #-------------------------------------------------------------------------
    jasmine: {
      socksCommon:
        src: ['build/socks-common/socks-headers.js']
        options:
          specs: 'build/socks-common/socks-headers.spec.js'
          outfile: 'build/socks-common/_SpecRunner.html'
          keepRunner: true
    }

    clean: ['build/**']

    ccaJsPath: Path.join(ccaPath, 'src/cca.js')
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
        command: '<%= ccaJsPath %> create build/cca-app --link-to=build/socks-server/samples/simple-socks-chromeapp/manifest.json'
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
  grunt.loadNpmTasks 'grunt-env'
  grunt.loadNpmTasks 'grunt-exec'
  grunt.loadNpmTasks 'grunt-jasmine-node'
  grunt.loadNpmTasks 'grunt-typescript'

  #-------------------------------------------------------------------------
  # Define the tasks
  taskManager = new TaskManager.Manager();

  taskManager.add 'base', [
    # copy modules from uproxyLibBuild to build/
    'copy:uproxyLibBuild'
    'copy:ipAddrJavaScript'
    'copy:churnBuild'
    # symlink all modules with typescript src to build/typescript-src
    'symlink:uproxyLibTypescriptSrc'
    'symlink:uproxyLibThirdPartyTypescriptSrc'
    'symlink:thirdPartyTypescriptSrc'
    'symlink:typescriptSrc'
    'symlink:churnTypescriptSrc'
  ]

  taskManager.add 'tcp', [
    'base'
    'copy:tcp'
    'typescript:tcp'
  ]

  taskManager.add 'udp', [
    'base'
    'copy:udp'
    'typescript:udp'
  ]

  taskManager.add 'socksCommon', [
    'base'
    'copy:socksCommon'
    'typescript:socksCommon'
    'jasmine:socksCommon'
  ]

  taskManager.add 'socksToRtc', [
    'base'
    'socksCommon'
    'copy:socksToRtc'
    'typescript:socksToRtc'
  ]

  taskManager.add 'rtcToNet', [
    'base'
    'socksCommon'
    'copy:rtcToNet'
    'typescript:rtcToNet'
  ]

  #-------------------------------------------------------------------------
  # tasks for sample apps
  taskManager.add 'echoServer', [
    'base'
    'tcp'
    'typescript:echoServerChromeApp'
    'copy:echoServerChromeApp'
  ]

  taskManager.add 'socksSamples', [
    'base'
    'tcp'
    'udp'
    'socksCommon'
    'socksToRtc'
    'rtcToNet'
    'typescript:socksSamples'
    'copy:socksSamples'
    'typescript:simpleSocksChromeApp'
    'copy:simpleSocksChromeApp'
    'typescript:copypasteSocksChromeApp'
    'copy:copypasteSocksChromeApp'
  ]

  #-------------------------------------------------------------------------
  taskManager.add 'build', [
    'base'
    'tcp'
    'udp'
    'echoServer'
    'socksCommon'
    'socksToRtc'
    'rtcToNet'
    'socksSamples'
  ]

  # This is the target run by Travis. Targets in here should run locally
  # and on Travis/Sauce Labs.
  taskManager.add 'test', [
    'build'
    'jasmine:socksCommon'
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
