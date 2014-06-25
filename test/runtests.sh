SCRIPT_DIR=${0%/*}

$SCRIPT_DIR/../node_modules/.bin/mocha --ui tdd --reporter spec $SCRIPT_DIR/test_*.js
