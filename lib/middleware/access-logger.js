'use strict'

const LoopBackContext = require('loopback-context')
const debug = require('debug')('loopback:component:access:logger')

module.exports = function accessLoggerMiddleware() {
  debug('initializing access logger middleware')
  return function accessLogger(req, res, next) {
    const loopbackContext = LoopBackContext.getCurrentContext({ bind: true })

    next = loopbackContext.bind(next)

    if (req.accessToken) {
      debug('req: %s %s, token: %o', req.method, req.originalUrl, req.accessToken)
    }
    else {
      debug('req', req.method, req.originalUrl)
    }

    const start = new Date()

    if (res._responseTime) {
      return next()
    }
    res._responseTime = true

    // install a listener for when the response is finished
    res.on('finish', () => {
      // the request was handled, print the log entry
      const duration = new Date() - start

      debug('res %s %s: %o', req.method, req.originalUrl, {
        lbHttpMethod: req.method,
        lbUrl: req.originalUrl,
        lbStatusCode: res.statusCode,
        lbResponseTime: duration,
        lbResponseTimeUnit: 'ms',
      }
      )
    })

    return next()
  }
}
