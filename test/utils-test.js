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
    it('should return a where condiditon that includes all tenants for a user (no tenants)', function() {
      return app.accessUtils.buildFilter('generalUser')
        .then(filter => {
          expect(filter).to.deep.equal({
            programId: {
              inq: []
            }
          });
        });
    });
    it('should return a where condiditon that includes all tenants for a user (1 tenant)', function() {
      return app.accessUtils.buildFilter('programAdminA')
        .then(filter => {
          expect(filter).to.deep.equal({
            programId: {
              inq: [ 'A' ]
            }
          });
        });
    });
  });

  describe('getUserTenants', function() {
    it('should return a list of tenants for a user', function() {
      return app.accessUtils.getUserTenants('generalUser')
        .then(tenants => {
          expect(tenants).to.be.an('array');
          expect(tenants).to.have.length(0);
          return app.accessUtils.getUserTenants('programAdminA');
        })
        .then(tenants => {
          expect(tenants).to.be.an('array');
          expect(tenants).to.have.length(1);
          expect(tenants[0]).to.have.property('programId', 'A');
          expect(tenants[0]).to.have.property('role', 'admin');
          return app.accessUtils.getUserTenants('programManagerA');
        })
        .then(tenants => {
          expect(tenants).to.be.an('array');
          expect(tenants).to.have.length(1);
          expect(tenants[0]).to.have.property('programId', 'A');
          expect(tenants[0]).to.have.property('role', 'manager');
        });
    });
  });
});
