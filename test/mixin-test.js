'use strict'

const path = require('path')
const request = require('supertest')
const chai = require('chai')
const { expect } = chai

chai.use(require('dirty-chai'))
chai.use(require('sinon-chai'))

require('mocha-sinon')

const SIMPLE_APP = path.join(__dirname, 'fixtures', 'simple-app')
const app = require(path.join(SIMPLE_APP, 'server/server.js'))

function json(verb, url, data) {
  return request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send(data)
    .expect('Content-Type', /json/)
}

describe('Current User Mixin.', function() {
  describe('Smoke test', function() {
    it('should add a getCurrentUser model method', function() {
      expect(app.models.user).itself.to.respondTo('getCurrentUser')
    })
  })

  describe('Role: unauthenticated', function() {
    it('should return null', function() {
      return json('get', '/api/users/currentUser')
        .expect(200)
        .then(res => {
          expect(res.body).to.be.null()
        })
    })
  })

  describe('Role: authenticated', function() {
    it('should return the current user', function() {
      return json('post', '/api/users/login')
        .send({ username: 'generalUser', password: 'password' })
        .expect(200)
        .then(res => json('get', `/api/users/currentUser?access_token=${res.body.id}`)
          .expect(200))
        .then(res => {
          expect(res.body).to.be.an('object')
          expect(res.body).to.have.property('id', 'generalUser')
          expect(res.body).to.have.property('username', 'generalUser')
          expect(res.body).to.have.property('email', 'generalUser@fullcube.com')
        })
    })
  })
})
