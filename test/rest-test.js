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
    it('should not allow access to list things without access token', function() {
      return json('get', '/api/things')
        .expect(401);
    });

    it('should not allow access to a teams thing without access token', function() {
      return json('get', '/api/things/1')
        .expect(401);
    });
  });

  const users = [
    {
      username: 'generalUser',
      abilities: []
    }, {
      username: 'programMemberA',
      abilities: [ 'read' ]
    }, {
      username: 'programManagerA',
      abilities: [ 'create', 'read', 'update' ]
    }, {
      username: 'programAdminA',
      abilities: [ 'create', 'read', 'update', 'delete' ]
    }
  ];

  users.forEach(user => {
    describe(`${user.username} (User with ${user.abilities.join(', ')} permissions):`, function() {
      // exists
      describe('exists', function() {
        if (_includes(user.abilities, 'read')) {
          it('should check if a teams thing exists by tenant id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/1/exists?&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('exists', true);
              });
          });
        }
        else {
          it('should not check if a teams thing exists by tenant id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/1/exists?access_token=${res.body.id}`)
                .expect(401));
          });
        }
        it('should not check if another teams thing exists by tenant id', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things/2/exists?access_token=${res.body.id}`)
              .expect(401));
        });
        it('should return false when checking for existance of a thing that doesnt exist', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things/unknown-id/exists?access_token=${res.body.id}`)
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
          it('should count a teams things by tenant id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/count?where[programId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 2);
              });
          });
        }
        else {
          it('should not find a teams things by tenant id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/count?where[programId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 0);
              });
          });
        }
        it('should not count another teams things by tenant id', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things/count?where[programId]=B&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('object');
              expect(res.body).to.have.property('count', 0);
            });
        });

        if (_includes(user.abilities, 'read')) {
          it('should count a teams things by name', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/count?where[name]=Widget 1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 1);
              });
          });
        }
        else {
          it('should not count a teams things by name', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/count?where[name]=Widget 1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 0);
              });
          });
        }
        it('should not count another teams things by name', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things/count?where[name]=Widget 2&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('object');
              expect(res.body).to.have.property('count', 0);
            });
        });

        const filter = {
          and: [ {
            status: 'active'
          }, {
            programId: {
              inq: [ 'A', 'B' ]
            }
          } ]
        };

        if (_includes(user.abilities, 'read')) {
          it('should limit count results to a teams things with a complex filter', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/count?where=${JSON.stringify(filter)}&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 1);
              });
          });
        }
        else {
          it('should limit count results to a teams things with a complex filter', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/count?where=${JSON.stringify(filter)}&access_token=${res.body.id}`)
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
          it('should find a teams things by tenant id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter[where][programId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(2);
                expect(res.body[0]).to.have.property('name', 'Widget 1');
                expect(res.body[1]).to.have.property('name', 'Widget 3');
              });
          });
        }
        else {
          it('should not find a teams things by tenant id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter[where][programId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }
        it('should not find another teams things by tenant id', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things?filter[where][programId]=B&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('array');
              expect(res.body).to.have.length(0);
            });
        });

        if (_includes(user.abilities, 'read')) {
          it('should find a teams things by name', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter[where][name]=Widget 1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(1);
                expect(res.body[0]).to.have.property('name', 'Widget 1');
              });
          });
        }
        else {
          it('should not find a teams things by name', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter[where][name]=Widget 1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }
        it('should not find another teams things by name', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things?filter[where][name]=Widget 2&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('array');
              expect(res.body).to.have.length(0);
            });
        });

        const filter = {
          where: {
            and: [ {
              status: 'active'
            }, {
              programId: {
                inq: [ 'A', 'B' ]
              }
            } ]
          }
        };

        if (_includes(user.abilities, 'read')) {
          it('should limit find results to a teams things with a complex filter', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter=${JSON.stringify(filter)}&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(1);
                expect(res.body[0]).to.have.property('name', 'Widget 1');
              });
          });
        }
        else {
          it('should limit find results to a teams things with a complex filter', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter=${JSON.stringify(filter)}&access_token=${res.body.id}`)
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
          it('should get a teams thing', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/1?access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('name', 'Widget 1');
              });
          });
        }
        else {
          it('should not get a teams thing', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things/1?access_token=${res.body.id}`)
                .expect(401));
          });
        }

        it('should not get another teams thing', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things/2?access_token=${res.body.id}`)
              .expect(401));
        });

        it('should return a 404 when getting a thing that doesnt exist', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things/unknown-id?access_token=${res.body.id}`)
              .expect(404));
        });
      });
      // end findById

      // findOne
      describe('findOne', function() {
        if (_includes(user.abilities, 'read')) {
          it('should find a teams thing by tenant id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter[where][programId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(2);
                expect(res.body[0]).to.have.property('name', 'Widget 1');
                expect(res.body[1]).to.have.property('name', 'Widget 3');
              });
          });
        }
        else {
          it('should not find a teams thing by tenant id', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter[where][programId]=A&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }

        it('should not find another teams thing by tenant id', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things?filter[where][programId]=B&access_token=${res.body.id}`)
              .expect(200))
            .then(res => {
              expect(res.body).to.be.an('array');
              expect(res.body).to.have.length(0);
            });
        });

        if (_includes(user.abilities, 'read')) {
          it('should find a teams thing by name', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter[where][name]=Widget 1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(1);
                expect(res.body[0]).to.have.property('name', 'Widget 1');
              });
          });
        }
        else {
          it('should not find a teams thing by name', function() {
            return logInAs(user.username)
              .then(res => json('get', `/api/things?filter[where][name]=Widget 1&access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('array');
                expect(res.body).to.have.length(0);
              });
          });
        }

        it('should not find another teams thing by name', function() {
          return logInAs(user.username)
            .then(res => json('get', `/api/things?filter[where][name]=Widget 2&access_token=${res.body.id}`)
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
        let thingId = null;

        if (_includes(user.abilities, 'create')) {
          it('should create a teams thing', function() {
            return logInAs(user.username)
              .then(res => json('post', `/api/things?access_token=${res.body.id}`)
                .send({ programId: 'A', name: 'A thing' })
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('name', 'A thing');
                thingId = res.body.id;
              });
          });
        }
        else {
          it('should not create a teams thing', function() {
            return logInAs(user.username)
              .then(res => json('post', `/api/things?access_token=${res.body.id}`)
                .send({ programId: 'A', name: 'A thing' })
                .expect(401));
          });
        }

        it('should not create another teams thing', function() {
          return logInAs(user.username)
            .then(res => json('post', `/api/things?access_token=${res.body.id}`)
              .send({ programId: 'B', name: 'A thing' })
              .expect(401));
        });

        after(function() {
          if (thingId) {
            return app.models.Thing.destroyById(thingId);
          }
        });
      });
      // end create

      // upsert
      describe('upsert', function() {
        if (_includes(user.abilities, 'update')) {
          it('should update a teams thing', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/things?access_token=${res.body.id}`)
                .send({
                  id: 1,
                  programId: 'A',
                  name: 'Widget 1',
                  someprop: 'someval'
                })
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('someprop', 'someval');
              });
          });
        }
        else {
          it('should not update a teams thing', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/things?access_token=${res.body.id}`)
                .send({
                  id: 1,
                  programId: 'A',
                  name: 'Widget 1',
                  someprop: 'someval'
                })
                .expect(401));
          });
        }

        it('should not update another teams thing', function() {
          return logInAs(user.username)
            .then(res => json('put', `/api/things?access_token=${res.body.id}`)
              .send({
                id: 2,
                programId: 'A',
                name: 'Widget 1',
                someprop: 'someval'
              })
              .expect(401));
        });
      });
      // end upsert

      // updateAttributes
      describe('updateAttributes', function() {
        if (_includes(user.abilities, 'update')) {
          it('should update a teams thing attributes', function() {
            return logInAs(user.username)
              .then(res => json('put', `/api/things/1?access_token=${res.body.id}`)
                .send({ someprop: 'someval' })
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('someprop', 'someval');
              });
          });
        }
        else {
          return logInAs(user.username)
            .then(res => json('put', `/api/things/1?access_token=${res.body.id}`)
              .send({ someprop: 'someval' })
              .expect(401));
        }

        it('should not update another teams thing attributes', function() {
          return logInAs(user.username)
            .then(res => json('put', `/api/things/2?access_token=${res.body.id}`)
              .send({ someprop: 'someval' })
              .expect(401));
        });
      });
      // end updateAttributes

      // destroyById
      describe('destroyById', function() {
        if (_includes(user.abilities, 'delete')) {
          it('should delete a teams thing', function() {
            return logInAs(user.username)
              .then(res => json('delete', `/api/things/1?access_token=${res.body.id}`)
                .expect(200))
              .then(res => {
                expect(res.body).to.be.an('object');
                expect(res.body).to.have.property('count', 1);
              });
          });
        }
        else {
          it('should not delete a teams thing', function() {
            return logInAs(user.username)
              .then(res => json('delete', `/api/things/1?access_token=${res.body.id}`)
                .expect(401));
          });
        }
        it('should not delete another teams thing', function() {
          return logInAs(user.username)
            .then(res => json('delete', `/api/things/2?access_token=${res.body.id}`)
              .expect(401));
        });
      });
    // end destroyById,
    });
  });
});
