'use strict';

const debug = require('debug')('loopback:component:access:logger');
const winston = require('winston');
const chalk = require('chalk');

module.exports = function accessLoggerMiddleware() {
  debug('initializing access logger middleware');
  return function accessLogger(req, res, next) {
    if (req.accessToken) {
      winston.debug(`${chalk.green('Start Request')} - ${req.method} ${req.originalUrl}`);
    }
    else {
      debug('req', req.method, req.originalUrl);
    }

    const start = new Date();

    if (res._responseTime) {
      return next();
    }
    res._responseTime = true;

    // install a listener for when the response is finished
    res.on('finish', () => {
      // the request was handled, print the log entry
      const duration = new Date() - start;

      winston.debug(`${chalk.green('Finish Request')} - ${req.method} ${req.originalUrl} lbHttpMethod: ${req.method} lbUrl ${req.originalUrl} lbStatusCode ${res.statusCode} lbResponseTime  ${duration} lbResponseTimeUnit: 'ms'`);
    });

    return next();
  };
};
