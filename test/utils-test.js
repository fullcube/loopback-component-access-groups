'use strict'

const path = require('path')
const chai = require('chai')
const { expect } = chai

chai.use(require('dirty-chai'))
chai.use(require('sinon-chai'))

require('mocha-sinon')

const SIMPLE_APP = path.join(__dirname, 'fixtures', 'simple-app')
const app = require(path.join(SIMPLE_APP, 'server/server.js'))

describe('Utils', function() {
  describe('isGroupModel', function() {
    it('should return true for a group model', function() {
      const res = app.accessUtils.isGroupModel('Store')

      expect(res).to.be.true()
    })
    it('should return false for a model that is not a group model', function() {
      const res = app.accessUtils.isGroupModel('user')

      expect(res).to.be.false()
    })
  })

  describe('getGroupContentModels', function() {
    it('should return a list of group content models', function() {
      const groupContentModels = app.accessUtils.getGroupContentModels()

      expect(groupContentModels).to.be.an('array')
      expect(groupContentModels).to.deep.equal([ 'Invoice', 'Transaction' ])
    })
  })

  describe('buildFilter', function() {
    it('should return a where condition that includes all groups for a user (no groups)', function() {
      return app.accessUtils.buildFilter('generalUser')
        .then(filter => {
          expect(filter).to.deep.equal({
            storeId: {
              inq: [],
            },
          })
        })
    })
    it('should return a where condition that includes all groups for a user (1 group)', function() {
      return app.accessUtils.buildFilter('storeAdminA')
        .then(filter => {
          expect(filter).to.deep.equal({
            storeId: {
              inq: [ 'A' ],
            },
          })
        })
    })
  })

  describe('getUserGroups', function() {
    it('should return a list of groups for a user', function() {
      return app.accessUtils.getUserGroups('generalUser')
        .then(groups => {
          expect(groups).to.be.an('array')
          expect(groups).to.have.length(0)
          return app.accessUtils.getUserGroups('storeAdminA')
        })
        .then(groups => {
          expect(groups).to.be.an('array')
          expect(groups).to.have.length(1)
          expect(groups[0]).to.have.property('storeId', 'A')
          expect(groups[0]).to.have.property('role', 'admin')
          return app.accessUtils.getUserGroups('storeManagerA')
        })
        .then(groups => {
          expect(groups).to.be.an('array')
          expect(groups).to.have.length(1)
          expect(groups[0]).to.have.property('storeId', 'A')
          expect(groups[0]).to.have.property('role', 'manager')
        })
    })
  })
})
