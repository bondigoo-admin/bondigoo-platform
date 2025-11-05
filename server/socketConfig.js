const socketIo = require('socket.io');
const { logger } = require('./utils/logger');
const UnifiedNotificationService = require('./services/unifiedNotificationService');
const Session = require('./models/Session');
const Booking = require('./models/Booking');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Notification = require('./models/Notification');
const Payment = require('./models/Payment');
const MediaServer = require('./services/mediaServer');
const StreamManager = require('./services/streamManager');
const { EventEmitter } = require('events');
const emitter = new EventEmitter();
const messageService = require('./services/messageService');
const SocketNotificationService = require('./services/socketService');
const { getSocketService } = require('./services/socketService');
const AnalyticsService = require ('./services/analyticsService')
const mongoose = require('mongoose');
const LiveSession = require('./models/LiveSession');
const { NotificationTypes } = require('./utils/notificationHelpers');
const paymentService = require('./services/paymentService');
const { SOCKET_EVENTS } = require ('./utils/socket_events');
const liveSessionManager = require('./services/liveSessionManager');

let ioInstance = null;

const configureSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000", "http://localhost:5000"],
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 120000,
    pingInterval: 25000
  });

 ioInstance = io;
  const socketService = getSocketService();
  if (socketService && !socketService.io) {
    initializeSocketService(io);
  }

  // Store active connections with metadata
  const activeConnections = new Map();

  // Connection monitoring
  const connectionMonitor = {
    connections: new Map(),
    addConnection: (userId, socket) => {
      logger.info('[Socket] New connection added:', { userId, socketId: socket.id });
      connectionMonitor.connections.set(userId, {
        socketId: socket.id,
        connectedAt: new Date(),
        lastActivity: new Date()
      });
    },
    removeConnection: (userId) => {
      logger.info('[Socket] Connection removed:', { userId });
      connectionMonitor.connections.delete(userId);
    },
    updateActivity: (userId) => {
      const connection = connectionMonitor.connections.get(userId);
      if (connection) {
        connection.lastActivity = new Date();
      }
    }
  };

  const videoIO = io.of('/video');
  videoIO.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.info('[VideoSocket] New connection to /video namespace', {
      socketId: socket.id,
      namespace: socket.nsp.name,
      query: socket.handshake.query,
      transport: socket.conn.transport.name,
      timestamp: new Date().toISOString(),
      headers: socket.handshake.headers
    });

    // Add global event logger
    socket.onAny((eventName, data) => {
      logger.info('[VideoSocket] Incoming event captured', {
        eventName,
        data: data || 'NO_DATA_PROVIDED',
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('signal', (data) => {
      logger.info(`[VideoSocket] Relaying signal from ${socket.id} to ${data.to}`);
      videoIO.to(data.to).emit('signal', {
        from: socket.id,
        signal: data.signal,
        displayName: socket.displayName,
        isCoach: socket.isCoach,
      });
    });

    socket.on('peer-disconnected', async ({ sessionId, peerId }) => {
        try {
            const userId = socket.userId;
            if (!userId) {
                return logger.error('[SocketConfig] peer-disconnected event received from a socket without a userId.', { socketId: socket.id });
            }
            logger.warn(`[SocketConfig] << RCVD peer-disconnected from user ${userId} regarding peer ${peerId} in session ${sessionId}`);

            const liveSession = await LiveSession.findOne({ 'sessionLink.sessionId': sessionId, status: 'in_progress' });

            if (!liveSession) {
                return logger.warn(`[SocketConfig] Peer-disconnected event for an invalid or non-active session ignored.`, { sessionId });
            }

            const isParticipant = liveSession.client.toString() === userId || liveSession.coach.toString() === userId;
            if (!isParticipant) {
                return logger.error(`[SocketConfig] Unauthorized peer-disconnected event from non-participant.`, { userId, sessionId });
            }
            
            logger.info(`[SocketConfig] Valid peer disconnection report. Triggering authoritative session end.`, { sessionId, endedBy: userId });
            await liveSessionManager.endSession(liveSession._id.toString(), userId, { reason: 'peer_disconnected' });

        } catch (error) {
            logger.error('[SocketConfig] Error handling peer-disconnected event.', { error: error.message, sessionId, peerId });
        }
    });

    logger.info(`[Socket Connect:${socket.id}] Attaching standard event listeners (login, disconnect, error)...`);

    // Increase max listeners to accommodate all events (adjust number based on your needs)
    socket.setMaxListeners(30); // Set to a number higher than your total unique event listeners

    const debugInterval = setInterval(() => {
      if (socket.connected) {
        logger.info('[VideoSocket] Socket still connected', {
          socketId: socket.id,
          transport: socket.conn.transport.name,
          rooms: Array.from(socket.rooms || []),
          timestamp: new Date().toISOString()
        });
      } else {
       logger.info('[VideoSocket] Socket disconnected', {
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });
        clearInterval(debugInterval);
      }
    }, 5000);

    const getSessionBySessionId = async (sessionId) => {
      const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId });
      if (!booking) {
        logger.warn('[VideoSocket] Booking not found for sessionId', { sessionId });
        return null;
      }
      const session = await Session.findOne({ bookingId: booking._id });
      if (!session) {
        logger.warn('[VideoSocket] Session not found for bookingId', { bookingId: booking._id.toString() });
      }
      return session;
    };

socket.on('join-live-session-handshake', async ({ sessionId, token, userId }) => {
      try {
        logger.info(`[SocketConfig] << RCVD join-live-session-handshake from user ${userId} for link ID ${sessionId}`);
        if (!sessionId || !token || !userId) {
          return socket.emit('error', { message: 'Authentication details missing for handshake.' });
        }

        socket.userId = userId;

        const liveSessionRecord = await LiveSession.findOne({ 'sessionLink.sessionId': sessionId, 'sessionLink.token': token }).populate('client coach', 'firstName lastName');
        if (!liveSessionRecord) {
          return socket.emit('error', { message: 'Live session authentication failed.' });
        }

        const roomName = `session:${sessionId}`;
        
        const userDoc = await User.findById(userId).select('firstName lastName').lean();
        if (!userDoc) {
             return socket.emit('error', { message: 'User not found.' });
        }

        socket.join(roomName);
        logger.info(`[SocketConfig] Socket ${socket.id} (User: ${userId}) joined live session room ${roomName}`);

        socket.displayName = `${userDoc.firstName} ${userDoc.lastName}`.trim();
        socket.isCoach = liveSessionRecord.coach._id.toString() === userId;

        const otherSockets = await videoIO.in(roomName).fetchSockets();
        const otherParticipants = [];

        for (const otherSocket of otherSockets) {
            if (otherSocket.id !== socket.id) {
                logger.info(`[SocketConfig] Announcing new participant ${socket.id} to existing participant ${otherSocket.id}`);
                otherSocket.emit('participant-joined', {
                    peerId: socket.id,
                    displayName: socket.displayName,
                    isCoach: socket.isCoach,
                });
                otherParticipants.push({
                    peerId: otherSocket.id,
                    displayName: otherSocket.displayName,
                    isCoach: otherSocket.isCoach,
                });
            }
        }
        
        logger.info(`[SocketConfig] Sending existing participants list to new joiner ${socket.id}`, { count: otherParticipants.length });
        socket.emit('session-participants', otherParticipants);

        const updatedSession = await LiveSession.findByIdAndUpdate(
            liveSessionRecord._id,
            { $addToSet: { presentParticipants: { userId: userId, socketId: socket.id, joinedAt: new Date() } } },
            { new: true }
        );

        if (!updatedSession) {
            logger.error('[SocketConfig] Could not find session to register presence.', { liveSessionId: liveSessionRecord._id });
            return socket.emit('error', { message: 'Session not found during handshake.' });
        }

        logger.info(`[SocketConfig] User ${userId} registered presence. Total present: ${updatedSession.presentParticipants.length}`, { liveSessionId: updatedSession._id });

        if (updatedSession.presentParticipants.length >= 2 && updatedSession.status === 'handshake_pending') {
            logger.info(`[SocketConfig] Two participants present. Attempting to start session...`, { liveSessionId: updatedSession._id });
            
            const finalSession = await LiveSession.findOneAndUpdate(
                { _id: updatedSession._id, status: 'handshake_pending' },
                {
                    $set: {
                        status: 'in_progress',
                        startTime: new Date(),
                        participants: [
                            { userId: updatedSession.client, lastHeartbeat: new Date() },
                            { userId: updatedSession.coach, lastHeartbeat: new Date() }
                        ]
                    }
                },
                { new: true }
            );

            if (finalSession) {
                logger.info(`[SocketConfig] HANDSHAKE COMPLETE: LiveSession ${finalSession._id} is now 'in_progress'.`);
                const payload = {
                    linkId: finalSession.sessionLink.sessionId,
                    startTime: finalSession.startTime
                };
                videoIO.to(roomName).emit('session-ready', payload);
                logger.info(`[SocketConfig] > SENT session-ready to room ${roomName}`, { payload });
            }
        }
        else if (updatedSession.status === 'in_progress') {
             logger.info(`[SocketConfig] Re-join detected for active session ${updatedSession._id}. Emitting session-ready.`);
             const payload = {
                linkId: updatedSession.sessionLink.sessionId,
                startTime: updatedSession.startTime
             };
             socket.emit('session-ready', payload);
        }

      } catch (err) {
        logger.error('[SocketConfig] Unhandled error in join-live-session-handshake handler.', { error: err.message, stack: err.stack });
        socket.emit('error', { message: 'An internal error occurred during handshake.' });
      }
    });
    
 socket.on('join-session', async ({ sessionId, token }) => {
      try {
        if (!sessionId || !token) {
          logger.warn('[SocketConfig] join-session event missing sessionId or token.', { socketId: socket.id });
          socket.emit('error', { message: 'Authentication details missing for session room.' });
          return;
        }
        
        // This handler is now ONLY for scheduled Bookings.
        const bookingRecord = await Booking.findOne({ 'sessionLink.sessionId': sessionId, 'sessionLink.token': token });
        if (!bookingRecord) {
            logger.error('[SocketConfig] FATAL: join-session validation failed for Booking.', { sessionId, socketId: socket.id });
            socket.emit('error', { message: 'Authentication failed for session room.' });
            return;
        }
  
        const roomName = `session:${sessionId}`;
        socket.join(roomName);
        logger.info(`[SocketConfig] Socket ${socket.id} joined room ${roomName} for a scheduled session.`);
  
        const clients = await videoIO.in(roomName).allSockets();
        const numClients = clients.size;
        logger.info(`[SocketConfig] There are now ${numClients} clients in room ${roomName}`);
  
        if (numClients >= 2) {
          logger.info(`[SocketConfig] Two or more clients present. Emitting session-ready to room ${roomName}.`);
          videoIO.to(roomName).emit('session-ready', {
            sessionId,
            startTime: new Date()
          });
        }
      } catch (err) {
        logger.error('[SocketConfig] Error during join-session handling.', { error: err.message, stack: err.stack, socketId: socket.id, sessionId });
        socket.emit('error', { message: 'An internal error occurred while joining the session.' });
      }
    });

      socket.on('live_session_heartbeat', async ({ sessionId, userId }) => {
        logger.debug('[SocketConfig] << RCVD live_session_heartbeat', { sessionId, userId, socketId: socket.id });
        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
            logger.error('[SocketConfig] Invalid ObjectId received for live session heartbeat.', { receivedId: sessionId, userId });
            return;
        }
        try {
            await LiveSession.updateOne(
                { _id: sessionId, 'participants.userId': userId },
                { $set: { 'participants.$.lastHeartbeat': new Date() } }
            );
        } catch (error) {
            logger.error('[SocketConfig] Failed to update live session heartbeat.', { error: error.message, sessionId, userId });
        }
    });

      socket.on('live_session_heartbeat', async ({ sessionId, userId }) => {
        try {
            await LiveSession.updateOne(
                { _id: sessionId, 'participants.userId': userId },
                { $set: { 'participants.$.lastHeartbeat': new Date() } }
            );
        } catch (error) {
            logger.error('[SocketConfig] Failed to update live session heartbeat.', { error: error.message, sessionId, userId });
        }
    });

    socket.on('leave-session', async ({ sessionId, userId, isCoach }) => {
      const now = new Date();
      const logContext = {
        event: 'leave_session_handler_v1',
        socketId: socket.id,
        userId,
        sessionLinkSessionId: sessionId,
        isCoach,
        peerId: socket.peerId,
        timestamp: now.toISOString()
      };
      logger.info(`[${logContext.event}] Handler entered`, logContext);
    
      // Validate input
      if (!userId || !sessionId) {
        logger.error(`[${logContext.event}] Missing userId or sessionId`, logContext);
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Missing required parameters' });
        return;
      }
    
      // Defensive check for mongoose
      if (!mongoose) {
        logger.error(`[${logContext.event}] Mongoose is not defined. Cannot proceed with finalization`, {
          ...logContext,
          mongooseAvailable: !!mongoose,
          mongooseVersion: mongoose?.version || 'unknown',
        });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Server error: Database unavailable' });
        return;
      }
    
      let isFinalizationAttempted = false;
      let finalCaptureStatus = 'not_applicable';
      let sessionEndedByFinalization = false;
      let finalizeResult = null;
      let bookingForCleanup = null;
      let sessionForCleanup = null;
    
      const sessionDb = await mongoose.startSession();
      sessionDb.startTransaction({ readPreference: 'primary' });
      logger.debug(`[${logContext.event}] DB Transaction started`, logContext);
    
      try {
        isFinalizationAttempted = true;
    
        bookingForCleanup = await Booking.findOne({ 'sessionLink.sessionId': sessionId })
          .select('+user +coach +overtime +price +start +end +sessionType')
          .populate('user', '_id firstName lastName email')
          .populate('coach', '_id settings.professionalProfile.hourlyRate firstName lastName email')
          .populate('sessionType', 'name')
          .session(sessionDb);
    
        if (!bookingForCleanup) {
          logger.error(`[${logContext.event}] Booking not found for sessionId`, logContext);
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Booking not found' });
          await sessionDb.abortTransaction();
          await sessionDb.endSession();
          return;
        }
        logContext.bookingId = bookingForCleanup._id.toString();
    
        const isParticipant = bookingForCleanup.user && bookingForCleanup.user._id.toString() === userId;
        logContext.isParticipant = isParticipant;
        logger.debug(`[${logContext.event}] User is ${isParticipant ? 'participant' : 'coach'}`, logContext);
    
        if (!isParticipant && !isCoach) {
          logger.warn(`[${logContext.event}] User is neither participant nor coach`, logContext);
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Unauthorized to leave session' });
          await sessionDb.abortTransaction();
          await sessionDb.endSession();
          return;
        }
    
        sessionForCleanup = await Session.findOne({ bookingId: bookingForCleanup._id }).session(sessionDb);
        logContext.sessionDocId = sessionForCleanup?._id?.toString();
        if (!sessionForCleanup) {
          logger.error(`[${logContext.event}] Session document not found`, logContext);
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found' });
          await sessionDb.abortTransaction();
          await sessionDb.endSession();
          return;
        }
    
        const isSessionActive = sessionForCleanup.state === 'active';
        logContext.isSessionActive = isSessionActive;
        if (!isSessionActive) {
          logger.warn(`[${logContext.event}] Session not active. Skipping finalization`, logContext);
          await sessionDb.abortTransaction();
          await sessionDb.endSession();
          return;
        }

        if (sessionForCleanup.overtimeSegments?.some(s => ['requested', 'pending_confirmation'].includes(s.status))) {
          logger.info(`[leave_session_handler_v1] Skipping session state changes: Pending overtime request exists`, {
            sessionLinkSessionId: sessionId,
            userId,
            bookingId: sessionForCleanup?.bookingId?.toString(),
            sessionDocId: sessionForCleanup?._id?.toString(),
            segmentStatuses: sessionForCleanup.overtimeSegments?.map(s => s.status) || [],
            timestamp: new Date().toISOString(),
          });
          await sessionDb.commitTransaction();
          await sessionDb.endSession();
          return;
        }
    
        const hasAuthorizedSegment = sessionForCleanup.overtimeSegments?.some(s => s.status === 'authorized' && !s.finalizedAt);
        logContext.hasAuthorizedSegment = hasAuthorizedSegment;
        if (!hasAuthorizedSegment) {
          logger.info(`[${logContext.event}] No authorized segment found or already finalized`, logContext);
          await sessionDb.abortTransaction();
          await sessionDb.endSession();
          return;
        }
    
        // Log authorized segment details
        const latestAuthorizedSegment = sessionForCleanup?.overtimeSegments
        ?.filter(s => s.status === 'authorized' && s.paymentIntentId && s.authorizedAt)
        ?.sort((a, b) => new Date(b.authorizedAt) - new Date(a.authorizedAt))[0];
      
      if (!latestAuthorizedSegment) {
        logger.warn('[leave_session_handler_v1] No authorized overtime segment found to finalize', {
          sessionLinkSessionId: sessionId,
          userId,
          bookingId: sessionForCleanup?.bookingId?.toString(),
          sessionDocId: sessionForCleanup?._id?.toString(),
          segmentStatuses: sessionForCleanup?.overtimeSegments?.map(s => s.status) || [],
          timestamp: new Date().toISOString()
        });
        await sessionDb.commitTransaction();
        await sessionDb.endSession();
        return;
      }
        logger.info(`[${logContext.event}] Processing authorized segment`, {
          ...logContext,
          segmentId: latestAuthorizedSegment?._id.toString(),
          segmentPrice: latestAuthorizedSegment?.calculatedMaxPrice.amount,
          paymentIntentId: latestAuthorizedSegment?.paymentIntentId,
          segmentStatus: latestAuthorizedSegment?.status,
          requestedDuration: latestAuthorizedSegment?.requestedDuration,
          segmentCreatedAt: latestAuthorizedSegment?.createdAt,
        });
    
        // Finalize payment (only for participant)
        if (isParticipant) {
          logger.info(`[${logContext.event}] Calling paymentService.finalizeOvertimePayment`, logContext);
          finalizeResult = await paymentService.finalizeOvertimePayment(bookingForCleanup._id, now, sessionDb);
          finalCaptureStatus = finalizeResult?.status || 'error';
          logContext.finalizationResultStatus = finalCaptureStatus;
          logContext.finalizationError = finalizeResult?.error;
    
          if (finalizeResult?.sessionUpdatePayload && finalizeResult?.segmentId) {
            const sessionUpdateResult = await Session.updateOne(
              { _id: sessionForCleanup._id, 'overtimeSegments._id': finalizeResult.segmentId },
              { ...finalizeResult.sessionUpdatePayload, 'overtimeSegments.$.finalizedAt': now },
              { arrayFilters: [{ 'elem._id': finalizeResult.segmentId }], session: sessionDb }
            );
            logger.debug(`[${logContext.event}] Session update result`, {
              ...logContext,
              segmentId: finalizeResult.segmentId.toString(),
              matched: sessionUpdateResult.matchedCount,
              modified: sessionUpdateResult.modifiedCount,
            });
            if (sessionUpdateResult.matchedCount === 0) {
              logger.error(`[${logContext.event}] Failed to find Session segment for update`, logContext);
            }
          }
    
          if (finalizeResult?.paymentUpdatePayload && finalizeResult?.segmentId) {
            const segmentForPI = sessionForCleanup.overtimeSegments.find(s => s._id.equals(finalizeResult.segmentId));
            if (segmentForPI?.paymentIntentId) {
              const paymentUpdateResult = await Payment.updateOne(
                { 'stripe.paymentIntentId': segmentForPI.paymentIntentId },
                finalizeResult.paymentUpdatePayload,
                { session: sessionDb }
              );
              logger.debug(`[${logContext.event}] Payment update result`, {
                ...logContext,
                segmentId: finalizeResult.segmentId.toString(),
                paymentIntentId: segmentForPI.paymentIntentId,
                matched: paymentUpdateResult.matchedCount,
                modified: paymentUpdateResult.modifiedCount,
              });
              if (paymentUpdateResult.matchedCount === 0) {
                logger.error(`[${logContext.event}] Failed to find Payment record for update`, logContext);
              }
            } else {
              logger.error(`[${logContext.event}] Cannot update Payment record: Missing paymentIntentId`, logContext);
            }
          }
    
          sessionForCleanup.state = 'ended';
          sessionForCleanup.endedAt = now;
          sessionForCleanup.actualEndTime = now;
          const participant = sessionForCleanup.participants.find(p => p.userId.equals(userId));
          if (participant) participant.leftAt = now;
          const coachParticipant = sessionForCleanup.participants.find(p => p.userId.equals(bookingForCleanup.coach._id));
          if (coachParticipant && !coachParticipant.leftAt) coachParticipant.leftAt = now;
    
          sessionForCleanup.terminationReason = finalizeResult?.success
            ? 'Participant left session'
            : `Participant left; Overtime processing error: ${finalizeResult?.error || 'Unknown Error'}`;
          sessionForCleanup.sessionCompleted = false;
    
          await sessionForCleanup.save({ session: sessionDb });
          sessionEndedByFinalization = true;
          logContext.finalSessionState = sessionForCleanup.state;
          logContext.terminationReason = sessionForCleanup.terminationReason;
    
          await sessionDb.commitTransaction();
          logger.info(`[${logContext.event}] Transaction committed successfully`, logContext);
        } else {
          logger.info(`[${logContext.event}] Coach leaving, marking leftAt`, logContext);
          const coachParticipant = sessionForCleanup.participants.find(p => p.userId.equals(userId));
          if (coachParticipant && !coachParticipant.leftAt) {
            coachParticipant.leftAt = now;
            await sessionForCleanup.save({ session: sessionDb });
            await sessionDb.commitTransaction();
          } else {
            await sessionDb.abortTransaction();
          }
        }
      } catch (error) {
        logger.error(`[${logContext.event}] Error during finalization`, {
          ...logContext,
          errorMessage: error.message,
          stack: error.stack,
          segmentId: latestAuthorizedSegment?._id.toString(),
          segmentPrice: latestAuthorizedSegment?.calculatedMaxPrice.amount,
          paymentIntentId: latestAuthorizedSegment?.paymentIntentId,
        });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to process session leave', details: error.message });
        if (sessionDb.inTransaction()) {
          await sessionDb.abortTransaction();
        }
      } finally {
        if (sessionDb && sessionDb.endSession) {
          await sessionDb.endSession();
        }
      }
    
      try {
        let sessionToUseForCleanup = null;
        if (sessionEndedByFinalization && bookingForCleanup?._id) {
          sessionToUseForCleanup = await Session.findById(sessionForCleanup?._id);
          logger.debug(`[${logContext.event}] Refetched session for cleanup`, {
            ...logContext,
            sessionState: sessionToUseForCleanup?.state,
          });
        } else if (isFinalizationAttempted && sessionForCleanup) {
          sessionToUseForCleanup = sessionForCleanup;
        }
      
        const videoIO = ioInstance?.of('/video');
        if (sessionEndedByFinalization && videoIO && bookingForCleanup && sessionToUseForCleanup) {
          const roomName = `session:${sessionId}`;
          const eventPayload = {
            endedBy: userId,
            timestamp: now.toISOString(),
            isCompleted: false,
            reason: sessionToUseForCleanup.terminationReason || 'Participant left session',
            captureStatus: finalCaptureStatus,
          };
          videoIO.to(roomName).emit('session-ended', eventPayload);
      
          if (finalizeResult && finalizeResult.success) {
            const { capturedAmount, currency, status: resultCaptureStatus, error: resultCaptureError, paymentIntentId: piFromFinalize } = finalizeResult;
            const metadataBase = { 
                bookingId: bookingForCleanup._id, 
                sessionId: sessionToUseForCleanup._id,
            };

            if (resultCaptureStatus === 'captured' || resultCaptureStatus === 'partially_captured') {
              try {
                await UnifiedNotificationService.sendNotification(
                  { ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_CAPTURED, recipient: bookingForCleanup.user._id, metadata: { ...metadataBase, amount: capturedAmount, currency }, channels: ['in_app', 'email'] },
                  bookingForCleanup, getSocketService()
                );
                logger.info(`[${logContext.event}] Sent OVERTIME_PAYMENT_CAPTURED notification to user ${bookingForCleanup.user._id}`, { ...logContext, capturedAmount, currency });
              } catch (notificationError) { logger.error(`[${logContext.event}] Failed to send OVERTIME_PAYMENT_CAPTURED notification`, { ...logContext, notificationType: NotificationTypes.OVERTIME_PAYMENT_CAPTURED, error: notificationError.message }); }
      
              try {
                await UnifiedNotificationService.sendNotification(
                  { ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_COLLECTED, recipient: bookingForCleanup.coach._id, metadata: { ...metadataBase, amount: capturedAmount, currency, clientName: `${bookingForCleanup.user.firstName} ${bookingForCleanup.user.lastName}` }, channels: ['in_app', 'email'] },
                  bookingForCleanup, getSocketService()
                );
                logger.info(`[${logContext.event}] Sent OVERTIME_PAYMENT_COLLECTED notification to coach ${bookingForCleanup.coach._id}`, { ...logContext, capturedAmount, currency });
              } catch (notificationError) { logger.error(`[${logContext.event}] Failed to send OVERTIME_PAYMENT_COLLECTED notification`, { ...logContext, notificationType: NotificationTypes.OVERTIME_PAYMENT_COLLECTED, error: notificationError.message }); }
            } else if (resultCaptureStatus === 'released') {
              try {
                await UnifiedNotificationService.sendNotification(
                  { ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_RELEASED, recipient: bookingForCleanup.user._id, metadata: { ...metadataBase }, channels: ['in_app'] },
                  bookingForCleanup, getSocketService()
                );
                logger.info(`[${logContext.event}] Sent OVERTIME_PAYMENT_RELEASED notification to user ${bookingForCleanup.user._id}`, { ...logContext });
              } catch (notificationError) { logger.error(`[${logContext.event}] Failed to send OVERTIME_PAYMENT_RELEASED notification`, { ...logContext, notificationType: NotificationTypes.OVERTIME_PAYMENT_RELEASED, error: notificationError.message }); }
            }
          } else if (finalizeResult && !finalizeResult.success && finalizeResult.status === 'capture_failed') {
            try {
                 await UnifiedNotificationService.sendNotification(
                  { type: NotificationTypes.OVERTIME_PAYMENT_CAPTURE_FAILED, recipient: bookingForCleanup.coach._id, metadata: { bookingId: bookingForCleanup._id, sessionId: sessionToUseForCleanup._id, paymentIntentId: finalizeResult.paymentIntentId, error: finalizeResult.error } , channels: ['in_app', 'email']},
                  bookingForCleanup, getSocketService()
                );
                logger.error(`[${logContext.event}] Sent OVERTIME_PAYMENT_CAPTURE_FAILED to coach`, { ...logContext, error: finalizeResult.error });
            } catch (notificationError) { logger.error(`[${logContext.event}] Failed to send OVERTIME_PAYMENT_CAPTURE_FAILED notification`, { ...logContext, error: notificationError.message }); }
          }
      
          try {
            const sessionEndedMetadataForCoach = {
                bookingId: bookingForCleanup._id,
                sessionId: sessionToUseForCleanup._id,
                reason: sessionToUseForCleanup.terminationReason,
                finalCaptureStatus 
            };
            if (finalizeResult && finalizeResult.success && (finalizeResult.status === 'captured' || finalizeResult.status === 'partially_captured')) {
                sessionEndedMetadataForCoach.amount = finalizeResult.capturedAmount; 
                sessionEndedMetadataForCoach.currency = finalizeResult.currency;
            }
            await UnifiedNotificationService.sendNotification(
              { type: NotificationTypes.SESSION_ENDED, recipient: bookingForCleanup.coach._id, content: { title: 'Session Ended', message: `Participant ${bookingForCleanup.user.firstName} left the session.` }, metadata: sessionEndedMetadataForCoach, channels: ['in_app', 'email'] },
              bookingForCleanup, getSocketService()
            );
            logger.info(`[${logContext.event}] Sent SESSION_ENDED notification to coach ${bookingForCleanup.coach._id}`, { ...logContext, metadataSent: sessionEndedMetadataForCoach });
            
            const sessionEndedMetadataForUser = { ...sessionEndedMetadataForCoach }; // Copy for user
             await UnifiedNotificationService.sendNotification(
              { type: NotificationTypes.SESSION_ENDED, recipient: bookingForCleanup.user._id, content: { title: 'Session Ended', message: `Your session with ${bookingForCleanup.coach.firstName} has ended.` }, metadata: sessionEndedMetadataForUser, channels: ['in_app', 'email'] },
              bookingForCleanup, getSocketService()
            );
            logger.info(`[${logContext.event}] Sent SESSION_ENDED notification to user ${bookingForCleanup.user._id}`, { ...logContext, metadataSent: sessionEndedMetadataForUser });

          } catch (notificationError) { logger.error(`[${logContext.event}] Failed to send SESSION_ENDED notification`, { ...logContext, notificationType: NotificationTypes.SESSION_ENDED, error: notificationError.message }); }
        }
      
        if (!sessionEndedByFinalization && sessionToUseForCleanup && userId && sessionToUseForCleanup.state !== 'ended') {
          const participantIndex = sessionToUseForCleanup.participants.findIndex((p) => p.userId.toString() === userId);
          if (participantIndex !== -1 && !sessionToUseForCleanup.participants[participantIndex].leftAt) {
            await Session.updateOne(
              { _id: sessionToUseForCleanup._id, 'participants.userId': userId },
              { $set: { 'participants.$.leftAt': now } },
            );
          }
        }
      
        if (sessionToUseForCleanup && userId) {
          const handIndex = (sessionToUseForCleanup.raisedHands || []).findIndex(hand => hand.userId.toString() === userId);
          if (handIndex !== -1) {
            const updateResult = await Session.updateOne(
              { _id: sessionToUseForCleanup._id },
              { $pull: { raisedHands: { userId: new mongoose.Types.ObjectId(userId) } } },
            );
            if (updateResult.modifiedCount > 0) {
              const updatedSession = await Session.findById(sessionToUseForCleanup._id).select('raisedHands');
              const raisedHandsPayload = (updatedSession?.raisedHands || []).map(hand => ({
                userId: hand.userId.toString(),
                peerId: hand.peerId,
                raisedAt: hand.raisedAt,
              }));
              videoIO?.to(`session:${sessionId}`).emit('raised-hands-update', raisedHandsPayload);
            }
          }
        }
      
        if (!sessionEndedByFinalization && socket.peerId && videoIO) {
          videoIO.to(`session:${sessionId}`).emit(SOCKET_EVENTS.PARTICIPANT_LEFT, {
            peerId: socket.peerId,
            timestamp: now.toISOString(),
          });
        }
      } catch (cleanupError) {
        logger.error(`[${logContext.event}] Error during post-finalization cleanup`, {
          ...logContext,
          error: cleanupError.message,
          stack: cleanupError.stack,
          timestamp: new Date().toISOString(),
        });
      }
      
      try {
        const conversationRooms = Array.from(socket.rooms).filter(room => room.startsWith('conversation:'));
        conversationRooms.forEach(room => socket.leave(room));
      } catch (roomError) {
        logger.error(`[${logContext.event}] Error during room cleanup`, {
          ...logContext,
          error: roomError.message,
          timestamp: new Date().toISOString(),
        });
      }
      
      logger.info(`[${logContext.event}] Handler finished`, logContext);
    });

    socket.on('togglePresentationMode', async (data) => {
      logger.info('[VideoSocket] Event received on togglePresentationMode listener', { event: 'togglePresentationMode', data });
      if (!data || typeof data !== 'object') {
        logger.warn('[VideoSocket] Invalid or missing data for togglePresentationMode', { data });
        socket.emit('error', { message: 'Invalid event data' });
        return;
      }
      const { sessionId, enabled } = data;
      if (typeof sessionId !== 'string' || typeof enabled !== 'boolean') {
        logger.warn('[VideoSocket] Invalid payload for togglePresentationMode', { sessionId, enabled, data });
        socket.emit('error', { message: 'Invalid togglePresentationMode parameters' });
        return;
      }
      try {
        const session = await getSessionBySessionId(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }
        session.workshopMode = enabled;
        await session.save();
        videoIO.to(`session:${sessionId}`).emit('presentationModeChanged', { enabled });
        logger.info('[VideoSocket] Presentation mode toggled', { sessionId, enabled });
      } catch (error) {
        logger.error('[VideoSocket] Error toggling presentation mode', { error: error.message, sessionId });
        socket.emit('error', { message: 'Failed to toggle presentation mode' });
      }
    });
    
    socket.on('nextSlide', async ({ sessionId, slide }) => {
      try {
        const session = await Session.findOne({ bookingId: sessionId });
        if (!session) {
          logger.warn('[VideoSocket] Session not found for slide change', { sessionId });
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found' });
          return;
        }
        session.currentSlide = slide;
        await session.save();
        videoIO.to(`session:${sessionId}`).emit('slideChanged', { slide });
        logger.info('[VideoSocket] Slide changed', { sessionId, slide });
      } catch (error) {
        logger.error('[VideoSocket] Error changing slide', { error: error.message, sessionId });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to change slide' });
      }
    });
    
    socket.on('prevSlide', async ({ sessionId, slide }) => {
      try {
        const session = await Session.findOne({ bookingId: sessionId });
        if (!session) {
          logger.warn('[VideoSocket] Session not found for previous slide', { sessionId });
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found' });
          return;
        }
        session.currentSlide = slide;
        await session.save();
        videoIO.to(`session:${sessionId}`).emit('slideChanged', { slide });
        logger.info('[VideoSocket] Previous slide changed', { sessionId, slide });
      } catch (error) {
        logger.error('[VideoSocket] Error changing previous slide', { error: error.message, sessionId });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to change previous slide' });
      }
    });
    
    socket.on('lockScreenSharing', async ({ sessionId, locked }) => {
      try {
        const session = await getSessionBySessionId(sessionId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }
        session.screenShareLocked = locked;
        await session.save();
        videoIO.to(`session:${sessionId}`).emit('screenShareLocked', { locked });
        logger.info('[VideoSocket] Screen share lock updated', { sessionId, locked });
      } catch (error) {
        logger.error('[VideoSocket] Error updating screen share lock', { error: error.message, sessionId });
        socket.emit('error', { message: 'Failed to update screen share lock' });
      }
    });

    socket.on('screen-sharing-started', ({ sessionId, peerId }) => {
      logger.info('[VideoSocket] Screen sharing started', { sessionId, peerId });
      videoIO.to(`session:${sessionId}`).emit('screen-sharing-started', { peerId });
    });
    
    socket.on('screen-sharing-stopped', ({ sessionId, peerId }) => {
      logger.info('[VideoSocket] Screen sharing stopped', { sessionId, peerId });
      videoIO.to(`session:${sessionId}`).emit('screen-sharing-stopped', { peerId });
    });

    socket.on('startTimer', ({ sessionId, duration, startTime }) => {
      videoIO.to(`session:${sessionId}`).emit('timerStarted', { duration, startTime });
      logger.info('[VideoSocket] Timer started', { sessionId, duration });
    });
    
    socket.on('pauseTimer', ({ sessionId }) => {
      videoIO.to(`session:${sessionId}`).emit('timerPaused');
      logger.info('[VideoSocket] Timer paused', { sessionId });
    });
    
    socket.on('resetTimer', ({ sessionId }) => {
      videoIO.to(`session:${sessionId}`).emit('timerReset');
      logger.info('[VideoSocket] Timer reset', { sessionId });
    });
    
    socket.on('timerEnded', ({ sessionId }) => {
      videoIO.to(`session:${sessionId}`).emit('timerEnded');
      logger.info('[VideoSocket] Timer ended', { sessionId });
    });

    socket.on('submitFeedback', async ({ sessionId, feedback, userId }) => {
      try {
        // Find the booking using the sessionId string
        const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId });
        if (!booking) {
          logger.warn('[VideoSocket] Booking not found for feedback', { sessionId });
          return;
        }
        // Find the session using the bookingId
        const session = await Session.findOne({ bookingId: booking._id });
        if (!session) {
          logger.warn('[VideoSocket] Session not found for feedback', { sessionId, bookingId: booking._id.toString() });
          return;
        }
        session.feedback.push({ userId, text: feedback, timestamp: new Date() });
        await session.save();
        videoIO.to(`session:${sessionId}`).emit('feedbackReceived', { feedback, userId, timestamp: new Date().toISOString() });
        logger.info('[VideoSocket] Feedback submitted and saved', { sessionId, userId });
      } catch (error) {
        logger.error('[VideoSocket] Error saving feedback', { error: error.message, sessionId });
      }
    });

    socket.on('no-feedback-provided', async ({ sessionId, userId }) => {
      try {
        logger.info('[VideoSocket] User did not provide feedback', { sessionId, userId });
    
        // Fetch user details for notification
        const user = await User.findById(userId);
        if (!user) {
          logger.warn('[VideoSocket] User not found for no-feedback notification', { userId });
          return;
        }
    
        // Create a notification to remind the user to provide feedback
        const notificationData = {
          recipient: userId,
          type: 'feedback_reminder',
          category: 'session',
          priority: 'medium',
          message: 'Please provide feedback for your recent session.',
          metadata: { sessionId },
        };
    
        // Use the UnifiedNotificationService to create and send the notification
        await UnifiedNotificationService.createNotification(notificationData);
    
        logger.info('[VideoSocket] Feedback reminder notification sent', { sessionId, userId });
      } catch (error) {
        logger.error('[VideoSocket] Error handling no-feedback-provided', {
          sessionId,
          userId,
          error: error.message,
          stack: error.stack,
        });
      }
    });

    socket.on('spotlightParticipant', ({ sessionId, participantId }) => {
      videoIO.to(`session:${sessionId}`).emit('participantSpotlighted', { participantId });
      logger.info('[VideoSocket] Participant spotlighted', { sessionId, participantId });
    });
    
    socket.on('muteAll', ({ sessionId }) => {
      videoIO.to(`session:${sessionId}`).emit('muteAll');
      logger.info('[VideoSocket] Mute all broadcast', { sessionId });
    });

    socket.on('engagement', async ({ sessionId, action }) => {
      const userId = socket.userId; // Use socket.userId set during join-session
      logger.info('[VideoSocket] Engagement event received', {
        action: action || 'NO_ACTION_PROVIDED',
        sessionId: sessionId || 'UNDEFINED',
        userId: userId || 'UNDEFINED',
        socketId: socket.id,
        query: socket.handshake.query,
        timestamp: new Date().toISOString()
      });
      try {
        if (!sessionId || !userId) {
          logger.warn('[VideoSocket] Missing sessionId or userId in engagement event', {
            sessionId,
            userId,
            action,
          });
          return;
        }
        await AnalyticsService.trackEngagement(sessionId, userId, action);
        console.log('[socketConfig] Engagement event processed', { sessionId, userId, action });
      } catch (error) {
        logger.error('[socketConfig] Error tracking engagement', { sessionId, userId, action, error: error.message });
      }
    });

    socket.on('tool-used', async ({ sessionId, tool }) => {
      try {
        logger.info('[VideoSocket] Received tool-used event', { sessionId, tool });
        await AnalyticsService.trackToolUsage(sessionId, tool);
        console.log('[socketConfig] Tool usage event processed', { sessionId, tool });
      } catch (error) {
        logger.error('[socketConfig] Error tracking tool usage', { sessionId, tool, error: error.message });
      }
    });

    socket.on('breakout-room-created', async ({ roomId, participants, startTime }) => {
      try {
        await AnalyticsService.trackBreakoutRoom(sessionId, roomId, participants, startTime);
        socket.to(`session:${sessionId}`).emit('breakout-room-update', { roomId, participants, startTime });
        console.log('[socketConfig] Breakout room created', { sessionId, roomId });
      } catch (error) {
        logger.error('[socketConfig] Error tracking breakout room', { sessionId, roomId, error: error.message });
      }
    });

    socket.on('breakout-room-ended', async ({ roomId, endTime }) => {
      try {
        await AnalyticsService.endBreakoutRoom(sessionId, roomId, endTime);
        socket.to(`session:${sessionId}`).emit('breakout-room-update', { roomId, endTime });
        console.log('[socketConfig] Breakout room ended', { sessionId, roomId });
      } catch (error) {
        logger.error('[socketConfig] Error ending breakout room', { sessionId, roomId, error: error.message });
      }
    });

    let reconnectTimeout;

    socket.on('disconnect', () => {
      clearTimeout(reconnectTimeout);
      
    });
  
    // Handle fallback join mechanism
    socket.on('join_video_namespace', async (data) => {
      logger.info('[VideoSocket] Received explicit namespace join request', {
        sessionId: data.sessionId,
        socketId: socket.id,
        timestamp: data.timestamp
      });
      
      // Just acknowledge receipt
      socket.emit('video_namespace_joined', {
        success: true,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });
    });

    if (!socket.handshake.query.sessionId || !socket.handshake.query.token) {
      logger.warn('[VideoSocket] Missing required query parameters', {
        socketId: socket.id,
        query: socket.handshake.query,
        timestamp: new Date().toISOString(),
      });
      socket.emit(SOCKET_EVENTS.ERROR, { message: 'Missing required session parameters' });
      return;
    }

    socket.on(SOCKET_EVENTS.JOIN_SESSION, async ({ sessionId, token, displayName, isCoach, peerId }) => {
      logger.info('[VideoSocket] Join session received', { sessionId, userId: socket.userId, isCoach });
  socket.isCoach = !!isCoach; // Force boolean and ensure it’s set
  socket.displayName = displayName;
      try {
        logger.info('[VideoSocket] Join session attempt', {
          sessionId,
          token,
          displayName,
          isCoach,
          peerId,
          socketId: socket.id,
        });

        const booking = await Booking.findOne({
          'sessionLink.sessionId': sessionId,
          'sessionLink.token': token,
          'sessionLink.expired': false,
        });
        if (!booking) {
          logger.warn('[VideoSocket] Invalid or expired session link', {
            sessionId,
            token,
            socketId: socket.id,
          });
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid or expired session link' });
          return;
        }

        const session = await Session.findOne({ bookingId: booking._id });
        if (!session || !['confirmed', 'active'].includes(session.state)) {
          logger.warn('[VideoSocket] Session not in joinable state', {
            sessionId,
            state: session?.state,
            socketId: socket.id,
          });
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not active or confirmed' });
          return;
        }

        const now = new Date();
        const startTime = new Date(booking.start);
        const endTime = new Date(booking.end);
        if (isCoach && session.state === 'confirmed') {
          const earlyJoinMinutes = (startTime - now) / (1000 * 60);
          session.state = 'active';
          session.startedAt = now;
          await session.save();
          logger.info('[VideoSocket] Coach activated session early', {
            sessionId,
            bookingId: booking._id.toString(),
            earlyJoinMinutes: earlyJoinMinutes > 0 ? earlyJoinMinutes : 0,
            startTime: startTime.toISOString(),
            joinTime: now.toISOString(),
          });
          videoIO.to(`session:${sessionId}`).emit('session-started');
        }

        socket.join(`session:${sessionId}`);
        socket.peerId = peerId;
        socket.displayName = displayName;
        socket.isCoach = isCoach;
        logger.info('[VideoSocket] Set socket.isCoach', { isCoach, socketId: socket.id, userId: socket.userId });
        socket.userId = booking[isCoach ? 'coach' : 'user']._id.toString();

        logger.info('[VideoSocket] User joined session successfully', {
          sessionId,
          peerId,
          displayName,
          isCoach,
          userId: socket.userId,
          joinTime: now.toISOString(),
          rooms: Array.from(socket.rooms),
        });

        const participant = session.participants.find((p) => p.userId.toString() === socket.userId);
        if (!participant) {
          session.participants.push({ userId: socket.userId, joinedAt: now });
          await session.save();
          logger.info('[VideoSocket] Added new participant to session', {
            sessionId,
            userId: socket.userId,
          });
        }

        if (isCoach) {
          const now = new Date();
          const scheduledStart = new Date(booking.start);
          session.actualStartTime = now <= scheduledStart ? scheduledStart : now;
          const plannedDuration = (new Date(booking.end) - new Date(booking.start)) / 60000; // in minutes
          const plannedEndTime = new Date(session.actualStartTime.getTime() + plannedDuration * 60000);
          session.actualEndTime = new Date(plannedEndTime.getTime() + 5 * 60000); // +5 minutes grace period
          await session.save();
          logger.info('[VideoSocket] Set actualStartTime and actualEndTime', {
            sessionId,
            actualStartTime: session.actualStartTime,
            actualEndTime: session.actualEndTime,
          });
        
          // Schedule automatic termination
          const timeUntilEnd = session.actualEndTime - now;
          if (timeUntilEnd > 0) {
            setTimeout(async () => {
              try {
                session.state = 'ended';
                session.actualEndTime = new Date();
                await session.save();
                videoIO.to(`session:${sessionId}`).emit(SOCKET_EVENTS.SESSION_ENDED, {
                  endedBy: 'system',
                  timestamp: new Date().toISOString(),
                });
                logger.info('[VideoSocket] Session automatically terminated', { sessionId });
              } catch (error) {
                logger.error('[VideoSocket] Error in automatic session termination', { sessionId, error: error.message });
              }
            }, timeUntilEnd);
          } else {
            // If already past actualEndTime, terminate immediately
            session.state = 'ended';
            session.actualEndTime = new Date();
            await session.save();
            videoIO.to(`session:${sessionId}`).emit(SOCKET_EVENTS.SESSION_ENDED, {
              endedBy: 'system',
              timestamp: new Date().toISOString(),
            });
            logger.info('[VideoSocket] Session immediately terminated', { sessionId });
          }
        }

        socket.to(`session:${sessionId}`).emit(SOCKET_EVENTS.PARTICIPANT_JOINED, {
          peerId,
          displayName,
          isCoach,
          timestamp: now,
        });


        let participants = [];
        try {
          // Handle different Socket.IO versions safely
          if (videoIO.sockets.sockets instanceof Map) {
            // Socket.IO 4.x
            participants = Array.from(videoIO.sockets.sockets.values())
              .filter(s => s.rooms && s.rooms.has(`session:${sessionId}`) && s.peerId !== peerId)
              .map(s => ({
                peerId: s.peerId,
                displayName: s.displayName || 'Unknown',
                isCoach: s.isCoach || false
              }));
          } 
          else if (videoIO.sockets.adapter && videoIO.sockets.adapter.rooms) {
            // Socket.IO 3.x/2.x fallback
            const roomName = `session:${sessionId}`;
            const room = videoIO.sockets.adapter.rooms.get(roomName);
            
            if (room) {
              const sockets = Array.from(room);
              participants = sockets
                .filter(id => id !== socket.id)
                .map(id => {
                  const s = videoIO.sockets.sockets.get(id);
                  return s ? {
                    peerId: s.peerId,
                    displayName: s.displayName || 'Unknown',
                    isCoach: s.isCoach || false
                  } : null;
                })
                .filter(p => p !== null);
            }
          }
          
          logger.info('[VideoSocket] Sending participants list', {
            sessionId,
            participantCount: participants.length
          });
        } catch (err) {
          logger.error('[VideoSocket] Error determining participants', {
            sessionId,
            error: err.message,
            stack: err.stack
          });
          participants = [];
        }
        
        socket.emit('session-participants', participants);

        socket.emit('raised-hands-update', session.raisedHands);
        logger.info('[VideoSocket] Sent initial raised-hands-update to new joiner', { sessionId, peerId, raisedHandsCount: session.raisedHands.length });

        logger.info('[VideoSocket] Sent session-participants to client', {
          sessionId,
          participantCount: participants.length,
          peerId,
        });

        socket.on('session-started', ({ sessionId: startedSessionId }) => {
          if (startedSessionId === sessionId) {
            logger.info('[VideoSocket] Session started broadcast triggered', { sessionId });
            videoIO.to(`session:${sessionId}`).emit('session-started');
          }
        });

        StreamManager.startMonitoring(sessionId);
        logger.info('[VideoSocket] Started stream monitoring', { sessionId });

        socket.on(SOCKET_EVENTS.SIGNAL, (data) => {
          logger.info('[VideoSocket] Signal received', {
            sessionId,
            from: peerId,
            to: data.to,
            signalType: data.signal.type,
          });
          socket.to(data.to).emit(SOCKET_EVENTS.SIGNAL, { from: peerId, signal: data.signal });
        });
  
        socket.on(SOCKET_EVENTS.SESSION_ENDED, async ({ sessionId, peerId }) => {
          try {
            const session = await Session.findById(sessionId);
            if (!session) {
              logger.warn('[VideoSocket] Session not found for ending', { sessionId, peerId });
              socket.emit(SOCKET_EVENTS.ERROR, { message: 'Session not found' });
              return;
            }
        
            session.state = 'ended';
            session.endedAt = new Date();
            session.raisedHands = [];
        
            const booking = await Booking.findById(session.bookingId).populate('coach user');
            if (!booking) {
              logger.warn('[VideoSocket] Booking not found for session', { sessionId, bookingId: session.bookingId });
              socket.emit(SOCKET_EVENTS.ERROR, { message: 'Booking not found' });
              return;
            }
        
            const coachParticipant = session.participants.find(p => p.userId.equals(booking.coach._id));
            const clientParticipant = session.participants.find(p => p.userId.equals(booking.user._id));
            let isCompleted = false;
        
            if (coachParticipant && clientParticipant) {
              const coachStart = coachParticipant.joinedAt;
              const coachEnd = coachParticipant.leftAt || session.endedAt;
              const clientStart = clientParticipant.joinedAt;
              const clientEnd = clientParticipant.leftAt || session.endedAt;
        
              const overlapStart = Math.max(coachStart.getTime(), clientStart.getTime());
              const overlapEnd = Math.min(coachEnd.getTime(), clientEnd.getTime());
              const overlapDuration = (overlapEnd - overlapStart) / (1000 * 60); // Convert to minutes
        
              isCompleted = overlapDuration >= 5;
              session.sessionCompleted = isCompleted;
        
              logger.info('[VideoSocket] Calculated session completion', {
                sessionId,
                overlapDuration,
                isCompleted,
                coachId: booking.coach._id.toString(),
                clientId: booking.user._id.toString(),
              });
            } else {
              logger.warn('[VideoSocket] Missing participants for completion check', {
                sessionId,
                coachPresent: !!coachParticipant,
                clientPresent: !!clientParticipant,
              });
            }

            session.actualEndTime = new Date();
        
            await session.save();
        
            // Update user session history
            await User.updateMany(
              { _id: { $in: [booking.coach._id, booking.user._id] } },
              {
                $push: {
                  sessionHistory: {
                    sessionId: session._id,
                    bookingId: session.bookingId,
                    role: { $cond: { if: { $eq: ['$_id', booking.coach._id] }, then: 'coach', else: 'participant' } },
                    completedAt: new Date(),
                  },
                },
              }
            );
        
            logger.info('[VideoSocket] Session ended and history updated', {
              sessionId,
              bookingId: session.bookingId.toString(),
              coachId: booking.coach._id.toString(),
              clientId: booking.user._id.toString(),
            });
        
            videoIO.to(`session:${sessionId}`).emit(SOCKET_EVENTS.SESSION_ENDED, {
              endedBy: peerId,
              timestamp: new Date().toISOString(),
              isCompleted,
            });
        
            videoIO.to(`session:${sessionId}`).emit('raised-hands-update', []);
        
            StreamManager.stopMonitoring(sessionId);
          } catch (error) {
            logger.error('[VideoSocket] Error ending session', {
              sessionId,
              peerId,
              error: error.message,
              stack: error.stack,
            });
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to end session', details: error.message });
          }
        });
  
        socket.on(SOCKET_EVENTS.CHAT_MESSAGE, (message) => {
          logger.info('[VideoSocket] Chat message:', { sessionId, peerId, message });
          videoIO.to(`session:${sessionId}`).emit(SOCKET_EVENTS.CHAT_MESSAGE, {
            senderId: peerId,
            senderName: displayName || 'Unknown',
            text: message.text,
            timestamp: message.timestamp || new Date().toISOString(),
          });
        });
  
        socket.on(SOCKET_EVENTS.WHITEBOARD_UPDATE, (data) => {
          logger.info('[VideoSocket] Whiteboard update:', { sessionId, peerId });
          if (data.clear) {
            videoIO.to(`session:${sessionId}`).emit(SOCKET_EVENTS.WHITEBOARD_UPDATE, { clear: true });
          } else if (data.undo || data.redo) {
            videoIO.to(`session:${sessionId}`).emit(SOCKET_EVENTS.WHITEBOARD_UPDATE, data);
          } else {
            socket.to(`session:${sessionId}`).emit(SOCKET_EVENTS.WHITEBOARD_UPDATE, data);
          }
        });

        socket.on('raise-hand', async ({ sessionId, peerId }) => {
          try {
            logger.info('[VideoSocket] Received raise-hand event', { sessionId, peerId, userId: socket.userId });
            const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId });
            if (!booking) {
              logger.warn('[VideoSocket] Booking not found for raise-hand', { sessionId, peerId });
              throw new Error('Booking not found');
            }
            const session = await Session.findOne({ bookingId: booking._id });
            if (!session) {
              logger.warn('[VideoSocket] Session not found for raise-hand', { sessionId, peerId });
              throw new Error('Session not found');
            }
            const userId = socket.userId;
            if (!userId) {
              logger.error('[VideoSocket] No userId on socket for raise-hand', { sessionId, peerId });
              throw new Error('Missing userId');
            }
            const existingHand = session.raisedHands.find(hand => hand.userId.toString() === userId);
            if (!existingHand) {
              session.raisedHands.push({ userId, peerId, raisedAt: new Date() }); // No displayName here
              await session.save();
              logger.info('[VideoSocket] Hand raised and saved', { sessionId, userId, peerId });
            } else {
              logger.info('[VideoSocket] Hand already raised, skipping', { sessionId, userId, peerId });
            }
            const raisedHandsPayload = session.raisedHands.map(hand => ({
              userId: hand.userId.toString(),
              peerId: hand.peerId,
              raisedAt: hand.raisedAt
            }));
            videoIO.to(`session:${sessionId}`).emit('raised-hands-update', raisedHandsPayload);
            logger.info('[VideoSocket] Emitted raised-hands-update', { sessionId, raisedHandsCount: raisedHandsPayload.length });
          } catch (error) {
            logger.error('[VideoSocket] Error in raise-hand', { error: error.message, sessionId, peerId, userId: socket.userId });
            socket.emit('error', { message: 'Failed to raise hand', details: error.message });
          }
        });
        
        socket.on('lower-hand', async ({ sessionId, peerId }) => {
          try {
            const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId });
            if (!booking) {
              logger.warn('[VideoSocket] Booking not found for lower-hand', { sessionId, peerId });
              throw new Error('Booking not found');
            }
            const session = await Session.findOne({ bookingId: booking._id });
            if (!session) {
              logger.warn('[VideoSocket] Session not found for lower-hand', { sessionId, peerId });
              throw new Error('Session not found');
            }
            const userId = socket.userId;
            const initialCount = session.raisedHands.length;
            session.raisedHands = session.raisedHands.filter(hand => hand.userId.toString() !== userId);
            if (session.raisedHands.length !== initialCount) {
              await session.save();
              logger.info('[VideoSocket] Hand lowered and removed', { sessionId, userId, peerId });
              const raisedHandsPayload = session.raisedHands.map(hand => ({
                userId: hand.userId.toString(),
                peerId: hand.peerId,
                raisedAt: hand.raisedAt,
                displayName: hand.displayName,
                confirmed: hand.confirmed || false
              }));
              videoIO.to(`session:${sessionId}`).emit('raised-hands-update', raisedHandsPayload);
              logger.info('[VideoSocket] Broadcast raised-hands-update after lower', { sessionId, raisedHandsCount: raisedHandsPayload.length });
            } else {
              logger.info('[VideoSocket] No hand to lower', { sessionId, userId, peerId });
            }
          } catch (error) {
            logger.error('[VideoSocket] Error in lower-hand', { error: error.message, sessionId, peerId });
            socket.emit('error', { message: 'Failed to lower hand', details: error.message });
          }
        });
        
        socket.on('confirm-hand', async ({ sessionId, userIdToConfirm }) => {
          try {
            logger.info('[VideoSocket] Received confirm-hand event', { sessionId, userId: socket.userId, userIdToConfirm });
            const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId }).populate('coach');
            if (!booking) {
              logger.warn('[VideoSocket] Booking not found for confirm-hand', { sessionId });
              throw new Error('Booking not found');
            }
            const session = await Session.findOne({ bookingId: booking._id });
            if (!session) {
              logger.warn('[VideoSocket] Session not found for confirm-hand', { sessionId });
              throw new Error('Session not found');
            }
           /* const isCoach = booking.coach._id.toString() === socket.userId;
            if (!isCoach) {
              logger.warn('[VideoSocket] Non-coach attempted to confirm hand', { sessionId, userId: socket.userId, userIdToConfirm });
              throw new Error('Only coaches can confirm hands');
            }*/
            const handIndex = session.raisedHands.findIndex(hand => hand.userId.toString() === userIdToConfirm);
            if (handIndex === -1) {
              logger.warn('[VideoSocket] Hand not found to confirm', { sessionId, userIdToConfirm });
              throw new Error('Hand not found');
            }
            session.raisedHands.splice(handIndex, 1); // Remove the hand
            await session.save();
            logger.info('[VideoSocket] Hand confirmed and removed', { sessionId, userId: socket.userId, userIdToConfirm });
            const raisedHandsPayload = session.raisedHands.map(hand => ({
              userId: hand.userId.toString(),
              peerId: hand.peerId,
              raisedAt: hand.raisedAt,
              displayName: hand.displayName,
              confirmed: hand.confirmed || false
            }));
            videoIO.to(`session:${sessionId}`).emit('raised-hands-update', raisedHandsPayload);
            logger.info('[VideoSocket] Emitted raised-hands-update after confirm', { sessionId, raisedHandsCount: raisedHandsPayload.length });
          } catch (error) {
            logger.error('[VideoSocket] Error in confirm-hand', { error: error.message, sessionId, userIdToConfirm });
            socket.emit('error', { message: 'Failed to confirm hand', details: error.message });
          }
        });

        socket.on('mute-all', () => {
          videoIO.to(`session:${sessionId}`).emit('mute-all');
          logger.info('[VideoSocket] Mute all broadcast', { sessionId });
        });
        
        socket.on('screen-share-locked', ({ locked }) => {
          videoIO.to(`session:${sessionId}`).emit('screen-share-locked', { locked });
          logger.info('[VideoSocket] Screen share lock broadcast', { sessionId, locked });
        });
        
        socket.on('next-slide', () => {
          videoIO.to(`session:${sessionId}`).emit('next-slide');
          logger.info('[VideoSocket] Next slide broadcast', { sessionId });
        });

        socket.on('launchPoll', ({ sessionId, pollId }) => {
          videoIO.to(`session:${sessionId}`).emit('pollCreated', { pollId });
          logger.info('[VideoSocket] Poll launched', { sessionId, pollId });
        });

        socket.on('poll-created', (poll) => {
          videoIO.to(`session:${sessionId}`).emit('poll-created', poll);
          logger.info('[VideoSocket] Poll created broadcast', { sessionId, pollId: poll._id });
        });
        
        socket.on('poll-voted', (poll) => {
          videoIO.to(`session:${sessionId}`).emit('poll-voted', poll);
          logger.info('[VideoSocket] Poll voted broadcast', { sessionId, pollId: poll._id });
        });
        
        socket.on('qa-submitted', (qa) => {
          videoIO.to(`session:${sessionId}`).emit('qa-submitted', qa);
          logger.info('[VideoSocket] QA submitted broadcast', { sessionId, qaId: qa._id });
        });
        
        socket.on('qa-updated', (qa) => {
          videoIO.to(`session:${sessionId}`).emit('qa-updated', qa);
          logger.info('[VideoSocket] QA updated broadcast', { sessionId, qaId: qa._id });
        });

        socket.on('notes-updated', (notes) => {
          videoIO.to(`session:${sessionId}`).emit('notes-updated', notes);
          logger.info('[VideoSocket] Notes updated broadcast', { sessionId });
        });
        
        socket.on('agenda-updated', (agenda) => {
          videoIO.to(`session:${sessionId}`).emit('agenda-updated', agenda);
          logger.info('[VideoSocket] Agenda updated broadcast', { sessionId });
        });

        socket.on('join_video_namespace', async (data) => {
          logger.info('[VideoSocket] Received explicit namespace join request', {
            sessionId: data.sessionId,
            socketId: socket.id,
            timestamp: data.timestamp
          });
          
          // Just acknowledge receipt
          socket.emit('video_namespace_joined', {
            success: true,
            socketId: socket.id,
            timestamp: new Date().toISOString()
          });
        });

        socket.on('create-breakout-rooms', async ({ sessionId, roomAssignments }) => {
          try {
            const session = await Session.findOne({ bookingId: sessionId });
            if (!session || !socket.isCoach) {
              socket.emit(SOCKET_EVENTS.ERROR, { message: 'Unauthorized or invalid session' });
              return;
            }

            session.breakoutRooms = roomAssignments.map((room, index) => ({
              roomId: `breakout-${sessionId}-${index}`,
              participants: room.map(userId => ({ userId })),
            }));
            await session.save();

            session.breakoutRooms = roomAssignments.map((room, index) => ({
              roomId: `breakout-${sessionId}-${index}`,
              participants: room.map(userId => ({ userId })),
            }));
            await session.save();
            
            const booking = await Booking.findById(session.bookingId);
            if (booking) {
              booking.attendees = booking.attendees.map(attendee => {
                const room = session.breakoutRooms.find(r => 
                  r.participants.some(p => p.userId.toString() === attendee.user.toString())
                );
                if (room) {
                  attendee.notes = `Assigned to breakout room ${room.roomId}`;
                }
                return attendee;
              });
              await booking.save();
              logger.info('[VideoSocket] Breakout rooms synced with booking attendees', {
                bookingId: session.bookingId.toString(),
                attendeeCount: booking.attendees.length
              });
            }
            
            logger.info('[VideoSocket] Breakout rooms created:', { sessionId, roomAssignments });

            videoIO.to(`session:${sessionId}`).emit('breakout-rooms-created', {
              rooms: session.breakoutRooms,
            });

            // Move participants to their rooms
            roomAssignments.forEach((room, index) => {
              const roomId = `breakout-${sessionId}-${index}`;
              room.forEach((userId) => {
                const participantSocket = Array.from(videoIO.sockets.sockets.values())
                  .find(s => s.rooms.has(`session:${sessionId}`) && s.userId === userId);
                if (participantSocket) {
                  participantSocket.leave(`session:${sessionId}`);
                  participantSocket.join(roomId);
                  participantSocket.emit('moved-to-breakout', { roomId });
                }
              });
            });
          } catch (error) {
            logger.error('[VideoSocket] Create breakout rooms error:', { sessionId, error: error.message });
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to create breakout rooms' });
          }
        });

        socket.on('end-breakout-rooms', async ({ sessionId }) => {
          try {
            const session = await Session.findOne({ bookingId: sessionId });
            if (!session || !socket.isCoach) {
              socket.emit(SOCKET_EVENTS.ERROR, { message: 'Unauthorized or invalid session' });
              return;
            }

            session.breakoutRooms = [];
            await session.save();

            logger.info('[VideoSocket] Breakout rooms ended:', { sessionId });

            videoIO.to(`session:${sessionId}`).emit('breakout-rooms-ended');
            Array.from(videoIO.sockets.sockets.values())
              .filter(s => s.rooms.has(`breakout-${sessionId}-*`))
              .forEach(s => {
                s.leaveAll();
                s.join(`session:${sessionId}`);
                s.emit('returned-to-main', { sessionId });
              });
          } catch (error) {
            logger.error('[VideoSocket] End breakout rooms error:', { sessionId, error: error.message });
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to end breakout rooms' });
          }
        });

        socket.on('create-transport', async ({ sessionId }) => {
          try {
            const transport = await MediaServer.createTransport(sessionId, socket.id);
            socket.emit('transport-created', {
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
            });
          } catch (error) {
            logger.error('[VideoSocket] Create transport error:', { sessionId, error: error.message });
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to create transport' });
          }
        });
        
        socket.on('connect-transport', async ({ sessionId, transportId, dtlsParameters }) => {
          try {
            const transport = MediaServer.transports.get(`${sessionId}:${socket.id}`);
            if (!transport || transport.id !== transportId) throw new Error('Invalid transport');
            await transport.connect({ dtlsParameters });
            logger.info('[VideoSocket] Transport connected:', { sessionId, socketId: socket.id });
          } catch (error) {
            logger.error('[VideoSocket] Connect transport error:', { sessionId, error: error.message });
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to connect transport' });
          }
        });
        
        socket.on('produce', async ({ sessionId, transportId, kind, rtpParameters }) => {
          try {
            const producer = await MediaServer.produce(sessionId, socket.id, transportId, kind, rtpParameters);
            socket.emit('producer-created', { producerId: producer.id });
            socket.to(`session:${sessionId}`).emit('new-producer', { producerId: producer.id, socketId: socket.id });
          } catch (error) {
            logger.error('[VideoSocket] Produce error:', { sessionId, error: error.message });
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to produce' });
          }
        });
        
        socket.on('consume', async ({ sessionId, producerSocketId, producerId }) => {
          try {
            const consumer = await MediaServer.consume(sessionId, producerSocketId, socket.id, producerId);
            socket.emit('consumer-created', {
              id: consumer.id,
              producerId,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters,
            });
            await consumer.resume();
          } catch (error) {
            logger.error('[VideoSocket] Consume error:', { sessionId, error: error.message });
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to consume' });
          }
        });

        socket.on('test-resource-upload', ({ sessionId, resource }) => {
          videoIO.to(`session:${sessionId}`).emit('resource-uploaded', resource);
          logger.info('[VideoSocket] Test resource uploaded event emitted', { sessionId, resourceId: resource._id });
        });
    
        socket.on('test-resource-delete', ({ sessionId, resourceId }) => {
          videoIO.to(`session:${sessionId}`).emit('resource-deleted', { resourceId });
          logger.info('[VideoSocket] Test resource deleted event emitted', { sessionId, resourceId });
        });
  

