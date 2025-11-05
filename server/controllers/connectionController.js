const Connection = require('../models/Connection');
const User = require('../models/User');
const Coach = require('../models/Coach');
const { logger } = require('../utils/logger');
const { validationResult } = require('express-validator');
const getIo = (req) => req.app.get('io');
const mongoose = require('mongoose');

exports.requestConnection = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn(`[connectionController] Validation errors: ${JSON.stringify(errors.array())}`);
    return res.status(400).json({ errors: errors.array() });
  }

  const { targetUserId } = req.body;
  const initiatorId = req.user._id;

  logger.info(`[connectionController] Received connection request: initiator=${initiatorId}, target=${targetUserId}`);
  logger.debug(`[connectionController] Request body: ${JSON.stringify(req.body)}`);

  try {
    if (!mongoose.Types.ObjectId.isValid(initiatorId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
      logger.warn(`[connectionController] Invalid ObjectId: initiator=${initiatorId}, target=${targetUserId}`);
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const [blockCheckInitiator, blockCheckTarget] = await Promise.all([
        User.findById(initiatorId).select('blockedUsers').lean(),
        User.findById(targetUserId).select('blockedUsers').lean()
    ]);

    if (!blockCheckInitiator) {
        return res.status(404).json({ message: "Initiator user not found." });
    }
    if (!blockCheckTarget) {
        return res.status(404).json({ message: "Target user not found." });
    }

    // FIX: Safely access blockedUsers array, providing an empty array as a fallback.
    const initiatorBlockedTarget = (blockCheckInitiator.blockedUsers || []).some(b => b.user.equals(blockCheckTarget._id));
    const targetBlockedInitiator = (blockCheckTarget.blockedUsers || []).some(b => b.user.equals(blockCheckInitiator._id));

    if (initiatorBlockedTarget || targetBlockedInitiator) {
        logger.warn(`[connectionController] Blocked interaction attempt between ${initiatorId} and ${targetUserId}`);
        return res.status(403).json({ message: "You are not allowed to interact with this user." });
    }

    const [initiator, targetCoach] = await Promise.all([
      User.findById(initiatorId),
      Coach.findOne({ user: targetUserId }).populate('user', 'firstName lastName email role')
    ]);

    if (!initiator) {
      logger.warn(`[connectionController] Initiator not found after block check: ${initiatorId}`);
      return res.status(404).json({ message: 'Initiator not found' });
    }

    if (!targetCoach) {
      logger.warn(`[connectionController] Target coach not found: ${targetUserId}`);
      return res.status(404).json({ message: 'Target coach not found' });
    }

    if (targetCoach.user.role !== 'coach') {
      logger.warn(`[connectionController] Target user is not a coach: ${targetUserId}`);
      return res.status(400).json({ message: 'Target user is not a coach' });
    }

    let existingConnection = await Connection.findOne({
      $or: [
        { coach: targetUserId, client: initiatorId },
        { client: targetUserId, coach: initiatorId } // Corrected logic to check both ways
      ]
    });

    if (existingConnection) {
      if (existingConnection.status === 'declined') {
        logger.info(`[connectionController] Updating declined connection to pending`);
        existingConnection.status = 'pending';
        existingConnection.initiator = initiatorId;
        await existingConnection.save();
      } else {
        logger.warn(`[connectionController] Connection already exists with status: ${existingConnection.status}`);
        return res.status(400).json({ message: `Connection already exists with status: ${existingConnection.status}` });
      }
    } else {
      logger.info(`[connectionController] Creating new connection`);
      existingConnection = new Connection({
        coach: targetUserId,
        client: initiatorId,
        initiator: initiatorId,
        status: 'pending'
      });
      await existingConnection.save();
    }

    const responseObject = {
      message: 'Connection request sent successfully',
      connection: {
        ...existingConnection.toObject(),
        initiator: {
          _id: initiator._id,
          firstName: initiator.firstName,
          lastName: initiator.lastName,
          profilePicture: initiator.profilePicture
        },
        receiver: {
          _id: targetCoach.user._id,
          firstName: targetCoach.user.firstName,
          lastName: targetCoach.user.lastName,
          profilePicture: targetCoach.user.profilePicture,
          email: targetCoach.user.email
        }
      }
    };

    logger.info(`[connectionController] Connection request processed successfully`);
    res.status(201).json(responseObject);
  } catch (error) {
    logger.error(`[connectionController] Error in requestConnection: ${error.message}`, { error, stack: error.stack });
    res.status(500).json({ message: 'Error processing connection request', error: error.message });
  }
};

exports.respondToConnection = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { connectionId } = req.params;
  const { status } = req.body;
  const userId = req.user._id;

  logger.info(`[connectionController] Responding to connection: ${connectionId} with status: ${status} by user: ${userId}`);

  try {
    const connection = await Connection.findOne({
      _id: connectionId,
      $or: [{ coach: userId }, { client: userId }],
      status: 'pending'
    }).populate('coach client', 'firstName lastName email profilePicture');

    if (!connection) {
      logger.warn(`[connectionController] Connection request not found or cannot be responded to: ${connectionId}`);
      return res.status(404).json({ message: 'Connection request not found or cannot be responded to' });
    }

    connection.status = status;
    await connection.save();

    logger.info(`[connectionController] Connection request updated successfully: ${connectionId}`);
    res.json({ message: 'Connection request updated successfully', connection });

    const io = getIo(req);
    const otherUserId = connection.initiator.toString() === userId.toString() ?
      (connection.coach._id.toString() === userId.toString() ? connection.client._id.toString() : connection.coach._id.toString()) :
      connection.initiator.toString();

    if (otherUserId) {
      io.to(otherUserId).emit('connectionRequestResponded', {
        connectionId: connection._id,
        status: status,
        respondedBy: userId
      });
    }
  } catch (error) {
    logger.error(`[connectionController] Error responding to connection request: ${error.message}`, { error });
    res.status(500).json({ message: 'Error responding to connection request', error: error.message });
  }
};

