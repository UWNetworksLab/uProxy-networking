var benchmark = require('./build/benchmark/benchmark.js').Benchmark;

var runner = new benchmark.TestRunner([1024, 16384]);

runner.runTests(1);
