#!/bin/bash

# Simple shell script to launch 10000 clients against the server at a rate of
# 200 new clients/second. Each client will wait up to 5 seconds to connect and,
# once connected, will keep its connection open for 1 second. This script
# should complete in ~50 seconds.

for i in `seq 1 10000`; do
  echo "Sending $i"
  (echo $i|nc -n 127.0.0.1 9998 -q 5 -w 1) &
  sleep 0.005
done
