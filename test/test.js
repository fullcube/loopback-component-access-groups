'use strict';

const path = require('path');
const SIMPLE_APP = path.join(__dirname, 'fixtures', 'simple-app');
const app = require(path.join(SIMPLE_APP, 'server/server.js'));
const request = require('supertest');
const chai = require('chai');
const expect = chai.expect;

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
  before(function(done) {
    require('./start-server');
    done();
  });

  after(function(done) {
    app.removeAllListeners('started');
    app.removeAllListeners('loaded');
    expect(1);
    done();
  });
});

describe('Unexpected Usage', function() {
  it('should not crash the server when posting a bad id', function(done) {
    json('post', '/api/users/foobar')
      .send({ })
      .expect(404, done);
  });
});
