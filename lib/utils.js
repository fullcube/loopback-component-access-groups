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
      groupModel: 'Group',
      groupAccessModel: 'GroupAccess',
      groupRoles: [
        '$group:admin',
        '$group:member'
      ]
    });
    // Default the foreignKey to the group model name + Id.
    this.options.foreignKey = this.options.foreignKey || `${this.options.groupModel.toLowerCase()}Id`;

    // Validate the format of options.groupRoles ($group:[role]).
    this.options.groupRoles.forEach(name => {
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
    this.options.groupRoles.forEach(accessGroup => {
      this.setupRoleResolver(accessGroup);
    });
  }

  /**
   * Add operation hooks to limit access.
   */
  setupModels() {
    this.getGroupContentModels().forEach(modelName => {
      const Model = this.app.models[modelName];

      if (typeof Model.observe === 'function') {
        debug('Attaching access observer to %s', modelName);
        Model.observe('access', (ctx, next) => {
          const currentUser = this.getCurrentUser();

          if (currentUser) {
            // Do noinvoice if options.skipAccess has been set.
            if (ctx.options.skipAccess) {
              debug('skipAccess: true - skipping access filters');
              return next();
            }

            // Do noinvoice if the request is being made against a single model instance.
            if (_get(ctx.query, 'where.id')) {
              debug('looking up by Id - skipping access filters');
              return next();
            }

            debug('%s observe access: query=%s, options=%o, hookState=%o',
              Model.modelName, JSON.stringify(ctx.query, null, 4), ctx.options, ctx.hookState);

            this.buildFilter(currentUser.getId())
              .then(filter => {
                debug('filter: %o', filter);
                const where = ctx.query.where ? {
                  and: [ ctx.query.where, filter ]
                } : filter;

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

  /**
   * Build a where filter to restrict search results to a users group
   *
   * @param {String} userId UserId to build filter for,
   * @returns {Object} A where filter.
   */
  buildFilter(userId) {
    const filter = { };

    return this.getUserGroups(userId)
      .then(userGroups => {
        userGroups = Array.from(userGroups, group => group[this.options.foreignKey]);
        filter[this.options.foreignKey] = { inq: userGroups };
        return filter;
      });
  }

  /**
   * Check if a model class is the configured group model.
   *
   * @param {String|Object} modelClass Model class to check.
   * @returns {Boolean} Returns true if the principalId is on the expected format.
   */
  isGroupModel(modelClass) {
    if (modelClass) {
      const groupModel = this.app.models[this.options.groupModel];

      return modelClass === groupModel ||
        modelClass.prototype instanceof groupModel ||
        modelClass === this.options.groupModel;
    }
    return false;
  }

  /**
   * Get a list of group content models (models that have a belongs to relationship to the group model)
   *
   * @returns {Array} Returns a list of group content models.
   */
  getGroupContentModels() {
    const models = [ ];

    Object.keys(this.app.models).forEach(modelName => {
      const modelClass = this.app.models[modelName];

      // TODO: Should we allow the access group model to be treated as a group content model too?
      if (modelName === this.options.groupAccessModel) {
        return;
      }

      // Try to follow belongsTo
      for (let rel in modelClass.relations) {
        rel = modelClass.relations[rel];
        // debug('Checking relation %s to %s: %j', r, rel.modelTo.modelName, rel);
        if (rel.type === 'belongsTo' && this.isGroupModel(rel.modelTo)) {
          models.push(modelName);
        }
      }
    });

    debug('Got group content models: %o', models);
    return models;
  }

  /**
   * Get the access groups for a given user.
   *
   * @param {String} userId UserId to fetch access groups for.
   * @param {Boolean} force Boolean indicating wether to bypass the cache if it exists.
   * @param {Function} [cb] A callback function.
   * @returns {Boolean} Returns true if the principalId is on the expected format.
   */
  getUserGroups(userId, force, cb) {
    force = force || false;
    cb = cb || createPromiseCallback();
    const currentUser = this.getCurrentUser();
    const currentUserGroups = this.getCurrentUserGroups();

    // Return from the context cache if exists.
    if (!force && currentUser && currentUser.getId() === userId) {
      debug('getUserGroups returning from cache: %o', currentUserGroups);
      process.nextTick(() => cb(null, currentUserGroups));
      return cb.promise;
    }

    // Otherwise lookup from the datastore.
    this.app.models[this.options.groupAccessModel].find({
      where: {
        userId
      }
    })
      .then(groups => {
        debug('getUserGroups returning from datastore: %o', currentUserGroups);
        cb(null, groups);
      })
      .catch(cb);

    return cb.promise;
  }

  /**
   * Get the currently logged in user.
   *
   * @returns {Object} Returns the currently logged in user.
   */
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
   * Get the currently logged in user's access groups from the current request cache.
   *
   * @returns {Array} Returnds a list of access groups the user is a member of.
   */
  getCurrentUserGroups() {
    const ctx = this.app.loopback.getCurrentContext();
    const currentUserGroups = ctx && ctx.get('currentUserGroups') || null;

    if (ctx) {
      debug('currentUserGroups(): %o', currentUserGroups);
    }
    else {
      // this means its a server-side logic call w/o any HTTP req/resp aspect to it.
      debug('currentUserGroups(): no loopback context');
    }

    return currentUserGroups;
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
      const GroupAccess = this.app.models[this.options.groupAccessModel];
      const scope = { };

      // Do not allow anonymous users.
      if (!currentUserId) {
        debug('access denied for anonymous user');
        return process.nextTick(() => cb(null, false));
      }

      debug(`Role resolver for ${role}: evaluate ${context.model.definition.name} with id: ${context.modelId}` +
        ` for currentUserId: ${currentUserId}`);

      return Promise.join(this.getCurrentGroupId(context), this.getTargetGroupId(context),
        (currentGroupId, targetGroupId) => {
          if (!currentGroupId) {
            // TODO: Use promise cancellation to abort the chain early.
            // Causes the access check to be bypassed (see below).
            return [ false ];
          }

          scope.currentGroupId = currentGroupId;
          scope.targetGroupId = targetGroupId;
          const actions = [ ];
          const conditions = { userId: currentUserId, role: roleName };

          conditions[this.options.foreignKey] = currentGroupId;
          actions.push(GroupAccess.count(conditions));

          // If this is an attempt to save the item into a new group, check the user has access to the target group.
          if (targetGroupId && targetGroupId !== currentGroupId) {
            conditions[this.options.foreignKey] = targetGroupId;
            actions.push(GroupAccess.count(conditions));
          }

          return actions;
        })
        .spread((currentGroupCount, targetGroupCount) => {
          if (currentGroupCount === false) {
            // No group context was determined, so allow passthrough access.
            return cb(null, true);
          }
          const cMember = currentGroupCount > 0;

          debug(`user ${currentUserId} ${cMember ? 'is a' : 'is not a'} ${roleName} of group ${scope.currentGroupId}`);

          // If it's an attempt to save the item into a new group, also ensure the user has access to the target group.
          if (scope.targetGroupId && scope.targetGroupId !== scope.currentGroupId) {
            const tMember = targetGroupCount > 0;

            debug(`user ${currentUserId} ${tMember ? 'is a' : 'is not a'} ${roleName} of group ${scope.targetGroupId}`);
            return cb(null, cMember && tMember);
          }

          // Otherwise, base access on the current group membership only.
          return cb(null, cMember);
        })
        .catch(cb);
    });
  }

  /**
   * Determine the current Group Id based on the current security context.
   *
   * @param {Object} context The security context.
   * @param {function} [cb] A callback function.
   * @returns {Object} Returns the determined Group ID.
   */
  getCurrentGroupId(context, cb) {
    cb = cb || createPromiseCallback();
    debug('getCurrentGroupId context.remotingContext.args: %o', context.remotingContext.args);
    let groupId = null;

    // If we are accessing an existing model, get the store id from the existing model instance.
    // TODO: Cache this result so that it can be reused across each ACL lookup attempt.
    if (context.modelId) {
      debug(`fetching group id for existing model with id: ${context.modelId}`);
      context.model.findById(context.modelId, { }, {
        skipAccess: true
      })
        .then(item => {
          // TODO: Attempt to follow relationships in addition to the foreign key.
          if (item) {
            debug(`determined group id ${item[this.options.foreignKey]} from existing model %o`, item);
            groupId = item[this.options.foreignKey];
          }
          cb(null, groupId);
        })
        .catch(cb);
    }

    // If we are creating a new model, get the foreignKey from the incoming data.
    else if (_get(context, `remotingContext.args.data[${this.options.foreignKey}]`)) {
      debug(`determined current group id ${groupId} from incoming data`);
      groupId = context.remotingContext.args.data[this.options.foreignKey];
      process.nextTick(() => cb(null, groupId));
    }

    // Otherwise, return null.
    else {
      debug('unable to determine current group context');
      process.nextTick(() => cb(null, groupId));
    }

    return cb.promise;
  }

  /**
   * Determine the target Group Id based on the current security context.
   *
   * @param {Object} context The security context.
   * @param {function} [cb] A callback function.
   * @returns {Object} Returns the determined Group ID.
   */
  getTargetGroupId(context, cb) {
    cb = cb || createPromiseCallback();
    debug('getTargetGroupId context.remotingContext.args: %o', context.remotingContext.args);
    let groupId = null;

    // Get the target group id from the incoming data.
    if (_get(context, `remotingContext.args.data[${this.options.foreignKey}]`)) {
      debug(`determined target group id ${groupId} from incoming data`);
      groupId = context.remotingContext.args.data[this.options.foreignKey];
    }

    // Otherwise, return null.
    else {
      debug('unable to determine target group context');
    }

    process.nextTick(() => cb(null, groupId));

    return cb.promise;
  }
};
