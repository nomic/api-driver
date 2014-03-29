"use strict";
/*global suite: false, test: false*/

var assert = require('assert'),
    expector = require('../lib/expector'),
    cje = expector.test.checkJSONExpression;


suite('checkJSONExpresion', function() {
  test('$length', function() {
    assert(  cje({$length: 1}, [2]) );
    assert( !cje({$length: 1}, []) );
    assert( !cje({$length: 1}, [2, 3]) );
    assert(  cje({$length: 4}, [1, 2, 3, 4]) );
  });

  test('$int', function() {
    assert(  cje({a: "$int"}, {a: 2}) );
    assert( !cje({a: "$int"}, {a: 1.5}) );
  });

  test('$not-exists', function() {
    assert(  cje({a: "$not-exists"}, {}) );
    assert( !cje({a: "$not-exists"}, {a: 1}) );
  });


  test('$unordered', function() {
    assert(  cje({$unordered: [1, 2]}, [1, 2]) );
    assert(  cje({$unordered: [1, 2]}, [2, 1]) );
    assert( !cje({$unordered: [1, 2, 3]}, [1, 2]) );
  });

  test('combos', function() {
    assert(  cje({$unordered: [1, 2], $length: 2}, [2, 1]) );
    assert( !cje({$unordered: [1, 2], $length: 3}, [2, 1]) );
    assert( !cje({$length: 2, $unordered: [1, 3]}, [2, 1]) );
  });

  test('comparisons', function() {
    assert(  cje({a: {$gt:  10}}, {a: 11}) );
    assert( !cje({a: {$gt:  10}}, {a: 10}) );
    assert( !cje({a: {$gt:  10}}, {a: 9})) ;

    assert(  cje({a: {$gte: 10}}, {a: 11}) );
    assert(  cje({a: {$gte: 10}}, {a: 10}) );
    assert( !cje({a: {$gte: 10}}, {a: 9})) ;

    assert( !cje({a: {$lt:  10}}, {a: 11}) );
    assert( !cje({a: {$lt:  10}}, {a: 10}) );
    assert(  cje({a: {$lt:  10}}, {a: 9})) ;

    assert( !cje({a: {$lte: 10}}, {a: 11}) );
    assert(  cje({a: {$lte: 10}}, {a: 10}) );
    assert(  cje({a: {$lte: 10}}, {a: 9})) ;
  });
});
