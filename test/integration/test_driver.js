"use strict";
/*global suite: false, test: false, setup: false*/

var drive = require("../../index"),
    expector = drive.expector,
    assert = require("assert"),
    Q = require("q");

suite("Driver Basics", function() {

  var reqMemo = {};

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
      .results(done);
  });

  test("Check body", function(done) {
    driver
      .introduce('ella')
      .GET('/')
      .expect({})
      .results(done);
  });

});
