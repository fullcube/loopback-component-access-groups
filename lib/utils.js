'use strict';

const debug = require('debug')('loopback:componenet:access');
const createPromiseCallback = require('loopback-datasource-juggler/lib/utils').createPromiseCallback;
const _defaults = require('lodash').defaults;

module.exports = class AccessUtils {
  constructor(app, options) {
    this.app = app;

    this.options = _defaults({ }, options, {
      userModel: 'User',
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
      if (!this.isValidPrincipalId(name)) {
        throw new Error('$name is an invalid access group name.');
      }
    });

    // Save the component config for easy reference.
    app.set('loopback-component-access', options);
    debug('options: %o', options);
  }

  /**
   * Register a dynamic role resolver for each defined access group.
   */
  setupRoleResolvers() {
    this.options.accessGroups.forEach(accessGroup => {
      this.setupRoleResolver(accessGroup);
    });
  }

  /**
   * Add operation hooks to limit access.
   */
  setupModels() {
    Object.keys(this.app.models).forEach(Model => {
      // TODO: Only add an access observer to relevant models.
      if (typeof Model.observe === 'function') {
        Model.observe('access', (ctx, next) => {
          const currentUser = this.getCurrentUser();
          const tenants = this.extractTenants[ctx.query.where];

          if (currentUser) {
            ctx.query.where[this.options.foreignKey] = this.filterTenants(tenants, currentUser.getId());
          }
          next();
        });
      }
    });
  }

  extractTenants(filter) {
    // TODO: Implement mothod to extract tenants from a where filter.
    return filter;
  }

  getUserTenants(userId) {
    return this.app.models[this.options.groupModel].find({
      where: {
        userId
      }
    });
  }

  filterTenants(tenants, userId) {
    tenants = tenants || [ ];
    debug('filterTenants: tenants=%o', tenants);
    return this.getUserTenants(userId)
      .then(userTenants => {
        userTenants = Array.from(userTenants, tenant => tenant[this.options.foreignKey]);

        debug('filterTenants: userTenants=%o', userTenants);

        return tenants.filter(value => {
          const res = userTenants.indexOf(value) !== -1;

          debug('checking value %s: %s', value, res);
          return res;
        });
      });
  }

  getCurrentUser() {
    const ctx = this.app.loopback.getCurrentContext();
    const currentUser = ctx && ctx.get('currentUser') || null;

    if (ctx) {
      debug('getCurrentUser() - currentUser: %o', currentUser);
    }
    else {
      // this means its a server-side logic call w/o any HTTP req/resp aspect to it.
      debug('getCurrentUser() - no loopback context');
    }

    return currentUser;
  }

  /**
   * Valid that a principalId conforms to the expected format.
   *
   * @param {String} principalId A principalId.
   * @returns {Boolean} Returns true if the principalId is on the expected format.
   */
  isValidPrincipalId(principalId) {
    return Boolean(this.extractRoleName(principalId));
  }

  /**
   * Extract the role name from a principalId (eg, for '$group:admin' the role name is 'admin').
   *
   * @param {String} principalId A principalId.
   * @returns {Boolean} Returns true if the principalId is on the expected format.
   */
  extractRoleName(principalId) {
    return principalId.split(':')[1];
  }

  /**
   * Register a dynamic role resolver for an access group.
   *
   * @param {String} accessGroup Name of the access group to be setup.
   */
  setupRoleResolver(accessGroup) {
    debug(`Registering role resolver for ${accessGroup}`);
    const Role = this.app.models[this.options.roleModel];

    Role.registerResolver(accessGroup, (role, context, cb) => {
      const currentUserId = context.accessToken.userId;
      const roleName = this.extractRoleName(role);
      const AccessGroup = this.app.models[this.options.groupModel];
      const scope = { };

      // Do not allow anonymous users.
      if (!currentUserId) {
        debug('access denied for anonymous user');
        return process.nextTick(() => cb(null, false));
      }

      debug(`using role name ${roleName}`);
      debug(`Role resolver for ${role}: evaluate ${context.model.definition.name} with id: ${context.modelId}` +
        ` for currentUserId: ${currentUserId}`);

      return this.getGroupId(context)
        .then(groupId => {
          debug('got group id %s', this.options.foreignKey);
          if (!groupId) {
            debug('unable to determine group context');
            return false;
          }

          scope.groupId = groupId;
          const conditions = { userId: currentUserId, role: roleName };

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

  /**
   * Determine the relevant Group Id based on the current security context.
   *
   * @param {Object} context The security context.
   * @param {function} [cb] A callback function.
   * @returns {Object} Returns the determined Group ID.
   */
  getGroupId(context, cb) {
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
};
