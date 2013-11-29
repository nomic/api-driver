"use strict";
var _ = require("underscore"),
    Q = require("q"),
    assert = require("assert");

var _p = exports._private = {};

var Stash = function() {

  // FIXME: aaron: you still can't restash to the same
  // name in the same command.
  //
  // stash is a list of pairs: key, promise
  // it's a list rather than array to allow restashing
  // and appropriate lookup order for a name used multiple
  // times
  this._data = [];
};

var trace = function() {
  if (process.env.DRIVER_TRACE) {
    console.log.apply(console, arguments);
  }
};


Stash.prototype.getPromise = function(key) {
  var i = this._data.length - 1;
  var promise = null;
  // indexOf, from the back
  for (i; i >= 0; i--) {
    if (key === this._data[i].key) {
      promise = this._data[i].promise;
      break;
    }
  }
  if (! promise) {
    throw _p.stashKeyError(key);
  }

  return promise;
};

Stash.prototype.destashKeyPath = function(keypath) {
  var parts = keypath.split(".");
  var key = parts[0];
  return this.getPromise(key)
    .then( function(val) {
      _.each(parts.slice(1), function(part) {
        val = val[part];
      });
      return val;
    });
};

Stash.prototype.substitute = function(arg) {
  trace("stash.substitute:", arg);
  var that = this;

  if (_.isString(arg) && arg[0] === ":") {
    return that.destashKeyPath(arg.slice(1));
  }

  if (_.isRegExp(arg) || _.isFunction(arg)) return Q(arg);

  if (_.isObject(arg)) {

    // recursively run substitute on every key
    var subbedArg = _.isArray(arg) ? [] : {};
    var keyPromises = _.map(arg, function(val, key) {
      return that.substitute(val)
      .then( function(val) {
        subbedArg[key] = val;
      });
    });

    return Q.all(keyPromises)
    .then(function() {
      return subbedArg;
    });

  }

  return Q(arg);

};

Stash.prototype.substitutePath = function(path) {
  trace("stash.substitutePath:", path);
  assert(_.isString(path));
  var that = this;

  var halves = path.split("?");
  var pathParts = halves[0].split("/");
  var subbingPath = that.substitute(pathParts).then( function(subbedParts) {
    return subbedParts.join("/");
  });

  var queryParts = _.map((halves[1] || "").split("&"), function(p) {return p.split("=");});
  var subbingQuery = that.substitute(queryParts).then( function(subbedParts) {
    return _.map(subbedParts, function(p) {return p.join("=");}).join("&");
  });

  return Q.all([subbingPath, subbingQuery])
  .spread(function(path, query) {
    return path + (query.length ? "?" + query : "");
  });

};

Stash.prototype.stash = function(key, promise) {
  this._data.push({key: key, promise: promise});
};

// For checking the state of outstanding promises for failures
Stash.prototype.allPromises = function() {
  return _.pluck(this._data, "promise");
};

Stash.prototype.clear = function() {
  this._data = [];
};

_p.stashKeyError = function(key) {
  return new Error("Name '"+key+"' not found in stash");
};


exports.makeStash = function() {
  return new Stash();
};