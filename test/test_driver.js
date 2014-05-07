"use strict";
/*global suite: false, test: false, setup: false*/

var drive = require("../index"),
    expector = drive.expector,
    assert = require("assert"),
    Q = require("q");

var SUCCESS_BODY = {result: "success"};
var SUCCESS_RESPONSE = {statusCode: 200, json: SUCCESS_BODY};
var FAILURE_RESPONSE = {statusCode: 400, json: {result: "failure"}};
var NOT_FOUND_RESPONSE = {statusCode: 404, json: {result: "not found"}};

function makeRequestFake(memo) {

  function responseFake(opts) {
    return Q.all([{
      statusCode: opts.statusCode,
      body: JSON.stringify(opts.json),
      headers: opts.headers || []
    }]);
  }

  function hasPath(req, path) {
    return (req.uri.slice(-path.length, req.uri.length) === path);
  }

  function requestFake(opts) {
    var req = opts;
    memo.lastReq = req;

    if (hasPath(req, "fail")) {
      return responseFake(FAILURE_RESPONSE);
    }
    if (hasPath(req, "succeed")) {
      return responseFake(SUCCESS_RESPONSE);
    }
    if (hasPath(req, "return")) {
      return responseFake({statusCode: 200, json:req.body});
    }
    if (hasPath(req, "error")) {
      return Q.fcall(function() { throw new Error(); });
    }

    return responseFake(NOT_FOUND_RESPONSE);
  }

  return requestFake;
}

var assertDriverFailure = function(driver, expected, done) {
  driver.results(function(__, results) {
    var err = results.err;
    if (!err && !expected) {
      return done();
    }
    assert.ok(err && expected);
    assert.strictEqual(err.name, expected.name);
    done();
  });
};

var assertDriverError = function(driver, expected, done) {
  driver.results(function(err) {
    if (!err && !expected) {
      return done();
    }
    assert.ok(err && expected);
    assert.strictEqual(err.name, expected.name);
    done();
  });
};

var assertDriverResults = function(driver, expected, done) {
  driver.results(function(__, result) {
    assert.deepEqual(result, expected);
    done();
  });
};

var assertDriverOutput = function(driver, error, result, done) {
  assertDriverError(driver, error, function() {
    assertDriverResults(driver, result, done);
  });
};

var assertCalls = function(driver, method, reqMemo, done) {
  driver.results( function() {
    assert.strictEqual(method, reqMemo.lastReq.method);
    done();
  });
};

var assertRequested = function(driver, req, reqMemo, done) {
  driver.results( function() {
    assert.strictEqual(req.method, reqMemo.lastReq.method);
    assert.deepEqual(JSON.stringify(req.body), reqMemo.lastReq.body);
    done();
  });
};

var skip = function(name) {
  return function() {
    console.log("Skipping suite "+name+", it's busted.");
  };
};

suite("Driver Basics", function() {

  var reqMemo = {};

  setup(function() {
    drive.testing.setHttpRequestFake(makeRequestFake(reqMemo));
  });

  test("create a driver", function(done) {
    var driver = drive.driver();
    assert.ok(driver);
    done();
  });

  test("introduce a user driver", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user");
    assert.ok(driver);
    done();
  });

  test("must call introduce first", function(done) {
    var driver = drive.driver();
    assert.throws( function() {
      driver.as("user");
    }, Error);
    done();
  });

  test("error making http request is handled", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("error");

    assertDriverOutput(driver, new Error(), null, done);
  });

  test("successful http request", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed");

    assertDriverOutput(driver,  null, {expectationsPassed:0, expectationsFailed:0}, done);
  });

  test("successful expectation", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed")
      .expect(200, SUCCESS_BODY);

    assertDriverResults(driver, {expectationsPassed:1, expectationsFailed:0}, done);
  });

  test("ok passes", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed")
      .ok();

    assertDriverOutput(driver, null, {expectationsPassed:0, expectationsFailed:0}, done);
  });


  test("http calls made", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed");

    assertCalls(driver, "GET", reqMemo, function() {

      driver.POST();
      assertCalls(driver, "POST", reqMemo, function() {

        driver.PUT();
        assertCalls(driver, "PUT", reqMemo, function() {

          driver.DELETE();
          assertCalls(driver, "DELETE", reqMemo, done);
        });
      });
    });
  });

  test("failed expectation", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("fail")
      .expect(200);

    assertDriverFailure(driver, expector.statusFail(400, 200), done);
  });

  test("extend api with request", function(done) {
    var api = drive.api;

    api.namespace("foo", "description", function() {
      api.request("bar", function(value) {
        return api.POST("return", {value : value});
      });
    });

    var driver = drive.driver();
    driver
      .introduce("user")
      .foo.bar("baz")
      .expect(200, {value : "baz"});

    assertRequested(driver, {method:"POST", body: { value: "baz" } }, reqMemo, done);
  });

});



suite("Stashing", function() {
  var reqMemo = {};

  setup(function() {
    drive.testing.setHttpRequestFake(makeRequestFake(reqMemo));
  });

  test("submit stashed value", function(done) {
    var driver = drive.driver();
    driver
      .stash("obj", {value: "foo"})
      .introduce("user")
      .POST("succeed", ":obj")
      .results(function(){
        assert.deepEqual(JSON.parse(reqMemo.lastReq.body), {value: "foo"});
        done();
      });
  });

  test("exception on undefined stash name", function(done) {
    var driver = drive.driver();
    try {
      driver
        .introduce("user")
        .GET("succeed")
        .expect(200, ":bogus");
    } catch (err) {
      assert(/stash/.test(err.toString()));
      return done();
    }
    assert(false, "Expected an exception to be thrown");
  });

  test("stash and use a request result", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed")
      .stash("result")
      .POST("succeed", ":result");

    assertDriverError(driver, null, done);
  });

});
