"use strict";
/*global suite: false, test: false, setup: false*/

var assert = require('assert'),
    expector = require('../lib/expector'),
    checkJSONExpression = expector.test.checkJSONExpression;


suite('checkJSONExpression', function(done) {
    test('$length', function(done) {
        assert(checkJSONExpression({$length: 1}, [2]));
        assert(!checkJSONExpression({$length: 1}, []));
        assert(!checkJSONExpression({$length: 1}, [2, 3]));
        assert(checkJSONExpression({$length: 4}, [1, 2, 3, 4]));

        done();
    });

    test('$unordered', function(done) {
        assert(checkJSONExpression({$unordered: [1, 2]}, [1, 2]));
        assert(checkJSONExpression({$unordered: [1, 2]}, [2, 1]));

        // FIXME: this seems like it should fail
        //assert(!checkJSONExpression({$unordered: [1, 2]}, [1, 2, 3]));

        assert(!checkJSONExpression({$unordered: [1, 2, 3]}, [1, 2]));

        done();
    });
});
