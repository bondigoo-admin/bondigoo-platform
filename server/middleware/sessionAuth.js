const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const { logger } = require('../utils/logger');

const sessionAuth = async (req, res, next) => {
  const { sessionId, token } = req.params;

  if (!sessionId || !token) {
    logger.warn('[sessionAuth] Missing sessionId or token', { sessionId, token });
    return res.status(400).json({
      success: false,
      message: 'Session ID and token are required',
    });
  }

  try {
    const booking = await Booking.findOne({
      'sessionLink.sessionId': sessionId,
      'sessionLink.token': token,
      'sessionLink.expired': false,
    }).populate('coach', '-password').populate('user', '-password');

    if (!booking) {
      logger.warn('[sessionAuth] Invalid or expired session link', { sessionId, token });
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired session link',
      });
    }

    const now = new Date();
    const sessionStart = new Date(booking.start);
    const sessionEnd = new Date(booking.end);
    const earlyJoinWindow = 15 * 60 * 1000; // 15 minutes in ms
    const lateJoinWindow = 15 * 60 * 1000;  // 15 minutes in ms

    const userId = req.user?._id?.toString();
    const isCoach = userId && booking.coach._id.toString() === userId;

    // Coaches can join anytime, participants are restricted to the early join window
    if (!isCoach && now < sessionStart - earlyJoinWindow) {
      logger.info('[sessionAuth] Session access too early for participant', { sessionId, sessionStart });
      return res.status(403).json({
        success: false,
        message: 'Session has not yet started',
        sessionStart: sessionStart,
      });
    }

    if (now > sessionEnd + lateJoinWindow) {
      booking.sessionLink.expired = true;
      await booking.save();
      logger.info('[sessionAuth] Session expired', { sessionId, sessionEnd });
      return res.status(403).json({
        success: false,
        message: 'Session has ended',
        sessionEnd: sessionEnd,
      });
    }

    req.booking = booking;
    logger.info('[sessionAuth] Session link validated', { sessionId, userId, isCoach });
    next();
  } catch (error) {
    logger.error('[sessionAuth] Validation error', {
      error: error.message,
      stack: error.stack,
      sessionId,
      token,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to validate session link',
      error: error.message,
    });
  }
};

module.exports = sessionAuth;