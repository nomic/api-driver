'use strict';
var _ = require('lodash'),
    request = require('request'),
    Promise = require('bluebird'),
    context = require('./lib/context');

module.exports = _.extend({
  introduce: introduce,
  as: as,
  sequence: sequence,
  concurrence: concurrence,
  step: step,
  stash: stash,
  eventually: eventually
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
  _validate(_.all(cmds, _.isFunction), 'Commands must be functions: ' + cmds);
  return function(ctx) {
    return Promise.map(cmds, function(cmd) {
      return cmd(ctx.clone());
    })
    .then(function(ctxs) {
      var newCtx = context.Context.merge(ctxs);
      newCtx.setCurrentActor(ctx.currentActor());
      return newCtx;
    });
  };
}

function _sequence(ctx, cmds) {
  cmds = _.flatten(cmds);
  _validate(
    _.all(cmds, _.isFunction),
    'Commands must be functions: [' + cmds + ']'
  );
  return _sequenceHelper(ctx, cmds);
}

function _sequenceHelper(ctx, cmds) {
  return cmds.length
    ? Promise.try(cmds.slice(0,1)[0], ctx)
      .then(function(ctx) {
        return _sequence(ctx, cmds.slice(1));
      })
    : Promise.resolve(ctx);
}

function step(title /*, cmds* */) {
  _validate(title, 'Invalid title: ' + title);
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

function _validate(condition, msg) {
  if (! condition) {
    var err = new TypeError(msg);
    Error.captureStackTrace(err, _validate);
    throw err;
  }
}

function eventually(fn, opts) {
  opts =_.defaults(opts || {}, {
    delay: 2,
    timeout: 5000,
    report: _.noop
  });
  return function() {
    var args = arguments;
    var boundFn = function() {
      return fn.apply(null, args);
    };
    return _untilResolved(boundFn, opts.delay, opts.timeout, opts.report, 0);
  };
}

function _untilResolved(fn, delay, timeout, report, elapsed) {
  return Promise.try(fn)
  .then(null, function(err) {
    if (elapsed > timeout) throw err;
    report('Retrying in ' + delay + ' ms');
    return Promise.delay(delay).then(function() {
      return _untilResolved(fn, delay * 2, timeout, report, delay + elapsed);
    });
  });
}