exports.getUserConnections = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    logger.info(`[connectionController] Fetching connections for user: ${userId}`);

    const currentUser = await User.findById(userId).select('blockedUsers').lean();
    if (!currentUser) {
        return res.status(404).json({ message: "Current user not found." });
    }
    const blockedUserIds = (currentUser.blockedUsers || []).map(b => b.user.toString());

    const connectionsFromDb = await Connection.findConnectionsForUser(userId);

    logger.info(`[connectionController] Found ${connectionsFromDb.length} connections from Connection.findConnectionsForUser.`);

    if (!connectionsFromDb) {
        logger.warn(`[connectionController] Connection.findConnectionsForUser returned null for user: ${userId}`);
        return res.json({ connections: [], blockedUserIds });
    }

    const transformedConnections = connectionsFromDb.map(conn => {
      const isUserCoach = conn.coach?._id?.toString() === userId;
      const otherUserPopulated = isUserCoach ? conn.client : conn.coach;

      if (!otherUserPopulated?._id) {
        logger.warn(`[connectionController] Could not determine otherUser for connection ${conn._id}. Skipping.`);
        return null;
      }

      return {
        _id: conn._id.toString(),
        status: conn.status,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
        otherUser: {
          _id: otherUserPopulated._id.toString(),
          firstName: otherUserPopulated.firstName,
          lastName: otherUserPopulated.lastName,
          email: otherUserPopulated.email,
          role: otherUserPopulated.role,
          profilePicture: otherUserPopulated.profilePicture,
          coachProfilePicture: otherUserPopulated.coachProfilePicture
        },
        initiatedByMe: conn.initiator?._id?.toString() === userId
      };
    }).filter(conn => conn !== null);

    logger.info(`[connectionController] Sending ${transformedConnections.length} transformed connections to frontend.`);
    res.json({
        connections: transformedConnections,
        blockedUserIds: blockedUserIds
    });
  } catch (error) {
    logger.error('[connectionController] Error fetching user connections:', { error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Error fetching connections', error: error.message });
  }
};

exports.getConnectionStatus = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { targetUserId } = req.params;
  const userId = req.user._id;

  logger.info(`[connectionController] Checking connection status. User: ${userId}, Target: ${targetUserId}`);

  try {
    const connection = await Connection.findOne({
      $or: [
        { coach: userId, client: targetUserId },
        { coach: targetUserId, client: userId }
      ]
    });

    if (!connection) {
      logger.info(`[connectionController] No connection found between ${userId} and ${targetUserId}`);
      return res.json({ status: 'not_connected' });
    }

    logger.info(`[connectionController] Connection status: ${connection.status}`);
    res.json({ status: connection.status, connection });
  } catch (error) {
    logger.error(`[connectionController] Error in getConnectionStatus: ${error.message}`, { error });
    res.status(500).json({ message: 'Error checking connection status', error: error.message });
  }
};

exports.cancelConnectionRequest = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { connectionId } = req.params;
  const userId = req.user._id;

  logger.info(`[connectionController] Cancelling connection request: ${connectionId} by user: ${userId}`);

  try {
    const connection = await Connection.findOne({
      _id: connectionId,
      initiator: userId,
      status: 'pending'
    });

    if (!connection) {
      logger.warn(`[connectionController] Connection request not found or cannot be cancelled: ${connectionId}`);
      return res.status(404).json({ message: 'Connection request not found or you are not the initiator' });
    }

    await Connection.deleteOne({ _id: connectionId });

    logger.info(`[connectionController] Connection request cancelled successfully: ${connectionId}`);
    res.json({ message: 'Connection request cancelled successfully' });

    const io = getIo(req);
    const otherUserId = connection.coach.toString() === userId.toString() ? connection.client.toString() : connection.coach.toString();

    if (otherUserId) {
      io.to(otherUserId).emit('connectionRequestCancelled', {
        connectionId: connection._id,
        cancelledBy: userId
      });
    }
  } catch (error) {
    logger.error(`[connectionController] Error cancelling connection request: ${error.message}`, { error });
    res.status(500).json({ message: 'Error cancelling connection request', error: error.message });
  }
};

exports.removeConnection = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { connectionId } = req.params;
  const userId = req.user._id;

  logger.info(`[connectionController] Removing connection: ${connectionId} by user: ${userId}`);

  try {
    const connection = await Connection.findOne({
      _id: connectionId,
      $or: [{ coach: userId }, { client: userId }],
      status: 'accepted'
    });

    if (!connection) {
      logger.warn(`[connectionController] Connection not found or is not accepted: ${connectionId}`);
      return res.status(404).json({ message: 'Connection not found or is not in an accepted state' });
    }

    const otherUserId = connection.coach.toString() === userId.toString() ? connection.client.toString() : connection.coach.toString();

    await Connection.deleteOne({ _id: connectionId });

    logger.info(`[connectionController] Connection removed successfully: ${connectionId}`);
    res.json({ message: 'Connection removed successfully' });

    const io = getIo(req);
    if (otherUserId && io) {
      io.to(otherUserId).emit('connection_removed', {
        connectionId: connectionId,
        removedBy: userId
      });
      logger.info(`[connectionController] Emitted 'connection_removed' to user: ${otherUserId}`);
    }
  } catch (error) {
    logger.error(`[connectionController] Error removing connection: ${error.message}`, { error });
    res.status(500).json({ message: 'Error removing connection', error: error.message });
  }
};

module.exports = exports;