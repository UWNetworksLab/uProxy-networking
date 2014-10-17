#!/bin/sh
mkdir data
pushd data
for i in 1024 2048 4096 8192 1048576 2097152 16777216
do
   dd if=/dev/urandom of=$i bs=$i count=1 status=noxfer
done
popd

