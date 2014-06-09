"use strict";

var util = require("util"),
      _ = require("underscore"),
      jsondiff = require("json-diff"),
      Q = require("q");

//
// Check the body expression matches matches the body.
//


function checkJSONExpression(expression, json) {
  if (! (expression && json)) {
    return false;
  }

  // array expressions never match non-arrays or arrays of a different length.
  if (_.isArray(expression) && !(_.isArray(json) && expression.length === json.length)) {
    return false;
  }

  return _.all(expression, function(v, k) {

    // check "$" properties
    if (k === "$not") return (! checkJSONExpression(v, json));
    if (k === "$unordered") {
      return v.length === json.length && arrayContains(json, v);
    }
    if (k === "$contains") {
      return arrayContains(json, v);
    }
    if (k === "$length" ) return(v === json.length);
    if (k === "$gt") return (json > v);
    if (k === "$gte") return (json >= v);
    if (k === "$lt") return (json < v);
    if (k === "$lte") return (json <= v);

    // check $not-exists
    if (! _.has(json, k)) return (v === "$not-exists");

    // check rest of "$" values.
    if (v === "$exists") return _.has(json, k);
    if (v === "$string") return _.isString(json[k]);
    if (_.isRegExp(v)) return v.test(json[k]);
    if (_.isObject(v)) return checkJSONExpression(v, json[k]);
    if (v === "$date") {
      try {
        new Date(json[k]);
        return true;
      } catch (e) {
        return false;
      }
    }
    if (v === "$int") {
      //http://stackoverflow.com/questions/3885817/how-to-check-if-a-number-is-float-or-integer
      return (typeof json[k] === 'number' && json[k] % 1 === 0);
    }

    // check a strict equals
    return (v === json[k]);
  });
};

function arrayContains(haystack, needles) {
  // We're dealing with an unordered array comparison so we check values
  // such that order doesn't matter.  We want to make sure that all values
  // in the subset have a match.
  var haystackCopy = _.clone(haystack);
  return _.all(needles, function(elem) {
    // Does the _deepIncludes test pass for any index?
    return _.any(haystackCopy, function(superElem, i) {
      if ( checkJSONExpression({0: elem}, {0: superElem}) ) {
        delete haystackCopy[i];
        return true;
      }
      return false;
    });
  });
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


function expectFn(actual, fn, trace) {
  return Q.try(function() {
    return fn(actual.json || actual.text, actual.response);
  })
  .catch(function(err) {
    var expectError = fail("", "Expectation Function Failed", trace);
    expectError.stack += "\n"+"Caused By:\n"+err.stack;
    throw expectError;
  });
}
//
// The main interface to this module.
//
// Pass in the trace that will be given along with the failure
//

exports.expect = function(actual, expected, trace) {

  return Q.try(function() {
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

      if ( _.isFunction(expected.body) ) return expectFn(actual, expected.body, trace);

      if (    ! _.isRegExp(expected.body)
           && ! _.isString(expected.body)
           && ! checkJSONExpression(expected.body, actual.json) ) {
        throw jsonExpressionFail( actual.json, expected.body, trace );
      }
    }
  });
};

// only exporting this for test purposes.
exports.test = {
  checkJSONExpression: checkJSONExpression,
  expectFn: expectFn
};
