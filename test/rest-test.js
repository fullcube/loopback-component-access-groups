'use strict';

/* eslint max-nested-callbacks: 0 */

const path = require('path');
const request = require('supertest-as-promised');
const chai = require('chai');
const expect = chai.expect;
const _includes = require('lodash').includes;
// const tbd = require('chai-tbd');

chai.use(require('dirty-chai'));
chai.use(require('sinon-chai'));
require('mocha-sinon');

const SIMPLE_APP = path.join(__dirname, 'fixtures', 'simple-app');
const app = require(path.join(SIMPLE_APP, 'server/server.js'));

function json(verb, url) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

/* --------------------- */

function logInAs(name) {
  return json('post', '/api/users/login')
    .send({ username: name, password: 'password' })
    .expect(200);
}

/* --------------------- */

describe('REST API', function() {
  describe('Role: unauthenticated', function() {
    it('should not allow access to list invoices without access token', function() {
      return json('get', '/api/invoices')
        .expect(401);
    });

    it('should not allow access to a teams invoice without access token', function() {
      return json('get', '/api/invoices/1')
        .expect(401);
    });
  });

  const users = [
    {
      username: 'generalUser',
      abilities: []
    }, {
      username: 'storeMemberA',
      abilities: [ 'read' ]
    }, {
      username: 'storeManagerA',
      abilities: [ 'create', 'read', 'update' ]
    }, {
      username: 'storeAdminA',
      abilities: [ 'create', 'read', 'update', 'delete' ]
    }
  ];

  users.forEach(user => {
    describe(`${user.username} (User with ${user.abilities.join(', ')} permissions):`, function() {
      // related group content
      describe('group model', function() {
        if (_includes(user.abilities, 'read')) {
          it('should get a teams store', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/stores/A?access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('name', 'Store A');
              });
          });
        }
        it('should not get another teams store', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/stores/B?access_token=${res.body.id}`)
              .expect(401));
        });
      });

      // related group content
      describe('related group content', function() {
        if (_includes(user.abilities, 'read')) {
          it('should fetch an invoices related transactions from the same team', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/1/transactions?access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(2);
                expect(res.body[0]).to.have.property('id', 1);
                expect(res.body[1]).to.have.property('id', 2);
              });
          });
        }
        it('should not fetch an invoice via a relationship from another teams transaction', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/transactions/3/invoice?access_token=${res.body.id}`)
              .expect(401));
        });
      });
      // end related group content
      // exists
      describe('exists', function() {
        if (_includes(user.abilities, 'read')) {
          it('should check if a teams invoice exists by group id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/1/exists?&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('exists', true);
              });
          });
        }
        else {
          it('should not check if a teams invoice exists by group id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/1/exists?access_token=${res.body.id}`)
                .expect(401));
          });
        }
        it('should not check if another teams invoice exists by group id', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices/2/exists?access_token=${res.body.id}`)
              .expect(401));
        });
        it('should return false when checking for existance of a invoice that doesnt exist', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices/unknown-id/exists?access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('object');
              expect(res.body).to.have.property('exists', false);
            });
        });
      });
      // end exists

      // count
      describe('count', function() {
        if (_includes(user.abilities, 'read')) {
          it('should count a teams invoices by group id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/count?where[storeId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 2);
              });
          });
        }
        else {
          it('should not find a teams invoices by group id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/count?where[storeId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 0);
              });
          });
        }
        it('should not count another teams invoices by group id', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices/count?where[storeId]=B&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('object');
              expect(res.body).to.have.property('count', 0);
            });
        });

        if (_includes(user.abilities, 'read')) {
          it('should count a teams invoices by invoiceNumber', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/count?where[invoiceNumber]=1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 1);
              });
          });
        }
        else {
          it('should not count a teams invoices by invoiceNumber', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/count?where[invoiceNumber]=1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 0);
              });
          });
        }
        it('should not count another teams invoices by invoiceNumber', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices/count?where[invoiceNumber]=2&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('object');
              expect(res.body).to.have.property('count', 0);
            });
        });

        const filter = JSON.stringify({
          and: [ {
            status: 'active'
          }, {
            storeId: {
              inq: [ 'A', 'B' ]
            }
          } ]
        });

        if (_includes(user.abilities, 'read')) {
          it('should limit count results to a teams invoices with a complex filter', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/count?where=${filter}&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 1);
              });
          });
        }
        else {
          it('should limit count results to a teams invoices with a complex filter', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/count?where=${filter}&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 0);
              });
          });
        }
      });
      // end count

      // find
      describe('find', function() {
        if (_includes(user.abilities, 'read')) {
          it('should find a teams invoices', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(2);
                expect(res.body[0]).to.have.property('invoiceNumber', 1);
                expect(res.body[1]).to.have.property('invoiceNumber', 3);
              });
          });
          it('should find a teams invoices by group id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter[where][storeId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(2);
                expect(res.body[0]).to.have.property('invoiceNumber', 1);
                expect(res.body[1]).to.have.property('invoiceNumber', 3);
              });
          });
        }
        else {
          it('should not find a teams invoices', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
          it('should not find a teams invoices by group id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter[where][storeId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }
        it('should not find another teams invoices by group id', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices?filter[where][storeId]=B&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('array');
              expect(res.body).to.have.length(0);
            });
        });

        if (_includes(user.abilities, 'read')) {
          it('should find a teams invoices by invoiceNumber', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter[where][invoiceNumber]=1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(1);
                expect(res.body[0]).to.have.property('invoiceNumber', 1);
              });
          });
        }
        else {
          it('should not find a teams invoices by invoiceNumber', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter[where][invoiceNumber]=1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }
        it('should not find another teams invoices by invoiceNumber', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices?filter[where][invoiceNumber]=2&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('array');
              expect(res.body).to.have.length(0);
            });
        });

        const filter = JSON.stringify({
          where: {
            and: [ {
              status: 'active'
            }, {
              storeId: {
                inq: [ 'A', 'B' ]
              }
            } ]
          }
        });

        if (_includes(user.abilities, 'read')) {
          it('should limit find results to a teams invoices with a complex filter', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter=${filter}&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(1);
                expect(res.body[0]).to.have.property('invoiceNumber', 1);
              });
          });
        }
        else {
          it('should limit find results to a teams invoices with a complex filter', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter=${filter}&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }
      });
      // end find

      // findById
      describe('findById', function() {
        if (_includes(user.abilities, 'read')) {
          it('should get a teams invoice', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/1?access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('invoiceNumber', 1);
              });
          });
        }
        else {
          it('should not get a teams invoice', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices/1?access_token=${res.body.id}`)
                .expect(401));
          });
        }

        it('should not get another teams invoice', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices/2?access_token=${res.body.id}`)
              .expect(401));
        });

        it('should return a 404 when getting a invoice that doesnt exist', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices/unknown-id?access_token=${res.body.id}`)
              .expect(404));
        });
      });
      // end findById

      // findOne
      describe('findOne', function() {
        if (_includes(user.abilities, 'read')) {
          it('should find a teams invoice by group id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter[where][storeId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(2);
                expect(res.body[0]).to.have.property('invoiceNumber', 1);
                expect(res.body[1]).to.have.property('invoiceNumber', 3);
              });
          });
        }
        else {
          it('should not find a teams invoice by group id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter[where][storeId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }

        it('should not find another teams invoice by group id', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices?filter[where][storeId]=B&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('array');
              expect(res.body).to.have.length(0);
            });
        });

        if (_includes(user.abilities, 'read')) {
          it('should find a teams invoice by invoiceNumber', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter[where][invoiceNumber]=1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(1);
                expect(res.body[0]).to.have.property('invoiceNumber', 1);
              });
          });
        }
        else {
          it('should not find a teams invoice by invoiceNumber', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/invoices?filter[where][invoiceNumber]=1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }

        it('should not find another teams invoice by invoiceNumber', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/invoices?filter[where][invoiceNumber]=2&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('array');
              expect(res.body).to.have.length(0);
            });
        });
      });
      // end findOne

      // create
      describe('create', function() {
        let invoiceId = null;

        if (_includes(user.abilities, 'create')) {
          it('should create a teams invoice', function() {
            return logInAs(user.username)
              .then(res => json('post', `/api/invoices?access_token=${res.body.id}`)
                .send({ storeId: 'A', invoiceNumber: 100 })
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('invoiceNumber', 100);
                invoiceId = res.body.id;
              });
          });
        }
        else {
          it('should not create a teams invoice', function() {
            return logInAs(user.username)
              .then(res => json('post', `/api/invoices?access_token=${res.body.id}`)
                .send({ storeId: 'A', name: 'A invoice' })
                .expect(401));
          });
        }

        it('should not create another teams invoice', function() {
          return logInAs(user.username)
            .then(res => json('post', `/api/invoices?access_token=${res.body.id}`)
              .send({ storeId: 'B', name: 'A invoice' })
              .expect(401));
        });

        after(function() {
          if (invoiceId) {
            return app.models.Invoice.destroyById(invoiceId);
          }
          return null;
        });
      });
      // end create

      // upsert
      describe('upsert', function() {
        if (_includes(user.abilities, 'update')) {
          it('should update a teams invoice', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/invoices?access_token=${res.body.id}`)
                .send({
                  id: 1,
                  storeId: 'A',
                  invoiceNumber: 1,
                  someprop: 'someval'
                })
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('someprop', 'someval');
              });
          });
          it('should not reassign a invoice to another team', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/invoices?access_token=${res.body.id}`)
                .send({
                  id: 1,
                  storeId: 'B',
                  invoiceNumber: 1,
                  someprop: 'someval'
                })
                .expect(401));
          });
        }
        else {
          it('should not update a teams invoice', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/invoices?access_token=${res.body.id}`)
                .send({
                  id: 1,
                  storeId: 'A',
                  invoiceNumber: 1,
                  someprop: 'someval'
                })
                .expect(401));
          });
        }
        it('should not update another teams invoice', function() {
          return logInAs(user.username)
            .then(res => json('put', `/api/invoices?access_token=${res.body.id}`)
              .send({
                id: 2,
                storeId: 'B',
                invoiceNumber: 1,
                someprop: 'someval'
              })
              .expect(401));
        });
        it('should not reassign another teams invoice to our team', function() {
          return logInAs(user.username)
            .then(res => json('put', `/api/invoices?access_token=${res.body.id}`)
              .send({
                id: 2,
                storeId: 'A',
                invoiceNumber: 2,
                someprop: 'someval'
              })
              .expect(401));
        });
      });
      // end upsert

      // updateAttributes
      describe('updateAttributes', function() {
        if (_includes(user.abilities, 'update')) {
          it('should update a teams invoice attributes', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/invoices/1?access_token=${res.body.id}`)
                .send({ someprop: 'someval' })
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('someprop', 'someval');
              });
          });
          it('should not reassign a invoice to another team', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/invoices/1?access_token=${res.body.id}`)
                .send({ storeId: 'B' })
                .expect(401));
          });
        }
        else {
          it('should update a teams invoice attributes', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/invoices/1?access_token=${res.body.id}`)
                .send({ someprop: 'someval' })
                .expect(401));
          });
        }

        it('should not update another teams invoice attributes', function() {
          return logInAs(user.username)
            .then(res => json('put', `/api/invoices/2?access_token=${res.body.id}`)
              .send({ someprop: 'someval' })
              .expect(401));
        });
        it('should not reassign another teams invoice to our team', function() {
          return logInAs(user.username)
            .then(res => json('put', `/api/invoices/2?access_token=${res.body.id}`)
              .send({ storeId: 'A' })
              .expect(401));
        });
      });
      // end updateAttributes

      // destroyById
      describe('destroyById', function() {
        if (_includes(user.abilities, 'delete')) {
          it('should delete a teams invoice', function() {
            return logInAs(user.username)
              .then(res => json('delete', `/api/invoices/1?access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 1);
              });
          });
        }
        else {
          it('should not delete a teams invoice', function() {
            return logInAs(user.username)
              .then(res => json('delete', `/api/invoices/1?access_token=${res.body.id}`)
                .expect(401));
          });
        }
        it('should not delete another teams invoice', function() {
          return logInAs(user.username)
            .then(res => json('delete', `/api/invoices/2?access_token=${res.body.id}`)
              .expect(401));
        });
      });
    // end destroyById,
    });
  });
});
