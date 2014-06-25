"use strict";
var Promise = require("bluebird"),
    request = require("request"),
    prequest = Promise.promisify(request),
    _ = require("underscore"),
    assert = require("assert"),
    util = require('util'),
    upload = require('./lib/upload'),
    expector = require('./lib/expector'),
    stash = require('./lib/stash'),
    url = require("url"),
    zlib = require("zlib"),
    sequential = require("./lib/dispatch").sequential,
    concurrent = require("./lib/dispatch").concurrent;

function Actor(alias) {
  this.alias = alias;
  this.jar = request.jar();
}

function Driver() {
  this._dispatcher = sequential();

  this.actors = [];
  this._active = null;  //the current actor

  this._stash = stash.makeStash();
  this._nullScribing();
  this._expectationsPassed = 0;
  this._config = {
    requestHeaders : {"Content-Type" : "application/json" },
    requestEndpoint : "http://localhost",
    delay: 0
  };

  return this;
}

Driver.prototype.config = function(opts) {
  this._config = _.extend(_.clone(this._config), opts);
  return this;
};

//
// Actor commands
//

Driver.prototype.introduce = function(alias) {
  this.actors[alias] = new Actor(alias);
  this._active = this.actors[alias];
  return this;
};


Driver.prototype.as = function(alias) {
  if(! this.actors[alias]) {
    throw new Error("Actor for alias["+alias+"] not found");
  }
  this._active = this.actors[alias];
  return this;
};


//
// Request commands
//
_.each(['POST', 'PUT', 'PATCH'], function(method) {
  Driver.prototype[method] = function(path, body, opts) {
    var req = _.extend({ method: method, path: path, body: body }, opts);
    return this.request(req);
  };
});

_.each(['DELETE', 'GET', 'HEAD'], function(method) {
  Driver.prototype[method] = function(path, opts) {
    var req = _.extend({ method: method, path: path }, opts);
    return this.request(req);
  };
});

Driver.prototype.upload = function (path, file, body, opts) {
  var req = _.extend(
    {method:"upload", path:path, body:body, file:file},
    opts
  );
  return this.request(req);
};

Driver.prototype.req = function(req) {
  trace("driver.request", req);
  if (!this._concurrent) this.wait(this._config.delay);
  this._request(req);
  return this;
};

Driver.prototype.request = Driver.prototype.req;


//
// Expectation commands
//

Driver.prototype.until = function() {
  var args =_.toArray(arguments);
  trace("driver.until", args);

  if (args.length === 3) {
    this._requestClauses.timeout = args.pop();
  }

  var stack = new Error().stack;
  var expectation = argsToExpectation(args);

  this._requestClauses.untils.push(
    this._stash.substitute(expectation)
    .then( function(exp) {
      return {
        stack: stack,
        expected: exp
      };
    })
  );

  return this;
};


Driver.prototype.never = function() {
  var args =_.toArray(arguments);
  trace("driver.never", args);

  if (args.length === 3) {
    this._requestClauses.timeout = args.pop();
  }

  var stack = new Error().stack;
  var expectation = argsToExpectation(args);

  this._requestClauses.nevers.push(
    this._stash.substitute(expectation)
    .then( function(exp) {
      return {
        stack: stack,
        expected: exp
      };
    })
  );

  return this;
};

Driver.prototype.expect = function() {
  var args =_.toArray(arguments);
  trace("driver.expect", args);

  var stack = new Error().stack;
  var expectation = argsToExpectation(args);

  this._requestClauses.expectations.push(
    this._stash.substitute(expectation)
    .then( function(exp) {
      return {
        stack: stack,
        expected: exp
      };
    })
  );

  return this;
};

//
// Stashing
//

