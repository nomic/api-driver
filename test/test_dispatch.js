'use strict';
/*global suite: false, test: false, setup: false*/

var dispatch = require('../lib/dispatch'),
  chai = require('chai'),
  expect = chai.expect;

function reflectTask(val) {
  return function() {
    return val;
  };
}

suite("Dispatch", function() {

  var dispatcher;
  setup(function() {
    dispatcher = new dispatch.dispatcher();
  });

  test("Run no tasks", function() {
    return dispatcher.dispatch()
    .then(function(results) {
      expect(results).to.eql([]);
    });
  });

  test("Run a task", function() {
    dispatcher.addTask( reflectTask("dummy") );
    return dispatcher.dispatch()
    .spread(function(result) {
      expect(result).to.equal("dummy");
    });
  });

  test("Run 2 sequential tasks", function() {
    dispatcher.addTask( reflectTask(1) );
    dispatcher.addTask( reflectTask(2) );
    return dispatcher.dispatch()
    .then(function(results) {
      expect(results).to.eql([1, 2]);
    });
  });


});