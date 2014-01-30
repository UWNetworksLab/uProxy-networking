module.exports = (grunt) ->

  grunt.initConfig {
    pkg: grunt.file.readJSON('package.json'),
    copy: {
      lib: {
        files: [
        ]
      }
    }
    ts: {

      client: {
        src: ['src/client/*.ts'],
        outDir: 'build/client',
        options: {
          sourceMap: false
        }
      }

      server: {
        src: ['src/server/*.ts'],
        outDir: 'build/server',
        options: {
          sourceMap: false
        }
      }

    }
  }

  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-ts'

  grunt.registerTask 'default', [
    'ts:client'
    'ts:server'
  ]