Driver.prototype.stash = function(key /*, [stashKeys...], [fn | value]*/) {
  trace("stash:", key);
  var that = this;

  var options = _.toArray(arguments).slice(1);
  var stashable = null;
  var stashKeys = [];

  if (options.length > 0) {
    stashable = options.pop();
  }

  if (options.length > 0) {
    stashKeys = options;
  }

  this._stash.set(
    key,
    new Promise(function(resolve) {
      if (stashable && ! _.isFunction(stashable)) {
        resolve(stashable);
      } else {
        var onStashVals = stashKeys.length
          ? that._stash.substitute(stashKeys)
          : Promise.cast([]);

        that._requestClauses.stashResolvers.push(function(value) {
          var body = value.json || value.text || value;
          if (! stashable) {
            resolve(body);
          } else {
            onStashVals.then(function(stashVals) {
              resolve( stashable.apply(null, stashVals.concat([body])) );
            })
            .done();
          }
        });
      }
    })
  );
  return that;
};

Driver.prototype.clearStash = function() {
  var that = this;
  that._stash.clear();
  return this;
};

//
// Execution timing commands
//

Driver.prototype.wait = function(millis) {
  trace("driver.wait: " + millis || 0);
  millis = millis || 0;
  this._dispatcher.wait(millis);
  return this;
};

Driver.prototype.concurrent = function(fn) {
  this.wait(this._config.delay);

  var formerDispatcher = this._dispatcher;
  this._dispatcher = concurrent();
  formerDispatcher.addDispatcher(this._dispatcher);
  fn();
  this._dispatcher = formerDispatcher;
  return this;
};

//
// Debugging commands
//

Driver.prototype.log = function(stashKey) {

  if (stashKey === undefined) {
    this._requestClauses.log = true;
    return this;
  }

  stashKey = stashKey.toString().slice(1);
  this._stash.getKeyPath(stashKey)
  .then( function(stashResult) {
    logMessage(":" + stashKey + " =\n" + util.inspect(stashResult, true, null, true));
  }, function(err) {
    if (err) return logMessage(err);
  });
  return this;
};


//
// Miscellaneous commands
//

Driver.prototype.scribingOn = function(scribe) {
  this._scribe = scribe;
  return this;
};

Driver.prototype.scribingOff = function() {
  this._nullScribing();
  return this;
};

Driver.prototype.doc = function(message) {
  var that = this;
  that._scribe.doc(message);
  return this;
};

Driver.prototype.results = function(fn) {
  trace("driver.results");

  var that = this;

  // Wait for everything to finish, then consume
  // the results and reset the state of the promises
  this._dispatcher.dispatch()
  .then(function () {
    fn(null, that._consumeResults());
  }, function(err) {
    if (err instanceof expector.ExpectationError ) {
      var results = that._consumeResults();
      results.err = err;
      return fn(null, results);
    }
    fn(err, null);
  })
  .done();

  return this;

};

//
// Private Helpers
//

Driver.prototype._request = function(req) {
  var that = this;
  var actor = that._active;
  var scribeRequest = that._scribe.deferredRequest();

  // Record clauses for the new request
  var reqClauses = that._requestClauses = {
    config: that._config,
    untils: [],
    nevers: [],
    expectations: [],
    log: false,
    timeout: 10000,
    stashResolvers: [],
  };

  // We don't want a stash with names from
  // the future.
  var stash = that._stash.clone();

  defaultExpectation = null;
  if (that._config.defaultExpectation) {
    var defaultExpectation = {
      stack: new Error().stack,
      expected: {
        body: that._config.defaultExpectation
      }
    };
  }
  this.wait(that._config._delay);
  that._dispatcher.addTask(function() {
    return Promise.all([
      stash.substituteRoute(req.path || ""),
      stash.substitute(_.omit(req, "path")),
      resolveRequestClauses(reqClauses)
    ])
    .spread(function(path, reqOpts, reqClauses) {
      trace("Done waiting:", req.path);
      req = _.extend(reqOpts, {path: path});


      // Handle making a single request, or looping
      // for until or never.
      var makeRequest = _.partial(
        doRequest, actor.jar, req, reqConfig(reqClauses.config)
      );
      return (
        reqClauses.untils.length > 0
        ? doUntil(makeRequest, reqClauses.untils, 10, reqClauses.timeout)
        : reqClauses.nevers.length > 0
          ? doUntil(makeRequest, reqClauses.nevers, 10, reqClauses.timeout, true)
          : makeRequest()
      )

      // Handle .log()
      .then(function(result) {
        if (reqClauses.log) {
          logMessage(
            util.inspect(_.omit(result, 'response'), true, null, true)
          );
        }
        var expectations = reqClauses.expectations.length > 0
          ? reqClauses.expectations
          : defaultExpectation
            ? [defaultExpectation]
            : [];
        return applyExpectations(result, expectations)
        .then(function(result) {
          scribeRequest(
            actor.alias,
            req,
            result.response,
            result.json || result.text
          );
          that._expectationsPassed
            += reqClauses.untils.length
            + reqClauses.nevers.length
            + reqClauses.expectations.length;

          _.each(reqClauses.stashResolvers, function(resolver) {
            resolver(result);
          });

          return result;
        });
      }, function(err) {
        if (reqClauses.log) {
          logMessage(
            util.inspect(_.omit(err.actual, 'response'), true, null, true)
          );
        }
        throw err;
      });

    });
  });

};

