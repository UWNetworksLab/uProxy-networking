// benchmark.ts benchmarks the proxy
// import shhtp = require('socks5-http-client');
// import Socks5ClientHttpAgent = require('socks5-http-client/lib/Agent');
/// <reference path="../third_party/typings/tsd.d.ts" />
var request = require('request');

console.log("BENCHMARK Loading");

var Benchmark;
(function (Benchmark) {
    var Bucket = (function () {
        function Bucket(up, cnt) {
            this.upperLimit = up;
            this.count = cnt;
        }
        return Bucket;
    })();
    ;

    var Histogram = (function () {
        function Histogram(nbuckets) {
            this.buckets_ = new Array();
            this.count_ = 0;
            this.min_ = 0;
            this.max_ = 0;
            for (var i = 0; i < nbuckets; i++) {
                this.buckets_[i] = new Bucket(Math.pow(2, i), 0);
            }
        }
        Histogram.prototype.addValue = function (num) {
            // This isn't fast.
            var i = 0;
            if (num < this.min_) {
                this.min_ = num;
            }
            if (num > this.max_) {
                this.max_ = num;
            }
            while (i < this.buckets_.length) {
                if (num < this.buckets_[i].upperLimit) {
                    this.buckets_[i].count++;
                    return;
                }
            }
        };

        Histogram.prototype.addValues = function (nums) {
            for (var i = 0; i < nums.length; i++) {
                this.addValue(nums[i]);
            }
            return this;
        };
        Histogram.prototype.getValues = function () {
            return this.buckets_;
        };
        Histogram.prototype.getMin = function () {
            return this.min_;
        };
        Histogram.prototype.getMax = function () {
            return this.max_;
        };
        return Histogram;
    })();
    ;

    var Result;
    (function (Result) {
        Result[Result["RES_SUCCESS"] = 0] = "RES_SUCCESS";
        Result[Result["RES_FAILURE"] = 1] = "RES_FAILURE";
        Result[Result["RES_TIMEOUT"] = 2] = "RES_TIMEOUT";
    })(Result || (Result = {}));
    ;

    var DataVector = (function () {
        function DataVector() {
            this.values_ = [
                new Array(),
                new Array(),
                new Array()
            ];
        }
        DataVector.prototype.addValue = function (latency, result) {
            this.values_[result].push(latency);
        };
        return DataVector;
    })();
    ;

    var TestRunner = (function () {
        function TestRunner(sizes) {
            // TODO(lally): Size concurrency for underlying runtime.
            this.kConcurrency = 1;
            this.sockOpts = {
                proxy: {
                    ipaddress: "localhost",
                    socksPort: 9999,
                    type: 5
                },
                target: {
                    host: "localhost",
                    port: 8080
                },
                command: 'connect'
            };
            this.latencies_ = new Array();
            this.sizes_ = sizes;
            this.request_queue_ = [];
            for (var i = 0; i < sizes.length; i++) {
                this.latencies_.push(new DataVector);
            }
        }
        TestRunner.prototype.startRequest = function (sizeIndex) {
            var request_time = Date.now();
            var size = this.sizes_[sizeIndex];
            request({
                url: 'http://localhost:8080/' + size
            }, function (err, response, body) {
                var request_in_error;
                var result_time = Date.now();
                request_in_error = err != 0;

                // first verify that the body is fully-formed
                if (body.length != size) {
                    request_in_error = true;
                }
                var latency_ms = result_time - request_time;

                // TODO(lally): Look up error codes for this.
                if (request_in_error) {
                    this.latencies_[sizeIndex].addValue(latency_ms, 1 /* RES_FAILURE */);
                } else {
                    this.latencies_[sizeIndex].addValue(latency_ms, 0 /* RES_SUCCESS */);
                }
                this.runATest();
            });
        };

        TestRunner.prototype.runATest = function () {
            if (this.request_queue_.length > 0) {
                var queue_head = this.request_queue_[0];
                this.request_queue_.shift();
                this.startRequest(queue_head);
            }
        };

        TestRunner.prototype.runTests = function (numPerSize) {
            var result = { raw: {}, histogram: {} };

            for (var sz = 0; sz < this.sizes_.length; sz++) {
                for (var run = 0; run < numPerSize; run++) {
                    this.request_queue_.push(sz);
                }
            }

            for (var c = 0; c < this.kConcurrency; c++) {
                this.runATest();
            }

            for (var sz = 0; sz < this.sizes_.length; sz++) {
                var key = "" + this.sizes_[sz];
                result.raw[key] = {
                    "SUCCESS": this.latencies_[sz].values_[0],
                    "FAILURE": this.latencies_[sz].values_[1],
                    "TIMEOUT": this.latencies_[sz].values_[2]
                };
                var success = new Histogram(16);
                var failure = new Histogram(16);
                var timeout = new Histogram(16);
                success.addValues(this.latencies_[sz].values_[0]);
                failure.addValues(this.latencies_[sz].values_[1]);
                timeout.addValues(this.latencies_[sz].values_[2]);
                result.histogram[key] = {
                    "SUCCESS": success,
                    "FAILURE": failure,
                    "TIMEOUT": timeout
                };
            }
            return result;
        };
        return TestRunner;
    })();
    Benchmark.TestRunner = TestRunner;
    ;
})(Benchmark || (Benchmark = {}));
