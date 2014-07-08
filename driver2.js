'use strict';
var _ = require('lodash'),
    request = require('request'),
    Promise = require('bluebird');

module.exports = _.extend({
  introduce: introduce,
  as: as,
  sequence: sequence
},
  require('./lib/context'),
  require('./lib/req')
);

function introduce(alias) {
  return function(ctx) {
    ctx.addActor(alias, request.jar());
    ctx.setCurrentActor(alias);
    return ctx;
  };
}

function as(alias) {
  return function(ctx) {
    ctx.setCurrentActor(alias);
    return ctx;
  };
}

function sequence() {
  var cmds = _.toArray(arguments);
  return function(ctx) {
    return _sequence(cmds, ctx);
  };
}

function _sequence(cmds, ctx) {
  return cmds.length
    ? Promise.resolve(cmds.slice(0,1)[0](ctx))
      .then(function(ctx) {
        return _sequence(cmds.slice(1), ctx);
      })
    : Promise.resolve(ctx);
}