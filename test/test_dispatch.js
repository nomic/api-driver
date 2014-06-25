'use strict';
/*global suite: false, test: false, setup: false*/

var dispatch = require('../lib/dispatch'),
  sequential = dispatch.sequential, concurrent = dispatch.concurrent,
  chai = require('chai'),
  expect = chai.expect,
  Promise = require('bluebird');

function reflectTask(val) {
  return function() {
    return val;
  };
}

function timeTask() {
  return function() {
    return Date.now();
  };
}

function delayTask(millis, task) {
  return function() {
    return Promise.delay(millis)
    .then(task);
  };
}

suite("Dispatch", function() {

  test("Run no tasks", function() {
    return sequential()
    .dispatch()
    .then(function(results) {
      expect(results).to.eql([]);
    });
  });

  test("Run a task", function() {
    return sequential()
    .addTask( reflectTask("dummy") )
    .dispatch()
    .spread(function(result) {
      expect(result).to.equal("dummy");
    });
  });

  test("Run 2 sequential tasks", function() {
    return sequential()
      .addTask( reflectTask(1) )
      .addTask( reflectTask(2) )
      .dispatch()
      .then(function(results) {
        expect(results).to.eql([1, 2]);
      });
  });

  test("Run 2 asyncronous, sequential tasks", function() {
    return sequential()
      .addTask( delayTask(5, reflectTask(1)) )
      .addTask( reflectTask(2) )
      .dispatch()
      .then(function(results) {
        expect(results).to.eql([1, 2]);
      });
  });

  test("Run 2 tasks concurently", function() {
    return concurrent()
      .addTask( delayTask(5, timeTask()) )
      .addTask( timeTask() )
      .dispatch()
      .then(function(results) {
        expect(results[1]).to.be.lessThan(results[0]);
      });
  });

  test("Run a task, wait, run another", function() {
    return sequential()
      .addTask( timeTask() )
      .wait(5)
      .addTask( timeTask() )
      .dispatch()
      .then(function(results) {
        expect(results[0]).to.be.lessThan(results[1] - 4);
      });
  });

  test("Run sequence and concurrent tasks", function() {
    return sequential()
      .addTask(timeTask())
      .addDispatcher(
        concurrent()
          .addTask( delayTask(10, timeTask()) )
          .addTask( delayTask(5, timeTask()) )
      )
      .addTask( timeTask() )
      .dispatch()
      .then(function(results) {
        var start = results[0];
        expect(results[1]).to.be.greaterThan(start + 9);
        expect(results[2]).to.be.greaterThan(start + 4);
        expect(results[3]).to.be.greaterThan(start + 9);
        expect(results[3]).to.be.lessThan(start + 15);
      });
  });

});