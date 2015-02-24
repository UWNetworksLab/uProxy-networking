TaskManager = require 'uproxy-lib/build/dist/build-tools/taskmanager'

#-------------------------------------------------------------------------
# The top level tasks. These are the highest level grunt-tasks defined in terms
# of specific grunt rules below and given to grunt.initConfig
taskManager = new TaskManager.Manager();

taskManager.add 'default', [ 'dev' ]

taskManager.add 'base-dev', [
  'copy:typescriptLibs'
  'copy:dev'
  'ts:devInModuleEnv'
  'ts:devInCoreEnv'
]

taskManager.add 'dev', [
  'base-dev'
]

Rules = require 'uproxy-lib/build/dist/build-tools/common-grunt-rules'
devBuildDir = 'build/dev'
Rule = new Rules.Rule({devBuildDir: devBuildDir});

path = require('path');
freedomForChromePath = path.dirname(require.resolve('freedom-for-chrome/package.json'))
uproxyLibPath = path.dirname(require.resolve('uproxy-lib/package.json'))
ipaddrjsPath = path.dirname(require.resolve('ipaddr.js/package.json'))
uproxyObfuscatorsPath = path.dirname(require.resolve('uproxy-obfuscators/package.json'))
regex2dfaPath = path.dirname(require.resolve('regex2dfa/package.json'))
# Cordova testing
ccaPath = path.dirname(require.resolve('cca/package.json'))
pgpPath = path.dirname(require.resolve('freedom-pgp-e2e/package.json'))

#-------------------------------------------------------------------------
module.exports = (grunt) ->
  grunt.initConfig {
    pkg: grunt.file.readJSON 'package.json'

    copy:
      # Copy releveant non-typescript files to dev build.
      typescriptLibs:
        files: [
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyLibPath, 'build/dist'),
              src: ['**/*'],
              dest: 'build/dev/',
              onlyIf: 'modified'
          },
          # We will use the third_party definitions from uProxy-lib, and they
          # will need to have the same relative path to the created .d.ts files
          # from |build/dev|.
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyLibPath, 'build/third_party'),
              src: ['freedom-typings/**/*'],
              dest: 'build/third_party/',
              onlyIf: 'modified'
          },
          # This puts the locally defind third party definition files into the
          # common location of build/third_party.
          {
              nonull: true,
              expand: true,
              cwd: 'third_party',
              src: ['**/*'],
              dest: 'build/third_party/',
              onlyIf: 'modified'
          },
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyObfuscatorsPath, 'src/interfaces/'),
              src: ['**/*'],
              dest: 'build/third_party/uproxy-obfuscators',
              onlyIf: 'modified'
          }
        ]
      # Copy releveant non-typescript files to dev build.
      dev:
        files: [
          {
              nonull: false,
              expand: true,
              cwd: 'src/',
              src: ['**/*.html', '**/*.css', '**/*.json', '**/*.js',],
              dest: devBuildDir,
              onlyIf: 'modified'
          }
        ]

    ts:
      # Compile all non-sample typescript code into the development build
      # directory.
      devInModuleEnv:
        src: [
          'src/**/*.ts',
          '!src/**/*.core-env.ts',
          '!src/**/*.core-env.spec.ts',
        ]
        outDir: 'build/dev/'
        baseDir: 'src'
        options:
          target: 'es5'
          comments: true
          noImplicitAny: true
          sourceMap: false
          declaration: true
          module: 'commonjs'
          fast: 'always'

      devInCoreEnv:
        src: [
          'src/**/*.core-env.spec.ts',
          'src/**/*.core-env.ts',
        ]
        outDir: 'build/dev/'
        baseDir: 'src'
        options:
          target: 'es5'
          comments: true
          noImplicitAny: true
          sourceMap: false
          declaration: true
          module: 'commonjs'
          fast: 'always'


    clean:
      build:
        [ 'build/dev', 'build/dist'
          # Note: 'src/.baseDir.ts' and '.tscache/' are created by grunt-ts.
          '.tscache/'
          'src/.baseDir.ts' ]
  }  # grunt.initConfig

  #-------------------------------------------------------------------------
  grunt.loadNpmTasks 'grunt-browserify'
  grunt.loadNpmTasks 'grunt-contrib-clean'
  grunt.loadNpmTasks 'grunt-contrib-copy'
  grunt.loadNpmTasks 'grunt-contrib-jasmine'
  grunt.loadNpmTasks 'grunt-jasmine-chromeapp'
  grunt.loadNpmTasks 'grunt-ts'

  grunt.loadTasks (path.join freedomForChromePath, 'tasks')

  #-------------------------------------------------------------------------
  # Register the tasks
  taskManager.list().forEach((taskName) =>
    grunt.registerTask taskName, (taskManager.get taskName)
  );
