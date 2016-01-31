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

  // Initialise helper class.
  const accessUtils = new AccessUtils(app, options);

  app.accessUtils = accessUtils;

  // Set up role resolvers.
  accessUtils.setupRoleResolvers();
  accessUtils.setupModels();
};
