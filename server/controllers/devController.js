const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const { getSocketService } = require('../services/socketService');
const { logger } = require('../utils/logger');


exports.setUserStatus = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ message: 'This endpoint is for development use only.' });
  }

  console.log('[DevController] Received request to set user status. Body:', req.body);

  const { userId, status } = req.body;

  if (!userId || !status) {
    return res.status(400).json({ message: 'userId and status are required.' });
  }

  try {
    const allowedStatuses = User.schema.path('status').enumValues;
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
    }

    console.log(`[DevController] Attempting to find and update user: ${userId} with status: ${status}`);
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { status: status, lastStatusUpdate: new Date() } },
      { new: true }
    ).select('status lastStatusUpdate');

    console.log('[DevController] Mongoose findByIdAndUpdate result:', updatedUser ? `Updated user ${updatedUser._id}` : 'User not found');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }
    
    const socketService = getSocketService();
    if (socketService) {
      console.log(`[DevController] Broadcasting status update for user: ${userId}`);
      socketService.broadcastUserStatus(userId, updatedUser.status);
    } else {
      console.log('[DevController] Socket service not available for broadcast.');
    }

    res.json({ success: true, message: `User ${userId} status set to ${status}.`, user: updatedUser });

  } catch (error) {
    console.error('[DevController] CATCH BLOCK: An error occurred while setting status.', { message: error.message, stack: error.stack, userId, status });
    res.status(500).json({ message: 'Server error while setting status.' });
  }
};

exports.simulateCoachResponse = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ message: 'This endpoint is for development use only.' });
  }

  const { sessionId, response, message } = req.body;
  console.log(`[DevController] Received simulation request. SessionID: ${sessionId}, Response: ${response}`);

  try {
    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      logger.error(`[DevController] Simulation FAILED. Live session not found for ID: ${sessionId}`);
      return res.status(404).json({ message: 'Live session not found.' });
    }
    console.log(`[DevController] Found live session document. Client ID: ${liveSession.client}, Current Status: ${liveSession.status}`);

    if (liveSession.status !== 'requested') {
      logger.error(`[DevController] Simulation FAILED. Session status is not 'requested', it is '${liveSession.status}'. Cannot proceed.`);
      return res.status(400).json({ message: `Session status is not 'requested', it is '${liveSession.status}'.` });
    }
    
    liveSession.status = response;
    if (response === 'declined') {
      liveSession.cancellationReason = message || 'declined_by_coach_simulation';
    }
    await liveSession.save();
    console.log(`[DevController] Session ${sessionId} status updated in database to '${response}'.`);

    const socketService = getSocketService();
    if (socketService) {
      const payload = liveSession.toObject();
      const eventName = `live_session_${response}`;
      const targetClientId = liveSession.client.toString();

      console.log(`[DevController] Attempting to emit socket event... Event Name: '${eventName}', Target Client ID: '${targetClientId}'`);
      socketService.emitToUser(targetClientId, eventName, payload);
      console.log(`[DevController] Socket event emission call for '${eventName}' to user ${targetClientId} has been executed.`);

    } else {
       logger.error(`[DevController] CRITICAL: Socket service was not available. Event for session ${sessionId} was NOT sent.`);
    }

    console.log(`[DevController] Successfully completed simulation for session ${sessionId}`);
    res.json(liveSession.toObject());

  } catch (error) {
    logger.error('[DevController] UNHANDLED EXCEPTION in simulateCoachResponse:', { error: error.message, stack: error.stack, sessionId });
    res.status(500).json({ message: 'Server error during simulation.' });
  }
};