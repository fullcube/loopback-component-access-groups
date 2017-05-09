'use strict'

const debug = require('debug')('loopback:component:access:context')
const Promise = require('bluebird')
const LoopBackContext = require('loopback-context')

module.exports = function userContextMiddleware() {
  debug('initializing user context middleware')
  // set current user to enable user access for remote methods
  return function userContext(req, res, next) {
    const loopbackContext = LoopBackContext.getCurrentContext()

    if (!loopbackContext) {
      debug('No user context (loopback current context not found)')
      return next()
    }

    if (!req.accessToken) {
      debug('No user context (access token not found)')
      return next()
    }

    loopbackContext.set('accessToken', req.accessToken.id)
    const { app } = req
    const UserModel = app.accessUtils.options.userModel || 'User'

    return Promise.join(
      app.models[UserModel].findById(req.accessToken.userId),
      app.accessUtils.getUserGroups(req.accessToken.userId),
      (user, groups) => {
        if (!user) {
          return next(new Error('No user with this access token was found.'))
        }
        loopbackContext.set('currentUser', user)
        loopbackContext.set('currentUserGroups', groups)
        debug('currentUser', user)
        debug('currentUserGroups', groups)
        return next()
      })
      .catch(next)
  }
}
