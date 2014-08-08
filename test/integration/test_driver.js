"use strict";
/*global suite: false, test: false */

var driver = require('../../index'),
  as = driver.as, req = driver.req,
  request = require('request'),
  expect = require('chai').expect;

suite("Driver Basics", function() {
  var endpoint = "http://localhost:3333";

  req = req
    .rootUrl(endpoint)
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

  test("Actor cookie jar", function() {
    return driver.run(
      as('ella',
        req
          .POST('/reflect/cookie', {name: 'chocolate', value: 'chip'})
          .expect(204, function(body, res) {
            expect(res.cookies[0]).to.have.property('key', 'chocolate');
            expect(res.cookies[0]).to.have.property('value', 'chip');
          }),
        function(ctx) {
          var cookies = ctx.jarForCurrentActor(request.jar)
            .getCookies(endpoint);
          expect(cookies[0]).to.have.property('key', 'chocolate');
          expect(cookies[0]).to.have.property('value', 'chip');
          return ctx;
        },
        req
          .POST('/check/cookie', {name: 'chocolate', value: 'chip'})
          .expect(204))
    );
  });

});
