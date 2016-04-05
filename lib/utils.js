'use strict';

const debug = require('debug')('loopback:component:access');
const createPromiseCallback = require('loopback-datasource-juggler/lib/utils').createPromiseCallback;
const _defaults = require('lodash').defaults;
const _get = require('lodash').get;
const _isEmpty = require('lodash').isEmpty;
// const _includes = require('lodash').includes;
const Promise = require('bluebird');

module.exports = class AccessUtils {
  constructor(app, options) {
    this.app = app;

    this.options = _defaults({ }, options, {
      userModel: 'User',
      roleModel: 'Role',
      groupAccessModel: 'GroupAccess',
      groupModel: 'Group',
      foreignKey: 'groupId',
      groupRoles: [
        '$group:admin',
        '$group:member'
      ],
      groupContentModels: [],
      applyToStatic: false
    });

    // Default the foreignKey to the group model name + Id.
    this.options.foreignKey = this.options.foreignKey || `${this.options.groupModel.toLowerCase()}Id`;
    this.options.userIdKey = this.options.userIdKey || `${this.options.userModel.toLowerCase()}Id`;

    // Validate the format of options.groupRoles ($group:[role]).
    this.options.groupRoles.forEach(name => {
      if (!this.isValidPrincipalId(name)) {
        throw new Error(`${name} is an invalid access group name.`);
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
  setupFilters() {
    debug('Setting up access filters');
    const models = this.getGroupContentModels();

    models.forEach(modelName => {
      this.attachAccessObserver(modelName);
      this.attachBeforeSaveObserver(modelName);
    });
  }


  /**
   * Add access observer to a given model
   *
   * @param {String} Model name to add hook to.
   */
  attachAccessObserver(modelName) {
    const Model = this.app.models[modelName];

    if (!typeof Model.observe === 'function') {
      return;
    }

    debug('Attaching access observer to %s', modelName);
    Model.observe('access', (ctx, next) => {
      const currentUser = this.getCurrentUser();

      if (currentUser) {
        // Do not filter if options.skipAccess has been set.
        if (ctx.options.skipAccess) {
          debug('skipAccess: true - skipping access filters');
          return next();
        }

        // // Do not apply filters if no group access acls were applied.
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
            const where = _isEmpty(ctx.query.where) ? filter : {
              and: [ ctx.query.where, filter ]
            };

            ctx.query.where = where;
            debug('modified query: %s', JSON.stringify(ctx.query, null, 4));
          });
      }
      return next();
    });
  }

  /**
   * Add before save observer to a given model
   *
   * @param {String} Model name to add hook to.
   */
  attachBeforeSaveObserver(modelName) {
    const Model = this.app.models[modelName];

    // No need for a before save hook on the Group Model
    if (this.isGroupModel(Model) || !typeof Model.observe === 'function') {
      return;
    }

    debug('Attaching before save observer to %s', modelName);
    Model.observe('before save', (ctx, next) => {
      if (!ctx.isNewInstance) {
        debug('updating %s with params - %o', modelName, ctx.data);
        return next();
      }

      debug('original object before save %o', ctx.instance);

      const currentUser = this.getCurrentUser();
      const foreignKey = this.options.foreignKey;

      if (currentUser) {
        // Do not filter if options.skipAccess has been set.
        if (ctx.options.skipAccess) {
          debug('skipAccess: true - skipping access filters');
          return next();
        }

        // TODO (Alex): the code below assumes the foreignKey exists on the User model.
        // This has been written specifically for our app
        if (ctx.instance[foreignKey] && ctx.instance[foreignKey] !== currentUser[foreignKey]) {
          debug('object field %s - %s does not match currentUser - %s',
            foreignKey, ctx.instance[foreignKey], currentUser[foreignKey]);
        }

        debug('setting object field %s to %s',
          foreignKey, currentUser[foreignKey]);

        if (foreignKey && currentUser[foreignKey]) {
          ctx.instance[foreignKey] = currentUser[foreignKey];
          debug('updated object before save %o', ctx.instance);
        }

        // TODO: this is probably how we will handle this issue in the future, when a User
        // can belong to many groups... Below defaults the newly created model's group id
        // to the first group in the list of userGroups

        // return this.getUserGroups(currentUser.getId())
        //   .then(userGroups => {
        //     userGroups = Array.from(userGroups, group => group[this.options.foreignKey]);

        //     const isInvalidGroupId = !_includes(userGroups, ctx.instance[foreignKey]);

        //     if (isInvalidGroupId) {
        //       // User may be trying to save with unpermitted group id
        //       debug('object field %s - %s not found in userGroups - %o',
        //         foreignKey, ctx.instance[foreignKey], currentUser[foreignKey]);
        //     }

      //     if (!ctx.instance[foreignKey] || isInvalidGroupId) {
      //       // Set to first group id by default
      //       ctx.instance[foreignKey] = userGroups[0];
      //     }
      //   });
      }

      return next();
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
    debug('Appending filter');
    const filter = { };
    const key = this.isGroupModel(Model) ? Model.getIdName() : this.options.foreignKey;
    // TODO: Support key determination based on the belongsTo relationship.

    return this.getUserGroups(userId)
      .then(userGroups => {
        debug('original userGroups: %o', userGroups);
        const userGroupIds = Array.from(userGroups, group => group[this.options.foreignKey]);

        filter[key] = { inq: userGroupIds };

        debug('where filter built from userGroupIds: %o - %o', userGroupIds, filter);
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
    if (!this.options.groupContentModels || !Array.isArray(this.options.groupContentModels)) {
      this.options.groupContentModels = [ ];
    }

    if (this.options.groupContentModels.length) {
      return this.options.groupContentModels;
    }

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
          this.options.groupContentModels.push(modelName);
        }
      }
    });

    debug('Got group content models: %o', this.options.groupContentModels);
    return this.options.groupContentModels;
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
        [this.options.userIdKey]: userId
      }
    })
      .then(groups => {
        debug('getUserGroups returning from datastore: %o', groups);
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
   * @returns {Array} Returns a list of access groups the user is a member of.
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
      cb = cb || createPromiseCallback();
      const modelClass = context.model;
      const modelId = context.modelId;
      const userId = context.getUserId();
      const roleName = this.extractRoleName(role);
      const GroupAccess = this.app.models[this.options.groupAccessModel];
      const scope = { };

      // No userId is present
      if (!userId) {
        process.nextTick(() => {
          debug('Deny access for anonymous user');
          cb(null, false);
        });
        return cb.promise;
      }

      /**
       * Basic application that does not cover static methods. Similar to $owner. (RECOMMENDED)
       */
      if (!this.options.applyToStatic) {
        debug('%o', context);
        if (!context || !modelClass || !modelId) {
          process.nextTick(() => {
            debug('Deny access (context: %s, context.model: %s, context.modelId: %s)',
              Boolean(context), Boolean(modelClass), Boolean(modelId));
            cb(null, false);
          });
          return cb.promise;
        }


        debug(`Role resolver for ${role}: evaluate ${modelClass.modelName} with id: ${modelId} for user: ${userId}`);

        this.isGroupMemberWithRole(modelClass, modelId, userId, roleName)
          .then(res => {
            if (res) {
              // Note the fact that we are allowing access due to passing an ACL.
              this.app.loopback.getCurrentContext().set('groupAccessApplied', true);
            }

            debug('Passed the ACL: %o', res);

            return cb(null, res);
          })
          .catch(cb);

        return cb.promise;
      }

      /**
       * More complex application that also covers static methods. (EXPERIMENTAL)
       */
      Promise.join(this.getCurrentGroupId(context), this.getTargetGroupId(context),
        (currentGroupId, targetGroupId) => {
          debug('currentGroupId - %s, targetGroupId - %s', currentGroupId, targetGroupId);
          if (!currentGroupId) {
            // TODO: Use promise cancellation to abort the chain early.
            // Causes the access check to be bypassed (see below).
            return [ false ];
          }

          scope.currentGroupId = currentGroupId;
          scope.targetGroupId = targetGroupId;
          const actions = [ ];
          const conditions = {
            [this.options.userIdKey]: userId,
            [this.options.foreignKey]: currentGroupId,
            role: roleName
          };

          actions.push(GroupAccess.count(conditions));

          // If this is an attempt to save the item into a new group, check the user has access to the target group.
          if (targetGroupId && targetGroupId !== currentGroupId) {
            conditions[this.options.foreignKey] = targetGroupId;
            actions.push(GroupAccess.count(conditions));
          }

          return actions;
        })
        .spread((currentGroupCount, targetGroupCount) => {
          let res = false;

          if (currentGroupCount === false) {
            // No group context was determined, so allow passthrough access.
            res = true;
          }
          else {
            // Determine grant based on the current/target group context.
            res = currentGroupCount > 0;

            debug(`user ${userId} ${res ? 'is a' : 'is not a'} ${roleName} of group ${scope.currentGroupId}`);

            // If it's an attempt to save  into a new group, also ensure the user has access to the target group.
            if (scope.targetGroupId && scope.targetGroupId !== scope.currentGroupId) {
              const tMember = targetGroupCount > 0;

              debug(`user ${userId} ${tMember ? 'is a' : 'is not a'} ${roleName} of group ${scope.targetGroupId}`);
              res = res && tMember;
            }
          }

          // Note the fact that we are allowing access due to passing an ACL.
          if (res) {
            this.app.loopback.getCurrentContext().set('groupAccessApplied', true);
          }

          debug('Passed the ACL: %o', res);
          return cb(null, res);
        })
        .catch(cb);
      return cb.promise;
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
      debug('Access to Group Model %s attempted', modelId);
      this.hasRoleInGroup(userId, roleId, modelId)
        .then(res => cb(null, res));
      return cb.promise;
    }

    modelClass.findById(modelId, (err, inst) => {
      if (err || !inst) {
        debug('Model not found for id %j', modelId);
        return cb(err, false);
      }
      debug('Model found: %j', inst);
      const groupId = inst[this.options.foreignKey];

      // Ensure groupId exists and is not a function/relation
      if (groupId && typeof groupId !== 'function') {
        return this.hasRoleInGroup(userId, roleId, groupId)
          .then(res => cb(null, res));
      }
      // Try to follow belongsTo
      for (const relName in modelClass.relations) {
        const rel = modelClass.relations[relName];

        if (rel.type === 'belongsTo' && this.isGroupModel(rel.modelTo)) {
          debug('Checking relation %s to %s: %j', relName, rel.modelTo.modelName, rel);
          return inst[relName](function processRelatedGroup(error, group) {
            if (!error && group) {
              debug('Group found: %j', group.getId());
              return cb(null, this.hasRoleInGroup(userId, roleId, group.getId()));
            }
            return cb(error, false);
          });
        }
      }
      debug('No matching belongsTo relation found for model %j and group: %j', modelId, groupId);
      return cb(null, false);
    });
    return cb.promise;
  }

  hasRoleInGroup(userId, roleName, groupId, cb) {
    debug('hasRoleInGroup: role: %o, groupId: %o, userId: %o', roleName, groupId, userId);
    cb = cb || createPromiseCallback();
    const GroupAccess = this.app.models[this.options.groupAccessModel];
    const conditions = {
      [this.options.userIdKey]: userId,
      role: roleName
    };

    conditions[this.options.foreignKey] = groupId;
    GroupAccess.count(conditions)
      .then(count => {
        const res = count > 0;

        debug(`User ${userId} ${res ? 'HAS' : 'DOESNT HAVE'} ${roleName} role in groupId ${groupId}`);
        cb(null, res);
      });

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
