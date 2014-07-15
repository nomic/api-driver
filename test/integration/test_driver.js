"use strict";
/*global suite: false, test: false, setup: false*/

var driver = require("../../driver2"),
  flow = driver.flow, step = driver.step, as = driver.as, req = driver.req,
  sequence = driver.sequence, concurrence = driver.concurrence,
  eventually = driver.eventually, introduce = driver.introduce,
  expect = require('chai').expect;

suite("Driver Basics", function() {

  req = req
    .rootUrl("http://localhost:3333")
    .headers({
      "Content-Type": "application/json"
    });

  test("Check for 200 and body", function() {
    return (
      sequence(
        introduce('ella'),
        req
          .GET('/')
          .expect(200)
          .expect({title: "$exists"})
          .expect(200, {title: "$exists"})
      )(new driver.Context())
    );
  });

  test("Check a 404", function() {
    return (
      sequence(
        introduce('ella'),
        req
          .GET('/bogus')
          .expect(404)
      )(new driver.Context())
    );
  });


});
