'use strict';

var _ = require('lodash');

module.exports = {
  Context: Context,
  ContextError: ContextError
};

function Context() {
  this._jars = {};
  this._actor = null;
  this.expectationsPassed = 0;
  this._stash = {};
}

Context.prototype.addActor = function(alias, jar) {
  this._jars[alias] = jar;
};

Context.prototype.jarFor = function(alias) {
  if (! this._jars[alias]) {
    throw new ContextError("Alias not found: " + alias);
  }
  return this._jars[alias];
};

Context.prototype.setCurrentActor = function(alias) {
  if (alias === null) this._actor = null;

  if (! this._jars[alias]) {
    throw new ContextError("Alias not found: " + alias);
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

  if (_.isPlainObject(arg)) {
    var subbedArg = _.isArray(arg) ? [] : {};
    _.each(arg, function(val, key) {
      subbedArg[key] = self.substitute(val);
    });
    return subbedArg;
  }

  return arg;
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
};

function ContextError(message) {
  this.message = message;
  this.name = "ContextError";
  Error.captureStackTrace(this, ContextError);
}
ContextError.prototype = Object.create(Error.prototype);
ContextError.prototype.constructor = ContextError;

