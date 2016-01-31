'use strict';

const loopback = require('loopback');
const debug = require('debug')('loopback:componenet:access:utils');

module.exports = function getCurrentUserMixin(Model) {
  Model.getCurrentUser = function getCurrentUser() {
    const ctx = loopback.getCurrentContext();
    const currentUser = ctx && ctx.get('currentUser') || null;

    if (ctx) {
      debug(`${Model.definition.name}.getCurrentUser() - currentUser: %o`, currentUser);
    }
    else {
      // this means its a server-side logic call w/o any HTTP req/resp aspect to it.
      debug(`${Model.definition.name}.getCurrentUser() - no loopback context`);
    }

    return currentUser;
  };
};
