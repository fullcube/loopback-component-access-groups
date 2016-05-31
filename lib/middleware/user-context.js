'use strict';

const debug = require('debug')('loopback:component:access:context');
const loopback = require('loopback');
const Promise = require('bluebird');
const logger = require('../accessComponentLogger')();
const _ = require('lodash');

module.exports = function userContextMiddleware() {
  debug('initializing user context middleware');
  // set current user to enable user access for remote methods
  return function userContext(req, res, next) {
    const loopbackContext = loopback.getCurrentContext();
    if (!loopbackContext) {
      logger.warning(`No user context (loopback current context not found)`);
      return next();
    }

    if (!req.accessToken) {
      debug('No user context (access token not found)');
      return next();
    }

    loopbackContext.set('accessToken', req.accessToken.id);
    logger.debug(`User Context Middleware - Token Id: ${req.accessToken.id} Token User Id: ${req.accessToken.userId}`)

    const app = req.app;
    const UserModel = app.accessUtils.options.userModel || 'User';

    return Promise.join(
      app.models[UserModel].findById(req.accessToken.userId),
      app.accessUtils.getUserGroups(req.accessToken.userId),
      (user, groups) => {
        if (!user) {
          return next(new Error('No user with this access token was found.'));
        }
        loopbackContext.set('currentUser', user);
        loopbackContext.set('currentUserGroups', groups);

        const userJSON = JSON.stringify({
          id:     user.id,
          email:  user.email,
          orgId:  user.orgId
        });
        const groupsJSON = JSON.stringify(groups);

        logger.debug(`Setting currentUser as ${userJSON}`);
        logger.debug(`Setting currentUserGroup as ${groupsJSON}`);

        debug('currentUser', user);
        debug('currentUserGroups', groups);
        return next();
      })
      .catch(next);
  };
};
