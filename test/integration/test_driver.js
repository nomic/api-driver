"use strict";
/*global suite: false, test: false, setup: false*/

var drive = require("../../index"),
  // Use 'want' so as not to confuse with driver.expect
  want = require('chai').expect;

suite("Driver Basics", function() {

  function wantNoFailures(done) {
    return function (err, result) {
      want(err).to.equal(null);
      want(
        result.err,
        result.err && result.err.stack
      ).to.equal(undefined);
      want(result.expectationsFailed).to.equal(0);
      done();
    };
  }

  var driver;

  setup(function(done) {
    driver = drive.driver();
    driver
      .config({
        requestEndpoint: "http://localhost:3333",
        requestHeaders: {
          "Content-Type": "application/json"
        }
      })
      .results(done);
  });

  test("Check a 200", function(done) {
    driver
      .introduce('ella')
      .GET('/')
      .expect(200)
      .results(wantNoFailures(done));
  });

  test("Check body", function(done) {
    driver
      .introduce('ella')
      .GET('/')
      .expect({title: "$exists"})
      .results(wantNoFailures(done));
  });

  test("Check 200 and Body", function(done) {
    driver
      .introduce('ella')
      .GET('/')
      .expect(200, {title: "$exists"})
      .results(wantNoFailures(done));
  });

  test("Check function expectation args", function(done) {
    driver
      .introduce('ella')
      .GET('/')
      .expect(function(body, response) {
        want(body).to.have.ownProperty('title');
        want(response).to.have.ownProperty('statusCode');
      })
      .results(wantNoFailures(done));
  });

});
