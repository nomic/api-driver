'use strict';
/*global suite: false, test: false, setup: false*/

var dispatch = require('../lib/dispatch'),
  chai = require('chai'),
  expect = chai.expect,
  Promise = require('q');

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
    dispatcher
      .addTask( reflectTask(1) )
      .addTask( reflectTask(2) );
    return dispatcher.dispatch()
    .then(function(results) {
      expect(results).to.eql([1, 2]);
    });
  });

  test("Run 2 asyncronous, sequential tasks", function() {
    dispatcher
      .addTask( delayTask(5, reflectTask(1)) )
      .addTask( reflectTask(2) );
    return dispatcher.dispatch()
    .then(function(results) {
      expect(results).to.eql([1, 2]);
    });
  });

  test("Run 2 tasks concurently", function() {
    dispatcher
      .concurrent()
      .addTask( delayTask(5, timeTask()) )
      .addTask( timeTask() );
    return dispatcher.dispatch()
    .then(function(results) {
      expect(results[1]).to.be.lessThan(results[0]);
    });
  });

  test("Run a task, wait, run another", function() {
    dispatcher
      .addTask( timeTask() )
      .wait(5)
      .addTask( timeTask() );
    return dispatcher.dispatch()
    .then(function(results) {
      expect(results[0]).to.be.lessThan(results[1] - 4);
    });
  });

  test("Run sequence and concurent tasks", function() {
    dispatcher
      .addTask(timeTask())
      .concurrent()
      .addTask( delayTask(10, timeTask()) )
      .addTask( delayTask(5, timeTask()) )
      .serial()
      .addTask( timeTask() );


    return dispatcher.dispatch()
    .then(function(results) {
      var start = results[0];
      expect(results[1]).to.be.lessThan(start + 12);
      expect(results[2]).to.be.lessThan(start + 7);
      expect(results[3]).to.be.lessThan(start + 12);
    });
  });

});