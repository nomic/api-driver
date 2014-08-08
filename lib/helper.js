'use strict';

module.exports = {
  validate: validate
};

function validate(condition, msg) {
  if (! condition) {
    var err = new ArgumentError(msg);
    Error.captureStackTrace(err, validate);
    throw err;
  }
}

function ArgumentError(message) {
  this.message = message;
  this.name = "ArgumentError";
  Error.captureStackTrace(this, ArgumentError);
}
ArgumentError.prototype = Object.create(Error.prototype);
ArgumentError.prototype.constructor = ArgumentError;
