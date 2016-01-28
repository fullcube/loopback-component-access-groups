'use strict';

const debug = require('debug')('loopback:componenet:access');
const createPromiseCallback = require('loopback-datasource-juggler/lib/utils').createPromiseCallback;
const _defaults = require('lodash').defaults;

module.exports = class AccessUtils {
  constructor(app, options) {
    this.app = app;

    this.options = _defaults({}, options, {
      roleModel: 'Role',
      groupModel: 'AccessGroup',
      foreignKey: 'groupId',
      accessGroups: [
        '$group:admin',
        '$group:member'
      ]
    });

    // Validate the format of options.accessGroups ($group:[role]).
    this.options.accessGroups.forEach(name => {
      if (!this.isValidGroupName(name)) {
        throw new Error(`$name is an invalid access group name.`);
      }
    });

    app.set('loopback-component-access', options);
    debug('options: %o', options);
  }

  isValidGroupName(name) {
    return Boolean(this.extractGroupName(name));
  }

  extractGroupName(name) {
    return name.split(':')[1];
  }

  // TODO: Create AccessGroup table automatically if it doesn't already exist.
  setupModels() {
    throw new Error(`not implemented`);
  }

  getAccessGroupId(context, cb) {
    cb = cb || createPromiseCallback();

    // If we are accessing an existing model, get the program id from the existing data.
    if (context.modelId) {
      debug(`fetching program id for existing model with id ${context.modelId}`);
      context.model.findById(context.modelId).then(modelInstance => cb(null, modelInstance[this.options.foreignKey]));
    }
    // If we are creating a new model, get the foreignKey from the incoming data.
    else if (context.remotingContext.args.data[this.options.foreignKey]) {
      debug(`fetching group id using incoming group id ${context.remotingContext.args.data[this.options.foreignKey]}`);
      process.nextTick(() => cb(null, context.remotingContext.args.data[this.options.foreignKey]));
    }
    // Otherwise, return null.
    else {
      debug('unable to determine program context');
      process.nextTick(cb);
    }

    return cb.promise;
  }

  registerRoleResolvers(accessGroup) {
    debug(`Registering role resolver for ${accessGroup}`);

    const Role = this.app.models[this.options.roleModel];

    Role.registerResolver(accessGroup, (role, context, cb) => {
      // Get the current user id.
      const currentUserId = context.accessToken.userId;

      // Do not allow anonymous users.
      if (!currentUserId) {
        debug('access denied for anonymous user');
        return process.nextTick(() => cb(null, false));
      }

      // Extract the target role name from the access group name.
      const roleName = this.extractGroupName(role);

      debug(`using role name ${roleName}`);

      debug(`Role resolver for ${role}: evaluate ${context.model.definition.name} with id: ${context.modelId}` +
        ` for currentUserId: ${currentUserId}`);

      // Determine which program context we are in.
      const AccessGroup = this.app.models[this.options.groupModel];
      const scope = { };

      return this.getAccessGroupId(context)
        .then(groupId => {
          debug('got group id %s', this.options.foreignKey);
          if (!groupId) {
            debug('unable to determine program context');
            return false;
          }

          scope.groupId = groupId;
          const conditions = {
            userId: currentUserId,
            role: roleName
          };

          conditions[this.options.foreignKey] = groupId;
          return AccessGroup.count(conditions);
        })
        .then(count => {
          const isMember = count > 0;

          debug(`user ${currentUserId} ${isMember ? 'is a' : 'is not a'} ${roleName} of group ${scope.groupId}`);
          return cb(null, isMember);
        })
        .catch(cb);
    });
  }
};
