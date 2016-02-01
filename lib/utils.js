'use strict';

const debug = require('debug')('loopback:componenet:access');
const createPromiseCallback = require('loopback-datasource-juggler/lib/utils').createPromiseCallback;
const _defaults = require('lodash').defaults;
const _get = require('lodash').get;

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
    // TODO: Only add an access observer to relevant models.
    const tenantModels = [ 'Thing' ];

    tenantModels.forEach(modelName => {
      const Model = this.app.models[modelName];

      if (typeof Model.observe === 'function') {
        debug('Attaching access observer to %s', modelName);
        Model.observe('access', (ctx, next) => {
          debug('%s observe access: query=%s, options=%o, hookState=%o',
            Model.modelName, JSON.stringify(ctx.query, null, 4), ctx.options, ctx.hookState);

          // Do nothing if options.skipAccess has been set.
          if (ctx.options.skipAccess) {
            debug('skipAccess: true - skipping access checks');
            return next();
          }

          // Do nothing if the request is being made against a single model instance.
          if (_get(ctx.query, 'where.id')) {
            debug('looking up by Id - skipping access checks');
            return next();
          }

          const currentUser = this.getCurrentUser();

          if (currentUser) {
            this.buildFilter(currentUser.getId())
              .then(filter => {
                debug('filter: %o', filter);
                const where = { and: [ ctx.query.where, filter ] };

                ctx.query.where = where;
                debug('where query modified to: %s', JSON.stringify(ctx.query, null, 4));
                next();
              });
          }
          else {
            return next();
          }
        });
      }
    });
  }

  buildFilter(userId) {
    const filter = { };

    return this.getUserTenants(userId)
      .then(userTenants => {
        userTenants = Array.from(userTenants, tenant => tenant[this.options.foreignKey]);
        filter[this.options.foreignKey] = { inq: userTenants };
        return filter;
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
          debug('got group id %s', groupId);
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
          if (count === false) {
            return cb(null, true);
          }
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
    debug('getGroupId context.remotingContext.args: %o', context.remotingContext.args);
    let groupId = null;

    // If we are accessing an existing model, get the program id from the existing data.
    if (context.modelId) {
      debug(`fetching group id for existing model with id: ${context.modelId}`);
      groupId = context.model.findById(context.modelId, { }, {
        skipAccess: true
      }).get(this.options.foreignKey);
    }

    // If we are creating a new model, get the foreignKey from the incoming data.
    else if (_get(context, `remotingContext.args.data[${this.options.foreignKey}]`)) {
      debug(`fetching group id using incoming group id: ${groupId}`);
      groupId = context.remotingContext.args.data[this.options.foreignKey];
    }

    // // If we are searching for a model, get the foreignKey from the query filter.
    // else if (_get(context, `remotingContext.args.filter.where[${this.options.foreignKey}]`)) {
    //   groupId = context.remotingContext.args.filter.where[this.options.foreignKey];
    //   debug(`fetching group id using incoming where filter: ${groupId}`);
    // }

    // Otherwise, return null.
    else {
      debug('unable to determine program context');
    }

    process.nextTick(() => cb(null, groupId));

    return cb.promise;
  }
};
