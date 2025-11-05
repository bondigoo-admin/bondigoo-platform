
const mongoose = require('mongoose');
const { generateSessionLink } = require('../controllers/sessionController');
const Booking = require('../models/Booking');
const User = require('../models/User');

jest.mock('../models/Booking');
jest.mock('../models/User');
jest.mock('../services/unifiedNotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(),
}));

describe('sessionController - generateSessionLink', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: { bookingId: '123456789012' },
      user: { _id: new mongoose.Types.ObjectId() },
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  it('should return 400 for invalid booking ID', async () => {
    req.params.bookingId = 'invalid-id';
    await generateSessionLink(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid booking ID format',
    });
  });

  it('should return 404 if booking not found', async () => {
    Booking.findById.mockResolvedValue(null);
    await generateSessionLink(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Booking not found',
    });
  });

  it('should return 403 if user is unauthorized', async () => {
    const booking = {
      _id: '123456789012',
      coach: { _id: new mongoose.Types.ObjectId() },
      user: { _id: new mongoose.Types.ObjectId() },
      sessionType: { _id: '987654321098' },
    };
    Booking.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(booking),
    });
    await generateSessionLink(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Unauthorized access to booking',
    });
  });

  it('should return existing session link if valid', async () => {
    const booking = {
      _id: '123456789012',
      coach: { _id: req.user._id },
      user: { _id: new mongoose.Types.ObjectId() },
      sessionType: { _id: '987654321098' },
      sessionLink: {
        token: 'existing-token',
        sessionId: 'existing-id',
        generatedAt: new Date(),
        expired: false,
      },
    };
    Booking.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(booking),
    });
    await generateSessionLink(req, res);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      sessionUrl: `${process.env.FRONTEND_URL}/session/existing-id/existing-token`,
      isNewLink: false,
    });
  });

  it('should generate new session link if none exists', async () => {
    const booking = {
      _id: '123456789012',
      coach: { _id: req.user._id },
      user: { _id: new mongoose.Types.ObjectId() },
      sessionType: { _id: '987654321098' },
      sessionLink: null,
      save: jest.fn().mockResolvedValue(),
    };
    Booking.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(booking),
    });
    await generateSessionLink(req, res);
    expect(booking.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        sessionUrl: expect.stringMatching(/^http.*\/session\/[0-9a-f]{64}\/[0-9a-f]{64}$/),
        isNewLink: true,
      })
    );
  });
});