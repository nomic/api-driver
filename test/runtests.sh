SCRIPT_DIR=${0%/*}

echo ""
echo "# Running Unit Tests"
mocha --ui tdd --reporter spec $SCRIPT_DIR/test_*.js

echo ""
echo "# Running Integration Tests"
$SCRIPT_DIR/integration/runtests.sh