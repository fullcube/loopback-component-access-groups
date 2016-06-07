'use strict';

const debug = require('debug')('loopback:component:access');
const util = require('util');
const logger = require('./accessComponentLogger')();
const chalk   = require('chalk');

const createPromiseCallback = require('loopback-datasource-juggler/lib/utils').createPromiseCallback;
const _defaults = require('lodash').defaults;
const _get = require('lodash').get;
const _isEmpty = require('lodash').isEmpty;
const _includes = require('lodash').includes;
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
      entityAccessModel: 'EntityAccess',
      entityRoles: [
        '$entity:admin',
        '$entity:member'
      ],
      entityContentModels: [],
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
    logger.debug(chalk.yellow(`Initializing Access Control`));
    logger.debug(`Access Control Options: ${JSON.stringify(options)}`);
  }

  /**
   * Register a dynamic role resolver for each defined access group.
   */
  setupRoleResolvers() {
    logger.debug(chalk.yellow(`Setup Role Resolvers`));
    this.options.groupRoles.forEach(accessGroup => {
      this.setupRoleResolver(accessGroup);
    });

    /** New Code - Per Entity Resolver **/
    // this.options.entityRoles.forEach(accessEntity => {
    //   this.setupEntityRoleResolver(accessEntity);
    // });
  }

  /**
   * Add operation hooks to limit access.
   */
  setupFilters() {
    logger.debug(chalk.yellow(`Setup Filters`));
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
    const _modelName = modelName;

    if (!typeof Model.observe === 'function') {
      return;
    }

    logger.debug(`ACCESS observer - Attaching access observer to ${_modelName}`);
    Model.observe('access', (ctx, next) => {
      const ctxJSON = JSON.stringify(ctx.query);
      const currentUser = this.getCurrentUser();

      logger.debug('ACCESS observer - Observing access for', modelName);

      if (currentUser) {
        // Do not filter if options.skipAccess has been set.
        if (ctx.options.skipAccess) {
          logger.debug(`ACCESS observer - skipAccess: true, no filter applied`);
          return next();
        }

        // // Do not apply filters if no group access acls were applied
        const loopbackContext = this.app.loopback.getCurrentContext();
        const groupAccessApplied = loopbackContext && loopbackContext.get('groupAccessApplied') || false;

        if (!groupAccessApplied) {
          logger.debug(`ACCESS observer - groupAccessApplied: false - returning without adding ACCESS filter to query`);
          return next();
        }

        // logger.debug('%s observe access: query=%s, options=%o, hookState=%o',
        //   Model.modelName, JSON.stringify(ctx.query, null, 4), ctx.options, ctx.hookState);

        return this.buildFilter(currentUser.getId(), ctx.Model)
          .then(filter => {

            logger.debug('ACCESS observer - appending to query:', filter);

            const where = _isEmpty(ctx.query.where) ? filter : {
              and: [ ctx.query.where, filter ]
            };

            ctx.query.where = where;
            const modifiedQuery = JSON.stringify(ctx.query);
            logger.debug(`ACCESS observer - Modified query for model ${_modelName}: ${modifiedQuery}`);
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

    logger.debug(`BEFORE SAVE observer - Attaching before save observer to ${modelName}`);
    Model.observe('before save', (ctx, next) => {

      // Only update GroupId  on new instances
      if (!ctx.isNewInstance) {
        return next();
      }

      logger.debug(`BEFORE SAVE observer - Original data before save ctx.instance ${util.inspect(ctx.instance)}`);

      const currentUser = this.getCurrentUser();
      const foreignKey = this.options.foreignKey;

      if (currentUser) {
        // Do not filter if options.skipAccess has been set.
        if (ctx.options.skipAccess) {
          logger.debug(`BEFORE SAVE observer - skipAccess: true, don't update ${foreignKey} for ${modelName} ${JSON.stringify(ctx.query)}`);
          return next();
        }

        // TODO (Alex): the code below assumes the foreignKey exists on the User model.
        // This has been written specifically for our app
        if (ctx.instance[foreignKey] && ctx.instance[foreignKey] !== currentUser[foreignKey]) {
          logger.warn(`BEFORE SAVE observer - Object field ${foreignKey} - ${ctx.instance[foreignKey]} does not match currentUser - ${currentUser[foreignKey]}`);
        }

        let foreignKeySet = Boolean(ctx.instance[foreignKey]);
        if (!foreignKeySet) {
          logger.warn(`BEFORE SAVE observer - Object field ${foreignKey} not set for ${modelName} on query ${JSON.stringify(ctx.query)}`);
        }

        if (foreignKeySet) {
          logger.debug(`BEFORE SAVE observer - Foreign key already set ${ctx.instance[foreignKey]}`);
        } else if (foreignKey && currentUser[foreignKey]) {
          logger.debug(`BEFORE SAVE observer - Setting object field ${foreignKey} to ${currentUser[foreignKey]}`);
          ctx.instance[foreignKey] = currentUser[foreignKey];
        } else {
          logger.debug(`BEFORE SAVE observer - unable to update object foreignKey`);
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
    const filter = { };
    const key = this.isGroupModel(Model) ? Model.getIdName() : this.options.foreignKey;
    // TODO: Support key determination based on the belongsTo relationship.

    return this.getUserGroups(userId)
      .then(userGroups => {
        const userGroupIds = Array.from(userGroups, group => group[this.options.foreignKey]);
        filter[key] = { inq: userGroupIds };
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

    logger.debug(`Got group content models: ${this.options.groupContentModels}`);
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


    // TODO: set force to true(?) or alert if
    // currentUserGroups includes org 158 and userId is not 72
    if (currentUserGroups && Array.isArray(currentUserGroups)) {
      let shouldAlert = currentUserGroups.find(group => {
        return group[this.options.foreignKey] === 158; // explicitly check for problem id (158)
      });

      if (shouldAlert) {
        logger.error('!!! potential incorrect user group in', JSON.stringify(currentUserGroups));
        logger.error(`!!! current user id: ${currentUser && currentUser.getId()}, user id: ${userId}`);
      }
    }

    // Return from the context cache if exists.
    if (!force && currentUser && currentUser.getId() === userId) {
      logger.debug(`getUserGroups - returning from ${chalk.blue('cache')}: ${JSON.stringify(currentUserGroups)}`);
      process.nextTick(() => cb(null, currentUserGroups));
      return cb.promise;
    }

    logger.debug(`getUserGroups - Skipping over getting from cache - currentUser ${JSON.stringify(currentUser)} currentUser.getId ${currentUser && currentUser.getId()} userId ${userId}`);
    // Otherwise lookup from the datastore.
    this.app.models[this.options.groupAccessModel].find({
      where: {
        [this.options.userIdKey]: userId
      }
    })
      .then(groups => {
        const groupsJSON = JSON.stringify(groups);
        logger.debug(`getUserGroups - returning from ${chalk.blue('datastore')}: ${groupsJSON}`);

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
   * Extract the role type from a principle id (eg, for '$group:admin' the role type is 'group')
   * @param  {String} principleId
   * @return {Boolean} Returns princple type
   */
  extractRoleType(principleId) {
    return principleId.split(':')[0];
  }

  /**
   * Extract the role name from a principalId (eg, for '$group:admin' the role name is 'admin').
   *
   * @param {String} principalId A principalId.
   * @returns {string} returns the principle name
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
    logger.debug(`ROLE RESOLVER - Registering for ${accessGroup}`);
    const Role = this.app.models[this.options.roleModel];

    Role.registerResolver(accessGroup, (role, context, cb) => {
      logger.debug('ROLE RESOLVER - Hitting role resolver for', context.modelName, context.method);

      cb = cb || createPromiseCallback();
      const modelName = context.modelName;
      const property = context.property;
      const method = context.method;
      const modelClass = context.model;
      const modelId = context.modelId;
      const userId = context.getUserId();
      const roleName = this.extractRoleName(role);
      const GroupAccess = this.app.models[this.options.groupAccessModel];
      const remotingData = _get(context, `remotingContext.args.data`);
      const scope = { };

      logger.debug(`ROLE RESOLVER - role: ${chalk.blue(accessGroup)} model: ${chalk.blue(modelName)} method: ${chalk.blue(method)} userId: ${chalk.blue(userId)} modelId: ${chalk.blue(modelId)} with remoting data: ${util.inspect(remotingData)}`);
      // No userId is present
      if (!userId) {
        process.nextTick(() => {
          logger.debug(`ROLE RESOLVER - Deny access for anonymous user`);
          cb(null, false);
        });
        return cb.promise;
      }

      // Determine if passes ACL
      Promise.join(this.getCurrentGroupId(context), this.getTargetGroupId(context),
        (currentGroupId, targetGroupId) => {
          if (!currentGroupId) {
            // TODO: Use promise cancellation to abort the chain early.
            // Causes the access check to be bypassed (see below).
            logger.debug(`ROLE RESOLVER - Could not get group id, skipping ACL check for ${chalk.blue(accessGroup)} on model ${chalk.blue(modelName)} for method ${chalk.bold(method)}`);
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
          let bAllowAccess = false;

          if (currentGroupCount === false) {
            logger.debug('ROLE RESOLVER - No group context was determined, so allow passthrough access')
            // No group context was determined, so allow passthrough access.
            bAllowAccess = true;
          }
          else {
            // Determine grant based on the current/target group context.
            bAllowAccess = currentGroupCount > 0;

            logger.debug(`ROLE RESOLVER - User ${userId} ${bAllowAccess ? 'has role' : 'does not have role'} ${roleName} in group ${scope.currentGroupId}`);

            // If it's an attempt to save into a new group, also ensure the user has access to the target group.
            if (scope.targetGroupId && scope.targetGroupId !== scope.currentGroupId) {
              const tMember = targetGroupCount > 0;

              logger.debug(`ROLE RESOLVER - Attempting save into new target group, User ${userId} ${tMember ? 'has role' : 'does not have'} ${roleName} in target group ${scope.targetGroupId}`);
              bAllowAccess = bAllowAccess && tMember;
            }
          }

          // Note the fact that we are allowing access due to passing an ACL.
           if (bAllowAccess) {
            logger.debug('ROLE RESOLVER - Allowing access due to passing an ACL');
            this.app.loopback.getCurrentContext().set('groupAccessApplied', true);
          }

          logger.debug(`ROLE RESOLVER - ${accessGroup} ${modelName}.${method} ACL check: ${chalk.blue(bAllowAccess)}`);
          return cb(null, bAllowAccess);
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
    logger.debug(`isGroupMemberWithRole: modelClass: ${modelClass && modelClass.modelName}, modelId: ${modelId}, userId: ${userId}, roleId: ${roleId}`);

    // No userId is present
    if (!userId) {
      process.nextTick(() => {
        cb(null, false);
      });
      return cb.promise;
    }

    // Is the modelClass GroupModel or a subclass of GroupModel?
    if (this.isGroupModel(modelClass)) {
      logger.debug(`Access to Group Model ${modelId} attempted`);
      this.hasRoleInGroup(userId, roleId, modelId)
        .then(res => cb(null, res));
      return cb.promise;
    }

    modelClass.findById(modelId, (err, inst) => {
      if (err || !inst) {
        logger.debug(`Model not found for id ${modelId}`);
        return cb(err, false);
      }
      logger.debug(`Model found: ${inst}`);
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
          logger.debug('Checking relation %s to %s: %j', relName, rel.modelTo.modelName, rel);
          return inst[relName](function processRelatedGroup(error, group) {
            if (!error && group) {
              logger.debug('Group found: %j', group.getId());
              return cb(null, this.hasRoleInGroup(userId, roleId, group.getId()));
            }
            return cb(error, false);
          });
        }
      }
      logger.debug(`No matching belongsTo relation found for model ${modelId} and group: ${groupId}`);
      return cb(null, false);
    });
    return cb.promise;
  }

  hasRoleInGroup(userId, roleName, groupId, cb) {
    logger.debug(`hasRoleInGroup: role: ${roleName}, groupId: ${groupId}, userId: ${userId}`);
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

        logger.debug(`User ${userId} ${res ? 'HAS' : 'DOESNT HAVE'} ${roleName} role in groupId ${groupId}`);
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
      logger.debug(`fetching group id for model ${context.modelName} with id: ${context.modelId} for method ${context.method}`);
      context.model.findById(context.modelId, { }, {
        skipAccess: true
      })
        .then(modelInstance => {
          // TODO: Attempt to follow relationships in addition to the foreign key.
          if (modelInstance) {
            logger.debug(`Determined group id ${modelInstance[this.options.foreignKey]} from model ${context.modelName} with id ${context.modelId} for method ${context.method}`);
            groupId = modelInstance[this.options.foreignKey];
          }
          cb(null, groupId);
        })
        .catch(cb);
    }

    // If we are creating a new model, get the foreignKey from the incoming data.
    else if (_get(context, `remotingContext.args.data[${this.options.foreignKey}]`)) {
      logger.debug(`Determined current group id ${groupId} from remoting incoming data for model ${context.modelName} for method ${context.method}`);
      groupId = context.remotingContext.args.data[this.options.foreignKey];
      process.nextTick(() => cb(null, groupId));
    }

    // Otherwise, return null.
    else {
      process.nextTick(() => cb(null, null));
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

    const methodName = context.method;
    const modelName = context.modelName;

    // Get the target group id from the incoming data.
    if (_get(context, `remotingContext.args.data[${this.options.foreignKey}]`)) {
      logger.debug(`Determined target group id ${groupId} from incoming data for model ${modelName} for method ${methodName}`);
      groupId = context.remotingContext.args.data[this.options.foreignKey];
    }

    // Otherwise, return null.
    else {
    }

    process.nextTick(() => cb(null, groupId));

    return cb.promise;
  }

  /** NEW CODE: Per Entity Role Resolveers **/

  setupEntityRoleResolver(accessGroup) {
    logger.debug(`Registering entity role resolver for ${chalk.blue(accessGroup)}`)
    const Role = this.app.models[this.options.roleModel];

    Role.registerResolver(accessGroup, (role, context, cb) => {
      cb = cb || createPromiseCallback();
      const modelClass    = context.model;
      const modelId       = context.modelId;
      const userId        = context.getUserId();
      const roleType      = this.extractRoleType(role);
      const roleName      = this.extractRoleName(role);

      const entityName    = 'Order';
      const scope         = { };


      return this.hasRoleInEntity(userId, roleName, entityName, modelId, cb);
    });
  }

  hasRoleInEntity(userId, roleName, entityName, entityId, groupId, cb) {
    cb = cb || createPromiseCallback();
    const EntityAccess  = this.app.models[this.options.entityAccessModel];

    const conditions = {
      [this.options.userIdKey]: userId,
      entityName: entityName,
      entityId: entityId,
      // [this.options.foreignKey]: groupId,
      role: roleName
    };

    EntityAccess.count(conditions)
      .then(count => {
        const res = count > 0;

        logger.debug(`User ${userId} ${res ? 'HAS' : 'DOES NOT HAVE'} ${roleName} role in entity ${entityName} id ${entityId}`);
        cb(null, res);
      });

    return cb.promise;
  }
};
