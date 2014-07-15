SCRIPT_DIR=${0%/*}

echo ""
echo "# Running Unit Tests"
$SCRIPT_DIR/../node_modules/.bin/mocha --ui tdd --reporter spec $SCRIPT_DIR/test_*.js

echo ""
echo "# Running Integration Tests"
$SCRIPT_DIR/integration/runtests.sh
