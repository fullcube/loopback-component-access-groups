'use strict';

const debug = require('debug')('loopback:componenet:access:context');
const loopback = require('loopback');

module.exports = function userContextMiddleware() {
  // set current user to enable user access for remote methods
  return function userContext(req, res, next) {
    const loopbackContext = loopback.getCurrentContext();

    if (loopbackContext) {
      // starts : info for injecting into logs
      loopbackContext.set('ip', req.headers['x-real-ip'] ||
        req.ip ||
        req.connection.remoteAddress ||
        (req.socket && req.socket.remoteAddress) ||
        (req.socket.socket && req.socket.socket.remoteAddress)
      );

      if (!req.accessToken) {
        debug('No user context (access token not found)');
        return next();
      }

      // info for injecting into logs
      loopbackContext.set('accessToken', req.accessToken.id);
      const app = req.app;

      // TODO: instead of hardcoding XYZModel, should we be able to dynamically figure out Model to search on?
      app.models.user.findById(req.accessToken.userId, (err, user) => {
        if (err) {
          return next(err);
        }
        if (!user) {
          return next(new Error('No user with this access token was found.'));
        }

        // TODO: what merit could this hold?
        // res.locals.currentUser = user;

        // info for use by remote methods
        loopbackContext.set('currentUser', user);

        // info for injecting into logs
        loopbackContext.set('username', user.username);

        debug('currentUser', user);

        next();
      });
    }
    else {
      debug('No user context (loopback current context not found)');
      return next();
    }
  };
};
