"use strict";
/*global suite: false, test: false */

var driver = require("../../index"),
  as = driver.as, req = driver.req;

suite("Driver Basics", function() {

  req = req
    .rootUrl("http://localhost:3333")
    .headers({
      "Content-Type": "application/json"
    });

  test("Check for 200 and body", function() {
    return driver.run(
      as('ella',
        req
          .GET('/')
          .expect(200)
          .expect({title: "$exists"})
          .expect(200, {title: "$exists"}))
    );
  });

  test("Check a 404", function() {
    return driver.run(
      as('ella',
        req
          .GET('/bogus')
          .expect(404))
    );
  });


});
