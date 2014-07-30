'use strict';
/*global suite: false, test: false, setup: false*/
/*jshint expr: true*/
var chai = require('chai'),
  expect = chai.expect,
  assert = chai.assert,
  Promise = require('bluebird'),
  driver = require('../index'),
  ContextError = driver.ContextError,
  ExpectationError = driver.ExpectationError,
  step = driver.step, as = driver.as, req = driver.req,
  sequentially = driver.sequentially, concurrently = driver.concurrently,
  eventually = driver.eventually, introduce = driver.introduce,
  wait = driver.wait;


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
    return sequentially(
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
    return sequentially(
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
    return sequentially(
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
    var urlParts = opts.relativeUrl.split('/');
    var body = opts.body;
    return Promise.try(function() {
      if ('status' === urlParts[1]) {
        var statusCode = urlParts[2];
        return {
          statusCode: parseInt(statusCode, 10)
        };
      }
      if ('reflect' === urlParts[1]) {
        return {
          statusCode: 200,
          body: body
        };
      }
      if ('reflectUrl' === urlParts[1]) {
        return {
          statusCode: 200,
          body: {url: (opts.rootUrl || "") + opts.relativeUrl}
        };
      }
    });
  }

  test('passing expectation', function() {
    return req
      .GET('/status/204')
      .expect(204)
      (new driver.Context());
  });

  test('failing expectation', function() {
    return req
      .GET('/status/204')
      .expect(200)
      (new driver.Context())
      .catch(ExpectationError, function(err) {
        return err;
      });
  });

  test('failing first expectation', function() {
    return req
      .GET('/status/204')
      .expect(200)
      .expect(204)
      (new driver.Context())
      .catch(ExpectationError, function(err) {
        return err;
      });
  });

  test('expectation on body', function() {
    return req
      .POST('/reflect', {foo: 'bar'})
      .expect({foo: 'bar'})
      (new driver.Context());
  });

  test('expectation on status and body', function() {
    return req
      .POST('/reflect', {foo: 'bar'})
      .expect(200, {foo: 'bar'})
      (new driver.Context());
  });

  test('expectation on fn', function() {
    return req
      .POST('/reflect', {foo: 'bar'})
      .expect(function(res) {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.eql({foo: 'bar'});
      })
      (new driver.Context());
  });

  test('expectation on status and fn', function() {
    return req
      .POST('/reflect', {foo: 'bar'})
      .expect(200, function(res) {
        expect(res.statusCode).to.equal(200);
        expect(res.body).to.eql({foo: 'bar'});
      })
      (new driver.Context());
  });

  test('stash', function() {
    return sequentially(
      req
        .POST('/reflect', {foo: 'bar'})
        .stash('result'),

      concurrently(
        req
          .POST('/reflect', {nested: ':result'})
          .expect({ nested: { foo: 'bar'} }),
        req
          .POST('/reflect', {nested: ':result'})
          .expect({nested: ':result'}),
        req
          .POST('/reflectUrl/:result.foo')
          .expect({ url: '/reflectUrl/bar' })
      )

    )(new driver.Context());
  });

  test('stash with scraping function', function() {
    return sequentially(
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
  test('sequentially', function() {

    return sequentially(
      function(ctx) {ctx.counter = 1; return ctx;},
      function(ctx) {ctx.counter++; return ctx;},
      function(ctx) {expect(ctx.counter).to.equal(2); }
    )(new driver.Context());
  });

  test('sequentially with array', function() {

    return sequentially([
      function(ctx) {ctx.counter = 1; return ctx;},
      function(ctx) {ctx.counter++; return ctx;},
      function(ctx) {expect(ctx.counter).to.equal(2); }
    ])(new driver.Context());
  });

  test('steps', function() {

    return sequentially(
      step('Do something',
          function(ctx) {ctx.counter = 1; return ctx;}
      ),
      step('Then do this',
        sequentially(
          function(ctx) {ctx.counter++; return ctx;},
          function(ctx) {expect(ctx.counter).to.equal(2); }))
    )(new driver.Context());
  });

  test('concurrently', function() {
    var val = null;
    return concurrently(
      function(ctx) {
        return Promise.delay(20)
        .then(function() { val = 'delayed'; return ctx; });
      },
      function(ctx) {val = 'immediate'; return ctx;},
      function(ctx) {
        return Promise.delay(10)
        .then(function() {
          expect(val).to.equal('immediate');
          return ctx;
        });
      }
    )(new driver.Context());
  });

  test('concurrently with array', function() {

    return concurrently([
      function(ctx) { return ctx; },
      function(ctx) { return ctx; }
    ])(new driver.Context());
  });

  test('eventually', function() {

    var tries = 0;
    return eventually(
      function(ctx) {
        if (tries++ < 3) {
          throw new Error();
        }
        return ctx;
      }
    )(new driver.Context());
  });

  test('wait', function() {

    var tries = 0;
    var start = Date.now();
    return sequentially(
      wait(10),
      function() {
        expect(Date.now() - start).is.gte(10);
      }
    )(new driver.Context());
  });

});


suite("Run", function() {

  test('Without context', function() {
    return driver.run(function(ctx) {
      expect(ctx.currentActor).to.exist;
    });
  });

  test('With context', function() {
    var ctx = new driver.Context();
    ctx.state = true;
    return driver.run(ctx, function(ctx) {
      expect(ctx.state).to.exist;
    });
  });

  test('With promise for context', function() {
    var ctx = new driver.Context();
    ctx.state = true;
    return driver.run(Promise.resolve(ctx), function(ctx) {
      expect(ctx.state).to.exist;
    });
  });

});

function assertIsACookieJar(obj) {
  expect(obj.getCookieString).is.a('function');
  expect(obj.setCookie).is.a('function');
}