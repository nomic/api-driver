#!/bin/bash

SCRIPT_DIR=${0%/*}
export DUMMY_APP_PORT=3333;

echo ""
echo "## Launching dummy app"
node $SCRIPT_DIR/dummy_app/app > /dev/null &

# wait for dummy app to come up
while true
do
  curl --silent localhost:$DUMMY_APP_PORT > /dev/null && break || echo -n "."
  sleep 0.1
done
echo ""

echo ""
echo "## Running tests"
mocha --ui tdd --reporter spec $SCRIPT_DIR/test_*.js

echo "## Killing dummy app"
kill `cat $SCRIPT_DIR/dummy_app/.pid`
