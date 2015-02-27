#!/bin/bash

# Make sure an error in this script stops it running where the error happened.
set -e

# Get the directory where this script is and set ROOT_DIR to that path. This
# allows script to be run from different directories but always act on the
# directory it is within.
ROOT_DIR="$(cd "$(dirname $0)"; pwd)";

# A simple bash script to run commands to setup and install all dev dependencies
# (including non-npm ones)
function runCmd ()
{
    echo "Running: $1"
    echo
    $1
}

function clean ()
{
  runCmd "rm -r node_modules build .tscache"
}

function installTools ()
{
  runCmd "cp -r node_modules/uproxy-lib/build/tools build/"
}

function installThirdParty ()
{
  runCmd "bower install"
  runCmd "node_modules/.bin/tsd reinstall --config ./third_party/tsd.json"
  runCmd "grunt copy:thirdParty"
}

function installDevDependencies ()
{
  runCmd "npm install"
  runCmd "mkdir -p build"
  installThirdParty
}

runCmd "cd $ROOT_DIR"

if [ "$1" == 'install' ]; then
  installDevDependencies
elif [ "$1" == 'tools' ]; then
  installTools
elif [ "$1" == 'third_party' ]; then
  installThirdParty
elif [ "$1" == 'clean' ]; then
  clean
else
  echo "Useage: setup.sh [install|tools|clean]"
  echo "  install       Installs 'node_modules' and 'build/third_party'"
  echo "  tools         Installs build tools into 'build/tools'"
  echo "  third_party   Installs 'build/third_party'"
  echo "  clean         Removes all dependencies installed by this script."
  echo
  exit 0
fi
