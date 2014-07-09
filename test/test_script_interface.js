'use strict';
/*global suite: false, test: false, setup: false*/
var chai = require('chai'),
  expect = chai.expect,
  assert = chai.assert,
  Promise = require('bluebird'),
  driver = require('../driver2'),
  ContextError = driver.ContextError,
  ExpectationError = driver.ExpectationError,
  flow = driver.flow, step = driver.step, as = driver.as, req = driver.req,
  sequence = driver.sequence, concurrence = driver.concurrence,
  eventually = driver.eventually, introduce = driver.introduce;


suite('Actors', function() {
  test('introduce', function() {
    var ctx = new driver.Context();
    expect(function() {
      ctx.jarFor('mia');
    }).to.throw(driver.ContextError);

    ctx = introduce('mia')(new driver.Context());
    assertIsACookieJar( ctx.jarFor('mia') );
  });

  test('multiple introductions', function() {
    return sequence(
      introduce('mia'),
      introduce('ella')
    )(new driver.Context())
    .then(function(ctx) {
      assertIsACookieJar( ctx.jarFor('mia') );
      assertIsACookieJar( ctx.jarFor('ella') );
      expect(ctx.currentActor()).to.eql('ella');
    });
  });

  test('as', function() {
    return sequence(
      introduce('mia', 'ella'),
      function(ctx) {
        expect(ctx.currentActor()).to.eql('ella');
        return ctx;
      },
      as('mia'),
      function(ctx) {
        expect(ctx.currentActor()).to.eql('mia');
      }
    )(new driver.Context());
  });

  test('as, nested', function() {
    return sequence(
      introduce('ella', 'mia'),
      as('ella',
        function(ctx) {
          expect(ctx.currentActor()).to.eql('ella');
          return ctx;
        }
      ),
      function(ctx) {
        expect(ctx.currentActor()).to.eql('mia');
        return ctx;
      }
    )(new driver.Context())
    .then(function(ctx) {
      expect(ctx.currentActor()).to.eql('mia');
    });
  });

});

suite('Requests', function() {
  req = req.handler(mockRequest);

  function mockRequest(opts) {
    var uriParts = opts.relativeUri.split('/');
    var body = opts.body;
    return Promise.try(function() {
      if ('status' === uriParts[1]) {
        var statusCode = uriParts[2];
        return {
          statusCode: parseInt(statusCode, 10)
        };
      }
      if ('reflect' === uriParts[1]) {
        return {
          statusCode: 200,
          body: body
        };
      }
    });
  }

  test('passing expectation', function() {
    return req
      .GET('/status/204')
      .expect(204)
      (new driver.Context())
      .then(function(ctx) {
        expect(ctx.expectationsPassed).to.eql(1);
      });
  });

  test('failing expectation', function() {
    return req
      .GET('/status/204')
      .expect(200)
      (new driver.Context())
      .catch(ExpectationError, function(err) {
        return err;
      });
      // .then( function(caughtError) {
      //   expect(caughtError).to.be.instanceOf(ExpectationError);
      // });
  });

  test('expectation on body', function() {
    return req
      .POST('/reflect', {foo: 'bar'})
      .expect({foo: 'bar'})
      (new driver.Context())
      .then(function(ctx) {
        expect(ctx.expectationsPassed).to.eql(1);
      });
  });

  test('expectation on status and body', function() {
    return req
      .POST('/reflect', {foo: 'bar'})
      .expect(200, {foo: 'bar'})
      (new driver.Context())
      .then(function(ctx) {
        expect(ctx.expectationsPassed).to.eql(1);
      });
  });

  test('expectation on fn', function() {
    return req
      .POST('/reflect', {foo: 'bar'})
      .expect(function(res) {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.eql({foo: 'bar'});
      })
      (new driver.Context())
      .then(function(ctx) {
        expect(ctx.expectationsPassed).to.eql(1);
      });
  });

  test('expectation on status and fn', function() {
    return req
      .POST('/reflect', {foo: 'bar'})
      .expect(200, function(res) {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.eql({foo: 'bar'});
      })
      (new driver.Context())
      .then(function(ctx) {
        expect(ctx.expectationsPassed).to.eql(1);
      });
  });

  test('stash', function() {
    return sequence(
      req
        .POST('/reflect', {foo: 'bar'})
        .stash('result'),
      req
        .POST('/reflect', {nested: ':result'})
        .expect({ nested: { foo: 'bar'} })
    )(new driver.Context());
  });

  test('stash with scraping function', function() {
    return sequence(
      req
        .POST('/reflect', {foo: 'bar'})
        .stash('result', function(body) {
          return body.foo;
        }),
      req
        .POST('/reflect', {nested: ':result'})
        .expect({ nested: 'bar' })
    )(new driver.Context());
  });

});

suite('Control Flow', function() {
  test('sequence', function() {

    return sequence(
      function(ctx) {ctx.counter = 1; return ctx;},
      function(ctx) {ctx.counter++; return ctx;},
      function(ctx) {expect(ctx.counter).to.equal(2); }
    )(new driver.Context());
  });

  test('concurrence', function() {

    return concurrence(
      function(ctx) {
        return Promise.delay(100)
        .then(function() { ctx.val = 'delayed'; return ctx; });
      },
      function(ctx) {ctx.val = 'immediate'; return ctx;},
      function(ctx) {
        return Promise.delay(50)
        .then(function() { expect(ctx.val).to.equal('immediate'); });
      }
    )(new driver.Context());
  });

});


function assertIsACookieJar(obj) {
  expect(obj.getCookieString).is.a('function');
  expect(obj.setCookie).is.a('function');
}