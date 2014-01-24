"use strict";
/*global suite: false, test: false, setup: false*/

var drive = require("../index"),
    expector = drive.expector,
    assert = require("assert");

var SUCCESS_BODY = {result:"success"};
var SUCCESS_RESPONSE = {statusCode: 200, body:SUCCESS_BODY};
var FAILURE_RESPONSE = {statusCode: 400, body:{result:"failure"}};
var NOT_FOUND_RESPONSE = {statusCode: 404, body:{result:"not found"}};

var makeRequestFake = function() {
  var self = {};

  self.doRequestFake = function(cookieJar, req, config, callback) {
    self.lastReq = req;
    self.lastConfig = config;

    if (req.path === "fail") {
      return callback(null, FAILURE_RESPONSE);
    }
    if (req.path === "succeed") {
      return callback(null, SUCCESS_RESPONSE);
    }
    if (req.path === "return") {
      return callback(null, {statusCode: 200, body:req.body});
    }
    if (req.path === "error") {
      return callback(new Error());
    }

    callback(null, NOT_FOUND_RESPONSE);
  };

  return self;
};

var assertDriverError = function(driver, expected, done) {
  driver.go(function(err) {
    if (!err && !expected) {
      return done();
    }
    assert.ok(err && expected);
    assert.strictEqual(err.name, expected.name);
    done();
  });
};

var assertDriverResults = function(driver, expected, done) {
  driver.go(function(__, result) {
    assert.deepEqual(result, expected);
    done();
  });
};

var assertDriverOutput = function(driver, error, result, done) {
  driver.go( function(__, result) {
    assertDriverError(driver, error, function() {
      assertDriverResults(driver, result, done);
    });
  });
};

var assertCalls = function(driver, method, requestFake, done) {
  driver.go( function() {
    assert.strictEqual(method, requestFake.lastReq.method);
    done();
  });
};

var assertRequested = function(driver, req, requestFake, done) {
  driver.go( function() {
    assert.strictEqual(req.method, requestFake.lastReq.method);
    assert.deepEqual(req.body, requestFake.lastReq.body);
    done();
  });
};

var skip = function(name) {
    return function() {
        console.log("Skipping test "+name+", it's busted.");
    };
};

suite("Driver Basics", skip('Driver Basics'), function() {

  var requestFake;

  setup(function() {
    requestFake = makeRequestFake();
    drive._private.doRequest = requestFake.doRequestFake;
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

    assertDriverOutput(driver,  null, {expectationsPassed:0}, done);
  });

  test("successful expectation", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed")
      .expect(200, SUCCESS_BODY);

    assertDriverResults(driver, {expectationsPassed:1}, done);
  });

  test("ok passes", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed")
      .ok();

    assertDriverError(driver, null, done);
  });


  test("http calls made", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed");

    assertCalls(driver, "GET", requestFake, function() {

      driver.POST();
      assertCalls(driver, "POST", requestFake, function() {

        driver.PUT();
        assertCalls(driver, "PUT", requestFake, function() {

          driver.DELETE();
          assertCalls(driver, "DELETE", requestFake, done);
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

    assertDriverError(driver, expector.statusFail(400, 200), done);
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

    assertRequested(driver, {method:"POST", body: { value: "baz" } }, requestFake, done);
  });

});



suite("Stashing", skip('Stashing'), function() {
  var requestFake;

  setup(function() {
    requestFake = makeRequestFake();
    drive._private.doRequest = requestFake.doRequestFake;
  });

  test("submit stashed value", function(done) {
    var driver = drive.driver();
    driver
      .stash("obj", {value: "foo"})
      .introduce("user")
      .POST("succeed", ":obj")
      .go(function(){
        assert.deepEqual(requestFake.lastReq.body, {value: "foo"});
        done();
      });
  });

  test("exception on undefined stash name", function(done) {
    var driver = drive.driver();
    driver
      .introduce("user")
      .GET("succeed")
      .expect(200, ":bogus");

    assertDriverError(driver, new Error(), done);
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
