TaskManager = require 'uproxy-lib/build/dist/build-tools/taskmanager'

#-------------------------------------------------------------------------
# The top level tasks. These are the highest level grunt-tasks defined in terms
# of specific grunt rules below and given to grunt.initConfig
taskManager = new TaskManager.Manager();

taskManager.add 'default', [ 'dev' ]

taskManager.add 'dev', [
  'copy:thirdParty'
  'copy:typescriptLibs'
  'copy:dev'
  'ts:devInModuleEnv'
  'ts:devInCoreEnv'
]

taskManager.add 'tcp-integration-test', [
  'dev'
  'copy:freedomLibsForIntegrationTestTcp'
  'browserify:'
]

Rules = require 'uproxy-lib/build/dist/build-tools/common-grunt-rules'
devBuildDir = 'build/dev'
Rule = new Rules.Rule({devBuildDir: devBuildDir});

path = require('path');
uproxyLibPath = path.dirname(require.resolve('uproxy-lib/package.json'))
ipaddrjsPath = path.dirname(require.resolve('ipaddr.js/package.json'))
# TODO(ldixon): update utransformers package to uproxy-obfuscators
# uproxyObfuscatorsPath = path.dirname(require.resolve('uproxy-obfuscators/package.json'))
uproxyObfuscatorsPath = path.dirname(require.resolve('utransformers/package.json'))
regex2dfaPath = path.dirname(require.resolve('regex2dfa/package.json'))
# Cordova testing
ccaPath = path.dirname(require.resolve('cca/package.json'))
pgpPath = path.dirname(require.resolve('freedom-pgp-e2e/package.json'))

#-------------------------------------------------------------------------
module.exports = (grunt) ->
  grunt.initConfig {
    pkg: grunt.file.readJSON 'package.json'

    copy:
      # Copy local |third_party| files into dev: so that the third_party
      # dependencies are always in the common |build/third_party| location. This
      # allows path to reference typescript definitions for ambient contexts to
      # always be found, even in generated `.d.ts` files..
      thirdParty:
        files: [
          {
              nonull: true,
              expand: true,
              src: ['third_party/**/*'],
              dest: 'build/',
              onlyIf: 'modified'
          }
        ]
      # Copy releveant non-typescript files to dev build.
      typescriptLibs:
        files: [
          # Copy distribution directory of uproxy-lib into the fixed build/dev
          # location, so all paths can always find their dependencies.
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyLibPath, 'build/dist'),
              src: ['**/*'],
              dest: 'build/dev/',
              onlyIf: 'modified'
          },
          # Use the third_party definitions from uproxy-lib. Copied to the same
          # location relative to their compiled location in uproxy-lib so they
          # have the same relative path to the created `.d.ts` files from
          # |build/dev|.
          {
              nonull: true,
              expand: true,
              cwd: path.join(uproxyLibPath, 'build/third_party'),
              src: ['freedom-typings/**/*'],
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
              nonull: true,
              expand: true,
              cwd: 'src/',
              src: ['**/*', '!**/*.ts'],
              dest: devBuildDir,
              onlyIf: 'modified'
          }
        ]
      # Copy releveant non-typescript files to distribution build.
      dist:
        files: [
          {
              nonull: true,
              expand: true,
              cwd: devBuildDir,
              src: ['**/*',
                    '!**/*.spec.js',
                    '!**/*.spec.*.js'],
              dest: 'build/dist/',
              onlyIf: 'modified'
          }
        ]

      # Copy the freedom output file to sample apps
      freedomLibsForIntegrationTestTcp:
        Rule.copyFreedomLibs 'freedom', ['loggingprovider'],
          'integration-tests/tcp/'

    # Typescript compilation rules
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

    jasmine:
      arraybuffers: Rule.jasmineSpec 'arraybuffers'
      buildTools: Rule.jasmineSpec 'build-tools'
      handler: Rule.jasmineSpec 'handler'
      logging: Rule.jasmineSpec 'logging'
      loggingProvider: Rule.jasmineSpec 'loggingprovider'
      webrtc: Rule.jasmineSpec 'webrtc'

    browserify:
      # Browserify freedom-modules in the library
      churnPipeFreedomModule: Rule.browserify 'churn-pipe/freedom-module'
      echoFreedomModule: Rule.browserify 'echo/freedom-module'

      # Browserify specs
      integrationTcpFreedomModule:
        Rule.browserify 'integration-tests/tcp/freedom-module'
      integrationTcpSpec:
        Rule.browserifySpec 'integration-tests/tcp/tcp.core-env.spec.ts'

      integrationSocksEchoFreedomModule:
        Rule.browserify 'integration-tests/socks-echo/freedom-module'
      integrationSocksEchoChurnSpec:
        Rule.browserifySpec 'integration-tests/socks-echo/churn.core-env.spec.ts'
      integrationSocksEchoNochurnSpec:
        Rule.browserifySpec 'integration-tests/socks-echo/nochurn.core-env.spec.ts'
      integrationSocksEchoSlowSpec:
        Rule.browserifySpec 'integration-tests/socks-echo/slow.core-env.spec.ts'
      # Browserify sample apps main freedom module and core environments

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

  #-------------------------------------------------------------------------
  # Register the tasks
  taskManager.list().forEach((taskName) =>
    grunt.registerTask taskName, (taskManager.get taskName)
  );
