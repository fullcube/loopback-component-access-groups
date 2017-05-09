'use strict'

module.exports = function userCustomizer(user) {
  user.currentUser = function(cb) {
    return process.nextTick(() => cb(null, user.getCurrentUser()))
  }
  return user
}
