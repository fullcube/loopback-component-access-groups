'use strict';

const path = require('path');
const chai = require('chai');
const expect = chai.expect;
// const tbd = require('chai-tbd');

chai.use(require('dirty-chai'));
chai.use(require('sinon-chai'));
require('mocha-sinon');

const SIMPLE_APP = path.join(__dirname, 'fixtures', 'simple-app');
const app = require(path.join(SIMPLE_APP, 'server/server.js'));

describe('Utils', function() {
  describe('buildFilter', function() {
    it('should return a where condition that includes all groups for a user (no groups)', function() {
      return app.accessUtils.buildFilter('generalUser')
        .then(filter => {
          expect(filter).to.deep.equal({
            storeId: {
              inq: []
            }
          });
        });
    });
    it('should return a where condition that includes all groups for a user (1 group)', function() {
      return app.accessUtils.buildFilter('storeAdminA')
        .then(filter => {
          expect(filter).to.deep.equal({
            storeId: {
              inq: [ 'A' ]
            }
          });
        });
    });
  });

  describe('getUserGroups', function() {
    it('should return a list of groups for a user', function() {
      return app.accessUtils.getUserGroups('generalUser')
        .then(groups => {
          expect(groups).to.be.an('array');
          expect(groups).to.have.length(0);
          return app.accessUtils.getUserGroups('storeAdminA');
        })
        .then(groups => {
          expect(groups).to.be.an('array');
          expect(groups).to.have.length(1);
          expect(groups[0]).to.have.property('storeId', 'A');
          expect(groups[0]).to.have.property('role', 'admin');
          return app.accessUtils.getUserGroups('storeManagerA');
        })
        .then(groups => {
          expect(groups).to.be.an('array');
          expect(groups).to.have.length(1);
          expect(groups[0]).to.have.property('storeId', 'A');
          expect(groups[0]).to.have.property('role', 'manager');
        });
    });
  });
});
