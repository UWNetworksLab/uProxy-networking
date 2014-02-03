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
            # flatten: false
            cwd: 'tmp'
          }, {
            src: 'node_modules/freedom/freedom.js'
            dest: 'chrome/js/freedom.js'
          }, {
            src: ['**/*.json']
            dest: 'chrome/js/'
            expand: true,
            # flatten: false
            cwd: 'src'
          },
        ]
      }
    }

    # All typescript compiles to tmp/ initially.
    ts: {
      client: {
        src: ['src/client/*.ts'],
        outDir: 'tmp/client',
        options: {
          sourceMap: false
        }
      }
      server: {
        src: ['src/server/*.ts'],
        outDir: 'tmp/server',
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
    'ts:client',
    'ts:server',
    'copy:app'
  ]

  # Freedom doesn't build correctly by itself - run this task when in a clean
  # directory.
  grunt.registerTask 'setup', [
    'shell:freedom_setup',
    'shell:freedom_build'
  ]
