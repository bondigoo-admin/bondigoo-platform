const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Coach = require('../models/Coach');
const config = require('../config');
const cloudinary = require('../utils/cloudinaryConfig');

// Mock Cloudinary
jest.mock('../utils/cloudinaryConfig', () => ({
  uploader: {
    upload: jest.fn(),
    destroy: jest.fn()
  }
}));

let token;
let userId;
let coachId;

beforeAll(async () => {
  await mongoose.connect(config.mongodb.uri);
});

afterAll(async () => {
  await User.deleteMany({});
  await Coach.deleteMany({});
  await mongoose.connection.close();
});

describe('Video Introduction Features', () => {
  beforeEach(async () => {
    await User.deleteMany({});
    await Coach.deleteMany({});

    // Create a test user and coach
    const userRes = await request(app)
      .post('/api/users/register')
      .send({
        firstName: 'Test',
        lastName: 'Coach',
        email: 'testcoach@example.com',
        password: 'password123',
        preferredLanguage: 'en'
      });

    token = userRes.body.token;
    userId = userRes.body.user.id;

    const coachRes = await request(app)
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

    coachId = coachRes.body.coachId;
  });

  it('should upload a video introduction', async () => {
    // Mock Cloudinary upload response
    cloudinary.uploader.upload.mockResolvedValue({
      public_id: 'test_video_id',
      secure_url: 'https://test-video-url.com',
      duration: 60
    });

    const res = await request(app)
      .post('/api/coaches/upload-video-introduction')
      .set('Authorization', `Bearer ${token}`)
      .send({
        publicId: 'test_video_id',
        url: 'https://test-video-url.com',
        duration: 60
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('videoIntroduction');
    expect(res.body.videoIntroduction).toHaveProperty('publicId', 'test_video_id');

    // Verify that the coach document was updated
    const updatedCoach = await Coach.findById(coachId);
    expect(updatedCoach.videoIntroduction).toBeTruthy();
    expect(updatedCoach.videoIntroduction.publicId).toBe('test_video_id');
  });

  it('should delete a video introduction', async () => {
    // First, add a video to the coach
    await Coach.findByIdAndUpdate(coachId, {
      videoIntroduction: {
        publicId: 'test_video_id',
        url: 'https://test-video-url.com',
        duration: 60
      }
    });

    // Mock Cloudinary destroy response
    cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

    const res = await request(app)
      .delete('/api/coaches/video-introduction/test_video_id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('msg', 'Video deleted successfully');

    // Verify that the coach document was updated
    const updatedCoach = await Coach.findById(coachId);
    expect(updatedCoach.videoIntroduction).toBeUndefined();
  });

  it('should return 404 when deleting non-existent video', async () => {
    const res = await request(app)
      .delete('/api/coaches/video-introduction/non_existent_id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(404);
    expect(res.body).toHaveProperty('msg', 'Video not found');
  });

  it('should handle Cloudinary errors during upload', async () => {
    cloudinary.uploader.upload.mockRejectedValue(new Error('Cloudinary error'));

    const res = await request(app)
      .post('/api/coaches/upload-video-introduction')
      .set('Authorization', `Bearer ${token}`)
      .send({
        publicId: 'test_video_id',
        url: 'https://test-video-url.com',
        duration: 60
      });

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('msg', 'Server error');
  });

  it('should handle Cloudinary errors during deletion', async () => {
    await Coach.findByIdAndUpdate(coachId, {
      videoIntroduction: {
        publicId: 'test_video_id',
        url: 'https://test-video-url.com',
        duration: 60
      }
    });

    cloudinary.uploader.destroy.mockRejectedValue(new Error('Cloudinary error'));

    const res = await request(app)
      .delete('/api/coaches/video-introduction/test_video_id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(500);
    expect(res.body).toHaveProperty('msg', 'Server error');
  });
});