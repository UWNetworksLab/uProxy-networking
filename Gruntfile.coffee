TaskManager = require './node_modules/uproxy-build-tools/build/taskmanager/taskmanager'

module.exports = (grunt) ->

  path = require('path');

  grunt.initConfig {
    pkg: grunt.file.readJSON('package.json')

    copy: {
      freedomChrome: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-chrome/'
        src: ['freedom-for-chrome.js']
        dest: 'build/chrome-app/' } ] }
      freedomFirefox: { files: [ {
        expand: true, cwd: 'node_modules/freedom-for-firefox/'
        src: ['freedom-for-firefox.jsm', 'freedom.map']
        dest: 'build/firefox-app/data' } ] }
      freedomProvidersBuild: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/freedom-providers' } ] }
      freedomProvidersChrome: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/chrome-app/freedom-providers' } ] }
      freedomProvidersFirefox: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/firefox-app/data/freedom-providers' } ] }
      buildUtil: { files: [ {
          expand: true, cwd: 'node_modules/uproxy-build-tools/build/util',
          src: ['**/*.js'],
          dest: 'build/util'
        } ] }

      # User should include the compiled source directly from:
      #   - build/socks-to-rtc
      #   - build/rtc-to-net
      socks2rtc: { files: [ {
        expand: true, cwd: 'src/'
        src: ['socks-to-rtc/**/*.json']
        dest: 'build/' } ] }
      rtc2net: { files: [ {
        expand: true, cwd: 'src/'
        src: ['rtc-to-net/**/*.json']
        dest: 'build/' } ] }
      echoChrome: { files: [ {
        expand: true, cwd: 'test/'
        src: ['**']
        dest: 'build/chrome-app/test/' } ] }
      echoFirefox: { files: [ {
        expand: true, cwd: 'test/'
        src: ['**']
        dest: 'build/firefox-app/data/test/' } ] }
      firefoxApp: { files: [ {
          expand: true, cwd: 'src/firefox-app'
          src: ['**/*.json', '**/*.js', '**/*.html', '**/*.css']
          dest: 'build/firefox-app/'
        }, {
          expand: true, cwd: 'src/chrome-app'
          src: ['socks_rtc.json', 'socks_to_rtc_to_net.js']
          dest: 'build/firefox-app/data' 
        }, {
          expand: true, cwd: 'build/socks-to-rtc',
          src: ['**/*.js', '**/*.json'],
          dest: 'build/firefox-app/data/socks-to-rtc'
        }, {
          expand: true, cwd: 'build/rtc-to-net',
          src: ['**/*.js', '**/*.json'],
          dest: 'build/firefox-app/data/rtc-to-net'
        }, {
          expand: true, cwd: 'node_modules/uproxy-build-tools/build/util',
          src: ['**/*.js'],
          dest: 'build/firefox-app/data/util'
        } ] }
      chromeApp: { files: [ {
          expand: true, cwd: 'src/chrome-app'
          src: ['**/*.json', '**/*.js', '**/*.html', '**/*.css']
          dest: 'build/chrome-app/'
        }, {
          expand: true, cwd: 'build/socks-to-rtc',
          src: ['**/*.js', '**/*.json'],
          dest: 'build/chrome-app/socks-to-rtc'
        }, {
          expand: true, cwd: 'build/rtc-to-net',
          src: ['**/*.js', '**/*.json'],
          dest: 'build/chrome-app/rtc-to-net'
        }, {
          expand: true, cwd: 'node_modules/uproxy-build-tools/build/util',
          src: ['**/*.js'],
          dest: 'build/chrome-app/util'
        } ] }
      cordovaApp: { files: [ {
          expand: true, cwd: 'src/cordova-app',
          src: ['**/*'],
          dest: 'build/cordova-app/'
        }, {
          expand: true, cwd: 'node_modules/freedom-for-chrome/'
          src: ['freedom-for-chrome.js']
          dest: 'build/cordova-app/www/' 
        }, {
          expand: true, cwd: 'src/chrome-app'
          src: ['socks_rtc.json', 'socks_to_rtc_to_net.js']
          dest: 'build/cordova-app/www/' 
        }, {
          expand: true, cwd: 'build/socks-to-rtc',
          src: ['**/*.js', '**/*.json'],
          dest: 'build/cordova-app/www/socks-to-rtc'
        }, {
          expand: true, cwd: 'build/rtc-to-net',
          src: ['**/*.js', '**/*.json'],
          dest: 'build/cordova-app/www/rtc-to-net'
        }, {
          expand: true, cwd: 'node_modules/uproxy-build-tools/build/util',
          src: ['**/*.js'],
          dest: 'build/cordova-app/www/util'
        }, {
          expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
          src: ['*']
          dest: 'build/cordova-app/www/freedom-providers'
        }, {
          expand: true, cwd: 'test/'
          src: ['**']
          dest: 'build/cordova-app/www/test/'
      } ] }
    }

    #-------------------------------------------------------------------------
    # All typescript compiles to build/ initially.
    typescript: {
      socks2rtc:
        src: ['src/socks-to-rtc/**/*.ts']
        dest: 'build/'
        options: { basePath: 'src', ignoreError: false }
      rtc2net:
        src: ['src/rtc-to-net/**/*.ts']
        dest: 'build/'
        options: { basePath: 'src', ignoreError: false }
      chromeApp:
        src: ['src/chrome-app/**/*.ts']
        dest: 'build/'
        options: { basePath: 'src/', ignoreError: false }
    }

    jasmine: {
      socksToRtc:
        src: ['build/chrome-app/socks-to-rtc/socks-headers.js']
        options : { specs : 'build/socks-to-rtc/**/*.spec.js' }
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
    
    cordovaPath: '../../node_modules/cordova/bin/cordova'
    cordovaCwd: 'build/cordova-app'
    ccaCwd: 'build/cca-app'
    exec: {
      cordovaAddPlatforms: {
        command: '<%= cordovaPath %> platform add android'
        cwd: '<%= cordovaCwd %>'
        exitCode: [0,1]
      }
      cordovaAddPlugins: {
        command: '<%= cordovaPath %> plugin add org.chromium.common org.chromium.socket org.chromium.storage org.chromium.polyfill.xhr_features org.apache.cordova.console'
        cwd: '<%= cordovaCwd %>'
      }
      cordovaBuild: {
        command: '<%= cordovaPath %> build android'
        cwd: '<%= cordovaCwd %>'
      }
      cordovaRun: {
        command: '<%= cordovaPath %> emulate android'
        cwd: '<%= cordovaCwd %>'
      }
      cordovaLog: {
        command: 'adb logcat *:I | grep CONSOLE'
      }
      cordovaPortForward: {
        command: 'adb forward tcp:10000 tcp:9998'
        exitCode: [0,1]
      }
      ccaCreate: {
        command: 'cca create build/cca-app --link-to=build/chrome-app/manifest.json'
        exitCode: [0,1]
      }
      ccaEmulate: {
        command: 'cca emulate android'
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

  # TODO: create separate build commands for just the socks-to-rtc and rtc-to-net
  # libaries, chrome app, and firefox app.
  taskManager.add 'build', [
    'typescript'
    'copy'
  ]

  # This is the target run by Travis. Targets in here should run locally
  # and on Travis/Sauce Labs.
  taskManager.add 'test', [
    'build'
    'jasmine:socksToRtc'
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

  taskManager.add 'cordova', [
    'build'
    'exec:cordovaAddPlatforms'
    'exec:cordovaAddPlugins'
    'exec:cordovaBuild'
    'exec:cordovaRun'
    'exec:cordovaPortForward'
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
