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
  events: globalEmitter
};

function Context() {
  this._jars = {};
  this._actor = null;
  this._stash = {};
}
util.inherits(Context, EventEmitter);

Context.prototype.emit = function() {
  globalEmitter.emit.apply(globalEmitter, arguments);
  Context.super_.prototype.emit.apply(this, arguments);
};

// Note that the cookie jars are not deep cloned.
// This enusres that jars are shared across concurrent
// operations.  Like a browser, there is only one
// set of cookies for a user.
Context.prototype.clone = function() {
  var ctx = new Context();
  ctx._jars = _.clone(this._jars);
  ctx._actor = this._actor;
  ctx._stash = _.cloneDeep(this._stash);
  _.extend(ctx, this);
  return ctx;
};

// Note that the cookie jars are not deep cloned.
Context.merge = function(ctxs) {
  var ctx = new Context();
  ctx._jars = _.extend.apply(null, [{}].concat(_.pluck(ctxs, '_jars')));
  ctx._stash = _.merge.apply(null, [{}].concat(_.pluck(ctxs, '_stash')));
  _.extend(ctx, ctxs);
  return ctx;
};

Context.prototype.addActor = function(alias, jar) {
  this._jars[alias] = jar;
};

Context.prototype.jarFor = function(alias) {
  if (! this._jars[alias]) {
    throw new ContextError("Alias not found: " + alias);
  }
  return this._jars[alias];
};

Context.prototype.setCurrentActor = function(alias, makeJar) {
  if (alias === null) {
    this._actor = null;
    return;
  }

  if (! this._jars[alias]) {
    this.addActor(alias, makeJar());
  }

  this._actor = alias;
};

Context.prototype.currentActor = function() {
  return this._actor;
};

Context.prototype.jarForCurrentActor = function() {
  return this._actor && this.jarFor(this._actor);
};

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

function ContextError(message) {
  this.message = message;
  this.name = "ContextError";
  Error.captureStackTrace(this, ContextError);
}
ContextError.prototype = Object.create(Error.prototype);
ContextError.prototype.constructor = ContextError;