socket.on(SOCKET_EVENTS.DISCONNECT, async (reason) => {
  const now = new Date();
  const userId = socket.userId;
  const sessionLinkSessionId = socket.handshake?.query?.sessionId;
  const peerId = socket.peerId;

  const logContext = {
    event: 'disconnect_handler_v3',
    reason,
    socketId: socket.id,
    userId,
    sessionLinkSessionId,
    peerId,
    timestamp: now.toISOString()
  };
  logger.info(`[${logContext.event}] Handler entered.`, logContext);

  if (typeof debugInterval !== 'undefined') {
    clearInterval(debugInterval);
    logger.debug(`[${logContext.event}] Cleared debug interval.`, logContext);
  } else {
    logger.warn(`[${logContext.event}] debugInterval was undefined, could not clear.`, logContext);
  }

  // Defensive check for mongoose availability
  if (!mongoose) {
    logger.error(`[${logContext.event}] Mongoose is not defined. Cannot proceed with transaction`, {
      ...logContext,
      mongooseAvailable: !!mongoose,
      mongooseVersion: mongoose?.version || 'unknown',
    });
    try {
      const conversationRooms = Array.from(socket.rooms).filter(room => room.startsWith('conversation:'));
      conversationRooms.forEach(room => socket.leave(room));
      logger.info(`[${logContext.event}] Cleaned up conversation rooms (mongoose unavailable).`, { ...logContext, rooms: conversationRooms });
    } catch (roomError) {
      logger.error(`[${logContext.event}] Error during room cleanup (mongoose unavailable)`, { ...logContext, error: roomError.message });
    }
    return;
  }

  let isFinalizationAttempted = false;
  let finalCaptureStatus = 'not_applicable';
  let sessionEndedByFinalization = false;
  let finalizeResult = null;
  let bookingForCleanup = null;
  let sessionForCleanup = null;
  let finalizationError = null;

  if (!userId || !sessionLinkSessionId) {
    logger.warn(`[${logContext.event}] Missing userId ('${userId}') or sessionLinkSessionId ('${sessionLinkSessionId}'). Cannot perform session-specific cleanup or finalization.`, logContext);
    try {
      const conversationRooms = Array.from(socket.rooms).filter(room => room.startsWith('conversation:'));
      conversationRooms.forEach(room => socket.leave(room));
      logger.info(`[${logContext.event}] Cleaned up conversation rooms (essential data missing).`, { ...logContext, rooms: conversationRooms });
    } catch (roomError) {
      logger.error(`[${logContext.event}] Error during room cleanup (essential data missing)`, { ...logContext, error: roomError.message });
    }
    return;
  }

  const sessionDb = await mongoose.startSession();
  sessionDb.startTransaction({ readPreference: 'primary' });
  logger.debug(`[${logContext.event}] DB Transaction started.`, logContext);

  try {
    isFinalizationAttempted = true;

    bookingForCleanup = await Booking.findOne({ 'sessionLink.sessionId': sessionLinkSessionId })
      .select('+user +coach +overtime +price +start +end +sessionType')
      .populate('user', '_id firstName lastName email')
      .populate('coach', '_id settings.professionalProfile.hourlyRate firstName lastName email')
      .populate('sessionType', 'name')
      .session(sessionDb);

    logger.debug(`[${logContext.event}] Booking fetch result: ${bookingForCleanup ? `Found (ID: ${bookingForCleanup._id})` : 'Not Found'}.`, logContext);

    if (!bookingForCleanup) {
      logger.warn(`[${logContext.event}] Booking not found for sessionLinkSessionId. Aborting transaction.`, logContext);
      await sessionDb.abortTransaction();
      await sessionDb.endSession();
      return;
    }
    logContext.bookingId = bookingForCleanup._id.toString();

    const isParticipantDisconnect = !!(bookingForCleanup.user && bookingForCleanup.user._id.toString() === userId);
    logContext.isParticipant = isParticipantDisconnect;
    logger.debug(`[${logContext.event}] Checking if user is participant: ${isParticipantDisconnect}.`, logContext);

    if (isParticipantDisconnect) {
      sessionForCleanup = await Session.findOne({ bookingId: bookingForCleanup._id }).session(sessionDb);
      logContext.sessionDocId = sessionForCleanup?._id?.toString();
      logger.debug(`[${logContext.event}] Session fetch result: ${sessionForCleanup ? `Found (ID: ${sessionForCleanup._id}, State: ${sessionForCleanup.state})` : 'Not Found'}.`, logContext);

      if (!sessionForCleanup) {
        logger.warn(`[${logContext.event}] Session document not found for participant disconnect. Aborting transaction.`, logContext);
        await sessionDb.abortTransaction();
        await sessionDb.endSession();
        return;
      }

      const isSessionActive = sessionForCleanup.state === 'active';
      logContext.isSessionActive = isSessionActive;
      logger.debug(`[${logContext.event}] Checking if session is active: ${isSessionActive}.`, logContext);

      if (sessionForCleanup.state === 'ended') {
        logger.info(`[${logContext.event}] Skipping finalization: Session already ended`, {
          ...logContext,
          sessionState: sessionForCleanup.state,
          segmentStatuses: sessionForCleanup.overtimeSegments?.map(s => s.status) || [],
          timestamp: new Date().toISOString(),
        });
        await sessionDb.commitTransaction();
        await sessionDb.endSession();
        return;
      }

      if (isSessionActive) {
        const hasPendingOvertime = sessionForCleanup.overtimeSegments?.some(s => ['requested', 'pending_confirmation'].includes(s.status));
        const hasUnfinalizedSegment = sessionForCleanup.overtimeSegments?.some(s => s.status === 'authorized' && !s.finalizedAt);
        logContext.hasPendingOvertime = hasPendingOvertime;
        logContext.hasUnfinalizedSegment = hasUnfinalizedSegment;
        logger.debug(`[${logContext.event}] Checking for pending overtime: ${hasPendingOvertime}, unfinalized authorized segment: ${hasUnfinalizedSegment}`, logContext);
      
        if (hasPendingOvertime) {
          logger.info(`[${logContext.event}] Skipping session state changes: Pending overtime request exists`, {
            ...logContext,
            segmentStatuses: sessionForCleanup.overtimeSegments?.map(s => s.status) || [],
            timestamp: new Date().toISOString(),
          });
          await sessionDb.commitTransaction();
          await sessionDb.endSession();
          return;
        }
      
        if (hasUnfinalizedSegment) {
          logger.info(`[${logContext.event}] Conditions met. Calling paymentService.finalizeOvertimePayment...`, logContext);
      
          finalizeResult = await paymentService.finalizeOvertimePayment(bookingForCleanup._id, now, sessionDb);
          finalCaptureStatus = finalizeResult?.status || 'error';
          logContext.finalizationResultStatus = finalCaptureStatus;
          logContext.finalizationError = finalizeResult?.error;
          logger.info(`[${logContext.event}] paymentService.finalizeOvertimePayment returned.`, { ...logContext, success: finalizeResult?.success, status: finalizeResult?.status, error: finalizeResult?.error });
      
          logger.debug(`[${logContext.event}] Transaction state after finalization`, {
            ...logContext,
            transactionState: sessionDb.inTransaction() ? 'active' : 'inactive'
          });
      
          if (finalizeResult?.sessionUpdatePayload && finalizeResult?.segmentId) {
            logger.debug(`[${logContext.event}] Applying Session update payload.`, { ...logContext, segmentId: finalizeResult.segmentId });
            const maxRetries = 3;
            let sessionUpdateResult;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                sessionUpdateResult = await Session.updateOne(
                  { _id: sessionForCleanup._id, 'overtimeSegments._id': finalizeResult.segmentId },
                  finalizeResult.sessionUpdatePayload,
                  { arrayFilters: [{ 'elem._id': finalizeResult.segmentId }], session: sessionDb }
                );
                break;
              } catch (error) {
                if (attempt === maxRetries || !error.message.includes('Write conflict')) {
                  logger.error(`[${logContext.event}] Session update failed after ${attempt} attempts`, {
                    ...logContext,
                    attempt,
                    error: error.message,
                    stack: error.stack,
                  });
                  throw error;
                }
                logger.warn(`[${logContext.event}] Write conflict on attempt ${attempt}, retrying`, { ...logContext, attempt });
                await new Promise(resolve => setTimeout(resolve, 100 * attempt));
              }
            }
            logger.debug(`[${logContext.event}] Session update result`, { ...logContext, matched: sessionUpdateResult.matchedCount, modified: sessionUpdateResult.modifiedCount });
            if (sessionUpdateResult.matchedCount === 0) logger.error(`[${logContext.event}] Failed to find Session segment for update!`, logContext);
          } else {
            logger.debug(`[${logContext.event}] No Session update payload from finalization.`, logContext);
          }
      
          if (finalizeResult?.paymentUpdatePayload && finalizeResult?.segmentId) {
            const segmentForPI = sessionForCleanup.overtimeSegments.find(s => s._id.equals(finalizeResult.segmentId));
            if (segmentForPI?.paymentIntentId) {
              logger.debug(`[${logContext.event}] Applying Payment update payload.`, { ...logContext, paymentIntentId: segmentForPI.paymentIntentId });
              const paymentUpdateResult = await Payment.updateOne(
                { 'stripe.paymentIntentId': segmentForPI.paymentIntentId },
                finalizeResult.paymentUpdatePayload,
                { session: sessionDb }
              );
              logger.debug(`[${logContext.event}] Payment update result`, { ...logContext, matched: paymentUpdateResult.matchedCount, modified: paymentUpdateResult.modifiedCount });
              if (paymentUpdateResult.matchedCount === 0) logger.error(`[${logContext.event}] Failed to find Payment record for update!`, logContext);
            } else {
              logger.error(`[${logContext.event}] Cannot update Payment record: Missing paymentIntentId on finalized segment.`, logContext);
            }
          } else {
            logger.debug(`[${logContext.event}] No Payment update payload from finalization.`, logContext);
          }
      
          sessionForCleanup.state = 'ended';
          sessionForCleanup.endedAt = now;
          if (!sessionForCleanup.actualEndTime || new Date(sessionForCleanup.actualEndTime) < now) {
            sessionForCleanup.actualEndTime = now;
          }
          const participant = sessionForCleanup.participants.find(p => p.userId.equals(userId));
          if (participant) participant.leftAt = now;
          const coachParticipant = sessionForCleanup.participants.find(p => p.userId.equals(bookingForCleanup.coach._id));
          if (coachParticipant && !coachParticipant.leftAt) coachParticipant.leftAt = now;
      
          if (!finalizeResult?.success) {
            logger.error(`[${logContext.event}] Overtime finalization FAILED during disconnect. Setting termination reason.`, { ...logContext });
            sessionForCleanup.terminationReason = `Participant left; Overtime processing error: ${finalizeResult?.error || 'Unknown Error'}`;
          } else {
            logger.info(`[${logContext.event}] Overtime finalization processed successfully. Setting termination reason.`, { ...logContext });
            if (!sessionForCleanup.terminationReason) {
              sessionForCleanup.terminationReason = `Participant left session`;
            }
          }
          sessionForCleanup.sessionCompleted = false;
      
          await sessionForCleanup.save({ session: sessionDb });
          sessionEndedByFinalization = true;
          logContext.finalSessionState = sessionForCleanup.state;
          logContext.terminationReason = sessionForCleanup.terminationReason;
          logger.info(`[${logContext.event}] Session state updated to ended within transaction.`, logContext);
      
          logger.debug(`[${logContext.event}] Attempting to commit transaction...`, logContext);
          await sessionDb.commitTransaction();
          logger.info(`[${logContext.event}] Transaction committed successfully.`, logContext);
        } else {
          logger.info(`[${logContext.event}] No authorized segment found. Aborting transaction.`, logContext);
          await sessionDb.abortTransaction();
        }
      } else {
        logger.info(`[${logContext.event}] Session not active. Aborting transaction.`, logContext);
        await sessionDb.abortTransaction();
      }
    } else {
      logger.info(`[${logContext.event}] Disconnecting user is not the participant. Aborting transaction.`, logContext);
      await sessionDb.abortTransaction();
    }
  } catch (error) {
    finalizationError = error.message;
    logger.error(`[${logContext.event}] Error during finalization transaction`, { ...logContext, bookingId: bookingForCleanup?._id?.toString(), errorMessage: error.message, stack: error.stack });
    if (sessionDb.inTransaction()) {
      logger.debug(`[${logContext.event}] Aborting transaction due to error...`, logContext);
      await sessionDb.abortTransaction().catch(abortErr => logger.error(`[${logContext.event}] Error aborting transaction after error`, { abortErr }));
    }
  } finally {
    if (sessionDb && sessionDb.endSession) {
      logger.debug(`[${logContext.event}] Ending DB session in finally block.`, logContext);
      await sessionDb.endSession().catch(endErr => logger.error(`[${logContext.event}] Error ending DB session in finally block`, { endErr }));
    }
  }

  logger.debug(`[${logContext.event}] Starting post-finalization cleanup/broadcast checks.`, { ...logContext, sessionEndedByFinalization });
  try {
    let sessionToUseForCleanup = null;
    if (sessionEndedByFinalization && bookingForCleanup?._id) {
      try {
        sessionToUseForCleanup = await Session.findById(sessionForCleanup?._id);
        logger.debug(`[${logContext.event}] Refetched session for cleanup broadcasting`, { ...logContext, sessionState: sessionToUseForCleanup?.state });
      } catch (fetchError) {
        logger.error(`[${logContext.event}] Error refetching session after finalization`, { ...logContext, error: fetchError.message });
      }
    } else if (isFinalizationAttempted && sessionForCleanup) {
      logger.debug(`[${logContext.event}] Using session object from transaction attempt for cleanup checks`, { ...logContext, sessionState: sessionForCleanup?.state });
      sessionToUseForCleanup = sessionForCleanup;
    }

    const videoIO = ioInstance?.of('/video');

    if (sessionEndedByFinalization && videoIO && bookingForCleanup && sessionToUseForCleanup) {
      const roomName = `session:${sessionLinkSessionId}`;
      const eventPayload = {
        endedBy: userId,
        timestamp: now.toISOString(),
        isCompleted: sessionToUseForCleanup.sessionCompleted,
        reason: sessionToUseForCleanup.terminationReason || 'Participant left session',
        captureStatus: finalCaptureStatus
      };
      logger.info(`[${logContext.event}] Emitting session-ended event...`, { ...logContext, payload: eventPayload });
      videoIO.to(roomName).emit('session-ended', eventPayload);

      const metadataBase = { 
          bookingId: bookingForCleanup._id, 
          sessionId: sessionToUseForCleanup._id,
      };

      if (finalizeResult) {
        const { capturedAmount, currency, status: resultCaptureStatus, error: resultCaptureError, paymentIntentId: piFromFinalize } = finalizeResult;
        try {
          if (finalizeResult.success) {
            if (resultCaptureStatus === 'captured' || resultCaptureStatus === 'partially_captured') {
              await UnifiedNotificationService.sendNotification({ ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_CAPTURED, recipient: bookingForCleanup.user._id, metadata: { ...metadataBase, amount: capturedAmount, currency } }, bookingForCleanup, getSocketService());
              logger.info(`[${logContext.event}] Sent OVERTIME_PAYMENT_CAPTURED notification to user ${bookingForCleanup.user._id}`, { ...logContext, capturedAmount, currency });
              await UnifiedNotificationService.sendNotification({ ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_COLLECTED, recipient: bookingForCleanup.coach._id, metadata: { ...metadataBase, amount: capturedAmount, currency, clientName: `${bookingForCleanup.user.firstName} ${bookingForCleanup.user.lastName}` } }, bookingForCleanup, getSocketService());
              logger.info(`[${logContext.event}] Sent OVERTIME_PAYMENT_COLLECTED notification to coach ${bookingForCleanup.coach._id}`, { ...logContext, capturedAmount, currency });
            } else if (resultCaptureStatus === 'released') {
              await UnifiedNotificationService.sendNotification({ ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_RELEASED, recipient: bookingForCleanup.user._id, metadata: { ...metadataBase } }, bookingForCleanup, getSocketService());
              logger.info(`[${logContext.event}] Sent OVERTIME_PAYMENT_RELEASED notification to user ${bookingForCleanup.user._id}`, logContext);
            }
          } else if (resultCaptureStatus === 'capture_failed') {
            logger.error(`[${logContext.event}] Capture failed post-authorization. Sending failure notification.`, { ...logContext, finalizeResult });
            await UnifiedNotificationService.sendNotification({ type: NotificationTypes.OVERTIME_PAYMENT_CAPTURE_FAILED, recipient: bookingForCleanup.coach._id, metadata: { ...metadataBase, paymentIntentId: piFromFinalize, error: resultCaptureError } }, bookingForCleanup, getSocketService());
          }
        } catch (notificationError) {
          logger.error(`[${logContext.event}] Error sending post-finalization notification`, { ...logContext, notificationError: notificationError.message });
        }
      } else {
        logger.warn(`[${logContext.event}] finalizeResult was null, cannot send finalization notifications based on it. Final status was: ${finalCaptureStatus}`, logContext);
      }

      try {
        const sessionEndedMetadataForCoach = {
            ...metadataBase,
            reason: sessionToUseForCleanup.terminationReason,
            finalCaptureStatus
        };
        if (finalizeResult && finalizeResult.success && (finalizeResult.status === 'captured' || finalizeResult.status === 'partially_captured')) {
            sessionEndedMetadataForCoach.amount = finalizeResult.capturedAmount;
            sessionEndedMetadataForCoach.currency = finalizeResult.currency;
        }
        await UnifiedNotificationService.sendNotification({ type: NotificationTypes.SESSION_ENDED, recipient: bookingForCleanup.coach._id, content: { title: "Session Ended", message: `Participant ${bookingForCleanup.user.firstName} left the session.` }, metadata: sessionEndedMetadataForCoach }, bookingForCleanup, getSocketService());
        logger.info(`[${logContext.event}] Sent SESSION_ENDED notification to coach (participant left).`, {...logContext, metadataSent: sessionEndedMetadataForCoach});

        const sessionEndedMetadataForUser = { ...sessionEndedMetadataForCoach };
        await UnifiedNotificationService.sendNotification({ type: NotificationTypes.SESSION_ENDED, recipient: bookingForCleanup.user._id, content: { title: "Session Ended", message: `Your session with ${bookingForCleanup.coach.firstName} has ended.` }, metadata: sessionEndedMetadataForUser }, bookingForCleanup, getSocketService());
        logger.info(`[${logContext.event}] Sent SESSION_ENDED notification to user (participant left).`, {...logContext, metadataSent: sessionEndedMetadataForUser});

      } catch (notificationError) {
        logger.error(`[${logContext.event}] Error sending generic SESSION_ENDED notification`, { ...logContext, notificationError: notificationError.message });
      }
    }

    if (!sessionEndedByFinalization && sessionToUseForCleanup && userId && sessionToUseForCleanup.state !== 'ended') {
      logger.debug(`[${logContext.event}] Session not ended by finalization. Performing standard leftAt update.`, { ...logContext, sessionState: sessionToUseForCleanup.state });
      const participantIndex = sessionToUseForCleanup.participants.findIndex((p) => p.userId.toString() === userId);
      if (participantIndex !== -1 && !sessionToUseForCleanup.participants[participantIndex].leftAt) {
        try {
          const updateResult = await Session.updateOne({ _id: sessionToUseForCleanup._id, 'participants.userId': userId }, { $set: { 'participants.$.leftAt': now } });
          if (updateResult.modifiedCount > 0) {
            logger.info(`[${logContext.event}] Updated participant leftAt time (standard disconnect).`, logContext);
          } else {
            logger.warn(`[${logContext.event}] Failed to update participant leftAt time (standard disconnect), user already marked?`, { ...logContext, updateResult });
          }
        } catch (saveErr) {
          logger.error(`[${logContext.event}] Error updating participant leftAt time during standard disconnect`, { ...logContext, error: saveErr.message });
        }
      }
    }

    if (sessionToUseForCleanup && userId) {
      logger.debug(`[${logContext.event}] Checking for raised hand cleanup for user ${userId}.`, { ...logContext, raisedHandsCount: sessionToUseForCleanup.raisedHands?.length });
      const handIndex = (sessionToUseForCleanup.raisedHands || []).findIndex(hand => hand.userId.toString() === userId);
      if (handIndex !== -1) {
        try {
          const updateResult = await Session.updateOne(
            { _id: sessionToUseForCleanup._id },
            { $pull: { raisedHands: { userId: new mongoose.Types.ObjectId(userId) } } }
          );
          if (updateResult.modifiedCount > 0) {
            const updatedSessionForHands = await Session.findById(sessionToUseForCleanup._id).select('raisedHands');
            const raisedHandsPayload = (updatedSessionForHands?.raisedHands || []).map(hand => ({
              userId: hand.userId.toString(),
              peerId: hand.peerId,
              raisedAt: hand.raisedAt
            }));
            if (videoIO) {
              logger.info(`[${logContext.event}] Emitting raised-hands-update after disconnect cleanup.`, { ...logContext, raisedHandsCount: raisedHandsPayload.length });
              videoIO.to(`session:${sessionLinkSessionId}`).emit('raised-hands-update', raisedHandsPayload);
            }
            logger.info(`[${logContext.event}] Cleaned up raised hand on disconnect.`, { ...logContext });
          } else {
            logger.warn(`[${logContext.event}] Failed to remove raised hand, maybe already removed?`, { ...logContext, updateResult });
          }
        } catch (pullError) {
          logger.error(`[${logContext.event}] Error removing raised hand on disconnect`, { ...logContext, error: pullError.message });
        }
      }
    }

    if (!sessionEndedByFinalization && peerId && videoIO) {
      const roomName = `session:${sessionLinkSessionId}`;
      logger.info(`[${logContext.event}] Emitting standard participant-left event...`, { ...logContext, roomName, peerId });
      videoIO.to(roomName).emit(SOCKET_EVENTS.PARTICIPANT_LEFT, {
        peerId,
        timestamp: now.toISOString(),
      });
    } else {
      logger.debug(`[${logContext.event}] Skipping standard participant-left event emission.`, { ...logContext, sessionEndedByFinalization, hasPeerId: !!peerId, hasVideoIO: !!videoIO });
    }

  } catch (cleanupError) {
    logger.error(`[${logContext.event}] Error during post-finalization cleanup/broadcast`, { ...logContext, error: cleanupError.message, stack: cleanupError.stack });
  }

  try {
    const conversationRooms = Array.from(socket.rooms).filter(room => room.startsWith('conversation:'));
    logger.info(`[${logContext.event}] Cleaning up conversation rooms...`, { ...logContext, rooms: conversationRooms });
    conversationRooms.forEach(room => socket.leave(room));
  } catch (roomError) {
    logger.error(`[${logContext.event}] Error during final room cleanup`, { ...logContext, error: roomError.message });
  }

  logger.info(`[${logContext.event}] Handler finished.`, logContext);
});
        

      } catch (error) {
        logger.error('[VideoSocket] Join session error', {
          sessionId,
          error: error.message,
          stack: error.stack,
          socketId: socket.id,
        });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to join session' });
      }
    });
  });

  emitter.on('session:started', ({ sessionId }) => {
    const videoIO = io.of('/video');
    videoIO.to(`session:${sessionId}`).emit('session-started');
    logger.info('[Socket] Emitted session-started event from emitter', { sessionId });
  });

  emitter.on('resource:uploaded', ({ sessionId, resource }) => {
    videoIO.to(`session:${sessionId}`).emit('resource-uploaded', resource);
    logger.info('[VideoSocket] Resource uploaded event emitted', { sessionId, resourceId: resource._id });
  });

  emitter.on('resource:deleted', ({ sessionId, resourceId }) => {
    videoIO.to(`session:${sessionId}`).emit('resource-deleted', { resourceId });
    logger.info('[VideoSocket] Resource deleted event emitted', { sessionId, resourceId });
  });

  io.use((socket, next) => {
    const { token, userId } = socket.handshake.auth;
    if (!token || !userId) {
      logger.error('[Socket] Authentication failed: Missing token or userId', {
        socketId: socket.id,
        auth: socket.handshake.auth,
      });
      return next(new Error('Authentication error: Missing token or userId'));
    }
    // Add token verification logic here if using JWT (optional)
    socket.userId = userId; // Set userId immediately
    logger.info('[Socket] Authentication successful', { socketId: socket.id, userId });
    next();
  });

  io.use((socket, next) => {
    socket.onAny((event, data) => {
     /*console.log('[Socket] Received event payload', {
        event,
        socketId: socket.id,
        userId: socket.handshake.auth?.userId,
        data,
        timestamp: new Date().toISOString(),
      });*/
      try {
        if (data && typeof data === 'object') {
          JSON.stringify(data); // Ensure payload is serializable
        }
      } catch (error) {
        logger.error('[Socket] Invalid payload received', {
          event,
          socketId: socket.id,
          userId: socket.handshake.auth?.userId,
          error: error.message,
          data,
          timestamp: new Date().toISOString(),
        });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid payload', details: error.message });
      }
    });
    next();
  });

