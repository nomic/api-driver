"use strict";
var request = require("request"),
    Q = require("q"),
    _ = require("underscore"),
    assert = require("assert"),
    util = require('util'),
    upload = require('./lib/upload'),
    expector = require('./lib/expector'),
    stash = require('./lib/stash'),
    url = require("url"),
    zlib = require("zlib");


var trace = function() {
  if (process.env.DRIVER_TRACE) {
    console.log.apply(console, arguments);
  }
};


var logMessage = function(msg) {
  console.log("log:");
  console.log("vvvvvvvvv");
  console.log(msg);
  console.log("^^^^^^^^^");
};

var decode = function(data, encoding, callback) {
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
};

var makeCookies = function(jar, url) {
  return {
    get: function(name) {
      var cookies = jar.get({url: url});
      var matches = _.where(cookies, {name: name});
      assert( matches.length < 2,
              new Error("Driver problem: multiple matching cookies found").stack
      );

      if (matches.length === 0) return null;

      return matches[0].value;
    }
  };

};

var makeResult = function(response, url, jar, profile, callback) {
  profile = _.clone(profile);
  profile.size = response.body.length;
  decode(
    response.body,
    response.headers['content-encoding'],
    function(err, decoded) {
      profile.sizeDecoded = decoded.length;
      if (err) return callback(err);

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
      callback(null, result);
    }
  );
};

var reqConfig = function(config) {
  var conf = {
    headers: config.requestHeaders,
  };
  _.extend(conf, url.parse(config.requestEndpoint));
  return conf;
};

var doRequest = function(cookieJar, req, config) {
  trace("doing request", req);

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
  var resPromise = Q.nfcall(request, opts)
  .spread( function(response) {
    var end = new Date().getTime();
    return Q.nfcall(
      makeResult,
      response,
      url,
      cookieJar,
      {
        reqStart: start,
        resEnd: end
      }
    );
  });

  return resPromise;

};

var doUpload = function(cookieJar, req, config) {
  var reqconf = reqConfig(config);

  var path = (reqconf.path || "/") + req.path;
  var headers = req.headers || {};

  return Q.nfcall( upload.upload,
                   cookieJar,
                   headers,
                   reqconf.protocol,
                   reqconf.hostname,
                   reqconf.port,
                   path,
                   req.file,
                   req.body )
  .spread( function(response, __, profile) {
    var url = reqconf.protocol
              + "//" + reqconf.hostname + (reqconf.port ? ":" + reqconf.port : "")
              + path;
    return Q.nfcall(makeResult, response, url, cookieJar, profile);
    // return results;
  });
};


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

var doUntil = function(fn, expectations, delay, timeout, negate) {
  //>>> console.log("DO UNTIL", expectations);

  // Montior time spent to compare against timeout
  var start = new Date().getTime();

  var success = function(result) {
    return result;
  };

  var next = function(err) {
    // One of the expectations failed.  Calculate remaining
    // time.
    var elapsed = new Date().getTime() - start;
    timeout -= elapsed + delay;

    // Out of time -- reject
    if (timeout < 0) {
      if (negate) {
        return null;
      } else {
        return Q.reject(err);
      }
    }

    //Not out of time, so let's delay and then try again, with
    //the updated timeout.
    return Q.delay(delay).then(function() {
      return doUntil(fn, expectations, Math.min(delay*delay, 1000), timeout, negate);
    });
  };

  return fn()
  .then( function(result) {
    var succeeded = 0;
    for (var i = 0; i < expectations.length; i++) {
      var exp = expectations[i];
      try {
        expector.expect(result, exp.expected, exp.stack);
      } catch (e) {
        if (negate) {
          continue;
        } else {
          return next(e);
        }
      }
      if (negate) {
        return Q.reject(expector.fail('One or more expectations succeeded which should not have', 'Predicate Failure', exp.stack));
      }
    }
    return negate ? next() : result;
  })
  .then(success);
};


var subUntilClauses = function(clauses, stash) {
  var expecteds = _.pluck(clauses, "expected");
  var expPromises = _.map(expecteds, _.bind(stash.substitute, stash));
  var pmap =_.map(expPromises, function(expPromise, i) {
    return expPromise.then( function(exp) {
      return {
        stack: clauses[i].stack,
        expected: exp
      };
    });
  });

  return Q.all(pmap);
};

