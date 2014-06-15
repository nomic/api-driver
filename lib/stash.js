"use strict";
var _ = require("underscore"),
    Q = require("q");

var _p = exports._private = {};
var stashKeyRegExp = /(^|[^:\\]):[\w0-9\.]+/g;
var encodedStashKeyRegExp = /(^|[^\\])::[\w0-9\.]+/g;
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
      var lastPart = key;
      _.each(parts.slice(1), function(part) {
        if (val === undefined) {
          throw Error(
            "Failed to destash keypath '" + keypath + "': " +
            lastPart + " is undefined"
          );
        }
        lastPart = part;
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

//
// Stash vars are uri encoded unless they are preceded
// by a "::".
//
Stash.prototype.substituteRoute = function(route) {
  trace("stash.substitutePath:", route);
  var that = this;

  if(! _.isString(route)) return Q(route);

  var stashKeys = route.match(encodedStashKeyRegExp) || [];
  stashKeys = stashKeys.concat(
    _.map(route.match(stashKeyRegExp) || [], function(key) {
      if (key[0] !== ":") return key.slice(1);
      else return key;
    })
  );

  return that.substitute(
    _.map(stashKeys, function(key) {
      if (key.slice(0,2) === "::") return key.slice(1);
      else return key;
    })
  )
  .then(function(subs) {
    var subbedRoute = route;
    _.each(stashKeys, function(stashKey, i) {
      subbedRoute = subbedRoute.replace(
        stashKey,
        stashKey.slice(0,2) === "::" ? subs[i] : encodeURIComponent(subs[i])
      );
    });
    return subbedRoute;
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