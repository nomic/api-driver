SCRIPT_DIR=${0%/*}

mocha --ui tdd $SCRIPT_DIR/test_*.js
