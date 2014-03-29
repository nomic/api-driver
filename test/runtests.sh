SCRIPT_DIR=${0%/*}

mocha --ui tdd --reporter spec $SCRIPT_DIR/test_*.js
