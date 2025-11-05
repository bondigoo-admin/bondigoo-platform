const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const User = require('../models/User');
const config = require('../config');

let token;
let testUserId;

beforeAll(async () => {
  await mongoose.connect(config.mongodb.uri);
});

afterAll(async () => {
  await User.deleteMany({});
  await mongoose.connection.close();
});

describe('User Authentication', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('should register a new user and return a token', async () => {
    const res = await request(app)
      .post('/api/users/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'password123'
      });
    
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('token');
    
    const decoded = jwt.verify(res.body.token, config.jwt.secret);
    expect(decoded).toHaveProperty('user');
    testUserId = decoded.user.id;

    // Verify that the user was actually created in the database
    const createdUser = await User.findById(testUserId);
    expect(createdUser).toBeTruthy();
    expect(createdUser.email).toBe('test@example.com');
  });

  // ... other tests remain the same ...
});

describe('Protected Routes', () => {
  beforeAll(async () => {
    // Create a test user and get the token
    const res = await request(app)
      .post('/api/users/register')
      .send({
        firstName: 'Protected',
        lastName: 'User',
        email: 'protected@example.com',
        password: 'password123'
      });
    
    token = res.body.token;
    const decoded = jwt.verify(token, config.jwt.secret);
    testUserId = decoded.user.id;
  });

  it('should get all users when authenticated', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('x-auth-token', token);
    
    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBeTruthy();
  });

  it('should not get users without authentication', async () => {
    const res = await request(app)
      .get('/api/users');
    
    expect(res.statusCode).toEqual(401);
    expect(res.body).toHaveProperty('msg', 'No token, authorization denied');
  });

  it('should get a specific user when authenticated', async () => {
    const res = await request(app)
      .get(`/api/users/${testUserId}`)
      .set('x-auth-token', token);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('email', 'protected@example.com');
  });

  it('should update a user when authenticated', async () => {
    const res = await request(app)
      .put(`/api/users/${testUserId}`)
      .set('x-auth-token', token)
      .send({ firstName: 'UpdatedName' });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('firstName', 'UpdatedName');
  });
});