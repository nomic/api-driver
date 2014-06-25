'use strict';

var _ = require('underscore'),
  Promise = require('bluebird');

module.exports = {
  sequential: sequential,
  concurrent: concurrent
};

function Dispatcher(opts) {
  opts = opts || {};
  this._tasks = [];
  this._isConcurrent = (opts.mode === 'concurrent');
}

function sequential() {
  return new Dispatcher();
}

function concurrent() {
  return new Dispatcher({mode: 'concurrent'});
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
    this._isConcurrent
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