io.on(SOCKET_EVENTS.CONNECTION, async (socket) => {
    const userId = socket.userId; // This is reliably set by your io.use() middleware
    const socketService = getSocketService();
    
    logger.info(`[Socket Connected] New client authenticated. Socket ID: ${socket.id}, User ID: ${userId}`);
    if (userId) {
        socket.join(userId);
        logger.info(`[SocketConfig] Socket ${socket.id} joined user-specific room: '${userId}'`);

        try {
            const user = await User.findById(userId).select('role').lean();
            if (user && user.role === 'admin') {
                socket.join('admin_room');
                logger.info(`[Socket.IO] Admin user ${userId} also joined shared 'admin_room'`);
            }
        } catch (error) {
            logger.error(`[Socket.IO] Failed to check role for user ${userId}`, { error: error.message });
        }
        
        socketService.addUser(userId, socket.id);
    }
    socket.onAny((event, ...args) => {
      const safeArgs = process.env.NODE_ENV === 'production' ? `[${args.length} args]` : JSON.stringify(args);
  
    });

    socket.onAny((event, data) => {
      try {
        socket.data = socket.data || {};
        socket.data.lastPacket = data; // Store raw packet for error logging
        if (data && typeof data === 'object') {
          JSON.stringify(data); // Validate serializability
        }
      
      } catch (error) {
        logger.warn('[Socket] Malformed payload detected', {
          event,
          socketId: socket.id,
          userId: socket.userId || socket.handshake.auth?.userId,
          error: error.message,
          data,
          timestamp: new Date().toISOString(),
        });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid payload', details: error.message });
        return; // Skip processing
      }
    });

    socket.on('error', (error) => {
      if (error.message === 'invalid payload') {
        logger.warn('[Socket] Invalid payload received, ignoring', {
          socketId: socket.id,
          userId: socket.userId || socket.handshake.auth?.userId,
          rawPacket: socket.data?.lastPacket || 'unknown',
          timestamp: new Date().toISOString(),
        });
        return; // Prevent forced disconnect
      }
      logger.error('[Socket] Socket error', {
        socketId: socket.id,
        userId: socket.userId || socket.handshake.auth?.userId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    });

    io.use((socket, next) => {
      socket.onAny((event, ...args) => {
      
      });
      next();
    });

  socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      const logContext = {
        event: 'default_disconnect_v1',
        reason,
        socketId: socket.id,
        userId: socket.userId, // userId attached by middleware/login
        timestamp: new Date().toISOString()
      };

      const service = getSocketService();
      if (service) {
        service.removeUser(socket.userId, socket.id);
      }
      
      logger.info(`[${logContext.event}] Disconnect detected on DEFAULT namespace.`, logContext);
      // The rest of your original logic can remain
      for (const [userId, sock] of activeConnections.entries()) {
        if (sock === socket) {
          activeConnections.delete(userId);
          connectionMonitor.removeConnection(userId);
          break;
        }
      }
    });

    socket.on(SOCKET_EVENTS.ERROR, (error) => {
      logger.error('[Socket] Client error:', {
        socketId: socket.id,
        userId: socket.userId || socket.handshake.auth?.userId || 'unknown',
        error: {
          message: error.message || 'No error message provided',
          stack: error.stack || 'No stack trace available',
          code: error.code || 'No error code',
          name: error.name || 'UnknownError',
          details: error.details || 'No additional details'
        },
        eventContext: {
          eventName: SOCKET_EVENTS.ERROR,
          previousEvents: socket._events ? Object.keys(socket._events) : 'No event listeners registered',
          rooms: Array.from(socket.rooms || []),
          namespace: socket.nsp?.name || 'default'
        },
        connection: {
          transport: socket.conn?.transport?.name || 'unknown',
          connected: socket.connected,
          disconnected: socket.disconnected,
          handshake: {
            query: socket.handshake?.query || {},
            headers: socket.handshake?.headers || {},
            auth: socket.handshake?.auth || {},
            time: socket.handshake?.time || 'unknown',
            address: socket.handshake?.address || 'unknown'
          },
          pingTimeout: socket.conn?.pingTimeout || 'unknown',
          lastActivity: connectionMonitor.connections.get(socket.userId)?.lastActivity?.toISOString() || 'unknown'
        },
        session: {
          sessionId: socket.handshake?.query?.sessionId || 'none',
          isCoach: socket.isCoach || false,
          peerId: socket.peerId || 'none',
          displayName: socket.displayName || 'none'
        },
        environment: {
          nodeEnv: process.env.NODE_ENV || 'unknown',
          socketPath: socket.nsp?.path || '/socket.io',
          allowedOrigins: process.env.ALLOWED_ORIGINS || 'unknown'
        },
        timestamp: new Date().toISOString()
      });
    });

    logger.info(`[Socket Connect:${socket.id}] Attaching BOOKING/NOTIFICATION event listeners...`);

    // Booking-specific events
    socket.on(SOCKET_EVENTS.BOOKING_UPDATE, (data) => {
      console.log('[Socket] Booking update received:', {
        socketId: socket.id,
        bookingId: data?.bookingId,
        type: data?.type,
        timestamp: new Date().toISOString()
      });
      
      io.emit(SOCKET_EVENTS.BOOKING_UPDATE, {
        ...data,
        timestamp: new Date().toISOString()
      });
    });

    socket.on(SOCKET_EVENTS.NOTIFICATION_DELIVERED, async (data) => {
      logger.info('[Socket] Notification delivery confirmation:', {
        notificationId: data.notificationId,
        recipientId: data.recipientId,
        timestamp: data.timestamp
      });

      console.log('[Socket] Checking Notification model availability', {
        notificationId: data.notificationId,
        isNotificationDefined: typeof Notification !== 'undefined',
        timestamp: new Date().toISOString()
      });
      if (typeof Notification === 'undefined') {
        logger.error('[Socket] Notification model is undefined before update', {
          notificationId: data.notificationId,
          timestamp: new Date().toISOString()
        });
      }

      try {
        await Notification.findByIdAndUpdate(data.notificationId, {
          $set: {
            'delivery.statuses.$[status].status': 'delivered',
            'delivery.statuses.$[status].timestamp': new Date(data.timestamp)
          }
        }, {
          arrayFilters: [{ 'status.channel': 'in_app' }]
        });
      } catch (error) {
        logger.error('[Socket] Error updating notification delivery status:', {
          error: error.message,
          notificationId: data.notificationId
        });
      }
    });

    socket.on('join_payment', async (data) => {
      const { roomId } = data;
      
      logger.info('[Socket] Payment room join request:', {
        socketId: socket.id,
        roomId,
        timestamp: new Date().toISOString()
      });
    
      try {
        await socket.join(roomId);
        
        socket.emit('room_joined', {
          success: true,
          roomId,
          timestamp: new Date().toISOString()
        });
    
        logger.info('[Socket] Payment room joined:', {
          socketId: socket.id,
          roomId,
          timestamp: new Date().toISOString()
        });
    
      } catch (error) {
        logger.error('[Socket] Payment room join failed:', {
          socketId: socket.id,
          roomId,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        socket.emit('room_joined', {
          success: false,
          error: error.message,
          roomId,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    socket.on('room_keepalive', (data) => {
      const { roomId } = data;
      socket.emit('room_keepalive_ack', { roomId });
    });

    socket.on(SOCKET_EVENTS.NOTIFICATION_READ, async (data) => {
      logger.info('[Socket] Notification read:', {
        notificationId: data.notificationId,
        userId: data.userId
      });

      try {
        const notification = await Notification.findByIdAndUpdate(
          data.notificationId,
          {
            $set: {
              isRead: true,
              readAt: new Date()
            }
          },
          { new: true }
        );

        if (notification) {
          // Notify other connected clients about the status change
          socket.to(notification.recipient.toString()).emit(
            SOCKET_EVENTS.NOTIFICATION_STATUS_CHANGED,
            {
              notificationId: notification._id,
              status: 'read',
              timestamp: new Date().toISOString()
            }
          );
        }
      } catch (error) {
        logger.error('[Socket] Error marking notification as read:', {
          error: error.message,
          notificationId: data.notificationId
        });
      }
    });

    socket.on(SOCKET_EVENTS.NOTIFICATION_ACTION, async (data) => {
      logger.info('[Socket] Notification action received:', {
        notificationId: data.notificationId,
        action: data.action,
        userId: data.userId
      });

      try {
        // Import required models at the top of the file
        const { Notification, Booking, Session } = require('./models');
        const { NotificationTypes, NotificationCategories, NotificationPriorities } = require('./utils/notificationHelpers');
        const { handleOvertimeResponse } = require('./controllers/sessionController');
        const { continueSession, terminateSessionForPayment } = require('./controllers/paymentController');

        const notification = await Notification.findById(data.notificationId)
          .populate('metadata.bookingId')
          .populate({
            path: 'metadata.bookingId',
            populate: [
              { path: 'coach', select: 'firstName lastName email' },
              { path: 'user', select: 'firstName lastName email' },
              { path: 'sessionType', select: 'name duration price' }
            ]
          });

        if (!notification) {
          throw new Error('Notification not found');
        }

        if (notification.status === 'actioned') {
          logger.warn('[Socket] Notification already actioned', { notificationId: data.notificationId });
          throw new Error('Notification already actioned');
        }

        const booking = notification.metadata.bookingId;
        if (!booking) {
          throw new Error('Booking not found');
        }

        // Get all affected users for this action
        const affectedUsers = [
          booking.coach._id.toString(),
          booking.user._id.toString()
        ];

        let status;
        let counterNotification;
        let updatedSession;

        // Process the action
        switch (data.action) {
          case 'approve':
            status = 'confirmed';
            counterNotification = {
              type: NotificationTypes.BOOKING_CONFIRMED,
              recipient: booking.user._id,
              category: NotificationCategories.BOOKING,
              priority: NotificationPriorities.MEDIUM,
            };
            break;

          case 'decline':
            status = 'declined';
            counterNotification = {
              type: NotificationTypes.BOOKING_DECLINED,
              recipient: booking.user._id,
              category: NotificationCategories.BOOKING,
              priority: NotificationPriorities.MEDIUM,
            };
            break;

          case 'suggest':
            if (data.suggestedTime) {
              status = 'suggestion_pending';
              counterNotification = {
                type: NotificationTypes.BOOKING_RESCHEDULED,
                recipient: booking.user._id,
                category: NotificationCategories.BOOKING,
                priority: NotificationPriorities.MEDIUM,
                metadata: {
                  suggestedTime: data.suggestedTime
                }
              };
            }
            break;

          case 'end_session':
          case 'free_overtime':
          case 'paid_overtime':
          case 'confirm_payment':
          case 'decline_overtime':
            if (!notification.metadata.sessionId) {
              logger.warn('[Socket] Missing sessionId for overtime action', { notificationId: data.notificationId, action: data.action });
              throw new Error('Invalid session data');
            }
            // Map action to choice expected by handleOvertimeResponse
            const choice = {
              end_session: 'end',
              free_overtime: 'free',
              paid_overtime: 'paid',
              confirm_payment: 'confirm',
              decline_overtime: 'decline'
            }[data.action];
            // Simulate HTTP request to handleOvertimeResponse
            const overtimeResponse = await new Promise((resolve, reject) => {
              const req = {
                params: { sessionId: booking.sessionLink.sessionId },
                body: { choice },
                user: { _id: data.userId },
                io: io
              };
              const res = {
                json: data => resolve(data),
                status: code => ({
                  json: data => reject(new Error(`${code}: ${data.message}`))
                })
              };
              handleOvertimeResponse(req, res);
            });
            status = overtimeResponse.choice;
            updatedSession = await Session.findOne({ bookingId: booking._id });
            // Create counter-notifications for specific actions
            if (data.action === 'decline_overtime') {
              counterNotification = {
                type: NotificationTypes.OVERTIME_DECLINED,
                recipient: booking.coach._id,
                category: NotificationCategories.SESSION,
                priority: NotificationPriorities.HIGH,
                metadata: {
                  bookingId: booking._id,
                  sessionId: notification.metadata.sessionId
                }
              };
            } else if (data.action === 'confirm_payment' && overtimeResponse.success) {
              counterNotification = {
                type: NotificationTypes.PAYMENT_RECEIVED,
                recipient: booking.coach._id,
                category: NotificationCategories.PAYMENT,
                priority: NotificationPriorities.MEDIUM,
                metadata: {
                  bookingId: booking._id,
                  sessionId: notification.metadata.sessionId,
                  amount: booking.overtime.paidOvertimeDuration * (booking.coach.settings?.professionalProfile?.hourlyRate || 100) * (booking.overtime.overtimeRate / 100) / 60,
                  currency: booking.price.currency || 'CHF'
                }
              };
            }
            break;

          case 'continue_session':
          case 'terminate_session':
            if (!notification.metadata.sessionId) {
              logger.warn('[Socket] Missing sessionId for payment failure action', { notificationId: data.notificationId, action: data.action });
              throw new Error('Invalid session data');
            }
            // Simulate HTTP request to continueSession or terminateSessionForPayment
            const handler = data.action === 'continue_session' ? continueSession : terminateSessionForPayment;
            const paymentResponse = await new Promise((resolve, reject) => {
              const req = {
                params: { sessionId: booking.sessionLink.sessionId },
                user: { _id: data.userId },
                io: io
              };
              const res = {
                json: data => resolve(data),
                status: code => ({
                  json: data => reject(new Error(`${code}: ${data.message}`))
                })
              };
              handler(req, res);
            });
            status = data.action === 'continue_session' ? 'continued' : 'terminated';
            updatedSession = await Session.findOne({ bookingId: booking._id });
            // Create counter-notification
            counterNotification = {
              type: data.action === 'continue_session' ? NotificationTypes.SESSION_CONTINUED : NotificationTypes.SESSION_TERMINATED,
              recipient: booking.user._id,
              category: NotificationCategories.SESSION,
              priority: NotificationPriorities.HIGH,
              metadata: {
                bookingId: booking._id,
                sessionId: notification.metadata.sessionId
              }
            };
            break;

          default:
            logger.warn('[Socket] Unsupported action', { action: data.action, notificationId: data.notificationId });
            throw new Error(`Unsupported action: ${data.action}`);
        }

        // Update booking (for overtime/payment actions, update metadata only)
        const bookingUpdate = {
          updatedAt: new Date(),
          'metadata.lastAction': {
            type: data.action,
            by: data.userId,
            at: new Date()
          }
        };
        if (['approve', 'decline', 'suggest'].includes(data.action)) {
          bookingUpdate.status = status;
        }
        const updatedBooking = await Booking.findByIdAndUpdate(
          booking._id,
          { $set: bookingUpdate },
          { new: true }
        ).populate('coach user sessionType');

        // Create counter notification if needed
        if (counterNotification) {
          const newNotification = await UnifiedNotificationService.createNotification({
            ...counterNotification,
            metadata: {
              bookingId: booking._id,
              actionedBy: data.userId,
              originalNotificationId: notification._id,
              ...counterNotification.metadata
            }
          });

          // Emit counter notification
          socket.to(counterNotification.recipient.toString())
            .emit(SOCKET_EVENTS.NOTIFICATION, {
              ...newNotification.toObject(),
              timestamp: new Date().toISOString()
            });
          logger.info('[Socket] Emitted counter notification', {
            notificationId: newNotification._id,
            type: counterNotification.type,
            recipient: counterNotification.recipient.toString()
          });
        }

        // Mark original notification as actioned
        await Notification.findByIdAndUpdate(
          data.notificationId,
          {
            $set: {
              status: 'actioned',
              actionedAt: new Date(),
              'metadata.action': data.action,
              'metadata.actionResult': status
            }
          }
        );
        logger.info('[Socket] Marked notification as actioned', {
          notificationId: data.notificationId,
          action: data.action,
          status
        });

        // Emit session update to all affected users (instead of BOOKING_UPDATE for session actions)
        if (['end_session', 'free_overtime', 'paid_overtime', 'confirm_payment', 'decline_overtime', 'continue_session', 'terminate_session'].includes(data.action)) {
          affectedUsers.forEach(userId => {
            io.to(userId).emit('session-update', {
              bookingId: booking._id.toString(),
              sessionId: notification.metadata.sessionId,
              status,
              action: data.action,
              timestamp: new Date().toISOString(),
              updatedSession
            });
          });
          logger.info('[Socket] Emitted session-update to affected users', {
            bookingId: booking._id.toString(),
            sessionId: notification.metadata.sessionId,
            action: data.action,
            affectedUsers
          });
        } else {
          // Emit booking update for booking-related actions
          affectedUsers.forEach(userId => {
            io.to(userId).emit(SOCKET_EVENTS.BOOKING_UPDATE, {
              bookingId: booking._id.toString(),
              status,
              action: data.action,
              timestamp: new Date().toISOString(),
              updatedBooking
            });
          });
          logger.info('[Socket] Emitted booking-update to affected users', {
            bookingId: booking._id.toString(),
            action: data.action,
            affectedUsers
          });
        }

        // Emit action completion to the actor
        socket.emit(SOCKET_EVENTS.NOTIFICATION_ACTION_COMPLETE, {
          notificationId: notification._id.toString(),
          action: data.action,
          result: status,
          timestamp: new Date().toISOString()
        });
        logger.info('[Socket] Emitted notification action completion', {
          notificationId: notification._id.toString(),
          action: data.action,
          result: status
        });

      } catch (error) {
        logger.error('[Socket] Error processing notification action:', {
          error: error.message,
          stack: error.stack,
          data
        });

        socket.emit(SOCKET_EVENTS.ERROR, {
          type: 'notification_action_failed',
          message: error.message,
          notificationId: data.notificationId,
          action: data.action
        });
      }
    });

    socket.on(SOCKET_EVENTS.NOTIFICATION, async (data) => {
      logger.info('[Socket] Received notification event:', {
        type: data.type,
        recipientId: data.recipientId,
        timestamp: new Date().toISOString()
      });

      try {
        await UnifiedNotificationService.processSocketNotification(data, socket);
      } catch (error) {
        logger.error('[Socket] Error processing notification:', {
          error: error.message,
          data
        });
      }
    });

    const isMessageServiceReady = typeof messageService?.createMessage === 'function';
    logger.info(`[Socket Connect:${socket.id}] Attaching MESSAGING event listeners (MessageService Ready: ${isMessageServiceReady})...`);
    if (!isMessageServiceReady) {
       logger.error(`[Socket Connect:${socket.id}] CRITICAL: messageService is not ready when attaching listeners!`);
       // Optionally prevent attaching listeners if service isn't ready?
    }

    socket.on(SOCKET_EVENTS.SEND_MESSAGE, async (data) => {
      logger.debug('[Socket] Received SEND_MESSAGE', {
        socketId: socket.id,
        payload: {
          recipientUserId: data.recipientUserId,
          senderId: data.senderId,
          contentType: data.contentType,
          hasAttachment: !!data.attachment,
          tempId: data.tempId,
        },
        timestamp: new Date().toISOString(),
      });
    
      const { recipientUserId, senderId, content, contentType = 'text', attachment, tempId } = data;
    
      if (!recipientUserId || !senderId || (!content && !attachment)) {
        logger.error('[Socket] Invalid SEND_MESSAGE payload', {
          socketId: socket.id,
          received: data,
          expected: { recipientUserId: 'string', senderId: 'string', contentOrAttachment: 'required' },
          timestamp: new Date().toISOString(),
        });
        socket.emit(SOCKET_EVENTS.ERROR, { type: 'message_failed', message: 'Missing required message data' });
        return;
      }
    
      try {
        logger.debug('[Socket] Creating message via SEND_MESSAGE', { recipientUserId, senderId, tempId });
        const conversation = await messageService.createOrGetConversation(senderId, recipientUserId);
        const { populatedMessage } = await messageService.createMessage(
          senderId,
          conversation._id,
          content,
          contentType,
          attachment
        );
    
        logger.info('[Socket] Message created successfully via SEND_MESSAGE', {
          messageId: populatedMessage._id,
          conversationId: conversation._id,
          senderId,
          recipientUserId,
          socketId: socket.id,
          tempId,
          timestamp: new Date().toISOString(),
        });
    
        // Emit NEW_MESSAGE to sender and recipient user rooms
        io.to(senderId).emit(SOCKET_EVENTS.NEW_MESSAGE, { messageObject: populatedMessage });
        io.to(recipientUserId).emit(SOCKET_EVENTS.NEW_MESSAGE, { messageObject: populatedMessage });
    
        // Emit confirmation to sender
        io.to(senderId).emit('messageSentConfirmation', { messageObject: populatedMessage, tempId });
    
        logger.debug('[Socket] Emitted NEW_MESSAGE and confirmation to user rooms', {
          messageId: populatedMessage._id,
          senderId,
          recipientUserId,
          tempId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('[Socket] Error processing SEND_MESSAGE', {
          socketId: socket.id,
          recipientUserId,
          senderId,
          tempId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
        });
        socket.emit(SOCKET_EVENTS.ERROR, { type: 'message_failed', message: error.message });
      }
    });
    

    socket.on('join', (data) => {
      const { room } = data;
      if (!room) {
        logger.error('[Socket] Join attempt without room', { socketId: socket.id });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Room is required' });
        return;
      }
      socket.join(room);
      logger.info('[Socket] User joined room', { room, socketId: socket.id });
      socket.emit('join_confirmed', { success: true, room, timestamp: new Date().toISOString() });
    });

    socket.on('disconnect', (reason) => {
      logger.info('[Socket] Client disconnected', {
        socketId: socket.id,
        userId: socket.userId || socket.handshake.auth.userId || 'unknown',
        reason,
        rooms: Array.from(socket.rooms),
        timestamp: new Date().toISOString(),
      });
    });
    
    socket.on(SOCKET_EVENTS.START_TYPING, (data) => {
      const { recipientUserId, senderUserId } = data;
      if (!recipientUserId || !senderUserId) {
        logger.warn('[socketConfig] START_TYPING event missing required fields', {
          socketId: socket.id,
          data,
          timestamp: new Date().toISOString(),
        });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Recipient and Sender IDs required' });
        return;
      }
    
      logger.debug('[socketConfig] Broadcasting START_TYPING', {
        senderUserId,
        recipientUserId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    
      io.to(recipientUserId).emit(SOCKET_EVENTS.START_TYPING, {
        senderUserId,
        recipientUserId,
      });
    });

    socket.on(SOCKET_EVENTS.STOP_TYPING, (data) => {
      const { recipientUserId, senderUserId } = data;
      if (!recipientUserId || !senderUserId) {
        logger.warn('[socketConfig] STOP_TYPING event missing required fields', {
          socketId: socket.id,
          data,
          timestamp: new Date().toISOString(),
        });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Recipient and Sender IDs required' });
        return;
      }
    
      logger.debug('[socketConfig] Broadcasting STOP_TYPING', {
        senderUserId,
        recipientUserId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    
      io.to(recipientUserId).emit(SOCKET_EVENTS.STOP_TYPING, {
        senderUserId,
        recipientUserId,
      });
    });

    socket.on(SOCKET_EVENTS.CONVERSATION_READ, async (data) => {
      logger.debug('[socketConfig] Processing CONVERSATION_READ payload', {
        socketId: socket.id,
        userId: socket.userId,
        data,
        timestamp: new Date().toISOString(),
      });
      const { conversationId, readerUserId } = data;
      if (!conversationId || !readerUserId) {
        logger.warn('[socketConfig] CONVERSATION_READ event missing required fields', { socketId: socket.id, data, timestamp: new Date().toISOString() });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Conversation ID and Reader ID required' });
        return;
      }
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          logger.warn('[socketConfig] Conversation not found for CONVERSATION_READ', { conversationId, readerUserId, socketId: socket.id, timestamp: new Date().toISOString() });
          socket.emit(SOCKET_EVENTS.ERROR, { message: 'Invalid conversation' });
          return;
        }
        const otherParticipantId = conversation.participants.find((p) => p.toString() !== readerUserId.toString())?.toString();
        if (!otherParticipantId) {
          logger.warn('[socketConfig] No other participant found for CONVERSATION_READ', { conversationId, readerUserId, socketId: socket.id, timestamp: new Date().toISOString() });
          return;
        }
        await messageService.markConversationAsRead(readerUserId, conversationId);
        logger.info('[socketConfig] Broadcasting CONVERSATION_READ to user room', { conversationId, readerUserId, recipientUserId: otherParticipantId, socketId: socket.id, timestamp: new Date().toISOString() });
        io.to(otherParticipantId).emit(SOCKET_EVENTS.CONVERSATION_READ, { conversationId, readerUserId });
      } catch (error) {
        logger.error('[socketConfig] Error processing CONVERSATION_READ', { conversationId, readerUserId, socketId: socket.id, error: error.message, stack: error.stack, timestamp: new Date().toISOString() });
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to process read event' });
      }
    });

    socket.on('update_presence', ({ userId, status }) => {
      logger.info('[Socket] User presence updated', { userId, status });
      io.emit('presence_update', { userId, status }); // Broadcast to all connected clients
    });

      socket.on('invalidate_notifications', () => {
      logger.info(`[Socket] Received invalidate_notifications trigger for user ${socket.userId}. Relaying to client.`);
      socket.emit('invalidate_notifications_client');
    });

  });

  // Monitor connection health
  setInterval(() => {
    const now = new Date();
    connectionMonitor.connections.forEach((connection, userId) => {
      const inactiveTime = now - connection.lastActivity;
      if (inactiveTime > 300000) { // 5 minutes
        logger.warn('[Socket] Inactive connection detected:', {
          userId,
          inactiveTime: `${Math.round(inactiveTime / 1000)}s`
        });
      }
    });
  }, 60000); // Check every minute

  setInterval(() => {
    if (io && io.sockets && io.sockets.sockets) {
      io.sockets.sockets.forEach((socket) => {
        if (socket.connected) {
          socket.emit('ping');
        }
      });
    }
    if (videoIO && videoIO.sockets && videoIO.sockets.sockets) {
      videoIO.sockets.sockets.forEach((socket) => {
        if (socket.connected) {
          socket.emit('ping');
        }
      });
    }
  }, 30000);

  return { io, activeConnections, connectionMonitor, SOCKET_EVENTS };
};

module.exports = {
  configureSocket,
};