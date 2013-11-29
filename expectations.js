"use strict";
var assert = require("assert");

exports.Unauthorized = function(result) {
  assert.strictEqual(result.statusCode, 401);
  assert.strictEqual(result.text, "Unauthorized");
  return true;
};

exports.Forbidden = function(result) {
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.text, "Forbidden");
  return true;
};

exports.NotFound = function(result) {
  assert.strictEqual(result.statusCode, 404);
  assert.strictEqual(result.text, "Not Found");
  return true;
};