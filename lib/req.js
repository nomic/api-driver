'use strict';
var expector = require('./expector2'),
    _ = require('lodash'),
    Promise = require('bluebird'),
    zlib = Promise.promisifyAll(require('zlib')),
    request = Promise.promisify(require('request')),
    util = require('util'),
    assert = require('assert');

var reqAPI = {

  rootUrl: function(url) {
    return this.merge({reqOpts: {rootUrl: url}});
  },

  handler: function(fn) {
    return this.merge({handler: fn});
  },

  headers: function(headers) {
    return this.merge({headers: headers});
  },

  expect: function() {
    var args = _.toArray(arguments);
    var stack = new Error().stack;
    var expected = {};
    expected.statusCode = _.isNumber(args[0]) ? args.shift() : undefined;
    expected.body = args[0];
    assert( existy(expected.statusCode) || existy(expected.body),
            "Invalid expectation: " + util.inspect(expected));
    var expectation = function(ctx, actual) {
      actual = ctx.substitute(actual);
      return expector.expect(actual, expected, stack);
    };
    return this.merge({expectations: [expectation]});
  },

  stash: function(key, scraper) {
    scraper = scraper || _.identity;
    var stasher = function(ctx, res) {
      ctx.stash(key, scraper(res.body, res));
    };
    return this.merge({stashers: [stasher]});
  },

  log: function() {
    return this.merge({log: true});
  },

  merge: function(clauses) {
    clauses = clauses || {};
    return makeReq(_.merge(
      {},
      this._clauses,
      clauses,
      function(a, b) {
        return _.isArray(a) ? a.concat(b) : undefined;
      }
    ));
  }
};

_.each(['POST', 'PUT', 'PATCH'], function(method) {
  reqAPI[method] = function(relativeUrl, body) {
    var reqOpts = _.extend({ method: method, relativeUrl: relativeUrl, body: body });
    return this.merge({reqOpts: reqOpts});
  };
});

_.each(['DELETE', 'GET', 'HEAD'], function(method) {
  reqAPI[method] = function(relativeUrl) {
    var reqOpts = _.extend({ method: method, relativeUrl: relativeUrl});
    return this.merge({reqOpts: reqOpts});
  };
});

var clauses = {
  handler: defaultHandler,
  reqOpts: {
    rootUrl: "",
  },
  expectations: [],
  stashers: [],
  log: false
};

module.exports = {
  req: makeReq(clauses),
  ExpectationError: expector.ExpectationError
};

function makeReq(clauses) {
  function req(ctx) {
    return execReq(clauses, ctx);
  }

  req._clauses = clauses;
  return _.extend(req, reqAPI);
}

function defaultHandler(reqOpts) {
  var opts = _.omit(reqOpts, 'rootUrl', 'relativeUrl');
  opts.url = reqOpts.rootUrl + reqOpts.relativeUrl;

  if (opts.body) {
    opts.body = JSON.stringify(opts.body);
  }

  var start = new Date().getTime();
  return request(opts)
  .spread( function(response) {
    var end = new Date().getTime();
    return makeResult(
      response,
      opts.url,
      opts.jar,
      {
        reqStart: start,
        resEnd: end
      }
    );
  });
}

function execReq(clauses, ctx) {
  var reqOpts = _.extend({}, clauses.reqOpts, {jar: ctx.jarForCurrentActor()});
  return clauses.handler(reqOpts)
  .then(function(res) {
    if (clauses.log) {
      console.log("log:");
      console.log("vvvvvvvvv");
      console.log(_.pick(res, 'headers', 'body', 'text'));
      console.log("^^^^^^^^^");
    }
    return Promise.map(clauses.expectations, function(expectation) {
      return expectation(ctx, res);
    })
    .then(function() {
      _.map(clauses.stashers, function(stasher) {
        stasher(ctx, res);
      });
    })
    .then(function() {
      ctx.expectationsPassed += clauses.expectations.length;
      return ctx;
    });
  });
}

function decode(data, encoding) {
  return (
    encoding === 'gzip'
      ? zlib.gunzipAsync(data)
      : encoding === 'deflate'
        ? zlib.inflateAsync(data)
        : Promise.resolve(data)
  )
  .then(function(decoded) {
    return decoded && decoded.toString("utf8");
  });
}

function makeResult(response, url, jar, profile) {
  profile = _.clone(profile);
  profile.size = response.body.length;
  return decode(
    response.body,
    response.headers['content-encoding']
  ).then(function(decoded) {
    profile.sizeDecoded = decoded.length;

    var result = {};
    result.text = decoded || null;
    try {
      result.body = JSON.parse(result.text);
    } catch(e) {
      result.body = result.text;
    }
    result.response = response;
    result.headers = response.headers;
    result.statusCode = response.statusCode;
    result.profile = profile;
    return result;
  });
}

function existy(val) {
  return (val !== undefined && val !== null);
}

