'use strict';

var _ = require('underscore'),
  Promise = require('q');

module.exports = {
  dispatcher: function() { return new Dispatch(); }
};

function Dispatch() {
  this._tasks = [];
}

Dispatch.prototype.addTask = function(fn) {
  this._tasks.push(fn);
};

Dispatch.prototype.dispatch = function() {
  return Promise.all(_.map(this._tasks, function(task) {
    return task();
  }));
};