var existy = function(val) {
  return (val !== undefined && val !== null);
};

var argsToExpectation = function(args) {
  var expected = {};
  expected.statusCode = _.isNumber(args[0]) ? args.shift() : undefined;
  expected.body = args[0];
  assert( existy(expected.statusCode) || existy(expected.body),
          "Invalid expectation: " + util.inspect(expected));
  return expected;
};

var applyExpectations = function(result, expectations) {
  _.each(expectations, function(expectation) {
    expector.expect(result, expectation.expected, expectation.stack);
  });
  return result;
};

var resolveRequestClauses = function(requestClauses) {
  var resolved = {
    log: requestClauses.log
  };
  return Q.all([
    Q.all(requestClauses.untils),
    Q.all(requestClauses.nevers),
    Q.all(requestClauses.expectations)
  ]).spread( function(untils, nevers, expectations) {
    resolved.untils = untils;
    resolved.nevers = nevers;
    resolved.expectations = expectations;
    return resolved;
  });
};



var Actor = function(alias) {
  this.alias = alias;
  this.jar = request.jar();
};


var driverExtensions = {};

/*
 *  Attatch the api methods to the driver instance;
 */
var bindExtensions = function(obj, extensions) {
  var _bindExtension = function(extension) {
    if (_.isFunction(extension)) {
      return function() {
        return extension.apply(obj, _.toArray(arguments));
      };
    }
    if (_.isObject(extension)) {
      var space = {};
      _.each(extension, function(val, key) {
        if (key.slice(0,2) !== "__") space[key] = _bindExtension(val);
      });
      return space;
    }

    // extensions should be an object graph with functions
    // for leaves;
    assert(false);
  };

  _.each(extensions, function(val, key) {
    // avoid __name
    if (key.slice(0,2) !== "__") obj[key] = _bindExtension(val);
  });

};

var Driver = function() {
  this._resetPromises();

  this.actors = [];
  this._active = null;  //the current actor

  this._stash = stash.makeStash();
  this._nullScribing();
  this._expectationsPassed = 0;
  this._expectationsFailed = 0;
  this._config = {
    requestHeaders : {"Content-Type" : "application/json" },
    delay: 0
  };
  bindExtensions(this, driverExtensions);

  return this;
};

Driver.prototype._resetPromises = function() {
  this._waiting = Q();
  this._promises = [];
};


//
// commands: the user facing api for driver.
//

var actor_commands = {};

actor_commands.introduce = function(alias) {
  this.actors[alias] = new Actor(alias);
  this._active = this.actors[alias];
  return this;
};


actor_commands.as = function(alias) {
  if(! this.actors[alias]) {
    throw new Error("Actor for alias["+alias+"] not found");
  }

  this._active = this.actors[alias];
  return this;
};



var http_commands = {};

http_commands.POST = function(path, body, headers) {
  this._handleRequest( {method:"POST", path:path, body:body, headers:headers} );
  return this;
};


http_commands.PUT = function (path, body, headers) {
  this._handleRequest( {method:"PUT", path:path, body:body, headers:headers} );
  return this;
};

http_commands.PATCH = function (path, body, headers) {
  this._handleRequest( {method:"PATCH", path:path, body:body, headers:headers} );
  return this;
};

http_commands.DELETE = function (path, headers) {
  this._handleRequest( {method:"DELETE", path:path, headers:headers} );
  return this;
};

http_commands.GET = function (path, headers) {
  this._handleRequest( {method:"GET", path:path, headers:headers} );
  return this;
};

http_commands.HEAD = function (path, headers) {
  this._handleRequest( {method:"HEAD", path:path, headers:headers} );
  return this;
};

http_commands.upload = function (path, file, body, headers) {
  this._handleRequest({method:"upload", path:path, body:body, file:file, headers:headers});
  return this;
};

http_commands.req = function(req) {
  this._handleRequest(req);
};

var assertion_commands = {};