Driver.prototype._consumeResults = function() {
  var results = {
    expectationsPassed : this._expectationsPassed,
  };

  this._expectationsPassed = 0;
  return results;
};

Driver.prototype._nullScribing = function() {
  var devnullScribe = function() {
    var self = {};
    self.deferredRequest = function() { return function() {}; };
    self.doc = function() {};
    return self;
  };

  this._scribe = devnullScribe();
};

exports.driver = function() { return new Driver(); };
exports.expector = expector;
exports.testing = {
  setHttpRequestFake: function(requestFn) {
    httpRequest = requestFn;
  }
};

function trace() {
  if (process.env.DRIVER_TRACE) {
    console.log.apply(console, arguments);
  }
}


function logMessage(msg) {
  console.log("log:");
  console.log("vvvvvvvvv");
  console.log(msg);
  console.log("^^^^^^^^^");
}

function _decode(data, encoding, callback) {
  if (encoding === 'gzip') {
    zlib.gunzip(data, function(err, decoded) {
      callback(err, decoded && decoded.toString("utf8"));
    });
  } else if (encoding === 'deflate') {
    zlib.inflate(data, function(err, decoded) {
      callback(err, decoded && decoded.toString("utf8"));
    });
  } else {
    callback(null, data.toString("utf8"));
  }
}
var decode = Promise.promisify(_decode);

function makeCookies(jar, url) {
  return {
    get: function(name) {
      var cookies = jar.get({url: url});
      var matches = _.where(cookies, {name: name});
      assert( matches.length < 2, "Multiple matching cookies found");

      if (matches.length === 0) return null;

      return matches[0].value;
    }
  };

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
      result.json = JSON.parse(result.text);
    } catch(e) {
      result.json = null;
    }
    result.response = response;
    result.cookies = makeCookies(jar, url);
    result.headers = response.headers;
    result.statusCode = response.statusCode;
    result.profile = profile;
    return result;
  });
}

function reqConfig(config) {
  var conf = {
    headers: config.requestHeaders,
  };
  _.extend(conf, url.parse(config.requestEndpoint));
  return conf;
}

var httpRequest = function(opts) {
  return prequest(opts);
};

function doRequest(cookieJar, req, config) {
  trace("doing request", req);

  if (req.method === "upload") {
    return doUpload(cookieJar, req, config);
  }

  var headers = _.clone(config.headers);
  _.extend(headers, req.headers ? _.clone(req.headers) : {});

  var base = (config.protocol || "http:").slice(0,-1);
  base += "://" + config.host;
  var url;
  if (req.path.slice(0,2) === "//") {
    //absolute path
    url = base + req.path.slice(1);
  } else {
    url = base + (config.path || "") + req.path;
  }

  var opts = {
    method: req.method,
    uri: url,
    headers : headers,
    jar: cookieJar
  };

  if (req.body) {
    opts.body = JSON.stringify(req.body);
  }

  if (req.form) {
    opts.form = req.form;
  }
  opts.encoding = null;

  var start = new Date().getTime();
  return httpRequest(opts)
  .spread( function(response) {
    var end = new Date().getTime();
    return makeResult(
      response,
      url,
      cookieJar,
      {
        reqStart: start,
        resEnd: end
      }
    );
  });

}

