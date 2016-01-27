'use strict';

const path = require('path');
const SIMPLE_APP = path.join(__dirname, 'fixtures', 'simple-app');
const app = require(path.join(SIMPLE_APP, 'server/server.js'));
const request = require('supertest');
const chai = require('chai');
const expect = chai.expect;
const assert = require('assert');

chai.use(require('sinon-chai'));
require('mocha-sinon');

global.Promise = require('bluebird');

function json(verb, url) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);
}

describe('REST API request', function() {
  // before(function(done) {
  //   require('./start-server');
  //   done();
  // });

  after(function(done) {
    app.removeAllListeners('started');
    app.removeAllListeners('loaded');
    expect(1);
    done();
  });

  it('should not allow access without access token', function(done) {
    json('get', '/api/stuff')
      .expect(401, done);
  });

  it('should login as a team member and get a list of stuff', function(done) {
    json('post', '/api/users/login')
      .send({ username: 'programAdminA', password: 'password' })
      .expect(200, (err, res) => {
        assert(!err);
        assert(typeof res.body === 'object');
        assert(res.body.id, 'must have an access token');
        assert.equal(res.body.userId, 'programAdminA');
        const accessToken = res.body.id;

        console.log(accessToken);
        json('get', `/api/stuff/1?access_token=${accessToken}`)
          .expect(200, (err, res) => {
            // expect(err).to.not.exist;
            const stuff = res.body;

            assert(typeof stuff === 'object');
            assert.equal(stuff.name, 'Widget 1');
          });
        done();
      });
  });
});

describe('Unexpected Usage', function() {
  it('should not crash the server when posting a bad id', function(done) {
    json('post', '/api/users/foobar')
      .send({ })
      .expect(404, done);
  });
});