// A quick way to assert that the request didn't end in error.  Usefult for checking
// calls that are needed for your test flow but not actually the focus of your test.
assertion_commands.ok = function() {
  this.expect(function(result) {
    assert(
      [200, 201, 202, 203, 204].indexOf(result.statusCode) != -1,
      "Expected ok (2xx), but got http status code: " + result.statusCode +
      "\nResponse Body:\n"+JSON.stringify(result.json, null, 4)
    );
    return true;
  });
  return this;
};



assertion_commands.until = function() {
  var args =_.toArray(arguments);
  trace("driver.until", args);

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


assertion_commands.never = function() {
  var args =_.toArray(arguments);
  trace("driver.never", args);

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

assertion_commands.expect = function() {
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

// assertion_commands.expect = function() {
//   var args =_.toArray(arguments);
//   trace("driver.expect", args);

//   var that = this;
//   if this._lastPromise
//   var resultPromise = expect( this._promises.pop(),
//                               argsToExpectation(args),
//                               this._stash,
//                               new Error().stack);

//   .then(function() {
//     that._expectationsPassed += 1;
//   }, function() {
//     that._expectationsFailed += 1;
//   });

//   that._promises.push(resultPromise);
//   return this;
// };


var control_commands = {};

control_commands.config = function(opts) {
  this._config = _.extend(_.clone(this._config), opts);
  return this;
};

control_commands.stash = function(key /*, [stashKeys...], [fn | value]*/) {
  trace("stash:", key);
  var that = this;

  var options = _.toArray(arguments).slice(1);
  var last = null;
  var stashKeys = [];

  if (options.length > 0) {
    last = options.pop();
  }

  if (options.length > 0) {
    stashKeys = options;
  }


  var promise;

  // We only received a stash key.  Stash the last promise away
  if (! last) {
    promise = that._lastPromise().then( function(value) {
      // return the parsed body if it exists, otherwise the text
      return value.json || value.text || value;
    });


  // We received a function.  Apply it, and stash the result.
  } else if (_.isFunction(last)) {

    var numArgsAccepted = last.length;

    // If the function accepts more args than stash keys, submit the result of our last
    // promise/request as the final arg.
    if (numArgsAccepted > stashKeys.length) {
      promise = that._lastPromise();
    } else {
      promise = Q.fcall(function(){});
    }

    promise = Q.all([that._stash.substitute(stashKeys), promise])
       .spread( function(stashVals, lastResult) {
        lastResult = lastResult && (lastResult.json || lastResult.text);
        return last.apply(null, stashVals.concat([lastResult]));
      });

  // We received a value.  Destash any stash keys in the value, then stash that result.
  } else {
    promise = that._stash.substitute(last);
  }

  that._stash.stash(key, promise);
  return that;
};

control_commands.clearStash = function() {
  var that = this;
  that._stash.clear();
  return this;
};


control_commands.wait = function(millis) {
  millis = millis || 0;
  var oldWaiting = this._waiting;
  var outstanding = [oldWaiting];
  outstanding = outstanding.concat(this._promises);
  this._promises = [];
  this._waiting = Q.all(outstanding).then(function() { return Q.delay(millis); } );
  return this;
};

control_commands.results = function(fn) {
  trace("driver.results");

  var that = this;

  // Wait for everything to finish, then consume
  // the results and reset the state of the promises
  Q.all( that._promises.concat(that._waiting).concat(that._stash.allPromises()) )
    .then( function() {
      that._resetPromises();
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


//Errr... please don't use this.  This is not a driver pattern
//that has been discussed.
control_commands.on = function(emitter, evt, fn) {
  var deferred = Q.defer();

  emitter.once(evt, function() {
    try {
      var ret = fn ? fn.apply(emitter, arguments) : undefined;
      deferred.resolve(ret);
    }
    catch (e) {
      deferred.reject(e);
      return;
    }
  });

  this._promises.push(deferred.promise);

  return this;
};

var instrument_commands = {};

instrument_commands.log = function(stashKey) {

  if (stashKey === undefined) {
    this._currentRequest.log = true;

    // this._lastPromise().then( function(data) {
    //   if (data) {
    //     // Too much junk in result.response
    //     data = _.clone(data);
    //     delete data.response;
    //     logMessage(util.inspect(data, true, null, true));
    //   }
    // }, function(err) {
    //     logMessage(err);
    //   }
    // );
    return this;
  }

  stashKey = stashKey.toString().slice(1);
  this._stash.destashKeyPath(stashKey)
  .then( function(stashResult) {
    logMessage(":" + stashKey + " =\n" + util.inspect(stashResult, true, null, true));
  }, function(err) {
    if (err) return logMessage(err);
  });
  return this;
};

instrument_commands.scribingOn = function(scribe) {
  this._scribe = scribe;
  return this;
};

instrument_commands.scribingOff = function() {
  this._nullScribing();
  return this;
};

instrument_commands.doc = function(message) {
  var that = this;
  that._scribe.doc(message);
  return this;
};

_.extend(
  Driver.prototype,
  actor_commands,
  http_commands,
  assertion_commands,
  control_commands,
  instrument_commands
);

 //
 // Helper functions for handling http reequests
 //

Driver.prototype._handleRequest = function(req) {
  trace("driver._handleRequest", req);
  if (this._delay > 0) {
    this.wait(this._delay);
  }

  var subbingPath = this._stash.substitutePath(req.path);
  var subbingRest = this._stash.substitute(_.omit(req, "path"));
  var subbingReq = Q.all([subbingPath, subbingRest])
  .spread(function(path, rest) {
    rest.path = path;
    return rest;
  });
  this._promises.push( this._handleRequestPromise(subbingReq, req) );
};

Driver.prototype._handleRequestPromise = function(reqPromise, reqTemplate) {
  trace("driver._handleRequestPromise", reqPromise);
  var that = this;
  var actor = that._active;
  var scribeRequest = that._scribe.deferredRequest();

  // Recording clauses for the new request.
  var reqClauses = that._requestClauses = {
    untils: [],
    nevers: [],
    expectations: [],
    log: false,
  };
  if (that._config.defaultExpectation) {
    var defaultExpectation = {
      stack: new Error().stack,
      expected: {
        body: that._config.defaultExpectation
      }
    };
  }

  return Q.all([reqPromise, resolveRequestClauses(reqClauses), that._waiting])
  .spread(function(req, reqClauses) {
    trace("done waiting:", req.path);

    var request = function() {
      if (req.method === "upload") {
        return doUpload(actor.jar, req, that._config);
      }
      return doRequest(actor.jar, req, reqConfig(that._config));
    };

    var resPromise = reqClauses.untils.length > 0
                     ? doUntil(request, reqClauses.untils, 10, 10000)
                     : request();

    if (reqClauses.nevers.length > 0) {
      resPromise = resPromise.then(function(result) {
        return doUntil(request, reqClauses.nevers, 10, 10000, true).then(function() {
          return result;
        });
      });
    }

    if (reqClauses.log) {
      resPromise.then(function(result) {
        // Too much junk in result.response
        result = _.clone(result);
        delete result.response;
        logMessage(util.inspect(result, true, null, true));
      }, function(err) {
          logMessage(err);
        }
      );
    }

    var onExpectations = resPromise.then( function(result) {
      if (reqClauses.expectations.length > 0) {
        return applyExpectations(result, reqClauses.expectations);
      }
      if (defaultExpectation) {
        return applyExpectations(result, [defaultExpectation]);
      }
    });

    scribeRequest(actor.alias, req, onExpectations, reqTemplate);

    onExpectations.then(function() {
      that._expectationsPassed += reqClauses.untils.length;
      that._expectationsPassed += reqClauses.expectations.length;
    }, function(err) {
      if (err instanceof expector.ExpectationError) {
        that._expectationsFailed += 1;
      }
    });

    return onExpectations;
  });

};

// A quick way to assert that the request didn't end in error.  Usefult for checking
// calls that are needed for your test flow but not actually the focus of your test.
Driver.prototype._defaultExpectation = function(fn) {
  this.expect(fn);
  this._lastPromise()._isDefaultExpecation = true;
  return this;
};


// Get the last promise.  Often grabbed to add on steps like expectations or stashing.
Driver.prototype._lastPromise = function() {
  return this._promises[ this._promises.length - 1 ];
};


Driver.prototype._consumeResults = function() {
  var results = {
    expectationsPassed : this._expectationsPassed,
    expectationsFailed : this._expectationsFailed
  };

  this._expectationsPassed = 0;
  this._expectationsFailed = 0;
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



var api = (function() {
  var curNamespace = driverExtensions;
  var self = {};

  self.namespace = function(namespace, description, fn) {

    var origNamespace = curNamespace;
    _.each(namespace.split("."), function(name) {
      curNamespace[name] = curNamespace[name] || {};
      curNamespace = curNamespace[name];
      curNamespace.__name = namespace;
    });
    fn();
    curNamespace = origNamespace;
  };

  self.extend = function(name, fn) {
    curNamespace[name] = function() {
      var that = this;
      var waiting = that._waiting;
      var args = _.toArray(arguments);
      var actor = that._active;
      var untilClauses = that._untilClauses = [];
      var scribeRequest = that._scribe.deferredRequest();

      trace("promising", name, args);
      var promise = Q.all([that._stash.substitute(args), waiting])
      .spread( function(destashedArgs) {
        return subUntilClauses(untilClauses, that._stash)
        .then( function(untils) {
          var doFn = function() {
            return Q.nfapply(fn, destashedArgs);
          };

          var resPromise = untils.length > 0
                           ? doUntil(doFn, untils, 10, 10000)
                           : doFn();

          scribeRequest(actor.alias, {method: name, args: destashedArgs}, resPromise);
          resPromise.then(function() {
            that._expectationsPassed += untils.length;
          }, function(err) {
            if (err instanceof expector.ExpectationError) {
              that._expectationsFailed += 1;
            }
          });
          return resPromise;
        });
      });

      that._promises.push(promise);

      return that;

    };
  };

  self.request = function() {
    if (this._delay > 0) {
      this.wait(this._delay);
    }

    var name, description, reqBuilderFn;  //expected args; description is optional
    var args = _.toArray(arguments);

    name = args.shift();
    assert(_.isString(name));

    reqBuilderFn = args.pop();
    assert(_.isFunction(reqBuilderFn));

    description = args.pop() || undefined;

    var fullname = curNamespace.__name + "." + name;
    curNamespace[name] = function() {
      var args = _.toArray(arguments);
      var that = this;

      trace("promising", name, args);
      var promise = that._stash.substitute(args)
                    .then( function(destashedArgs) {
                      var req = reqBuilderFn.apply(null, destashedArgs);
                      assert(req, "API request builder did not return a request: " + fullname);
                      return req;
                    });
      that._promises.push(that._handleRequestPromise(promise));

      return that;
    };

  };

  self.POST = function() {
    var args = _.toArray(arguments);
    trace("POST", args);
    return {method:"POST", path: args[0], body: args[1], headers: args[2]};
  };

  self.PUT = function() {
    var args = _.toArray(arguments);
    return {method:"PUT", path: args[0], body: args[1], headers: args[2]};
  };

  self.PATCH = function() {
    var args = _.toArray(arguments);
    return {method:"PATCH", path: args[0], body: args[1], headers: args[2]};
  };

  self.GET = function() {
    var args = _.toArray(arguments);
    return {method:"GET", path: args[0], headers: args[1]};
  };

  self.DELETE = function() {
    var args = _.toArray(arguments);
    return {method:"DELETE", path: args[0], headers: args[1]};
  };

  self.HEAD = function() {
    var args = _.toArray(arguments);
    return {method:"HEAD", path: args[0], headers: args[1]};
  };

  //TODO: this is lame.  upload is not a first class http method, but here i've model
  //      it as one.  need something like super-agent attachments so file uploads can be added to
  //      any POST.
  self.upload = function() {
    var args = _.toArray(arguments);
    return {method:"upload", path: args[0], file: args[1], body: args[2], headers: args[3]};
  };

  self.req = function(req) {
    return req;
  };

  return self;
}());


exports.driver = function() { return new Driver(); };
exports.expector = expector;
exports.api = api;
