"use strict";

var util = require("util"),
      _ = require("underscore"),
      jsondiff = require("json-diff");

//
// Check the body expression matches matches the body.
//

var checkJSONExpression = function(expression, json) {
  if (! (expression && json)) {
    return false;
  }

  var length = expression["$length"];
  if (_.isNumber(length)) {
    return json.length === length;
  }

  var val = expression["$contains"];
  if (val) {
    return json.indexOf(val) !== -1;
  }

  var unordered = expression["$unordered"];

  if (unordered) {

    // We're dealing with an unordered array comparison so we check values
    // such that order doesn't matter.  We want to make sure that all values
    // in the subset have a match.
    var jsonCopy = _.clone(json);
    var passed = _.all( unordered, function(elem) {
      // Does the _deepIncludes test pass for any index?
      return _.any(jsonCopy, function(superElem, i) {
        if ( checkJSONExpression({0: elem}, {0: superElem}) ) {
          delete jsonCopy[i];
          return true;
        }
        return false;
      });
    });
    return passed;
  }

  var negation = expression["$not"];
  if (negation) {
    return !checkJSONExpression(negation, json);
  }

  var result = true;
  _.each(expression, function(v, k) {

    if (v === "$not-exists" && ! _.has(json, k)) { return; }
    if (v === "$exists" && _.has(json, k)) { return; }
    if (!_.has(json, k)) {
      result = false;
    } else {

      if (v === "$date") {
        try {
          new Date(json[k]);
        } catch (e) {
          result = false;
        }
      } else if (v === "$int") {
        var res = parseInt(json[k], 10);
        result = !_.isNaN(res) && _.isNumber(res);
      } else if (v === "$string") {
        result = _.isString(json[k]);
      } else if (_.isRegExp(v)) {

        if (! v.test(json[k])) { result = false; }

      } else if (_.isObject(v)) {

        if (!checkJSONExpression(v, json[k])) { result = false; }

      } else if (v !== json[k]) { result = false; }
    }
  });
  return result;
};


//
// Expectation Failures
//
var ExpectationError = function (msg, constr) {
  Error.captureStackTrace(this, constr || this);
  this.message = msg || 'Error';
};
util.inherits(ExpectationError, Error);
exports.ExpectationError = ExpectationError;

var fail = exports.fail = function(msg, name, trace) {
  msg += "\n"+trace;
  msg += "\n";
  var err = new ExpectationError(msg);
  err.name = name;
  return err;
};

var statusFail = exports.statusFail = function(actual, expected, actualBody, trace) {
  var msg =
    "Expected HTTP status code of " + expected + " but got " + actual +
    "\nResponse Body:\n"+JSON.stringify(actualBody, null, 4);

  return fail(msg, "Status Failure", trace);
};

var jsonExpressionFail = exports.jsonExpressionFail  = function(actual, expression, trace) {
  var msg;
  msg  = "\nExpected:\n" + expression +
         "\nBut not found in:\n" + actual;
  msg = "\n(expression diffed against actual follows)\n" + jsondiff.diffString(expression, actual);

  return fail(msg, "JSON Expression Failure", trace);
};

var textFail = exports.bodyFail = function(actual, text, trace) {
  var msg = "\nExpected:\n" + text +
            "\nBut not found:\n" + actual;

  return fail(msg, "Text Comparison Failure", trace);
};

var predicateFail = exports.predicateFail =  function(actual, predicate, trace) {
  var msg  = "\nExpected:\n" + predicate +
             "\nBut predicate not satisfied for:\n" + trace;

  return fail(msg, "Predicate Failure", trace);
};


//
// The main interface to this module.
//
// Pass in the trace that will be given along with the failure
//

exports.expect = function(actual, expected, trace) {

  if (expected.statusCode && expected.statusCode !== actual.statusCode) {
    throw statusFail(actual.statusCode, expected.statusCode, actual.json, trace);
  }

  if ( expected.body ) {
    if ( _.isRegExp(expected.body) && ! expected.body.test(actual.text) ) {
      throw textFail('"' + actual.text + '"', expected.body.toString(), trace );
    }

    if ( _.isString(expected.body) && expected.body !== actual.text ) {
      throw textFail( '"' + actual.text + '"', '"' + expected.body + '"', trace );
    }

    if ( _.isFunction(expected.body)) {
      var predicate = expected.body;
      var result;
      try {
        result = predicate(actual);
      } catch (err) {
        var expectError = fail("", "Predicate Failure", trace);
        expectError.stack += "\n"+"Caused By:\n"+err.stack;
        throw expectError;
      }
      if (! result) {
        throw predicateFail( actual.json, predicate, trace );
      }
      return;
    }

    if (    ! _.isRegExp(expected.body)
         && ! _.isString(expected.body)
         && ! checkJSONExpression(expected.body, actual.json) ) {
      throw jsonExpressionFail( actual.json, expected.body, trace );
    }
  }

  return;
};
