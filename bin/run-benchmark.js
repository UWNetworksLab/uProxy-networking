var benchmark = require('../build/benchmark/benchmark.js').Benchmark;
var runner = new benchmark.RequestManager([1024]);
// babar isn't in DefinitelyTyped, I didn't feel like putting it in yet.
var babar = require('babar');

var should_sleep = true;
runner.runTests(100, function (results) {
    console.log("-------------------------------------------------------");
    console.log("  BENCHMARK COMPLETE");
    console.log("-------------------------------------------------------");
    console.log("Run of 100 tests:");
    var titles = ["Success", "Failure", "Timeout"];
    for (var sz = 0; sz < results.length; sz++) {
        console.log("  -- Request size: " + results[sz].requestSize + " bytes");
        for (var i = 0; i < 3; i++) {
            if (results[sz].raw.values[i].length > 0) {
                console.log(babar(results[sz].histogram[i].getPoints(), {
                    caption: titles[i]
                    }));
            } else {
                console.log(" No reqeusts resulted in " + titles[i]);
            }
        }
    }
   should_sleep = false;
   });

function trySleep() {
   if (should_sleep) {
     setTimeout(trySleep, 500);
   }
};

trySleep();
