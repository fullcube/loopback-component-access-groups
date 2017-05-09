'use strict'

const path = require('path')
const chai = require('chai')
const LoopBackContext = require('loopback-context')

const { expect } = chai

chai.use(require('dirty-chai'))
chai.use(require('sinon-chai'))

require('mocha-sinon')

const SIMPLE_APP = path.join(__dirname, 'fixtures', 'simple-app')
const app = require(path.join(SIMPLE_APP, 'server/server.js'))

describe('User Context Middleware', function() {
  describe('Without loopback context', function() {
    it('should return null', function() {
      const currentUser = app.models.user.getCurrentUser()

      expect(currentUser).to.be.null()
    })
  })

  describe('With user in loopback context', function() {
    it('should return the user', function() {
      LoopBackContext.runInContext(function() {
        const loopbackContext = LoopBackContext.getCurrentContext()
        const user = {
          id: 'generalUser',
          username: 'generalUser',
          password: '$2a$10$Hb5a4OK7ZK97zdziGLSYgOScOy2lRQi0Kd2RCkldxRk0hZo6Eemy6',
          email: 'generalUser@fullcube.com',
        }

        loopbackContext.set('currentUser', user)
        expect(app.models.user.getCurrentUser()).to.equal(user)
      })
    })
  })
})
