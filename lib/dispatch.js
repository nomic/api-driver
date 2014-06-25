'use strict';

var _ = require('underscore'),
  Promise = require('bluebird');

module.exports = {
  serial: serial,
  parallel: parallel
};

function Dispatcher(opts) {
  opts = opts || {};
  this._tasks = [];
  this._isParallel = (opts.mode === 'parallel');
}

function serial() {
  return new Dispatcher();
}

function parallel() {
  return new Dispatcher({mode: 'parallel'});
}

Dispatcher.prototype.addTask = function(fn) {
  this._tasks.push(fn);
  return this;
};

Dispatcher.prototype.addDispatcher = function(dispatcher) {
  this._tasks.push(function() {
    return dispatcher.dispatch();
  });
  return this;
};

Dispatcher.prototype.wait = function(millis) {
  this._tasks.push(function() {
    return Promise.delay(millis)
    .then(function() {
      return "$wait$";
    });
  });
  return this;
};

Dispatcher.prototype.dispatch = function() {
  return (
    this._isParallel
      ? Promise.map(this._tasks, function(fn) {
          return fn();
        })
      : _dispatchSeq(this._tasks)
  ).then(function(results) {
    return _.filter(_.flatten(results), function(result) {
      return result !== "$wait$";
    });
  });
};

function _dispatchSeq(tasks, results) {
  results = results || [];
  return tasks.length
    ? Promise.cast(tasks.slice(0,1)[0]())
      .then(function(result) {
        results.push(result);
        return _dispatchSeq(tasks.slice(1), results);
      })
    : Promise.cast(results);
}