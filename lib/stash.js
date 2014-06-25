"use strict";
var _ = require("underscore"),
    Promise = require("bluebird");

var stashKeyRegExp = /(^|[^:\\]):[\w0-9\.]+/g;
var encodedStashKeyRegExp = /(^|[^\\])::[\w0-9\.]+/g;


exports.makeStash = function() {
  return new Stash();
};

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

Stash.prototype.clone = function() {
  var stash = new Stash();
  stash._data = _.clone(this._data);
  return stash;
};

Stash.prototype.set = function(key, promise) {
  trace('stash.set: ' + key);
  this._data.push({key: key, promise: promise});
};

Stash.prototype.get = function(key) {
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
    throw stashKeyError(key);
  }

  return promise;
};

Stash.prototype.getKeyPath = function(keypath) {
  var parts = keypath.split(".");
  var key = parts[0];
  return this.get(key)
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
    return that.getKeyPath(arg.slice(1));
  }

  if (_.isRegExp(arg) || _.isFunction(arg)) return Promise.cast(arg);

  if (_.isObject(arg)) {

    // recursively run substitute on every key
    var subbedArg = _.isArray(arg) ? [] : {};
    var keyPromises = _.map(arg, function(val, key) {
      return that.substitute(val)
      .then( function(val) {
        subbedArg[key] = val;
      });
    });

    return Promise.all(keyPromises)
    .then(function() {
      return subbedArg;
    });

  }

  return Promise.cast(arg);

};

//
// Stash vars are uri encoded unless they are preceded
// by a "::".
//
Stash.prototype.substituteRoute = function(route) {
  trace("stash.substituteRoute:", route);
  var that = this;

  if(! _.isString(route)) return Promise.cast(route);

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

// For checking the state of outstanding promises for failures
Stash.prototype.resolve = function() {
  return Promise.all(_.pluck(this._data, "promise"));
};

Stash.prototype.clear = function() {
  this._data = [];
};

function stashKeyError(key) {
  return new Error("Name '"+key+"' not found in stash");
}

function trace() {
  if (process.env.DRIVER_TRACE) {
    console.log.apply(console, arguments);
  }
}
