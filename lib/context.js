'use strict';

module.exports = {
  Context: Context,
  ContextError: ContextError
};

function Context() {
  this._jars = {};
  this._actor = null;
  this.expectationsPassed = 0;
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

function ContextError(message) {
  this.message = message;
  this.name = "ContextError";
  Error.captureStackTrace(this, ContextError);
}
ContextError.prototype = Object.create(Error.prototype);
ContextError.prototype.constructor = ContextError;

