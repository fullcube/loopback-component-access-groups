'use strict';

const loopback = require('loopback');
const winston = require('winston');

module.exports = function getCurrentUserMixin(Model) {
  winston.debug(`initializing GetCurrentUser Mixin for model ${Model.modelName}`);

  Model.getCurrentUser = function getCurrentUser() {
    const ctx = loopback.getCurrentContext();
    const currentUser = ctx && ctx.get('currentUser') || null;

    if (ctx) {
      winston.debug(`${Model.definition.name}.getCurrentUser() - currentUser: ${currentUser}`);
    }
    else {
      // this means its a server-side logic call w/o any HTTP req/resp aspect to it.
      winston.debug(`${Model.definition.name}.getCurrentUser() - no loopback context`);
    }

    return currentUser;
  };
};
