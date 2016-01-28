'use strict';

const path = require('path');
const fileName = path.basename(__filename, '.js');
const debug = require('debug')(`server:boot:${fileName}`);
const createPromiseCallback = require('loopback-datasource-juggler/lib/utils').createPromiseCallback;

module.exports = function(app, next) {
  const Role = app.models.Role;
  const Team = app.models.Team;

  function getProgramId(context, cb) {
    cb = cb || createPromiseCallback();

    // If we are accessing an existing model, get the program id from the existing data.
    if (context.modelId) {
      debug(`fetching program id for existing model with id ${context.modelId}`);
      context.model.findById(context.modelId).then(modelInstance => cb(null, modelInstance.programId));
    }
    // If we are creating a new model, get the programId from the incoming data.
    else if (context.remotingContext.args.data.programId) {
      debug(`fetching program id using incoming programId ${context.remotingContext.args.data.programId}`);
      process.nextTick(() => cb(null, context.remotingContext.args.data.programId));
    }
    // Otherwise, return null
    else {
      debug('teamMember unable to determine program context');
      process.nextTick(cb);
    }

    return cb.promise;
  }

  Role.registerResolver('teamMember', (role, context, cb) => {
    function reject() {
      debug('teamMember: rejecting');
      process.nextTick(() => cb(null, false));
    }

    // do not allow anonymous users
    const currentUserId = context.accessToken.userId;

    if (!currentUserId) {
      debug('teamMember: do not allow anonymous users');
      return reject();
    }

    debug(`Role resolver for teamMember: evaluate ${context.model.definition.name} with id: ${context.modelId}` +
      ` for currentUserId: ${currentUserId}`);

    // Determine which program context we are in.
    const promiseContext = { };

    return getProgramId(context)
      .then(programId => {
        debug('got programId %s', programId);
        if (!programId) {
          debug('teamMember unable to determine program context');
          return reject();
        }

        promiseContext.programId = programId;
        return Team.count({
          programId,
          userId: currentUserId
        });
      })
      .then(count => {
        debug(`teamMember: user ${currentUserId} ${count > 0 ? 'is a' : 'is not a'} team member` +
          ` of program ${promiseContext.programId}`);
        return cb(null, count > 0);
      })
      .catch(() => cb(null, false));
  });

  process.nextTick(next);
};
