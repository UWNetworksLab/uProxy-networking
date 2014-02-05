module.exports = (grunt) ->

  grunt.initConfig {
    pkg: grunt.file.readJSON('package.json'),

    copy: {
      app: {
        files: [
          {
            src: ['**']
            dest: 'chrome/js/'
            expand: true,
            cwd: 'tmp'
          }, {
            src: 'node_modules/freedom/freedom.js'
            dest: 'chrome/js/freedom.js'
          }, {
            src: ['**/*.json']
            dest: 'chrome/js/'
            expand: true,
            cwd: 'src'
          },
        ]
      }
    }

    # All typescript compiles to tmp/ initially.
    ts: {
      s2r: {
        src: ['src/socks-to-rtc/*.ts'],
        outDir: 'tmp/socks-to-rtc',
        options: {
          sourceMap: false
        }
      }
      r2n: {
        src: ['src/rtc-to-net/*.ts'],
        outDir: 'tmp/rtc-to-net',
        options: {
          sourceMap: false
        }
      }
    }

    shell: {
      freedom_setup: {
        command: 'npm install',
        options: {stdout: true, stderr: true, failOnError: true, execOptions: {cwd: 'node_modules/freedom'}}
      }
      freedom_build: {
        command: 'grunt',
        options: {stdout: true, stderr: true, failOnError: true, execOptions: {cwd: 'node_modules/freedom'}}
      }
    }

    clean: [
      'tmp/**',
      'chrome/js/**'
    ]
  }

  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-shell'
  grunt.loadNpmTasks 'grunt-ts'

  grunt.registerTask 'default', [
    'ts:s2r',
    'ts:r2n',
    'copy:app'
  ]

  # Freedom doesn't build correctly by itself - run this task when in a clean
  # directory.
  grunt.registerTask 'setup', [
    'shell:freedom_setup',
    'shell:freedom_build'
  ]
