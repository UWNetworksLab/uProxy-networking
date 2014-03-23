TaskManager = require './node_modules/uproxy-build-tools/build/taskmanager/taskmanager'

module.exports = (grunt) ->

  path = require('path');

  grunt.initConfig {
    pkg: grunt.file.readJSON('package.json')

    copy: {
      freedom: { files: [ {
        expand: true, cwd: 'node_modules/freedom-runtime-chrome/'
        src: ['freedom.js']
        dest: 'build/chrome-app/' } ] }
      freedomProviders: { files: [ {
        expand: true, cwd: 'node_modules/freedom/providers/transport/webrtc/'
        src: ['*']
        dest: 'build/chrome-app/freedom-providers' } ] }

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
          expand: true, cwd: 'build/common',
          src: ['**/*.js'],
          dest: 'build/chrome-app/common'
        } ] }
    }

    #-------------------------------------------------------------------------
    # All typescript compiles to build/ initially.
    typescript: {
      socks2rtc:
        src: ['src/socks-to-rtc/**/*.ts']
        dest: 'build/'
        options: { base_path: 'src' }
      rtc2net:
        src: ['src/rtc-to-net/**/*.ts']
        dest: 'build/'
        options: { base_path: 'src' }
      common:
        src: ['src/common/**/*.ts']
        dest: 'build/'
        options: { base_path: 'src' }
      chromeProviders:
        src: ['src/chrome-providers/**/*.ts']
        dest: 'build/chrome-app/'
        options: { base_path: 'src' }
      chromeApp:
        src: ['src/chrome-app/**/*.ts']
        dest: 'build/'
        options: { base_path: 'src/' }
    }

    jasmine: {
      common:
        src: ['build/common/**.js']
        options : { specs : 'build/common/**/*.spec.js' }
      # TODO translate tests to TS.
      socksToRtc:
        src: ['build/chrome-app/socks-to-rtc/socks-headers.js']
        options : { specs : 'build/socks-to-rtc/**/*.spec.js' }
      # TODO translate tests to TS.
      chromeProvider:
        src: ['build/chrome-app/chrome-providers/chrome-udpsocket.js']
        options : { specs : 'build/chrome-app/chrome-providers/**/*.spec.js' }
    }

    env: {
      jasmine_node: {
        # Will be available to tests as process.env['CHROME_EXTENSION_PATH'].
        CHROME_EXTENSION_PATH: path.resolve('build/chrome-app')
      }
    }

    # TODO(yangoon): Figure out how to use Node modules with
    #                grunt-jasmine-contrib and move these to the jasmine target.
    jasmine_node:
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

  taskManager.add 'build', [
    'typescript:socks2rtc'
    'typescript:rtc2net'
    'typescript:common'
    'typescript:chromeProviders'
    'typescript:chromeApp'
    'copy:freedom'
    'copy:freedomProviders'
    'copy:socks2rtc'
    'copy:rtc2net'
    'copy:chromeApp'
  ]

  # This is the target run by Travis. Targets in here should run locally
  # and on Travis/Sauce Labs.
  taskManager.add 'test', [
    'build'
    'jasmine:common'
    'jasmine:socksToRtc'
    'jasmine:chromeProvider'
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
