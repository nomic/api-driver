'use strict';
var _ = require('lodash'),
    request = require('request'),
    Promise = require('bluebird'),
    assert = require('assert'),
    context = require('./lib/context');

module.exports = _.extend({
  introduce: introduce,
  as: as,
  sequence: sequence,
  concurrence: concurrence,
  step: step,
  stash: stash
},
  context,
  require('./lib/req')
);

function introduce(/* aliases* */) {
  var aliases = _.toArray(arguments);
  return function(ctx) {
    _.each(aliases, function(alias) {
      ctx.addActor(alias, request.jar());
    });
    ctx.setCurrentActor(aliases.slice(-1)[0]);
    return ctx;
  };
}

function as(alias /*, cmds* */) {
  var cmds = _.toArray(arguments).slice(1);
  if (cmds.length) {
    return function(ctx) {
      var prevActor = ctx.currentActor();
      ctx.setCurrentActor(alias, request.jar);
      return _sequence(ctx, cmds)
      .then(function(ctx) {
        ctx.setCurrentActor(prevActor);
        return ctx;
      });
    };
  }

  return function(ctx) {
    ctx.setCurrentActor(alias);
    return ctx;
  };
}

function sequence() {
  var cmds = _.toArray(arguments);
  return function(ctx) {
    return _sequence(ctx, cmds);
  };
}

function concurrence() {
  var cmds = _.flatten(_.toArray(arguments));
  return function(ctx) {
    return Promise.map(cmds, function(cmd) {
      return cmd(ctx.clone());
    })
    .then(context.Context.merge);
  };
}

function _sequence(ctx, cmds) {
  cmds = _.flatten(cmds);
  return cmds.length
    ? Promise.try(cmds.slice(0,1)[0], ctx.clone())
      .then(function(ctx) {
        return _sequence(ctx, cmds.slice(1));
      })
    : Promise.resolve(ctx);
}

function step(title /*, cmds* */) {
  assert(title);
  var cmds = _.toArray(_.rest(arguments));
  return function(ctx) {
    return _sequence(ctx, cmds);
  };
}

function stash(key, val) {
  return function(ctx) {
    ctx.stash(key, val);
    return ctx;
  };
}
