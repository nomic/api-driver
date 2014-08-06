'use strict';

var _ = require('lodash'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

var stashKeyRegExp = /(^|[^:\\]):[\w0-9\.]+/g;
var encodedStashKeyRegExp = /(^|[^\\])::[\w0-9\.]+/g;
var globalEmitter = new EventEmitter();

module.exports = {
  Context: Context,
  ContextError: ContextError,
  emitter: globalEmitter
};

function Context() {

  // Each actor has a cookie jar.  The context also keeps track
  // of the current actor so that subsequent requests can use it.
  this._jars = {};
  this._actor = null;

  // Collection of values to be used in later operations.
  this._stash = {};

  // The stack keeps track of what step(s) you are currently
  // inside of, and is reported when events are emited.
  //
  // In the future, it may also indicate all of the
  // statements you are inside of (e.g., concurrently, eventually)
  // to enhance what can be done with reporting on events.  This might
  // remove the need for the _actor member, as the stack could just
  // be queried.
  this.stack = [];
}
util.inherits(Context, EventEmitter);

Context.prototype.emit = function() {
  globalEmitter.emit.apply(globalEmitter, arguments);
  Context.super_.prototype.emit.apply(this, arguments);
};

// Use this when you kick off concurrent operations to
// provide a separate "stack" for each operation.
Context.prototype.branch = function() {
  var ctx = new Context();
  _.extend(ctx, _.omit(this, "stack"));
  ctx.stack = _.clone(this.stack);
  return ctx;
};

////////////
// Actors //
////////////

Context.prototype.setCurrentActor = function(actor) {
  this._actor = actor;
};

Context.prototype.currentActor = function() {
  return this._actor;
};

Context.prototype.jarFor = function Context$jarFor(actor, makeJar) {
  var jars = this._jars;
  if (actor) {
    if ((! jars[actor]) && makeJar) {
      jars[actor] = makeJar();
    }
    return jars[actor] || null;
  }
  return null;
};

Context.prototype.jarForCurrentActor = function(makeJar) {
  return this.jarFor(this._actor, makeJar);
};

///////////
// Stash //
///////////

Context.prototype.stash = function(key, val) {
  this._stash[key] = val;
};

Context.prototype.destash = function(key) {
  return this._stash[key];
};

Context.prototype.substitute = function(arg) {
  var self = this;
  if (_.isString(arg) && arg[0] === ":") {
    return getKeyPath(this._stash, arg.slice(1));
  }

  if (_.isPlainObject(arg) || _.isArray(arg)) {
    var subbedArg = _.isArray(arg) ? [] : {};
    _.each(arg, function(val, key) {
      subbedArg[key] = self.substitute(val);
    });
    return subbedArg;
  }

  return arg;
};

//
// Stash vars are uri encoded unless they are preceded
// by a "::".
//
Context.prototype.substituteRoute = function(route) {
  var that = this;

  if(! _.isString(route)) return route;

  var stashKeys = route.match(encodedStashKeyRegExp) || [];
  stashKeys = stashKeys.concat(
    _.map(route.match(stashKeyRegExp) || [], function(key) {
      if (key[0] !== ":") return key.slice(1);
      else return key;
    })
  );

  var subs = that.substitute(
    _.map(stashKeys, function(key) {
      if (key.slice(0,2) === "::") return key.slice(1);
      else return key;
    })
  );
  var subbedRoute = route;
  _.each(stashKeys, function(stashKey, i) {
    subbedRoute = subbedRoute.replace(
      stashKey,
      stashKey.slice(0,2) === "::" ? subs[i] : encodeURIComponent(subs[i])
    );
  });
  return subbedRoute;

};

function getKeyPath (stash, keypath) {
  var parts = keypath.split(".");
  var key = parts[0];
  var val = stash[key];
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
}


////////////
// Errors //
////////////

function ContextError(message) {
  this.message = message;
  this.name = "ContextError";
  Error.captureStackTrace(this, ContextError);
}
ContextError.prototype = Object.create(Error.prototype);
ContextError.prototype.constructor = ContextError;

