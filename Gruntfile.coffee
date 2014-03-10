module.exports = (grunt) ->

  path = require('path');

  grunt.initConfig {
    pkg: grunt.file.readJSON('package.json'),

    copy: {
      app: {
        files: [
          {
            src: ['**']
            dest: 'chrome/js/'
            expand: true,
            cwd: 'build'
          }, {
            src: 'node_modules/freedom-runtime-chrome/freedom.js'
            dest: 'chrome/js/freedom.js'
          }, {
            src: ['**/*.json']
            dest: 'chrome/js/'
            expand: true,
            cwd: 'src'
          },
        ]
      },
      json: {
        files: [{
            src: ['**/*.json']
            dest: 'build/'
            expand: true,
            cwd: 'src'
          }
        ]
      }
    }

    #-------------------------------------------------------------------------
    # All typescript compiles to build/ initially.
    typescript: {

    ts: {
      socks2rtc: {
        src: ['src/socks-to-rtc/*.ts'],
        dest: 'build/chrome-app/',
        options: { base_path: 'src' }
      }
      rtc2net: {
        src: ['src/rtc-to-net/*.ts'],
        dest: 'build/chrome-app/',
        options: { base_path: 'src' }
      }
      chromeProviders: {
        src: ['src/chrome-providers/*.ts'],
        dest: 'build/chrome-app/',
        options: { base_path: 'src' }
      },
      chromeProviders: {
        src: ['src/chrome-app/*.ts'],
        dest: 'build/',
        options: { base_path: 'src/' }
      }
    }

    jasmine: {
      # Eventually, this should be a wildcard once we've figured out how to run
      # more dependencies under Jasmine.
      src: [
        'build/chrome-app/socks-to-rtc/socks.js',
        'build/chrome-app/chrome-providers/chrome-udpsocket.js'
      ],
      options : {
        specs : 'spec/**/*_spec.js'
      }
    }

    env: {
      jasmine_node: {
        # Will be available to tests as process.env['CHROME_EXTENSION_PATH'].
        CHROME_EXTENSION_PATH: path.resolve('chrome')
      }
    }

    # TODO(yangoon): Figure out how to use Node modules with
    #                grunt-jasmine-contrib and move these to the jasmine target.
    jasmine_node: {
      projectRoot: 'spec/selenium'
    }

    clean: [
      'build/**',
    ]
  }

  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-typescript'
  grunt.loadNpmTasks 'grunt-jasmine-node'
  grunt.loadNpmTasks 'grunt-env'

  grunt.registerTask 'build', [
    'ts:socks2rtc',
    'ts:rtc2net',
    'ts:chromeProviders',
    'copy:json'
  ]

  # This is the target run by Travis. Targets in here should run locally
  # and on Travis/Sauce Labs.
  grunt.registerTask 'test', [
    'chrome',
    'jasmine'
  ]

  # TODO(yangoon): Figure out how to run our Selenium tests on Sauce Labs and
  #                move this to the test target.
  # TODO(yangoon): Figure out how to spin up Selenium server automatically.
  grunt.registerTask 'endtoend', [
    'chrome',
    'env',
    'jasmine_node'
  ]

  grunt.registerTask 'default', [
    'build'
  ]

  grunt.registerTask 'chrome', [
    'build',
    'copy:app'
  ]
