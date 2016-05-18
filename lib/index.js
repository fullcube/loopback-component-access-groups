'use strict';

const debug         = require('debug')('loopback:component:access');
const winston       = require('winston');

const AccessUtils   = require('./utils');
const accessLogger  = require('./middleware/access-logger');
const userContext   = require('./middleware/user-context');

module.exports = function loopbackComponentAccess(app, options) {
  debug('initializing component');
  const loopback = app.loopback;
  const loopbackMajor = loopback && loopback.version &&
    loopback.version.split('.')[0] || 1;

  if (loopbackMajor < 2) {
    throw new Error('loopback-component-access-groups requires loopback 2.0 or newer');
  }

  // Initialize middleware
  app.middleware('auth:after', userContext());
  app.middleware('routes:before', accessLogger());

  // Initialise helper class.
  const accessUtils = new AccessUtils(app, options);

  app.accessUtils = accessUtils;

  // Set up role resolvers.
  accessUtils.setupRoleResolvers();

  // Set up model opertion hooks.
  accessUtils.setupFilters();

// TODO: Create Group Access model automatically if one hasn't been specified
};

function setupLoggers() {
  const ENV               = process.env.NODE_ENV;
  const LOG_LEVEL = process.env.PROTEUS_ACCESS_COMPONENT_LOG_LEVEL;

  const logLevel = LOG_LEVEL || (ENV === 'dev' ? 'debug' : 'warn');
  winston.loggers.add('access-component-logger', {
    console: {
      level: 'debug',
      colorize: true,
      label: 'access-component-logger'
    }
  });
}
