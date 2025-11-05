const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Coach = require('../models/Coach');
const config = require('../config');

let token;
let userId;

beforeAll(async () => {
  await mongoose.connect(config.mongodb.uri);
});

afterAll(async () => {
  await User.deleteMany({});
  await Coach.deleteMany({});
  await mongoose.connection.close();
});

describe('Coach Routes', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Coach.deleteMany({});

    // Create a test user
    const userRes = await request(app)
      .post('/api/users/register')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'password123',
        preferredLanguage: 'en'
      });

    token = userRes.body.token;
    userId = userRes.body.user.id;
  });

  it('should register a new coach', async () => {
    const res = await request(app)
      .post('/api/coaches/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: userId,
        specialties: ['Career Development'],
        experience: 5,
        rate: { amount: 100, currency: 'USD' },
        languages: ['en'],
        bio: 'Experienced career coach'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('msg', 'Coach registered successfully');
    expect(res.body).toHaveProperty('coachId');

    // Verify that the coach was created in the database
    const coach = await Coach.findById(res.body.coachId);
    expect(coach).toBeTruthy();
    expect(coach.specialties).toContain('Career Development');
  });

  it('should get coach profile', async () => {
    // First, register a coach
    const registerRes = await request(app)
      .post('/api/coaches/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: userId,
        specialties: ['Career Development'],
        experience: 5,
        rate: { amount: 100, currency: 'USD' },
        languages: ['en'],
        bio: 'Experienced career coach'
      });

    const res = await request(app)
      .get(`/api/coaches/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('email', 'test@example.com');
    expect(res.body).toHaveProperty('specialties');
    expect(res.body.specialties).toContain('Career Development');
  });

  it('should update coach profile', async () => {
    // First, register a coach
    await request(app)
      .post('/api/coaches/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: userId,
        specialties: ['Career Development'],
        experience: 5,
        rate: { amount: 100, currency: 'USD' },
        languages: ['en'],
        bio: 'Experienced career coach'
      });

    const res = await request(app)
      .put('/api/coaches/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        specialties: ['Career Development', 'Leadership Coaching'],
        experience: 6,
        rate: { amount: 120, currency: 'USD' },
        languages: ['en', 'es'],
        bio: 'Experienced career and leadership coach'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('specialties');
    expect(res.body.specialties).toContain('Leadership Coaching');
    expect(res.body.experience).toEqual(6);
    expect(res.body.rate.amount).toEqual(120);
    expect(res.body.languages).toContain('es');
  });

  it('should get all coaches with pagination', async () => {
    // Create multiple coaches
    for (let i = 0; i < 15; i++) {
      await Coach.create({
        user: new mongoose.Types.ObjectId(),
        specialties: ['Test Specialty'],
        experience: i,
        rate: { amount: 100, currency: 'USD' },
        languages: ['en'],
        bio: `Test coach ${i}`
      });
    }

    const res = await request(app)
      .get('/api/coaches?page=1&limit=10');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('coaches');
    expect(res.body.coaches.length).toEqual(10);
    expect(res.body).toHaveProperty('currentPage', 1);
    expect(res.body).toHaveProperty('totalPages');
    expect(res.body).toHaveProperty('totalCoaches', 15);
  });
});