function doUpload(cookieJar, req, reqconf) {
  var path = (reqconf.path || "/") + req.path;
  var headers = req.headers || {};

  return upload.upload(
    cookieJar,
    headers,
    reqconf.protocol,
    reqconf.hostname,
    reqconf.port,
    path,
    req.file,
    req.body
  )
  .spread( function(response, __, profile) {
    var url = reqconf.protocol
              + "//" + reqconf.hostname + (reqconf.port ? ":" + reqconf.port : "")
              + path;
    return makeResult(response, url, cookieJar, profile);
    // return results;
  });
}


//
// Calls <fn> repeatedly until all <expectations> are met or
// until <timeout> miliseconds has elapsed.  Waits <delay>
// seconds between calls.
//
// Returns a promise that will be resolved with <fn>s
// resolution or rejected with the final expectation error.
//
// <fn> must be a function that returns a promise.
//
// <expectations> carry the usual expect details plus
// a stack trace that indicates the line the until command
// appeard at.  That stack trace is included in the failure
// if the until times out.
//

function doUntil(fn, expectations, delay, timeout, negate) {

  // Montior time spent to compare against timeout
  var start = new Date().getTime();

  var next = function(err, result) {
    // One of the expectations failed.  Calculate remaining
    // time.

    // Out of time -- reject
    if (timeout === 0) {
      if (negate) {
        return result;
      } else {
        return Promise.reject(err);
      }
    }

    var elapsed = new Date().getTime() - start;
    var newTimeout = timeout - elapsed - delay;

    if (newTimeout < 0) {
      // Allow one more attempt at roughly the end of the timeout range
      // that doUntil was originally called with
      newTimeout = 0;
      delay = timeout;
    }

    //Not out of time, so let's delay and then try again, with
    //the updated timeout.
    return Promise.delay(delay).then(function() {
      return doUntil(fn, expectations, Math.min(delay*delay, 1000), newTimeout, negate);
    });
  };

  return fn()
  .then( function(result) {
    return Promise.all(_.map(expectations, function(exp) {
      return expector.expect(result, exp.expected, exp.stack)
      .then(function() {
        if (negate) {
          return Promise.reject(expector.fail(
            'One or more expectations succeeded which should not have',
            'Predicate Failure',
            exp.stack
          ));
        }
      }, function(err) {
        if (! negate) throw err;
      });
    }))
    .then(function() {
      return negate ? next(null, result) : result;
    }, function(err) {
      if (negate) throw err;
      return next(err);
    });
  });
}

var existy = function(val) {
  return (val !== undefined && val !== null);
};

function argsToExpectation(args) {
  args = _.clone(args);
  var expected = {};
  expected.statusCode = _.isNumber(args[0]) ? args.shift() : undefined;
  expected.body = args[0];
  assert( existy(expected.statusCode) || existy(expected.body),
          "Invalid expectation: " + util.inspect(expected));
  return expected;
}

function applyExpectations(result, expectations) {
  return Promise.all(_.map(expectations, function(expectation) {
    return expector.expect(
      result,
      expectation.expected,
      expectation.stack
    );
  }))
  .then(function() {
    return result;
  });
}

function resolveRequestClauses(requestClauses) {
  return Promise.all([
    Promise.all(requestClauses.untils),
    Promise.all(requestClauses.nevers),
    Promise.all(requestClauses.expectations)
  ]).spread( function(untils, nevers, expectations) {
    // don't do this before the promises are evaluated
    // are the driver script won't have a chance to have
    // set it yet
    var resolved = _.omit(requestClauses, "untils", "nevers", "expectations");
    resolved.untils = untils;
    resolved.nevers = nevers;
    resolved.expectations = expectations;
    return resolved;
  });
}