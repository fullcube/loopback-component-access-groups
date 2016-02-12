'use strict';

const debug = require('debug')('loopback:componenet:access');
const createPromiseCallback = require('loopback-datasource-juggler/lib/utils').createPromiseCallback;
const _defaults = require('lodash').defaults;
const _get = require('lodash').get;
const Promise = require('bluebird');

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
    app.set('loopback-component-access-groups', options);
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
    const models = [ this.options.groupModel ].concat(this.getGroupContentModels());

    models.forEach(modelName => {
      const Model = this.app.models[modelName];

      if (typeof Model.observe === 'function') {
        debug('Attaching access observer to %s', modelName);
        Model.observe('access', (ctx, next) => {
          const currentUser = this.getCurrentUser();

          if (currentUser) {
            // Do not filter if options.skipAccess has been set.
            if (ctx.options.skipAccess) {
              debug('skipAccess: true - skipping access filters');
              return next();
            }

            // Do not filter if the request is being made against a single model instance.
            if (_get(ctx.query, 'where.id')) {
              debug('looking up by Id - skipping access filters');
              return next();
            }

            // Do not apply filters if no group access acls were applied.
            const loopbackContext = this.app.loopback.getCurrentContext();
            const groupAccessApplied = loopbackContext && loopbackContext.get('groupAccessApplied') || false;

            if (!groupAccessApplied) {
              debug('acls not appled - skipping access filters');
              return next();
            }

            debug('%s observe access: query=%s, options=%o, hookState=%o',
              Model.modelName, JSON.stringify(ctx.query, null, 4), ctx.options, ctx.hookState);

            return this.buildFilter(currentUser.getId(), ctx.Model)
              .then(filter => {
                debug('original query: %o', JSON.stringify(ctx.query, null, 4));
                const where = ctx.query.where ? {
                  and: [ ctx.query.where, filter ]
                } : filter;

                ctx.query.where = where;
                debug('modified query: %s', JSON.stringify(ctx.query, null, 4));
              });
          }
          return next();
        });
      }
    });
  }

  /**
   * Build a where filter to restrict search results to a users group
   *
   * @param {String} userId UserId to build filter for.
   * @param {Object} Model Model to build filter for,
   * @returns {Object} A where filter.
   */
  buildFilter(userId, Model) {
    const filter = { };
    const key = this.isGroupModel(Model)? Model.getIdName() : this.options.foreignKey;
    // TODO: Support key determination based on the belongsTo relationship.

    return this.getUserGroups(userId)
      .then(userGroups => {
        userGroups = Array.from(userGroups, group => group[this.options.foreignKey]);
        filter[key] = { inq: userGroups };
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
   * Check if a model class is the configured group access model.
   *
   * @param {String|Object} modelClass Model class to check.
   * @returns {Boolean} Returns true if the principalId is on the expected format.
   */
  isGroupAccessModel(modelClass) {
    if (modelClass) {
      const groupAccessModel = this.app.models[this.options.groupAccessModel];

      return modelClass === groupAccessModel ||
        modelClass.prototype instanceof groupAccessModel ||
        modelClass === this.options.groupAccessModel;
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

      // Mark the group itself as a group or the group access model.
      if (this.isGroupModel(modelClass) || this.isGroupAccessModel(modelClass)) {
        return;
      }

      // Try to follow belongsTo
      for (let rel in modelClass.relations) {
        rel = modelClass.relations[rel];
        // debug('Checking relation %s to %s: %j', r, rel.modelTo.modelName, rel);
        if (rel.type === 'belongsTo' && this.isGroupModel(rel.modelTo)) {
          return models.push(modelName);
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
    return currentUser;
  }

  /**
   * Get the currently logged in user's access groups from the current request cache.
   *
   * @returns {Array} Returnds a list of access groups the user is a member of.
   */
  getCurrentUserGroups() {
    const ctx = this.app.loopback.getCurrentContext();
    const currentUserGroups = ctx && ctx.get('currentUserGroups') || [];
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
      if (!context || !context.model || !context.modelId) {
        process.nextTick(() => {
          debug('Allow passthrough access (context: %s, context.model: %s, context.modelId: %s)',
            !!context, !!context.model, !!context.modelId);

          const currentUser = this.getCurrentUser();

          if (currentUser) {
            this.app.loopback.getCurrentContext().set('groupAccessApplied', true);
          }

          if (cb) cb(null, false);
        });
        return;
      }

      const modelClass = context.model;
      const modelId = context.modelId;
      const userId = context.getUserId();
      const roleName = this.extractRoleName(role);
      const GroupAccess = this.app.models[this.options.groupAccessModel];
      const scope = { };

      debug(`Role resolver for ${role}: evaluate ${modelClass.modelName} with id: ${modelId} for user: ${userId}`);

      return this.isGroupMemberWithRole(modelClass, modelId, userId, roleName)
        .then(res => {
          debug('Resolved to', res);
          cb(null, res);
        })
        .catch(cb);

      // return this.getTargetGroupId(context)
      //   .then(targetGroupId => {
      //     const actions = [ ];
      //
      //     actions.push(this.isGroupMemberWithRole(modelClass, modelId, userId, roleName));
      //
      //     // If this is an attempt to save the item into a new group, check the user has access to the target group.
      //     if (targetGroupId && targetGroupId !== modelId) {
      //       scope.targetGroupId = targetGroupId;
      //       actions.push(this.isGroupMemberWithRole(modelClass, targetGroupId, userId, roleName));
      //     }
      //
      //     return actions;
      //   })
      //   .spread((currentGroupCount, targetGroupCount) => {
      //     let res = false;
      //
      //     // Determine grant based on the current/target group context.
      //     res = currentGroupCount > 0;
      //
      //     debug(`user ${userId} ${res ? 'is a' : 'is not a'} ${roleName} of group ${modelId}`);
      //
      //     // If it's an attempt to save into a new group, also ensure the user has access to the target group.
      //     if (scope.targetGroupId && scope.targetGroupId !== modelId) {
      //       const tMember = targetGroupCount > 0;
      //
      //       debug(`user ${userId} ${tMember ? 'is a' : 'is not a'} ${roleName} of group ${scope.targetGroupId}`);
      //       res = res && tMember;
      //     }
      //
      //     // Note the fact that we are allowing access due to passing an ACL.
      //     if (res) {
      //       this.app.loopback.getCurrentContext().set('groupAccessApplied', true);
      //     }
      //
      //     debug(`${accessGroup} role resolver returns ${res} for user ${userId}`);
      //     return cb(null, res);
      //   })
      //   .catch(cb);
    });
  }

  /**
   * Check if a given user ID has a given role in the model instances group.
   * @param {Function} modelClass The model class
   * @param {*} modelId The model ID
   * @param {*} userId The user ID
   * @param {*} roleId The role ID
   * @param {Function} callback Callback function
   */
  isGroupMemberWithRole(modelClass, modelId, userId, roleId, cb) {
    cb = cb || createPromiseCallback();
    debug('isGroupMemberWithRole: modelClass: %o, modelId: %o, userId: %o, roleId: %o',
      modelClass && modelClass.modelName, modelId, userId, roleId);

    // No userId is present
    if (!userId) {
      process.nextTick(() => {
        cb(null, false);
      });
      return cb.promise;
    }

    // Is the modelClass GroupModel or a subclass of GroupModel?
    if (this.isGroupModel(modelClass)) {
      this.hasRoleInGroup(userId, roleId, modelId, context)
        .then(res => cb(null, res));
      return cb.promise;
    }

    modelClass.findById(modelId, (err, inst) => {
      if (err || !inst) {
        debug('Model not found for id %j', modelId);
        if (cb) cb(err, false);
        return;
      }
      debug('Model found: %j', inst);
      var groupId = inst[this.options.foreignKey];
      // Ensure groupId exists and is not a function/relation
      if (groupId && 'function' !== typeof groupId) {
        if (cb) {
          return this.hasRoleInGroup(userId, roleId, groupId, context)
            .then(res => cb(null, res));
        }
      } else {
        // Try to follow belongsTo
        for (var r in modelClass.relations) {
          var rel = modelClass.relations[r];
          if (rel.type === 'belongsTo' && isGroupModel(rel.modelTo)) {
            debug('Checking relation %s to %s: %j', r, rel.modelTo.modelName, rel);
            inst[r](processRelatedGroup);
            return;
          }
        }
        debug('No matching belongsTo relation found for model %j and group: %j', modelId, groupId);
        if (cb) cb(null, false);
      }

      function processRelatedGroup(err, group) {
        if (!err && group) {
          debug('Group found: %j', group.getId());
          if (cb) cb(null, this.hasRoleInGroup(userId, roleId, group.getId(), context, cb));
        } else {
          if (cb) cb(err, false);
        }
      }
    });
    return cb.promise;
  };

  hasRoleInGroup(userId, role, group, context, cb) {
    debug('hasRoleInGroup: role: %o, group: %o, userId: %o', role, group, userId);
    cb = cb || createPromiseCallback();
    const GroupAccess = this.app.models[this.options.groupAccessModel];
    const conditions = {
      userId,
      role,
    }
    conditions[this.options.foreignKey] = group;
    GroupAccess.count(conditions)
      .then(count => {
        const res = count > 0;

        debug(`user ${userId} has role ${role} in group ${group}: ${res}`);
        cb(null, res);
      })
    return cb.promise;
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

    // If we are accessing the group model directly, the group id is the model id.
    if (this.isGroupModel(context.model)) {
      process.nextTick(() => cb(null, context.modelId));
      return cb.promise;
    }

    // If we are accessing an existing model, get the group id from the existing model instance.
    // TODO: Cache this result so that it can be reused across each ACL lookup attempt.
    if (context.modelId) {
      debug(`fetching group id for existing model with id: ${context.modelId}`);
      context.model.findById(context.modelId, { }, {
        skipAccess: true
      })
        .then(item => {
          // TODO: Attempt to follow relationships in addition to the foreign key.
          if (item) {
            debug(`determined group id ${item[this.options.foreignKey]} from existing model ${context.modelId}`);
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
