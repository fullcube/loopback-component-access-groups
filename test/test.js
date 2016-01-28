'use strict';

const path = require('path');
const request = require('supertest-as-promised');
const chai = require('chai');
const expect = chai.expect;

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

describe('REST API request', function() {
  it('should not allow access without access token', function() {
    return json('get', '/api/stuff')
      .expect(401);
  });

  it('should login as a team member and get a list of stuff', function() {
    let accessToken = null;

    return json('post', '/api/users/login')
      .send({ username: 'programAdminA', password: 'password' })
      .expect(200)
      .then(res => {
        expect(res.body).to.be.an('object');
        expect(res.body.id).to.exist();
        expect(res.body.userId).to.equal('programAdminA');
        accessToken = res.body.id;
      })
      .then(() => json('get', `/api/stuff/1?access_token=${accessToken}`).expect(200))
      .then(res => {
        const stuff = res.body;

        expect(stuff).to.be.an('object');
        expect(stuff).to.have.property('name', 'Widget 1');
      });
  });
});

describe('Unexpected Usage', () => {
  it('should not crash the server when posting a bad id', function() {
    return json('post', '/api/users/foobar')
      .send({ })
      .expect(404);
  });
});
