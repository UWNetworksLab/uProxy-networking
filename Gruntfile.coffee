# How to build socks-rtc and its various demos.

# TODO: work out an automatic way to only take what we need rather than the
# whole library.

TaskManager = require './node_modules/uproxy-build-tools/build/taskmanager/taskmanager'

module.exports = (grunt) ->

  path = require('path');

  #-------------------------------------------------------------------------
  # Rule-making helper function that assume expected directory layout.
  #

  # Function to make a typescript rule based on expected directory layout.
  typeScriptSrcRule = (name) ->
    src: ['build/typescript-src/' + name + '/**/*.ts',
          '!build/typescript-src/' + name + '/**/*.d.ts']
    dest: 'build/'
    options:
      basePath: 'build/typescript-src/'
      ignoreError: false
      noImplicitAny: false  # TODO: make true
      sourceMap: true
  # Function to make jasmine spec assuming expected dir layout.
  jasmineSpec = (name) ->
    src: ['build/' + name + '/**/*.js', '!build/' + name + '/**/*.spec.js']
    options:
      specs: 'build/' + name + '/**/*.spec.js'
      outfile: 'build/' + name + '/_SpecRunner.html'
      keepRunner: true
  # Function to make a copy rule for a module directory, assuming standard
  # layout. Copies all non (ts/sass) compiled files into the corresponding
  # build directory.
  copySrcModule = (name, dest) ->
    expand: true, cwd: 'src/'
    src: [name + '/**', '!' + name + '/**/*.ts', '!' + name + '/**/*.sass']
    dest: 'build'
  copyBuiltModule = (name, dest) ->
    expand: true, cwd: 'build/'
    src: [name + '/**']
    dest: 'build/' + dest

  #-------------------------------------------------------------------------
  grunt.initConfig {
    pkg: grunt.file.readJSON('package.json')

    #-------------------------------------------------------------------------
    copy: {
      # Base
      typeScriptSrc: { files: [ {
        expand: true, cwd: 'src/'
        src: ['**/*.ts']
        dest: 'build/typescript-src/' } ] }
      buildToolsTypeScript: { files: [ {
          expand: true, cwd: 'node_modules/uproxy-build-tools/build/typescript-src',
          src: ['**/*.ts'],
          dest: 'build/typescript-src/'
        } ] }
      thirdPartyTypeScript: { files: [
        {
          expand: true,
          src: ['third_party/**/*.ts']
          dest: 'build/typescript-src/'
        },
        {
          expand: true, cwd: 'node_modules'
          src: ['freedom-typescript-api/interfaces/**/*.ts']
          dest: 'build/typescript-src'
        }
      ]}
      freedomProvidersBuild: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/freedom-providers/' } ] }

      # Individual modules.
      echoServer: copySrcModule 'echo-server'
      socksToRtc: copySrcModule 'socks-to-rtc'
      rtcToNet: copySrcModule 'rtc-to-net'

      # Chrome App
      chromeApp: copySrcModule 'chrome-app'
      freedomChrome: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-chrome/'
        src: ['freedom-for-chrome.js']
        dest: 'build/chrome-app/' } ] }
      freedomProvidersChrome: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/chrome-app/freedom-providers' } ] }
      echoServer_Chrome: copyBuiltModule 'echo-server', 'chrome-app/'
      socksToRtc_Chrome: copyBuiltModule 'socks-to-rtc', 'chrome-app/'
      arraybuffers_Chrome: copyBuiltModule 'arraybuffers', 'chrome-app/'
      rtcToNet_Chrome: copyBuiltModule 'rtc-to-net', 'chrome-app/'
      handler_Chrome: copyBuiltModule 'handler', 'chrome-app/'
      tcp_Chrome: copyBuiltModule 'tcp', 'chrome-app/'
      udp_Chrome: copyBuiltModule 'udp', 'chrome-app/'

      # Firefox App
      firefoxApp: copySrcModule 'firefox-app'
      freedomFirefox: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-firefox/'
        src: ['freedom-for-firefox.jsm', 'freedom.map']
        dest: 'build/firefox-app/data' } ] }
      freedomProvidersFirefox: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/firefox-app/data/freedom-providers' } ] }
      echoServer_Firefox: copyBuiltModule 'echo-server', 'firefox-app/data/'
      socksToRtc_Firefox: copyBuiltModule 'socks-to-rtc', 'firefox-app/data/'
      rtcToNet_Firefox: copyBuiltModule 'rtc-to-net', 'firefox-app/data/'
      # ? what more... ?
    }  # copy

    #-------------------------------------------------------------------------
    # All typescript compiles to build/ initially.
    typescript: {
      arraybuffers: typeScriptSrcRule 'arraybuffers'
      handler: typeScriptSrcRule 'handler'
      tcp: typeScriptSrcRule 'tcp'
      udp: typeScriptSrcRule 'udp'
      echoServer: typeScriptSrcRule 'echo-server'
      socksToRtc: typeScriptSrcRule 'socks-to-rtc'
      rtcToNet: typeScriptSrcRule 'rtc-to-net'
      chromeApp: typeScriptSrcRule 'chrome-app'
      firefoxApp: typeScriptSrcRule 'firefox-app'
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
  }  # grunt.initConfig

  #-------------------------------------------------------------------------
  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-typescript'
  grunt.loadNpmTasks 'grunt-jasmine-node'
  grunt.loadNpmTasks 'grunt-env'

  #-------------------------------------------------------------------------
  # Define the tasks
  taskManager = new TaskManager.Manager();

  taskManager.add 'base', [
    'copy:buildToolsTypeScript'
    'copy:thirdPartyTypeScript'
    'copy:freedomProvidersBuild'
    'copy:typeScriptSrc'
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

  #-------------------------------------------------------------------------
  # Register the tasks
  taskManager.list().forEach((taskName) =>
    grunt.registerTask taskName, (taskManager.get taskName)
  );
