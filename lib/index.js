'use strict';

const debug = require('debug')('loopback:componenet:access');
const createPromiseCallback = require('loopback-datasource-juggler/lib/utils').createPromiseCallback;
const _defaults = require('lodash').defaults;

module.exports = function loopbackComponentAccess(app, options) {
  const loopback = app.loopback;
  const loopbackMajor = loopback && loopback.version &&
    loopback.version.split('.')[0] || 1;

  if (loopbackMajor < 2) {
    throw new Error('loopback-component-access requires loopback 2.0 or newer');
  }

  options = _defaults({}, options, {
    roleModel: 'Role',
    groupModel: 'AccessGroup',
    foreignKey: 'groupId',
    accessGroups: [
      '$group:admin',
      '$group:member'
    ]
  });
  app.set('loopback-component-access', options);

  const Role = app.models[options.roleModel];
  const AccessGroup = app.models[options.groupModel];

  // TODO: Create AccessGroup table automatically if it doesn't already exist.

  // TODO: validate the format of options.accessGroups ($group:[role]).

  // Set up a role resolver for each access group.
  options.accessGroups.forEach(accessGroup => {
    registerRoleResolvers(accessGroup);
  });

  function getAccessGroupId(context, cb) {
    cb = cb || createPromiseCallback();

    // If we are accessing an existing model, get the program id from the existing data.
    if (context.modelId) {
      debug(`fetching program id for existing model with id ${context.modelId}`);
      context.model.findById(context.modelId).then(modelInstance => cb(null, modelInstance[options.foreignKey]));
    }
    // If we are creating a new model, get the foreignKey from the incoming data.
    else if (context.remotingContext.args.data[options.foreignKey]) {
      debug(`fetching group id using incoming group id ${context.remotingContext.args.data[options.foreignKey]}`);
      process.nextTick(() => cb(null, context.remotingContext.args.data[options.foreignKey]));
    }
    // Otherwise, return null.
    else {
      debug('unable to determine program context');
      process.nextTick(cb);
    }

    return cb.promise;
  }

  function registerRoleResolvers(accessGroup) {
    debug(`Registering role resolver for ${accessGroup}`);

    Role.registerResolver(accessGroup, (role, context, cb) => {
      function reject() {
        debug('rejecting');
        process.nextTick(() => cb(null, false));
      }

      // do not allow anonymous users
      const currentUserId = context.accessToken.userId;

      if (!currentUserId) {
        debug('do not allow anonymous users');
        return reject();
      }

      // Extract the target role name from the access group name.
      const roleName = role.split(':')[1];
      debug(`using role name ${roleName}`);

      debug(`Role resolver for ${role}: evaluate ${context.model.definition.name} with id: ${context.modelId}` +
        ` for currentUserId: ${currentUserId}`);

      // Determine which program context we are in.
      const promiseContext = { };

      return getAccessGroupId(context)
        .then(groupId => {
          debug('got group id %s', options.foreignKey);
          if (!groupId) {
            debug('unable to determine program context');
            return reject();
          }

          promiseContext.groupId = groupId;
          const conditions = {
            userId: currentUserId,
            role: roleName
          };

          conditions[options.foreignKey] = groupId;
          return AccessGroup.count(conditions);
        })
        .then(count => {
          debug(`user ${currentUserId} ${count > 0 ? 'is a' : 'is not a'} ${roleName}` +
            ` of program ${promiseContext.groupId}`);
          return cb(null, count > 0);
        })
        .catch(() => cb(null, false));
    });
  }
};
