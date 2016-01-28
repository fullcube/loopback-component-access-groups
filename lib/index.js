'use strict';

const debug = require('debug')('loopback:componenet:access');
const AccessUtils = require('./utils');

module.exports = function loopbackComponentAccess(app, options) {
  debug('initializing component');

  const loopback = app.loopback;
  const loopbackMajor = loopback && loopback.version &&
    loopback.version.split('.')[0] || 1;

  if (loopbackMajor < 2) {
    throw new Error('loopback-component-access requires loopback 2.0 or newer');
  }

  // Initialise our helper utilities.
  const accessUtils = new AccessUtils(app, options);

  // Set up a role resolver for each access group.
  options.accessGroups.forEach(accessGroup => {
    accessUtils.registerRoleResolvers(accessGroup);
  });
};
