SCRIPT_DIR=${0%/*}
export DUMMY_APP_PORT=3333;

node $SCRIPT_DIR/dummy_app/app &

# wait for dummy app to come up
while true
do
  curl --silent localhost:$DUMMY_APP_PORT && break
  sleep 0.1
done

mocha --ui tdd --reporter spec $SCRIPT_DIR/test_*.js
kill `cat $SCRIPT_DIR/dummy_app/.pid`
