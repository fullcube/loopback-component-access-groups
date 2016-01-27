'use strict';

const path = require('path');
const fileName = path.basename(__filename, '.js');
const debug = require('debug')(`server:middleware:${fileName}`);

module.exports = function() {
  return function accessLogger(req, res, next) {
    // enable audit log for API
    if (req.accessToken) {
      debug('req', req.method, req.originalUrl,
      // '\n\t', 'userId:', req.accessToken.id,
      /* '\n\t', */
      'token:', JSON.stringify(req.accessToken, null, 0)
      );
    }
    else {
      debug('req', req.method, req.originalUrl);
    }

    // http://www.senchalabs.org/connect/responseTime.html
    const start = new Date();

    if (res._responseTime) {
      return next();
    }
    res._responseTime = true;

    // install a listener for when the response is finished
    res.on('finish', () => {
      // the request was handled, print the log entry
      const duration = new Date() - start;

      debug('res', req.method, req.originalUrl,
        JSON.stringify({
          lbHttpMethod: req.method,
          lbUrl: req.originalUrl,
          lbStatusCode: res.statusCode,
          lbResponseTime: duration,
          lbResponseTimeUnit: 'ms'
        }, null, 0)
      );
    });

    // resume the routing pipeline,
    // let other middleware to actually handle the request
    return next();
  };
};
