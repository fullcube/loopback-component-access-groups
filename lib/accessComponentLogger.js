var winston   = require('winston');

module.exports = function accessComponentLogger() {
  const ENV       = process.env.NODE_ENV;
  const LOG_LEVEL = process.env.PROTEUS_ACCESS_COMPONENT_LOG_LEVEL || 'info';

  return new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            colorize: true
        })
    ],
    level: LOG_LEVEL
  });
};
