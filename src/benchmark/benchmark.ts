// benchmark.ts benchmarks the proxy

/// <reference path="../third_party/typings/tsd.d.ts" />
import request = require('request');
// import shhtp = require('socks5-http-client');
import shttpagent = require('socks5-http-client/lib/Agent');

// declare var bootbox: any;

console.log("BENCHMARK Loading");

export module Benchmark {
    export class Bucket {
        upperLimit : number;
        count : number;
        constructor(up : number, cnt : number) {
            this.upperLimit = up;
            this.count = cnt;
        }
    };

    export class BasicStats {
        max : number;
        min : number;
        mean : number;
        median : number;
        constructor(values: number[]) {
            this.min = values[0];
            this.max = values[0];
            var sum = 0;
            var n = values.length;
            for (var i = 0; i < n; i++) {
                sum += values[i];
                if (values[i] < this.min) {
                    this.min = values[i];
                }
                if (values[i] > this.max) {
                    this.max = values[i];
                }
            }
            var sortedArray: number[] = values.sort((n1,n2) => n1 - n2);
            this.median = sortedArray[n / 2];
            this.mean = sum / n;
        }

        public summary () : string {
            return "[min:" + this.min + "/median:" + this.median + "/mean:" +
                this.mean + "/max:" + this.max + "]";
        }
    };

    export class Histogram {
        private buckets_ : Bucket[];
        private count_ : number;

        constructor(nbuckets:number, max : number) {
            this.buckets_ = new Array<Bucket>();
            this.count_ = 0;
            var step = max / nbuckets;
            for (var i = 0; i < nbuckets - 1; i++) {
                this.buckets_[i] = new Bucket(step * i, 0);
            }
            // TODO(lally): replace with MAXINT
            this.buckets_[nbuckets - 1] = new Bucket(Number.MAX_VALUE, 0);
        }

        public addValue(num : number) : void {
            // This isn't fast.
            var i = 0;
            while (i < this.buckets_.length) {
                if (num < this.buckets_[i].upperLimit) {
                    this.buckets_[i].count++;
                    return;
                }
            }
        }

        public addValues(nums : number[]) : Histogram {
            for (var i = 0; i < nums.length; i++) {
                this.addValue(nums[i]);
            }
            return this;
        }

        public getValues() : Bucket[] {
            return this.buckets_;
        }
    };

    // Request result.  We separate out timeouts from the general
    // class of failure, as it probably indicates a bug in the SUT's
    // implementation.
    export enum Result {
        RES_SUCCESS,
        RES_FAILURE,
        RES_TIMEOUT
    };

    export class DataVector {
        public values : Array<number>[];
        constructor() {
            this.values = [
                new Array<number>(),  // RES_SUCCESS
                new Array<number>(),  // RES_FAILURE
                new Array<number>(),  // RES_TIMEOUT
            ];
        }

        addValue(latency: number, result: Result) {
            this.values[result].push(latency);
        }

        addValues(latencies: number[], result: Result) {
            for (var i = 0; i < latencies.length; i++) {
                this.values[result].push(latencies[i]);
            }
        }
    };

    export class TestResult {
        public raw : DataVector;
        public histogram : Histogram[];
        constructor(successes: number[],
                    failures: number[],
                    timeouts: number[],
                    nbuckets: number,
                    max: number) {
            this.raw = new DataVector();
            this.histogram = new Array<Histogram>();
            var suc_hist = new Histogram(nbuckets, max);
            var fail_hist = new Histogram(nbuckets, max);
            var to_hist = new Histogram(nbuckets, max);

            suc_hist.addValues(successes);
            fail_hist.addValues(failures);
            to_hist.addValues(timeouts);

            this.histogram.push(suc_hist);
            this.histogram.push(fail_hist);
            this.histogram.push(to_hist);

            this.raw.addValues(successes, Result.RES_SUCCESS);
            this.raw.addValues(failures, Result.RES_FAILURE);
            this.raw.addValues(timeouts, Result.RES_TIMEOUT);
        }
    };

    export class RequestManager {
        // TODO(lally): Size concurrency for underlying runtime.
        private concurrency = 1;
        private histoNumBuckets = 16;
        private histoMax = 100;
        private latencies_ : DataVector[];
        private sizes_: number[];
        private request_queue_ : number[];
        private resultCallback_ : Function;

        constructor(sizes: number[]) {
            console.log("--> TestRunner(" + sizes + ")");
            this.latencies_ = new Array<DataVector>();
            this.sizes_ = sizes;
            this.request_queue_ = [];
            this.resultCallback_ = null;
            for (var i = 0; i < sizes.length; i++) {
                this.latencies_.push(new DataVector);
            }
        }

        public configureDefaults(conc: number,
                                 nbuckets: number,
                                 max: number) {
            this.concurrency = conc;
            this.histoNumBuckets = nbuckets;
            this.histoMax = max;
        }

        public startRequest(sizeIndex: number) : void {
            var request_time = Date.now();
            var size = this.sizes_[sizeIndex];
            var self = this;
            request({
                url: 'http://localhost:8080/' + size,
                agent: new shttpagent({
                    socksHost: 'localhost',
                    socksPort: 9999
                })
            }, function (err, response, body) {
                var request_in_error : boolean;
                var result_time = Date.now();
                request_in_error = err != 0;
                var latency_ms = result_time - request_time;

                // first verify that the body is fully-formed
                if (!request_in_error && body.length != size) {
                    request_in_error = true;
                }

                // TODO(lally): Look up error codes for this.
                if (request_in_error) {
                    self.latencies_[sizeIndex].addValue(latency_ms, Result.RES_FAILURE);
                    console.log("--> startRequst: got err: " + err );
                } else {
                    self.latencies_[sizeIndex].addValue(latency_ms, Result.RES_SUCCESS);
                    console.log("--> startRequst: latency: " + latency_ms + " (ms)");
                }
                self.runATest();
            });
        }

        public runATest() : void {
            if (this.request_queue_.length > 0) {
                var queue_head = this.request_queue_[0];
                this.request_queue_.shift();
                this.startRequest(queue_head);
            } else if (this.resultCallback_ != null) {
                var results = new Array<TestResult>();
                for (var sz = 0; sz < this.sizes_.length; sz++) {
                   results.push(new TestResult(this.latencies_[sz].values[0],
                                               this.latencies_[sz].values[1],
                                               this.latencies_[sz].values[2],
                                               this.histoNumBuckets,
                                               this.histoMax));
                }
                var cb = this.resultCallback_;
                this.resultCallback_ = null;
                cb(results);
            }
        }

        public runTests (numPerSize : number, callback: Function) {
            this.resultCallback_ = callback;

            //
            // Queue the tests.
            for (var sz = 0; sz < this.sizes_.length; sz++) {
                for (var run = 0; run < numPerSize; run++) {
                    this.request_queue_.push(sz);
                }
            }


            // Start them.
            for (var c = 0; c < this.concurrency; c++) {
                this.runATest();
            }
        }
    };
}  // module Benchmark
