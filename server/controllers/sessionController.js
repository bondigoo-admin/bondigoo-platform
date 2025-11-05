const fs = require('fs').promises;
const crypto = require('crypto');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Session = require('../models/Session');
const Poll = require('../models/Poll');
const QA = require('../models/QA'); 
const Payment = require('../models/Payment');
const Coach = require('../models/Coach');
const UnifiedNotificationService = require('../services/unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');
const AnalyticsService = require('../services/analyticsService');
const { logger } = require('../utils/logger');
const cloudinary = require('cloudinary').v2;
const { EventEmitter } = require('events');
const emitter = new EventEmitter();
const paymentController = require('../controllers/paymentController');
const paymentService = require('../services/paymentService');
const { getSocketService } = require('../services/socketService');

const findSessionByLinkAndAuthorize = async (sessionLinkSessionId, userId, requireActive = true) => {
  if (!sessionLinkSessionId || !userId) {
    logger.error('[SessionUtil] Missing sessionLinkSessionId or userId', { sessionLinkSessionId, hasUserId: !!userId });
    return { error: 'Invalid input', status: 400 };
  }

  try {
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionLinkSessionId })
                                 .populate('coach', '_id firstName lastName email')
                                 .populate('user', '_id firstName lastName email');

    if (!booking) {
      logger.warn('[SessionUtil] Booking not found for session link ID', { sessionLinkSessionId });
      return { error: 'Booking not found', status: 404 };
    }

    let session = await Session.findOne({ bookingId: booking._id });
    if (!session) {
      console.log('[SessionUtil] Creating new Session document as it was not found', { bookingId: booking._id.toString() });
      session = new Session({
        bookingId: booking._id,
        state: 'pending',
        participants: [],
        resources: [],
        notes: '',
        agenda: [],
        privateNotes: {}
      });
      await session.save();
      console.log('[SessionUtil] Created new Session document', { sessionDocId: session._id });
    }

    if (requireActive && session.state !== 'active') {
      logger.warn('[SessionUtil] Session not active', { bookingId: booking._id.toString(), state: session.state, requireActive });
      return { error: 'Session must be active for this operation', status: 400 };
    }

    const isCoach = booking.coach && booking.coach._id.toString() === userId;
    const isUserInBooking = booking.user && booking.user._id.toString() === userId;
    const userRole = isCoach ? 'coach' : (isUserInBooking ? 'participant' : null);

    if (!isCoach && !isUserInBooking) {
      logger.warn('[SessionUtil] Unauthorized access attempt to session resources', { bookingId: booking._id.toString(), userId });
      return { error: 'Unauthorized', status: 403 };
    }

    return { session, booking, isCoach, userRole, status: 200 };
  } catch (error) {
    logger.error('[SessionUtil] Error during find/authorize', {
      sessionLinkSessionId,
      userId,
      error: error.message,
      stack: error.stack
    });
    if (error.name === 'CastError') {
      return { error: 'Invalid user identifier format', status: 400 };
    }
    return { error: 'Internal server error during authorization', status: 500 };
  }
};

const uploadToCloudinaryHelper = async (file, folderPath, publicIdPrefix = '') => {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      resource_type: 'auto',
      folder: folderPath,
      type: 'private',
      public_id: `${publicIdPrefix}${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`,
    });
    return {
      name: file.originalname,
      url: result.secure_url,
      publicId: result.public_id,
      fileType: result.resource_type === 'raw' ? file.mimetype : result.resource_type, // Use mimetype for raw
      size: result.bytes,
      uploadedAt: new Date(),
    };
  } catch (uploadError) {
    logger.error('[CloudinaryUploadHelper] Upload failed', { filename: file.originalname, error: uploadError.message });
    throw uploadError;
  } finally {
    await fs.unlink(file.path).catch(unlinkErr => logger.warn(`[CloudinaryUploadHelper] Failed to delete temp file ${file.path}`, { error: unlinkErr.message }));
  }
};

const generateSessionLink = async (req, res) => {
  try {
    const { bookingId } = req.params;

    console.log('[sessionController] generateSessionLink called:', { 
      bookingId, 
      userId: req.user?._id, 
      method: req.method, 
      url: req.originalUrl 
    });

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      console.log('[sessionController] Invalid booking ID:', { bookingId });
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID format',
      });
    }

    const booking = await Booking.findById(bookingId)
      .populate('coach', '-password')
      .populate('user', '-password')
      .populate('sessionType');

    if (!booking) {
      console.log('[sessionController] Booking not found:', { bookingId });
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    console.log('[sessionController] Booking found:', { 
      bookingId, 
      status: booking.status, 
      start: booking.start, 
      coachId: booking.coach?._id.toString(), 
      userId: booking.user?._id.toString(),
      sessionLink: booking.sessionLink 
    });

    const userId = req.user._id.toString();
    const isCoach = booking.coach._id.toString() === userId;
    const isClient = booking.user._id.toString() === userId;

    console.log('[sessionController] Authorization check:', { 
      userId, 
      isCoach, 
      isClient 
    });

    if (!isCoach && !isClient) {
      console.log('[sessionController] Unauthorized access:', { bookingId, userId });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to booking',
      });
    }

    if (
      booking.sessionLink &&
      booking.sessionLink.token &&
      booking.sessionLink.sessionId &&
      booking.sessionLink.generatedAt &&
      !booking.sessionLink.expired
    ) {
      const sessionUrl = `${process.env.FRONTEND_URL}/session/${booking.sessionLink.sessionId}/${booking.sessionLink.token}`;
      console.log('[sessionController] Returning existing session link:', { sessionUrl });
      return res.json({
        success: true,
        sessionUrl,
        isNewLink: false,
      });
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionId = crypto
      .createHmac('sha256', process.env.SESSION_SECRET || 'default-secret')
      .update(`${booking._id}-${Date.now()}`)
      .digest('hex');

    booking.sessionLink = {
      token: sessionToken,
      sessionId,
      generatedAt: new Date(),
      expired: false,
    };

    await booking.save();
    console.log('[sessionController] Session link generated and saved:', { 
      bookingId, 
      sessionId, 
      token: sessionToken 
    });

    const sessionUrl = `${process.env.FRONTEND_URL}/session/${sessionId}/${sessionToken}`;

    if (isCoach) {
      await UnifiedNotificationService.sendNotification({
        type: NotificationTypes.SESSION_LINK_CREATED,
        recipient: booking.user._id,
        category: 'session',
        priority: 'high',
        channels: ['in_app', 'email'],
        content: {
          title: 'Session Link Created',
          message: `Your coach ${booking.coach.firstName} ${booking.coach.lastName} has created a session link for your upcoming session.`,
        },
        metadata: {
          bookingId: booking._id,
          sessionType: booking.sessionType._id,
          sessionUrl,
        },
      });
      console.log('[sessionController] Notification sent to client:', { recipient: booking.user._id });
    }

    console.log('[sessionController] Returning new session link:', { sessionUrl });
    res.json({
      success: true,
      sessionUrl,
      isNewLink: true,
    });
  } catch (error) {
    console.error('[sessionController.generateSessionLink] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate session link',
      error: error.message,
    });
  }
};

const validateSessionLink = async (req, res) => {
  try {
    const { sessionId, token } = req.params;
    console.log('[sessionController.validateSessionLink] Request received', { 
      sessionId, 
      token, 
      userId: req.user?._id?.toString() 
    });

    const booking = await Booking.findOne({
      'sessionLink.sessionId': sessionId,
      'sessionLink.token': token,
      'sessionLink.expired': false,
    }).populate('coach', '-password').populate('user', '-password');

    if (!booking) {
      logger.warn('[sessionController.validateSessionLink] Invalid or expired session link', { 
        sessionId, 
        token, 
        queryResult: await Booking.find({ 'sessionLink.sessionId': sessionId }) 
      });
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired session link',
        debug: { sessionId, token },
      });
    }

    const session = await Session.findOne({ bookingId: booking._id });
    if (!session) {
      logger.warn('[sessionController.validateSessionLink] No session found for booking', { 
        sessionId, 
        bookingId: booking._id.toString() 
      });
      return res.status(404).json({
        success: false,
        message: 'Session not found for this booking',
        debug: { sessionId, token, bookingId: booking._id.toString() },
      });
    }

    const now = new Date();
    const sessionStart = new Date(booking.start); // Use booking start time
    const sessionEnd = new Date(booking.end);     // bookings end time

    let userRole = null;
    let userId = null;
    if (req.user) {
      userId = req.user._id.toString();
      if (booking.coach._id.toString() === userId) {
        userRole = 'coach';
      } else if (booking.user._id.toString() === userId) {
        userRole = 'participant';
      }
    }

    const isSessionStarted = now >= sessionStart;
    const canJoin = userRole === 'coach' || isSessionStarted;

    if (userRole === 'coach' && !isSessionStarted) {
      const earlyJoinMinutes = (sessionStart - now) / (1000 * 60);
      console.log('[sessionController.validateSessionLink] Coach joined session early', {
        sessionId,
        coachId: userId,
        sessionStart: sessionStart.toISOString(),
        joinTime: now.toISOString(),
        earlyJoinMinutes: earlyJoinMinutes > 0 ? earlyJoinMinutes : 0
      });
    }

    res.json({
      success: true,
      isValid: true,
      canJoinImmediately: canJoin,
      sessionDetails: {
        sessionId,
        bookingId: session.bookingId,
        sessionType: booking.sessionType.name,
        start: booking.start,
        end: booking.end,
        duration: (sessionEnd - sessionStart) / (60 * 1000),
        coach: {
          id: booking.coach._id,
          name: `${booking.coach.firstName} ${booking.coach.lastName}`,
          profilePicture: booking.coach.profilePicture,
        },
        participant: {
          id: booking.user._id,
          name: `${booking.user.firstName} ${booking.user.lastName}`,
          profilePicture: booking.user.profilePicture,
        },
        userRole,
        userId,
        isLiveSession: isSessionStarted,
      },
    });
  } catch (error) {
    logger.error('[sessionController.validateSessionLink] Error', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to validate session link',
      error: error.message,
    });
  }
};

const startSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { token, displayName, isCoach } = req.body;
    const userId = req.user._id.toString();

    console.log('[sessionController.startSession] Request received', { 
      sessionId, 
      token, 
      userId, 
      isCoach 
    });

    const booking = await Booking.findOne({
      'sessionLink.sessionId': sessionId,
      'sessionLink.token': token,
      'sessionLink.expired': false,
    }).populate('coach user');

    if (!booking) {
      logger.warn('[sessionController.startSession] Invalid or expired session link', { 
        sessionId, 
        token 
      });
      return res.status(404).json({ success: false, message: 'Invalid or expired session link' });
    }

    let session = await Session.findOne({ bookingId: booking._id });
    if (!session) {
      console.log('[sessionController.startSession] Creating new Session document', { 
        bookingId: booking._id.toString() 
      });
      session = new Session({
        bookingId: booking._id,
        state: 'pending',
        participants: [],
        resources: [],
        notes: '',
        agenda: [],
        privateNotes: {}
      });
    }

    const isAuthorized = [booking.coach._id.toString(), booking.user._id.toString()].includes(userId);
    if (!isAuthorized) {
      logger.warn('[sessionController.startSession] Unauthorized access', { 
        sessionId, 
        userId 
      });
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Update participant join time
    const participant = session.participants.find(p => p.userId.toString() === userId);
    if (!participant) {
      session.participants.push({ userId, joinedAt: new Date() });
    } else {
      participant.joinedAt = new Date();
    }

    let stateChanged = false;
    if (session.state !== 'active' && (isCoach || ['pending', 'confirmed'].includes(session.state))) {
      session.state = 'active';
      stateChanged = true;

      if (!session.startedAt) { // General marker for when session first went active
          session.startedAt = new Date();
      }

      // actualStartTime is critical for overtime. Set it when the session *effectively* starts for billing.
      // This is usually when the first billable participant (typically coach, or user if coach is late) joins an activatable session.
      // If coach is the one making it active, actualStartTime is now.
      // If participant makes a 'confirmed' session active, actualStartTime is now.
      if (!session.actualStartTime) {
          session.actualStartTime = new Date();
          console.log('[sessionController.startSession] actualStartTime SET by this call', {
            sessionId: session._id.toString(),
            actualStartTime: session.actualStartTime.toISOString(),
            triggeredByCoach: isCoach,
            initialSessionState: session.state // Log state *before* change for clarity
          });
      } else {
           console.log('[sessionController.startSession] actualStartTime was ALREADY SET', {
            sessionId: session._id.toString(),
            existingActualStartTime: session.actualStartTime.toISOString()
          });
      }
      console.log('[sessionController.startSession] Session state set to ACTIVE', {
        sessionId: session._id.toString(),
        bookingId: booking._id.toString(),
        sessionState: session.state, // Log state *after* change
        triggeredByCoach: isCoach
      });

      // Overtime prompt scheduling logic (should only happen once, typically when coach makes it active)
      if (isCoach && booking.overtime?.allowOvertime && (booking.overtime.freeOvertimeDuration > 0 || booking.overtime.paidOvertimeDuration > 0) && !session.overtimePromptTime) {
        // ... (existing overtime prompt scheduling logic, ensure it uses session.actualStartTime) ...
        // Example:
        const bookingEnd = new Date(booking.end).getTime();
        const bookingStart = new Date(booking.start).getTime();
        const plannedDurationMinutes = (bookingEnd - bookingStart) / 60000;
        
        const gracePeriodMinutes = 5; // Standard 5-min grace
        const freeOvertimeMinutes = booking.overtime.freeOvertimeDuration || 0;
        const promptLeadTimeMinutes = 5; // Prompt 5 mins before free/grace ends

        // Calculate prompt time relative to the *actual* start time
        const promptTime = new Date(
            session.actualStartTime.getTime() +
            (plannedDurationMinutes * 60000) +
            (gracePeriodMinutes * 60000) +
            (freeOvertimeMinutes * 60000) -
            (promptLeadTimeMinutes * 60000)
        );

        session.overtimePromptTime = promptTime;
        const delay = promptTime.getTime() - Date.now();

        if (delay > 0) {
          // Consider using a more robust scheduler than setTimeout for production
          setTimeout(() => triggerOvertimePrompt(req.io, sessionId, booking, session), delay);
          console.log('[sessionController.startSession] Scheduled overtime prompt', {
            sessionId: session._id.toString(),
            promptTime: session.overtimePromptTime,
            delayMs: delay
          });
        } else {
          logger.warn('[sessionController.startSession] Overtime prompt time already passed or no paid/free OT for prompt.', {
            sessionId: session._id.toString(),
            promptTime: session.overtimePromptTime,
            calculatedDelay: delay
          });
        }
      }
    } else {
      console.log('[sessionController.startSession] Session already active or conditions not met for state change by this user.', {
            sessionId: session._id.toString(),
            currentState: session.state,
            isCoachRequest: isCoach
      });
    }

    await session.save();
    const videoIO = req.io.of('/video');
    videoIO.to(`session:${sessionId}`).emit('session-started', {
      userId,
      isCoach,
      timestamp: new Date().toISOString()
    });
    console.log('[sessionController.startSession] Emitted session-started event', { 
      sessionId, 
      stateChanged 
    });

    res.json({ success: true, sessionId, stateChanged, actualStartTime: session.actualStartTime });
  } catch (error) {
    logger.error('[sessionController.startSession] Error:', { 
      error: error.message, 
      stack: error.stack,
      sessionId: req.params.sessionId 
    });
    res.status(500).json({ success: false, message: 'Failed to start session', error: error.message });
  }
};

const presenterControls = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { action, enabled, lock } = req.body;
    const userId = req.user._id.toString();

    // Find the booking using the session link's sessionId
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId }).populate('coach');
    if (!booking) {
      logger.warn('[sessionController.presenterControls] Booking not found for session link ID', { sessionId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    // Find the actual session using the booking ID
    const session = await Session.findOne({ 'bookingId': booking._id }).populate('coach'); // Corrected query
    if (!session || session.state !== 'active') {
      logger.warn('[sessionController.presenterControls] Session not active or not found', { bookingId: booking._id.toString(), state: session?.state });
      return res.status(404).json({ success: false, message: 'Session not active' });
    }

    // Authorization check using the coach from the session document
    if (!session.coach || session.coach._id.toString() !== userId) {
      logger.warn('[sessionController.presenterControls] Unauthorized presenter control attempt', { bookingId: booking._id.toString(), userId, coachId: session.coach?._id.toString() });
      return res.status(403).json({ success: false, message: 'Only coach can control presenter tools' });
    }

    // *** Use req.io here ***
    const io = req.io;
    if (!io) {
      logger.error('[sessionController.presenterControls] Socket.IO instance (io) not found on request object', { sessionId: booking.sessionLink.sessionId });
      return res.status(500).json({ success: false, message: 'Internal server error: Socket service unavailable' });
    }
    const videoIO = io.of('/video'); // Get the correct namespace

    const roomName = `session:${booking.sessionLink.sessionId}`; // Use the sessionLink sessionId for room name

    switch (action) {
      case 'setWorkshopMode':
        session.workshopMode = enabled;
        await session.save();
        console.log('[sessionController.presenterControls] Workshop mode set', { roomName, enabled });
        videoIO.to(roomName).emit('presentationModeToggled', { enabled }); // Use videoIO
        break;
      case 'muteAll':
        videoIO.to(roomName).emit('muteAll'); // Use videoIO
        console.log('[sessionController.presenterControls] Mute all triggered', { roomName });
        break;
      // ... other cases ...
      case 'lockScreenShare':
        session.screenShareLocked = lock;
        await session.save();
        videoIO.to(roomName).emit('screenShareLocked', { locked: lock }); // Use videoIO
        console.log('[sessionController.presenterControls] Screen share lock set', { roomName, locked: lock });
        break;
      default:
        logger.warn('[sessionController.presenterControls] Invalid action received', { action });
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    res.json({ success: true, action });
  } catch (error) {
    logger.error('[sessionController.presenterControls] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to execute presenter control', error: error.message });
  }
};

const createPoll = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  // Options from frontend should be an array of strings for 'multiple': ['Option 1', 'Option 2']
  const { type, question, options } = req.body; // 'options' is expected to be array of strings if type is 'multiple'
  const userId = req.user._id.toString();

  try {
     const { session, booking, error, status, isCoach: isUserCoach } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
     if (error) return res.status(status).json({ success: false, message: error });

     if (!isUserCoach) {
         logger.warn('[sessionController.createPoll] Unauthorized attempt by non-coach', { userId, sessionDocId: session._id });
         return res.status(403).json({ success: false, message: 'Only the coach can create polls' });
     }

     // Validate input structure (basic)
     if (!question || (type === 'multiple' && (!Array.isArray(options) || options.length === 0))) {
        logger.warn('[sessionController.createPoll] Invalid poll data received', { type, question, options: typeof options });
        return res.status(400).json({ success: false, message: 'Invalid poll data: Question and options (for multiple choice) are required.' });
     }

     // Prepare options based on type, ready for the Mongoose schema
     let pollOptionsForDb = [];
     if (type === 'multiple') {
        // Map the array of strings received from frontend into the schema structure
        pollOptionsForDb = options.map(text => ({ text: text || ' ' })); // Default text if empty string provided
     } else if (type === 'open') {
        // For open polls, we might not need specific options initially, or just a placeholder
        // The schema defines PollOptionSchema, so we need *something* if we want to store results there.
        // Let's create a placeholder. Votes will be 1 when someone responds. Text will be overwritten.
        pollOptionsForDb = [{ text: 'Open Response Placeholder', votes: 0 }];
     }
     // Add handling for 'rating' if implemented later

    // Create the new Poll document using the prepared options
    const poll = new Poll({
      sessionId: session._id, // Use the actual Session ObjectId
      type,
      question,
      options: pollOptionsForDb,
      // createdBy: userId, // Optional
    });

    await poll.save(); // Mongoose validation happens here

    // Emit Socket Event
    const io = req.io;
    if (io) {
        const videoIO = io.of('/video');
        const roomName = `session:${sessionLinkSessionId}`;
        // Fetch the poll again AFTER saving to ensure all defaults and _id are populated
        const savedPoll = await Poll.findById(poll._id);
        videoIO.to(roomName).emit('poll-created', savedPoll);
        console.log('[sessionController.createPoll] Emitted poll-created', { roomName, pollId: savedPoll._id });
    } else {
         logger.error('[sessionController.createPoll] Socket.IO instance not found on request');
    }

    console.log('[sessionController.createPoll] Poll created', { sessionDocId: session._id, pollId: poll._id, type: poll.type });
    const finalPoll = await Poll.findById(poll._id); // Fetch again to return latest state with populated _id
    res.status(201).json({ success: true, poll: finalPoll });

  } catch (error) {
     // Log the validation error specifically if it occurs
     if (error.name === 'ValidationError') {
         logger.error('[sessionController.createPoll] Mongoose Validation Error', { error: error.message, errors: error.errors, sessionLinkSessionId });
         // Send a more specific error message to the frontend
         return res.status(400).json({ success: false, message: `Poll validation failed: ${error.message}` });
     }
    logger.error('[sessionController.createPoll] Unexpected Error', { error: error.message, stack: error.stack, sessionLinkSessionId });
    res.status(500).json({ success: false, message: 'Failed to create poll', error: error.message });
  }
};

const updatePoll = async (req, res) => {
  const { sessionId: sessionLinkSessionId, pollId } = req.params;
  const { optionIndex, text } = req.body; // Added text for open polls
  const userId = req.user._id.toString();

  try {
     // Find session
     const { session, booking, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
     if (error) return res.status(status).json({ success: false, message: error });

    // Find the specific poll within that session
    const poll = await Poll.findOne({ '_id': pollId, sessionId: session._id }); // Query by Session's ObjectId
    if (!poll) {
      return res.status(404).json({ success: false, message: 'Poll not found in this session' });
    }

    // Check if already voted
    if (poll.voters.map(v => v.toString()).includes(userId)) {
        return res.status(400).json({ success: false, message: 'Already voted' });
    }

    // Update votes based on type
    if (poll.type === 'multiple' || poll.type === 'rating') {
       if (optionIndex === undefined || optionIndex < 0 || optionIndex >= poll.options.length) {
           return res.status(400).json({ success: false, message: 'Invalid option index' });
       }
       // Ensure votes field exists
       if (poll.options[optionIndex].votes === undefined) {
          poll.options[optionIndex].votes = 0;
       }
       poll.options[optionIndex].votes += 1;

    } else if (poll.type === 'open') {
       if (!text) {
            return res.status(400).json({ success: false, message: 'Text response is required for open poll' });
       }
       // Overwrite or add response? Let's assume we just store the first response text.
       // Ensure options array exists
       if (!poll.options || poll.options.length === 0) {
           poll.options = [{ text: '', votes: 0}]; // Initialize if needed
       }
       poll.options[0].text = text; // Store text in the first option's text field
       poll.options[0].votes = 1; // Mark as answered

    } else {
       return res.status(400).json({ success: false, message: 'Invalid poll type for voting' });
    }

    poll.voters.push(userId);
    await poll.save();

    // Emit Socket Event
    const io = req.io;
    if (io) {
        const videoIO = io.of('/video');
        const roomName = `session:${sessionLinkSessionId}`;
        // Find the updated poll again to ensure latest data is sent
        const updatedPoll = await Poll.findById(poll._id);
        videoIO.to(roomName).emit('poll-voted', updatedPoll);
        console.log('[sessionController.updatePoll] Emitted poll-voted', { roomName, pollId: updatedPoll._id });
    } else {
         logger.error('[sessionController.updatePoll] Socket.IO instance not found on request');
    }


    console.log('[sessionController.updatePoll] Poll updated', { sessionDocId: session._id, pollId });
    const finalPoll = await Poll.findById(poll._id); // Fetch again to return latest state
    res.json({ success: true, poll: finalPoll });

  } catch (error) {
    logger.error('[sessionController.updatePoll] Error', { error: error.message, sessionLinkSessionId, pollId });
    res.status(500).json({ success: false, message: 'Failed to update poll', error: error.message });
  }
};

const getPolls = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  const userId = req.user._id.toString();

  try {
     // Find session
     const { session, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false); // Don't require active to view polls
     if (error) return res.status(status).json({ success: false, message: error });

    const polls = await Poll.find({ sessionId: session._id }).sort({ createdAt: 1 }); // Find by Session ObjectId, sort by creation
    console.log('[sessionController.getPolls] Polls retrieved', { sessionDocId: session._id, count: polls.length });
    res.json({ success: true, polls });
  } catch (error) {
    logger.error('[sessionController.getPolls] Error', { error: error.message, sessionLinkSessionId });
     // Handle potential CastError if pollId format is wrong in other routes, though not applicable here
    res.status(500).json({ success: false, message: 'Failed to get polls', error: error.message });
  }
};

const deletePoll = async (req, res) => {
  const { sessionId: sessionLinkSessionId, pollId } = req.params;
  const userId = req.user._id.toString();

  try {
      // Find session and authorize (only coach can delete)
      const { session, booking, error, status, isCoach: isUserCoach } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
      if (error) return res.status(status).json({ success: false, message: error });

      if (!isUserCoach) {
          return res.status(403).json({ success: false, message: 'Only the coach can delete polls' });
      }

      // Find and delete the poll
      const result = await Poll.findOneAndDelete({ _id: pollId, sessionId: session._id });

      if (!result) {
          return res.status(404).json({ success: false, message: 'Poll not found in this session' });
      }

      // Emit Socket Event
      const io = req.io;
      if (io) {
          const videoIO = io.of('/video');
          const roomName = `session:${sessionLinkSessionId}`;
          videoIO.to(roomName).emit('poll-deleted', { pollId }); // Send ID of deleted poll
          console.log('[sessionController.deletePoll] Emitted poll-deleted', { roomName, pollId });
      } else {
          logger.error('[sessionController.deletePoll] Socket.IO instance not found on request');
      }

      console.log('[sessionController.deletePoll] Poll deleted successfully', { sessionDocId: session._id, pollId });
      res.json({ success: true, message: 'Poll deleted' });

  } catch (error) {
      logger.error('[sessionController.deletePoll] Error', { error: error.message, sessionLinkSessionId, pollId });
      res.status(500).json({ success: false, message: 'Failed to delete poll', error: error.message });
  }
};

const createQA = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  const { question } = req.body;
  const userId = req.user._id.toString();

  try {
     // Find session
     const { session, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
     if (error) return res.status(status).json({ success: false, message: error });

     // Anyone in the session (coach or participant) can ask
    const qa = new QA({
       sessionId: session._id, // <-- Use Session's ObjectId
       question,
       userId
    });
    await qa.save();

     // Emit Socket Event
    const io = req.io;
    if (io) {
        const videoIO = io.of('/video');
        const roomName = `session:${sessionLinkSessionId}`;
        videoIO.to(roomName).emit('qa-submitted', qa); // Send the created QA object
        console.log('[sessionController.createQA] Emitted qa-submitted', { roomName, qaId: qa._id });
    } else {
         logger.error('[sessionController.createQA] Socket.IO instance not found on request');
    }


    console.log('[sessionController.createQA] QA created', { sessionDocId: session._id, qaId: qa._id });
    res.status(201).json({ success: true, qa });

  } catch (error) {
    logger.error('[sessionController.createQA] Error', { error: error.message, sessionLinkSessionId });
    res.status(500).json({ success: false, message: 'Failed to create QA', error: error.message });
  }
};

const updateQA = async (req, res) => {
  const { sessionId: sessionLinkSessionId, qaId } = req.params;
  const { approved, answer } = req.body;
  const userId = req.user._id.toString();

  try {
    console.log('[sessionController.updateQA] Attempting to update QA', { sessionLinkSessionId, qaId, userId, approved, answer });
    const { session, error, status, isCoach } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
    if (error) {
      logger.warn('[sessionController.updateQA] Authorization failed', { sessionLinkSessionId, qaId, error });
      return res.status(status).json({ success: false, message: error });
    }

    const qa = await QA.findOne({ _id: qaId, sessionId: session._id });
    if (!qa) {
      logger.warn('[sessionController.updateQA] QA not found', { sessionLinkSessionId, qaId });
      return res.status(404).json({ success: false, message: 'Q&A not found' });
    }

    let updated = false;
    if (approved !== undefined && qa.approved !== approved && isCoach) {
      qa.approved = approved;
      updated = true;
      logger.info('[sessionController.updateQA] Approval status updated by coach', { qaId, approved });
    }
    if (answer !== undefined && answer.trim() && qa.answer !== answer) {
      qa.answer = answer;
      updated = true;
      logger.info('[sessionController.updateQA] Answer updated', { qaId, userId, answer });
    }

    if (updated) {
      await qa.save();
      const io = req.io;
      if (io) {
        const videoIO = io.of('/video');
        const roomName = `session:${sessionLinkSessionId}`;
        videoIO.to(roomName).emit('qa-updated', qa);
        logger.info('[sessionController.updateQA] Emitted qa-updated event', { roomName, qaId });
      } else {
        logger.warn('[sessionController.updateQA] Socket.IO instance not available', { sessionLinkSessionId, qaId });
      }
    } else {
      logger.info('[sessionController.updateQA] No changes to apply', { qaId });
    }

    res.json({ success: true, qa });
  } catch (error) {
    logger.error('[sessionController.updateQA] Error updating QA', { error: error.message, sessionLinkSessionId, qaId, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to update Q&A', error: error.message });
  }
};

const getQA = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  const userId = req.user._id.toString();

 try {
     // Find session
    const { session, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false); // Don't require active to view
    if (error) return res.status(status).json({ success: false, message: error });

   const questions = await QA.find({ sessionId: session._id }).sort({ createdAt: 1 }); // Find by Session ObjectId
   logger.info('[sessionController.getQA] QA retrieved', { sessionDocId: session._id, count: questions.length });
   res.json({ success: true, questions });
 } catch (error) {
   logger.error('[sessionController.getQA] Error', { error: error.message, sessionLinkSessionId });
   res.status(500).json({ success: false, message: 'Failed to get QA', error: error.message });
 }
};

const deleteQA = async (req, res) => {
  const { sessionId: sessionLinkSessionId, qaId } = req.params;
  const userId = req.user._id.toString();

  try {
      // Find session and authorize (e.g., only coach or original asker can delete?)
      // Let's allow only the coach for now
      const { session, error, status, isCoach: isUserCoach } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
      if (error) return res.status(status).json({ success: false, message: error });

      // Authorization: Only coach can delete any question
      if (!isUserCoach) {
           // Optionally allow user to delete their own *unapproved* question
           // const qaToDelete = await QA.findOne({ _id: qaId, sessionId: session._id, userId: userId, approved: false });
           // if (!qaToDelete) {
               return res.status(403).json({ success: false, message: 'Only the coach can delete questions' });
          // }
      }

      // Find and delete the QA item
      const result = await QA.findOneAndDelete({ _id: qaId, sessionId: session._id });

      if (!result) {
          return res.status(404).json({ success: false, message: 'Q&A item not found in this session' });
      }

      // Emit Socket Event
      const io = req.io;
      if (io) {
          const videoIO = io.of('/video');
          const roomName = `session:${sessionLinkSessionId}`;
          // Might need to emit 'qa-deleted' or just 'qa-updated' with the removed item filtered out
          // Let's use a specific event
          videoIO.to(roomName).emit('qa-deleted', { qaId }); // Send ID of deleted QA
          logger.info('[sessionController.deleteQA] Emitted qa-deleted', { roomName, qaId });
      } else {
          logger.error('[sessionController.deleteQA] Socket.IO instance not found on request');
      }

      logger.info('[sessionController.deleteQA] QA deleted successfully', { sessionDocId: session._id, qaId });
      res.json({ success: true, message: 'Q&A item deleted' });

  } catch (error) {
      logger.error('[sessionController.deleteQA] Error', { error: error.message, sessionLinkSessionId, qaId });
      res.status(500).json({ success: false, message: 'Failed to delete Q&A item', error: error.message });
  }
};

const updateNotesAgenda = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  const { notes } = req.body; // Removed agenda
  const userId = req.user._id.toString();

  try {
    logger.info('[sessionController.updateNotesAgenda] Updating coach notes', { sessionLinkSessionId, userId, notesLength: notes?.length });
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionLinkSessionId }).populate('coach');
    if (!booking) {
      logger.warn('[sessionController.updateNotesAgenda] Booking not found', { sessionLinkSessionId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.coach._id.toString() !== userId) {
      logger.warn('[sessionController.updateNotesAgenda] Unauthorized attempt', { bookingId: booking._id.toString(), userId });
      return res.status(403).json({ success: false, message: 'Only coach can update notes' });
    }

    const session = await Session.findOneAndUpdate(
      { bookingId: booking._id },
      { notes: notes || '' },
      { new: true, upsert: true }
    );
    logger.info('[sessionController.updateNotesAgenda] Coach notes updated', { sessionLinkSessionId, sessionId: session._id });

    const io = req.io.of('/video');
    io.to(`session:${sessionLinkSessionId}`).emit('notes-updated', notes);
    logger.info('[sessionController.updateNotesAgenda] Emitted notes-updated', { room: `session:${sessionLinkSessionId}` });

    return res.json({ success: true, notes: session.notes });
  } catch (error) {
    logger.error('[sessionController.updateNotesAgenda] Error updating notes', { error: error.message, sessionLinkSessionId });
    return res.status(500).json({ success: false, message: 'Failed to update notes', error: error.message });
  }
};

const getNotesAgenda = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    const session = await Session.findOne({ bookingId: booking._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    logger.info('[sessionController.getNotesAgenda] Notes/Agenda retrieved', { sessionId });
    res.json({
      success: true,
      notes: session.notes || '',
      agenda: session.agenda || [],
      bookingId: booking._id.toString() // Add bookingId to the response
    });
  } catch (error) {
    logger.error('[sessionController.getNotesAgenda] Error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get notes/agenda', error: error.message });
  }
};

const uploadBackground = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const background = await StorageManager.uploadBackground(req.file, userId);

    const user = await User.findById(userId);
    user.backgrounds = user.backgrounds || [];
    user.backgrounds.push(background);
    await user.save();
    logger.info('[sessionController.uploadBackground] Background added to user', { userId });

    res.json({ success: true, background });
  } catch (error) {
    logger.error('[sessionController.uploadBackground] Error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to upload background', error: error.message });
  }
};

const getBackgrounds = async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const user = await User.findById(userId);
    logger.info('[sessionController.getBackgrounds] Backgrounds retrieved', { userId });
    res.json({ success: true, backgrounds: user.backgrounds || [] });
  } catch (error) {
    logger.error('[sessionController.getBackgrounds] Error', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get backgrounds', error: error.message });
  }
};

const getSessionAnalytics = async (req, res) => {
  try {
    const { sessionId } = req.params; // This is the sessionLink sessionId string
    const userId = req.user._id.toString();

    logger.info('[sessionController.getSessionAnalytics] Request received', {
      sessionId,
      userId,
    });

    const booking = await Booking.findOne({
      'sessionLink.sessionId': sessionId,
    }).populate('coach', '-password');

    if (!booking) {
      logger.warn('[sessionController.getSessionAnalytics] Booking not found for sessionId', { sessionId });
      return res.status(404).json({ success: false, message: 'Session booking not found' });
    }

    logger.debug('[sessionController.getSessionAnalytics] Found booking', {
      bookingId: booking._id.toString(),
      sessionId,
    });

    if (booking.coach._id.toString() !== userId) {
      logger.warn('[sessionController.getSessionAnalytics] Unauthorized access', {
        sessionId,
        userId,
        coachId: booking.coach._id.toString(),
      });
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const analytics = await AnalyticsService.getSessionAnalytics(booking._id.toString());
    logger.info('[sessionController.getSessionAnalytics] Analytics retrieved', {
      sessionId,
      bookingId: booking._id.toString(),
    });

    // Emit real-time analytics update via Socket.IO
    const io = req.io;
    if (io) {
      const videoIO = io.of('/video');
      const roomName = `session:${sessionId}`;
      videoIO.to(roomName).emit('analytics-update', analytics);
      logger.info('[sessionController.getSessionAnalytics] Emitted analytics-update', {
        roomName,
        analyticsSummary: {
          duration: analytics.duration,
          lateArrivals: analytics.lateArrivals.length,
          engagementActive: analytics.engagement.active,
        },
      });
    } else {
      logger.warn('[sessionController.getSessionAnalytics] Socket.IO instance not found', { sessionId });
    }

    res.json({ success: true, analytics });
  } catch (error) {
    logger.error('[sessionController.getSessionAnalytics] Error', {
      error: error.message,
      stack: error.stack,
      sessionId: req.params.sessionId,
    });
    res.status(500).json({ success: false, message: 'Failed to get analytics', error: error.message });
  }
};

const getResources = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  const userId = req.user._id.toString();

  try {
      const { session, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false); // Allow viewing resources even if session not active
      if (error) {
          logger.warn('[sessionController.getResources] Authorization failed or session not found', { sessionLinkSessionId, userId, error });
          return res.status(status).json({ success: false, message: error });
      }

      logger.info('[sessionController.getResources] Resources retrieved', { sessionDocId: session._id, count: session.resources?.length || 0 });
      res.json({ success: true, resources: session.resources || [] });

  } catch (error) {
      logger.error('[sessionController.getResources] Error fetching resources', {
          error: error.message,
          sessionLinkSessionId: sessionLinkSessionId,
          stack: error.stack
      });
      res.status(500).json({ success: false, message: 'Server error fetching resources' });
  }
};

const uploadResource = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  const file = req.file;
  const userId = req.user._id.toString();

  if (!file) {
    logger.warn('[sessionController.uploadResource] Missing file', { sessionLinkSessionId });
    return res.status(400).json({ success: false, message: 'Missing file' });
  }

  try {
    const { session, isCoach, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
    if (error) return res.status(status).json({ success: false, message: error });
    if (!isCoach) return res.status(403).json({ success: false, message: 'Only the coach can upload resources' });

    const result = await cloudinary.uploader.upload(file.path, {
      resource_type: 'auto',
      folder: `sessions/${session.bookingId.toString()}/resources`,
      tags: [sessionLinkSessionId, session.bookingId.toString(), 'session-resource'],
      public_id: `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`,
      max_file_size: 100 * 1024 * 1024,
    });

    const resource = {
      name: file.originalname,
      url: result.secure_url,
      size: result.bytes || file.size,
      type: file.mimetype,
      uploadedAt: new Date(),
    };

    session.resources = session.resources || [];
    session.resources.push(resource);
    await session.save();
    const addedResource = session.resources[session.resources.length - 1];
    logger.info('[sessionController.uploadResource] Resource added to session document', { sessionDocId: session._id, resourceId: addedResource._id, name: addedResource.name });

    // Emit via Socket.IO
    const io = req.app.get('io'); // Access Socket.IO instance
    if (io) {
      const videoIO = io.of('/video');
      const roomName = `session:${sessionLinkSessionId}`;
      videoIO.to(roomName).emit('resource-uploaded', addedResource);
      logger.info('[sessionController.uploadResource] Emitted resource-uploaded via Socket.IO', { roomName, resourceId: addedResource._id });
    } else {
      logger.error('[sessionController.uploadResource] Socket.IO instance not found');
    }

    res.status(201).json({ success: true, resource: addedResource });
  } catch (error) {
    logger.error('[sessionController.uploadResource] Upload process error:', { error: error.message, sessionLinkSessionId, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to upload resource', error: error.message });
  } finally {
    if (req.file?.path) await fs.unlink(req.file.path).catch((err) => logger.error('Failed to delete temp file', { error: err.message }));
  }
};

const deleteResource = async (req, res) => {
  const { sessionId: sessionLinkSessionId, resourceId } = req.params;
  const userId = req.user._id.toString();

  try {
    const { session, isCoach, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
    if (error) return res.status(status).json({ success: false, message: error });
    if (!isCoach) return res.status(403).json({ success: false, message: 'Only the coach can delete resources' });

    const resourceIndex = session.resources.findIndex((r) => r._id.toString() === resourceId);
    if (resourceIndex === -1) return res.status(404).json({ success: false, message: 'Resource not found' });

    session.resources.splice(resourceIndex, 1);
    await session.save();
    logger.info('[sessionController.deleteResource] Resource deleted from session', { sessionDocId: session._id, resourceId });

    // Emit via Socket.IO
    const io = req.app.get('io'); // Access Socket.IO instance
    if (io) {
      const videoIO = io.of('/video');
      const roomName = `session:${sessionLinkSessionId}`;
      videoIO.to(roomName).emit('resource-deleted', { resourceId });
      logger.info('[sessionController.deleteResource] Emitted resource-deleted via Socket.IO', { roomName, resourceId });
    } else {
      logger.error('[sessionController.deleteResource] Socket.IO instance not found');
    }

    res.status(200).json({ success: true, message: 'Resource deleted' });
  } catch (error) {
    logger.error('[sessionController.deleteResource] Delete process error:', { error: error.message, sessionLinkSessionId, resourceId, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to delete resource', error: error.message });
  }
};

const getPrivateNotes = async (req, res) => {
  const { sessionId: sessionLinkSessionId, userId } = req.params;
  const userIdAuth = req.user._id.toString();

  try {
    logger.info('[sessionController.getPrivateNotes] Fetching private notes', { sessionLinkSessionId, userId, requester: userIdAuth });
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionLinkSessionId });
    if (!booking) {
      logger.warn('[sessionController.getPrivateNotes] Booking not found', { sessionLinkSessionId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (userId !== userIdAuth) {
      logger.warn('[sessionController.getPrivateNotes] Unauthorized access attempt', { sessionLinkSessionId, userId, requester: userIdAuth });
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    let session = await Session.findOne({ bookingId: booking._id });
    if (!session) {
      logger.info('[sessionController.getPrivateNotes] Session not found, creating new', { bookingId: booking._id });
      session = new Session({ 
        bookingId: booking._id, 
        privateNotes: { [userId]: [{ id: 'default', title: 'Main Notes', html: '' }] }, 
        resources: [], 
        agenda: []
      });
      await session.save();
      logger.info('[sessionController.getPrivateNotes] Created new session with default notes', { sessionId: session._id });
    }

    // Migrate existing string-based notes if present
    let notesFiles = session.privateNotes?.get(userId);
    if (typeof notesFiles === 'string') {
      notesFiles = [{ id: 'default', title: 'Main Notes', html: notesFiles }];
      session.privateNotes.set(userId, notesFiles);
      await session.save();
      logger.info('[sessionController.getPrivateNotes] Migrated string-based notes to array', { sessionId: session._id, userId });
    }

    const finalNotesFiles = notesFiles && notesFiles.length > 0 
      ? notesFiles 
      : [{ id: 'default', title: 'Main Notes', html: '' }];
    logger.info('[sessionController.getPrivateNotes] Private notes retrieved', { sessionLinkSessionId, userId, notesCount: finalNotesFiles.length });
    res.json({ success: true, notesFiles: finalNotesFiles });
  } catch (error) {
    logger.error('[sessionController.getPrivateNotes] Error fetching private notes', { error: error.message, sessionLinkSessionId, userId });
    res.status(500).json({ success: false, message: 'Failed to fetch private notes', error: error.message });
  }
};

const updatePrivateNotes = async (req, res) => {
  const { sessionId: sessionLinkSessionId, userId } = req.params;
  const { notesFiles } = req.body;
  const userIdAuth = req.user._id.toString();

  try {
    logger.info('[sessionController.updatePrivateNotes] Updating private notes', { sessionLinkSessionId, userId, notesCount: notesFiles?.length });
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionLinkSessionId });
    if (!booking) {
      logger.warn('[sessionController.updatePrivateNotes] Booking not found', { sessionLinkSessionId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (userId !== userIdAuth) {
      logger.warn('[sessionController.updatePrivateNotes] Unauthorized update attempt', { sessionLinkSessionId, userId, requester: userIdAuth });
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (!Array.isArray(notesFiles)) {
      logger.warn('[sessionController.updatePrivateNotes] Invalid notesFiles format', { sessionLinkSessionId, userId });
      return res.status(400).json({ success: false, message: 'notesFiles must be an array' });
    }

    // Validate each note file object
    for (const file of notesFiles) {
      if (!file.id || !file.title || typeof file.html !== 'string') {
        logger.warn('[sessionController.updatePrivateNotes] Invalid note file structure', { sessionLinkSessionId, userId, file });
        return res.status(400).json({ success: false, message: 'Each note file must have id, title, and html properties' });
      }
    }

    const session = await Session.findOneAndUpdate(
      { bookingId: booking._id },
      { $set: { [`privateNotes.${userId}`]: notesFiles } },
      { new: true, upsert: true }
    );
    logger.info('[sessionController.updatePrivateNotes] Private notes updated', { sessionLinkSessionId, userId, sessionId: session._id });

    const io = req.io.of('/video');
    io.to(`session:${sessionLinkSessionId}`).emit('notes-updated-private', { userId, notesFiles });
    logger.info('[sessionController.updatePrivateNotes] Emitted notes-updated-private', { room: `session:${sessionLinkSessionId}`, userId });

    res.json({ success: true, notesFiles });
  } catch (error) {
    logger.error('[sessionController.updatePrivateNotes] Error updating private notes', { error: error.message, sessionLinkSessionId, userId });
    res.status(500).json({ success: false, message: 'Failed to update private notes', error: error.message });
  }
};

const getAgenda = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  const userId = req.user._id.toString();

  try {
    logger.info('[sessionController.getAgenda] Fetching agenda', { sessionLinkSessionId, userId });
    const { session, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false);
    if (error) {
      logger.warn('[sessionController.getAgenda] Authorization failed', { sessionLinkSessionId, userId, error });
      return res.status(status).json({ success: false, message: error });
    }

    // Ensure agenda is initialized if not present
    if (!session.agenda) {
      session.agenda = [];
      await session.save();
      logger.info('[sessionController.getAgenda] Initialized empty agenda', { sessionId: session._id });
    }

    logger.info('[sessionController.getAgenda] Agenda retrieved', { sessionLinkSessionId, agendaLength: session.agenda.length });
    res.json({ success: true, agenda: session.agenda });
  } catch (error) {
    logger.error('[sessionController.getAgenda] Error fetching agenda', { error: error.message, sessionLinkSessionId });
    res.status(500).json({ success: false, message: 'Failed to fetch agenda', error: error.message });
  }
};

const updateAgenda = async (req, res) => {
  const { sessionId: sessionLinkSessionId } = req.params;
  const { agenda } = req.body;
  const userId = req.user._id.toString();

  try {
    logger.info('[sessionController.updateAgenda] Updating agenda', { sessionLinkSessionId, userId, agendaLength: agenda?.length });
    const { session, booking, isCoach, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId);
    if (error) {
      logger.warn('[sessionController.updateAgenda] Authorization failed', { sessionLinkSessionId, userId, error });
      return res.status(status).json({ success: false, message: error });
    }

    if (!isCoach) {
      logger.warn('[sessionController.updateAgenda] Non-coach update attempt', { sessionLinkSessionId, userId });
      return res.status(403).json({ success: false, message: 'Only coach can update agenda' });
    }

    session.agenda = agenda || [];
    await session.save();
    logger.info('[sessionController.updateAgenda] Agenda updated', { sessionLinkSessionId, sessionId: session._id });

    const io = req.io.of('/video');
    io.to(`session:${sessionLinkSessionId}`).emit('agenda-updated', agenda);
    logger.info('[sessionController.updateAgenda] Emitted agenda-updated', { room: `session:${sessionLinkSessionId}` });

    res.json({ success: true, agenda });
  } catch (error) {
    logger.error('[sessionController.updateAgenda] Error updating agenda', { error: error.message, sessionLinkSessionId });
    res.status(500).json({ success: false, message: 'Failed to update agenda', error: error.message });
  }
};

const terminateSession = async (req, res) => {
  const { sessionId } = req.params; // sessionLink.sessionId
  const userId = req.user._id.toString();
  // Initialize logContext early, bookingId and sessionDocId will be added later
  const logContext = { sessionLinkSessionId: sessionId, userId, function: 'terminateSession V7' }; 
  logger.info(`[${logContext.function}] Request received`, logContext);

  const sessionDb = await mongoose.startSession();
  sessionDb.startTransaction({ readPreference: 'primary' });

  try {
      // Fetch booking and session within the transaction
      const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId })
                                   .select('+price +overtime +start +end +coach +user +sessionType') 
                                   .populate('coach', '_id settings.professionalProfile.hourlyRate firstName lastName email') 
                                   .populate('user', '_id firstName lastName email')
                                   .populate('sessionType', 'name')
                                   .session(sessionDb);

      if (!booking) {
          logger.warn(`[${logContext.function}] Booking not found`, logContext);
          await sessionDb.abortTransaction(); await sessionDb.endSession(); // Added await
          return res.status(404).json({ success: false, message: 'Booking not found' });
      }
      logContext.bookingId = booking._id.toString();
      logContext.coachId = booking.coach?._id?.toString();
      logContext.clientId = booking.user?._id?.toString();
      logger.debug(`[${logContext.function}] Found booking`, logContext);


      let session = await Session.findOne({ bookingId: booking._id }).session(sessionDb);
      // Handle missing session doc
       if (!session) {
           logger.warn(`[${logContext.function}] Session document missing, creating minimal ended session.`, logContext);
           const now = new Date();
           const newSession = new Session({ bookingId: booking._id, state: 'ended', endedAt: now, actualEndTime: now, sessionCompleted: false, terminationReason: 'Terminated (Session doc missing)' });
           await newSession.save({ session: sessionDb });
           await sessionDb.commitTransaction(); await sessionDb.endSession(); // Added await
           logger.info(`[${logContext.function}] Created and ended minimal session doc.`, { ...logContext, newSessionId: newSession._id });
           const videoIO = req.io?.of('/video');
           if (videoIO) videoIO.to(`session:${sessionId}`).emit('session-ended', { endedBy: userId, timestamp: now, isCompleted: false, reason: 'Terminated (Session doc missing)' });
           return res.json({ success: true, message: 'Session terminated (session doc missing).', captureStatus: 'not_applicable' });
      }
      logContext.sessionDocId = session._id.toString();
      logger.debug(`[${logContext.function}] Found session doc`, { ...logContext, currentState: session.state });


      if (session.state === 'ended') {
          logger.info(`[${logContext.function}] Session already ended`, logContext);
          await sessionDb.abortTransaction(); await sessionDb.endSession(); // Added await
          return res.status(400).json({ success: false, message: 'Session already ended' });
      }

      // Authorization
      if (booking.coach._id.toString() !== userId) {
           logger.warn(`[${logContext.function}] Unauthorized termination attempt`, { ...logContext });
           await sessionDb.abortTransaction(); await sessionDb.endSession(); // Added await
           throw new Error('Only the coach can terminate the session');
      }

      // --- Finalize Overtime Payment ---
      let finalCaptureStatus = 'not_applicable';
      let finalizeResult = null; // Define outside the block
      const hasAuthorizedSegment = session.overtimeSegments?.some(s => s.status === 'authorized');
      logContext.hasAuthorizedSegment = hasAuthorizedSegment;

      if (hasAuthorizedSegment) {
          logger.info(`[${logContext.function}] Found authorized segment, calling paymentService.finalizeOvertimePayment...`, logContext);
          finalizeResult = await paymentService.finalizeOvertimePayment(booking._id, new Date(), sessionDb); // Assign to outer variable
          finalCaptureStatus = finalizeResult.status;
          logContext.finalizationResultStatus = finalCaptureStatus;
          logContext.finalizationError = finalizeResult.error;
          logger.info(`[${logContext.function}] paymentService.finalizeOvertimePayment finished.`, logContext);


          // Apply updates returned by the service within the transaction
          if (finalizeResult.sessionUpdatePayload && finalizeResult.segmentId) {
              logger.debug(`[${logContext.function}] Attempting to apply Session update payload`, { ...logContext, segmentId: finalizeResult.segmentId, payload: finalizeResult.sessionUpdatePayload });
              const sessionUpdateResult = await Session.updateOne(
                  { _id: session._id, 'overtimeSegments._id': finalizeResult.segmentId },
                  finalizeResult.sessionUpdatePayload,
                  { arrayFilters: [{ 'elem._id': finalizeResult.segmentId }], session: sessionDb }
              );
               logger.debug(`[${logContext.function}] Applied Session update payload`, { ...logContext, updateResult: sessionUpdateResult });
                if (sessionUpdateResult.matchedCount === 0) {
                    logger.error(`[${logContext.function}] Failed to find Session segment for update!`, { ...logContext });
                    throw new Error("Failed to update session segment during termination.");
                }
                // Manually apply update to in-memory session object for correct state saving later
                const segmentIndex = session.overtimeSegments.findIndex(s => s._id.equals(finalizeResult.segmentId));
                 if (segmentIndex !== -1) {
                     const setPayload = finalizeResult.sessionUpdatePayload.$set;
                     if (setPayload) {
                         Object.keys(setPayload).forEach(key => {
                             if (key.startsWith('overtimeSegments.$[elem].')) {
                                 const field = key.substring('overtimeSegments.$[elem].'.length);
                                 session.overtimeSegments[segmentIndex][field] = setPayload[key];
                             }
                         });
                         logger.debug(`[${logContext.function}] Manually applied session segment update to in-memory object`, { ...logContext, updatedSegment: session.overtimeSegments[segmentIndex] });
                     }
                 }
          } else {
             logger.debug(`[${logContext.function}] No Session update payload returned from finalization service`, logContext);
          }

          if (finalizeResult.paymentUpdatePayload && finalizeResult.segmentId) {
              const segmentForPI = session.overtimeSegments.find(s => s._id.equals(finalizeResult.segmentId));
              if (segmentForPI?.paymentIntentId) {
                   logger.debug(`[${logContext.function}] Attempting to apply Payment update payload`, { ...logContext, paymentIntentId: segmentForPI.paymentIntentId, payload: finalizeResult.paymentUpdatePayload });
                  const paymentUpdateResult = await Payment.updateOne(
                      { 'stripe.paymentIntentId': segmentForPI.paymentIntentId },
                      finalizeResult.paymentUpdatePayload,
                      { session: sessionDb }
                  );
                  logger.debug(`[${logContext.function}] Applied Payment update payload`, { ...logContext, updateResult: paymentUpdateResult });
                  if (paymentUpdateResult.matchedCount === 0) {
                      logger.error(`[${logContext.function}] Failed to find Payment record for update!`, { ...logContext });
                      // Log and continue, as session state update is more critical for session end
                   }
               } else {
                  logger.error(`[${logContext.function}] Cannot update Payment record: Missing paymentIntentId on finalized segment.`, logContext);
               }
          } else {
              logger.debug(`[${logContext.function}] No Payment update payload returned from finalization service`, logContext);
          }

          // Handle capture failure logging and reason setting
          if (!finalizeResult.success) {
              logger.error(`[${logContext.function}] Overtime finalization FAILED.`, { ...logContext });
              if (!session.terminationReason) {
                  session.terminationReason = `Overtime processing error: ${finalizeResult.error || 'Unknown'}`;
                  logger.debug(`[${logContext.function}] Set terminationReason due to finalization failure`, { ...logContext, reason: session.terminationReason });
              }
          } else {
               logger.info(`[${logContext.function}] Overtime finalization processed successfully.`, { ...logContext });
          }
      } else {
           logger.info(`[${logContext.function}] No authorized overtime segments found for finalization.`, logContext);
      }

      // --- Update Session State ---
      const now = new Date();
      session.state = 'ended';
      session.endedAt = now;
      if (!session.actualEndTime || session.actualEndTime < now) {
           session.actualEndTime = now;
      }
      session.participants.forEach(p => { if (!p.leftAt) p.leftAt = now; });
      if (!session.terminationReason) session.terminationReason = `Ended by coach`;
      logContext.terminationReason = session.terminationReason;
      const coachParticipant = session.participants.find(p => p.userId.equals(booking.coach._id));
      const clientParticipant = session.participants.find(p => p.userId.equals(booking.user._id));
      const isCompleted = !!(coachParticipant?.joinedAt && clientParticipant?.joinedAt);
      session.sessionCompleted = isCompleted;
      logContext.isSessionCompleted = isCompleted;
      logger.info(`[${logContext.function}] Determined session completion status & final state`, { ...logContext, finalState: session.state, endedAt: session.endedAt });


      // --- Save Session ---
      await session.save({ session: sessionDb });
      logger.debug(`[${logContext.function}] Session document saved within transaction.`, logContext);

      // --- Commit Transaction ---
      await sessionDb.commitTransaction();
      logger.info(`[${logContext.function}] Session terminated and transaction committed.`, { ...logContext });


      // --- Emit and Notify AFTER successful commit ---
      const io = req.io;
      if (io) {
          const videoIO = io.of('/video');
          const roomName = `session:${sessionId}`;
          const eventPayload = {
                endedBy: userId, // Coach ID
                timestamp: now.toISOString(),
                isCompleted: session.sessionCompleted,
                reason: session.terminationReason,
                captureStatus: finalCaptureStatus
          };
          videoIO.to(roomName).emit('session-ended', eventPayload);
          logger.info(`[${logContext.function}] Emitted session-ended socket event`, { ...logContext, roomName, payload: eventPayload });
      } else {
           logger.warn(`[${logContext.function}] Socket.IO instance (io) not found on request object. Cannot emit session-ended.`, logContext);
      }
      
      // Post-Finalization Notifications
      if (finalizeResult && finalizeResult.userId && finalizeResult.coachId) { // Check if finalizeResult is populated
        try {
          if (finalizeResult.success) {
              const { userId: clientId, coachId, capturedAmount, currency, status: captureStatus } = finalizeResult;
              
              if (captureStatus === 'captured' || captureStatus === 'partially_captured') {
                  await UnifiedNotificationService.sendNotification({
                      type: NotificationTypes.OVERTIME_PAYMENT_CAPTURED, recipient: clientId, metadata: { bookingId: booking._id, sessionId: session._id, amount: capturedAmount, currency }
                  }, booking); 
                  logger.info(`[${logContext.function}] Sent OVERTIME_PAYMENT_CAPTURED notification to user ${clientId}`, { ...logContext, capturedAmount, currency });

                  await UnifiedNotificationService.sendNotification({
                      type: NotificationTypes.OVERTIME_PAYMENT_COLLECTED, recipient: coachId, metadata: { bookingId: booking._id, sessionId: session._id, amount: capturedAmount, currency, clientName: `${booking.user.firstName} ${booking.user.lastName}` }
                  }, booking);
                  logger.info(`[${logContext.function}] Sent OVERTIME_PAYMENT_COLLECTED notification to coach ${coachId}`, { ...logContext, capturedAmount, currency });

              } else if (captureStatus === 'released') {
                  await UnifiedNotificationService.sendNotification({
                      type: NotificationTypes.OVERTIME_PAYMENT_RELEASED, recipient: clientId, metadata: { bookingId: booking._id, sessionId: session._id }
                  }, booking);
                   logger.info(`[${logContext.function}] Sent OVERTIME_PAYMENT_RELEASED notification to user ${clientId}`, logContext);
              }
          } else if (finalizeResult.status === 'capture_failed') {
               logger.error(`[${logContext.function}] Capture failed post-authorization. Sending failure notification.`, { ...logContext, finalizeResult });
                await UnifiedNotificationService.sendNotification({
                    type: NotificationTypes.OVERTIME_PAYMENT_CAPTURE_FAILED, recipient: booking.coach._id, metadata: { bookingId: booking._id, sessionId: session._id, paymentIntentId: finalizeResult.paymentIntentId, error: finalizeResult.error }
                 }, booking);
               // Consider notifying admin
          }
        } catch (notificationError) {
           logger.error(`[${logContext.function}] Error sending post-finalization notification`, { ...logContext, notificationError: notificationError.message });
           // Don't fail the main request if notifications fail
        }
      } else {
          logger.info(`[${logContext.function}] Skipping post-finalization notifications as finalization was not attempted or finalizeResult missing user/coach IDs`, logContext);
      }

      const sessionEndedUserMetadata = { 
        bookingId: booking._id, 
        sessionId: session._id, 
        reason: session.terminationReason, 
        captureStatus: finalCaptureStatus 
    };
    if (finalizeResult && finalizeResult.success && (finalizeResult.status === 'captured' || finalizeResult.status === 'partially_captured')) {
      sessionEndedUserMetadata.amount = finalizeResult.capturedAmount;
      sessionEndedUserMetadata.currency = finalizeResult.currency;
  }
  await UnifiedNotificationService.sendNotification({ 
    type: NotificationTypes.SESSION_ENDED, 
    recipient: booking.user._id, 
    content: { title:"Session Ended", message: `Your session with ${booking.coach.firstName} has ended.`}, 
    metadata: sessionEndedUserMetadata 
}, booking, getSocketService()); // Use getSocketService()
logger.info(`[${logContext.function}] Sent SESSION_ENDED notification to user.`, {...logContext, metadataSent: sessionEndedUserMetadata});

const sessionEndedCoachMetadata = { ...sessionEndedUserMetadata }; // Copy for coach
await UnifiedNotificationService.sendNotification({ 
    type: NotificationTypes.SESSION_ENDED, 
    recipient: booking.coach._id, 
    content: { title:"Session Ended", message: `Your session with ${booking.user.firstName} has ended.`}, 
    metadata: sessionEndedCoachMetadata 
}, booking, getSocketService()); // Use getSocketService()
logger.info(`[${logContext.function}] Sent SESSION_ENDED notification to coach.`, {...logContext, metadataSent: sessionEndedCoachMetadata});
        return res.json({ success: true, message: 'Session terminated successfully', captureStatus: finalCaptureStatus });

  } catch (error) {
      logger.error(`[${logContext.function}] Error during termination process`, { ...logContext, errorMessage: error.message, stack: error.stack });
      if (sessionDb.inTransaction()) {
          await sessionDb.abortTransaction().catch(abortErr => logger.error(`[${logContext.function}] Error aborting transaction`, { abortErr }));
      }
      // sessionDb.endSession(); // Moved to finally
      const statusCode = error.message.includes('Unauthorized') || error.message.includes('Only the coach') ? 403
                       : error.message.includes('not found') ? 404
                       : error.message.includes('payment record') || error.message.includes('session segment') ? 500 // Treat DB update issues as internal
                       : 500;
      return res.status(statusCode).json({ success: false, message: `Failed to terminate session: ${error.message}` });
  } finally { 
      if (sessionDb && sessionDb.endSession) {
           await sessionDb.endSession().catch(endErr => logger.error(`[${logContext.function}] Error ending sessionDb session in finally block`, { endErr }));
      }
  }
};

const triggerOvertimePrompt = async (io, sessionId, booking, session) => {
  try {
    console.log('[sessionController.triggerOvertimePrompt] Triggering overtime prompt', { sessionId });

    if (!booking.overtime?.allowOvertime || session.state !== 'active') {
      logger.warn('[sessionController.triggerOvertimePrompt] Overtime not allowed or session inactive', { 
        sessionId, 
        sessionState: session.state 
      });
      return;
    }

    const coach = await User.findById(booking.coach._id);
    const hourlyRate = coach.settings?.professionalProfile?.hourlyRate || 100;
    const paidDuration = booking.overtime.paidOvertimeDuration || 0;
    const overtimeCost = (hourlyRate * (booking.overtime.overtimeRate / 100) * paidDuration) / 60;

    const notificationData = {
      type: 'OVERTIME_PROMPT',
      category: 'session',
      priority: 'high',
      channels: ['in_app', 'email'],
      requiresAction: true,
      metadata: {
        bookingId: booking._id,
        sessionId: session._id,
        overtimeOptions: {
          end: {},
          free: { duration: booking.overtime.freeOvertimeDuration },
          paid: paidDuration > 0 ? { duration: paidDuration, cost: overtimeCost } : null
        }
      }
    };

    // Coach notification
    await UnifiedNotificationService.sendNotification(
      {
        ...notificationData,
        recipient: booking.coach._id,
        content: {
          title: 'Session Overtime Prompt',
          message: `Session ending soon. Choose: End, Free (${booking.overtime.freeOvertimeDuration} min), or Paid (${paidDuration} min at ${overtimeCost.toFixed(2)} CHF)`,
          data: {
            actions: [
              { type: 'end_session', label: 'End Session', endpoint: `/sessions/${sessionId}/overtime`, data: { choice: 'end' } },
              { type: 'free_overtime', label: `Free (${booking.overtime.freeOvertimeDuration} min)`, endpoint: `/sessions/${sessionId}/overtime`, data: { choice: 'free' } },
              ...(paidDuration > 0 ? [{ type: 'paid_overtime', label: `Paid (${paidDuration} min)`, endpoint: `/sessions/${sessionId}/overtime`, data: { choice: 'paid' } }] : [])
            ]
          }
        }
      },
      booking
    );
    console.log('[sessionController.triggerOvertimePrompt] Sent overtime prompt to coach', { 
      sessionId, 
      recipient: booking.coach._id 
    });

    // User notification (if paid overtime available)
    if (paidDuration > 0) {
      await UnifiedNotificationService.sendNotification(
        {
          ...notificationData,
          recipient: booking.user._id,
          content: {
            title: 'Session Overtime Payment Required',
            message: `Session can extend for ${paidDuration} min at ${overtimeCost.toFixed(2)} CHF. Confirm payment to continue.`,
            data: {
              actions: [
                { type: 'confirm_payment', label: 'Confirm Payment', endpoint: `/sessions/${sessionId}/overtime`, data: { choice: 'confirm' } },
                { type: 'decline_overtime', label: 'Decline', endpoint: `/sessions/${sessionId}/overtime`, data: { choice: 'decline' } }
              ]
            }
          }
        },
        booking
      );
      console.log('[sessionController.triggerOvertimePrompt] Sent overtime prompt to user', { 
        sessionId, 
        recipient: booking.user._id 
      });
    }

    const videoIO = io.of('/video');
    videoIO.to(`session:${sessionId}`).emit('overtime-prompt', {
      bookingId: booking._id,
      sessionId: session._id,
      options: notificationData.metadata.overtimeOptions
    });
    console.log('[sessionController.triggerOvertimePrompt] Emitted overtime-prompt event', { sessionId });
  } catch (error) {
    logger.error('[sessionController.triggerOvertimePrompt] Error:', { 
      error: error.message, 
      stack: error.stack,
      sessionId 
    });
  }
};

const handleOvertimeResponse = async (req, res) => {
  const { sessionId } = req.params; // sessionLink.sessionId
  const receivedSessionId = req.params.sessionId;
 console.log(`[handleOvertimeResponse V6] Received request. Session ID from params: ${receivedSessionId}`, { body: req.body, userId: req.user?._id });
 const { choice, customDuration, calculatedOvertimePrice, paymentIntentId } = req.body;
 const userId = req.user._id.toString();
 const logContext = { sessionLinkSessionId: receivedSessionId, choice, userId, customDuration, paymentIntentId, frontendPrice: calculatedOvertimePrice };
  // Refined Log V5
  console.log('[handleOvertimeResponse V5] Processing response', logContext);

  const sessionDb = await mongoose.startSession();
  sessionDb.startTransaction({ readPreference: 'primary' });

  try {
      // Fetch booking and session within the transaction
      const booking = await Booking.findOne({ 'sessionLink.sessionId': receivedSessionId })
                                   .select('+price +overtime +start +end +coach +user') // Select all needed fields
                                   .populate('coach', '_id firstName lastName') // Populate needed fields
                                   .populate('user', '_id firstName lastName stripe') // Populate needed fields, including stripe for customerId
                                   .session(sessionDb);

      if (!booking) throw new Error('Booking not found');
      logContext.bookingId = booking._id.toString();

      let session = await Session.findOne({ bookingId: booking._id }).session(sessionDb);
      if (!session) {
          logger.warn('[handleOvertimeResponse V5] Session document missing, creating one.', logContext);
          session = new Session({ bookingId: booking._id, state: 'active', participants: [] }); // Assume active, initialize participants
      }
      logContext.sessionDocId = session._id.toString();

      // Authorization & State Check
      const isCoach = booking.coach._id.toString() === userId;
      const isUser = booking.user._id.toString() === userId;
      const userRole = isCoach ? 'coach' : (isUser ? 'participant' : null);
      if (!userRole) throw new Error('Unauthorized for this session.');
      if (session.state === 'ended') throw new Error('Session has already ended.');

      session.overtimeSegments = session.overtimeSegments || [];
      const videoIO = req.io?.of('/video'); // Safely access io from request
      const roomName = `session:${sessionId}`;

      // --- Coach Logic ---
      if (isCoach) {
          logger.debug('[handleOvertimeResponse V5] Processing COACH action', logContext);

          if (choice === 'end') {
              // Mark relevant segments as declined
              session.overtimeSegments.forEach(seg => {
                  if (['requested', 'pending_confirmation'].includes(seg.status)) {
                      seg.status = 'declined';
                       console.log('[handleOvertimeResponse V5] Marked segment as declined due to coach END choice', { ...logContext, segmentId: seg._id });
                  }
              });
              // Note: We don't end the session here directly.
              // We save the declined state and rely on the frontend or session monitoring
              // to trigger the actual termination via the terminateSession endpoint.
              await session.save({ session: sessionDb });
              await sessionDb.commitTransaction(); sessionDb.endSession();
              console.log('[handleOvertimeResponse V5] Coach chose END. Session overtime state saved.', logContext);
              if (videoIO) videoIO.to(roomName).emit('overtime-response', { userId, choice: 'end', message: 'Coach requested session end.' });
              return res.json({ success: true, message: 'Session end requested by coach.' });


          } else if (choice === 'free') {
              const freeDuration = booking.overtime?.freeOvertimeDuration || 0;
              if (freeDuration > 0) {
                  session.overtimeSegments.forEach(seg => { if (seg.status === 'requested') seg.status = 'declined'; });
                  // Determine the correct base time to add free overtime onto
                  const lastConfirmedEndTime = session.actualEndTime || new Date(booking.end); // Use current end time or booking end
                  // Ensure we don't add free time multiple times accidentally
                  // Find the latest segment that wasn't declined
                  const latestRelevantSegment = session.overtimeSegments?.slice().reverse().find(s => s.status !== 'declined');
                  let newEndTime;
                  if (latestRelevantSegment && latestRelevantSegment.authorizedAt) {
                       // If paid OT was authorized, add free OT *after* its end time (unlikely scenario, but defensive)
                       newEndTime = new Date(latestRelevantSegment.authorizedAt.getTime() + (latestRelevantSegment.requestedDuration * 60000) + (freeDuration * 60000));
                  } else {
                       // Standard case: Add free time after the originally scheduled end + grace (or current actualEndTime if later)
                       const scheduledEndOfGrace = new Date(booking.end).getTime() + (5 * 60000);
                       const baseTimeForFree = Math.max(lastConfirmedEndTime.getTime(), scheduledEndOfGrace);
                       newEndTime = new Date(baseTimeForFree + freeDuration * 60000);
                  }

                  session.actualEndTime = newEndTime;
                  await session.save({ session: sessionDb });
                  await sessionDb.commitTransaction(); sessionDb.endSession();
                  if (videoIO) videoIO.to(roomName).emit('session-continued', { newEndTime: session.actualEndTime, reason: 'free_overtime' });
                  console.log('[handleOvertimeResponse V5] Coach chose FREE overtime', { ...logContext, newEndTime: session.actualEndTime.toISOString() });
                  return res.json({ success: true, choice, actualEndTime: session.actualEndTime });
              } else {
                  throw new Error('Free overtime not configured.');
              }

            } else if (choice === 'request_paid') {
              if (!booking.overtime?.allowOvertime) {
                logger.warn('[handleOvertimeResponse V7] Paid overtime not allowed for this booking.', logContext);
                throw new Error('Paid overtime not allowed.');
              }

              const requestedDuration = customDuration ? parseInt(customDuration, 10) : booking.overtime.paidOvertimeDuration;
              if (isNaN(requestedDuration) || requestedDuration <= 0 || requestedDuration > 120) { // Max 2 hours overtime request
                logger.warn('[handleOvertimeResponse V7] Invalid requested overtime duration.', { ...logContext, requestedDuration });
                throw new Error('Invalid duration requested (must be 1-120 minutes).');
              }

              // Validate the calculatedOvertimePrice from the frontend for basic sanity
              if (!calculatedOvertimePrice || typeof calculatedOvertimePrice.amount !== 'number' || calculatedOvertimePrice.amount < 0 || typeof calculatedOvertimePrice.currency !== 'string' || calculatedOvertimePrice.currency.length !== 3) {
                logger.error('[handleOvertimeResponse V7] Invalid calculatedOvertimePrice object from coach request.', { ...logContext, price: calculatedOvertimePrice });
                throw new Error('Invalid price data received from client. Price must be a positive number with a valid currency.');
              }
              // Optional: Add a check if amount is 0 for a paid request, which might be an error state
              if (calculatedOvertimePrice.amount === 0 && requestedDuration > 0) {
                logger.warn('[handleOvertimeResponse V7] Coach requested paid overtime with zero amount.', { ...logContext, price: calculatedOvertimePrice, requestedDuration });
                // Depending on policy, you might throw an error or allow it if "free paid overtime" is a concept
                // For now, let's assume a paid request should have a price > 0 if duration > 0
                // throw new Error('Paid overtime request cannot have a zero amount for a non-zero duration.');
              }

              logger.info('[handleOvertimeResponse V7] Coach requesting paid overtime with validated frontend price.', {
                ...logContext,
                requestedDuration,
                frontendCalculatedPrice: calculatedOvertimePrice
              });
            
              const existingPendingRequest = session.overtimeSegments.find(s => s.status === 'requested' || s.status === 'pending_confirmation');
              if (existingPendingRequest) {
                logger.warn('[handleOvertimeResponse V7] Coach tried to request paid OT while another request is already pending.', { ...logContext, existingSegmentId: existingPendingRequest._id, existingStatus: existingPendingRequest.status });
                throw new Error('Another overtime request is already in progress. Please wait or cancel the existing one.');
              }
            
              const newSegment = {
                _id: new mongoose.Types.ObjectId(),
                status: 'requested',
                requestedDuration: requestedDuration,
                calculatedMaxPrice: { // Store the validated price from the coach's client
                    amount: parseFloat(calculatedOvertimePrice.amount.toFixed(2)), // Ensure 2 decimal places
                    currency: calculatedOvertimePrice.currency.toUpperCase()
                },
                requestedAt: new Date()
              };
              session.overtimeSegments.push(newSegment);
              await session.save({ session: sessionDb });
              await sessionDb.commitTransaction(); 
              sessionDb.endSession(); // End session early after successful save & commit
              
              logger.info('[handleOvertimeResponse V7] Coach requested PAID overtime. Segment created and saved.', { ...logContext, segmentId: newSegment._id.toString(), storedMaxPrice: newSegment.calculatedMaxPrice });

              // Emit prompt ONLY to the user participant socket
              const userSocket = findUserSocket(booking.user._id, req.io); 
              if (userSocket && videoIO) {
                   const promptPayload = {
                        metadata: {
                             sessionId, 
                             bookingId: booking._id.toString(),
                             overtimeOptions: [ 
                                { type: 'authorize' },
                                { type: 'decline' }
                             ],
                             requestedDuration: newSegment.requestedDuration,
                             calculatedMaxPrice: newSegment.calculatedMaxPrice 
                        }
                   };
                   videoIO.to(userSocket.id).emit('overtime-prompt', promptPayload);
                   logger.info('[handleOvertimeResponse V7] Emitted overtime-prompt to specific user socket.', { ...logContext, userIdToPrompt: booking.user._id.toString(), socketId: userSocket.id });
              } else {
                  logger.warn('[handleOvertimeResponse V7] User socket or videoIO not available for direct prompt.', { ...logContext, userIdToPrompt: booking.user._id.toString(), hasUserSocket: !!userSocket, hasVideoIO: !!videoIO });
              }
              return res.json({ success: true, message: 'Paid overtime requested. Waiting for user authorization.' });
          } else {
              throw new Error('Invalid choice from coach.');
          }
      
      }
      // --- User Logic ---
      else if (isUser) {
          logger.debug('[handleOvertimeResponse V5] Processing USER action', logContext);
          let targetSegment;

           // Find the relevant segment based on the action
           if (choice === 'prepare_authorize' || choice === 'decline') {
               targetSegment = session.overtimeSegments
                   .filter(s => s.status === 'requested') // Only find 'requested' segments
                   .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0))[0]; // Get the latest 'requested'
           } else if (choice === 'confirm_authorize' || choice === 'authorization_failed') {
               if (!paymentIntentId) throw new Error('Missing paymentIntentId for confirmation/failure reporting.');
               logContext.paymentIntentId = paymentIntentId;
               targetSegment = session.overtimeSegments.find(s => s.paymentIntentId === paymentIntentId);
           }

           // Handle cases where the relevant segment isn't found or in the wrong state
           if (!targetSegment) {
               logger.warn('[handleOvertimeResponse V5] Target segment not found for user action', logContext);
               throw new Error('No relevant overtime request found or specified payment intent ID is invalid.');
           }
           logContext.segmentId = targetSegment._id.toString();
           logContext.segmentStatus = targetSegment.status;


           // --- Handle specific user choices ---
           if (choice === 'prepare_authorize') {
               if (targetSegment.status !== 'requested') throw new Error(`Cannot prepare authorization for segment in status: ${targetSegment.status}`);

               // Use duration from the found segment (ignore customDuration from user request body for security)
               const requestedDuration = targetSegment.requestedDuration;
               // Security/Validation Checks: Use price from the stored segment, validate against frontend price
               const segmentPrice = targetSegment.calculatedMaxPrice;
               if (!segmentPrice || typeof segmentPrice.amount !== 'number' || segmentPrice.amount < 0) throw new Error('Invalid stored price in segment.');

               if (!calculatedOvertimePrice || typeof calculatedOvertimePrice.amount !== 'number' ||
                   Math.abs(calculatedOvertimePrice.amount - segmentPrice.amount) > 0.01 || // Allow 1 cent difference
                   calculatedOvertimePrice.currency.toUpperCase() !== segmentPrice.currency.toUpperCase()) {
                   logger.error('[handleOvertimeResponse V5] Price mismatch (User prepare)', { ...logContext, segmentPrice, userPrice: calculatedOvertimePrice });
                   throw new Error('Price mismatch detected. Please refresh and try again.');
               }

               // Idempotency Check: If PI already exists (e.g., user clicked twice quickly)
               if (targetSegment.paymentIntentId) {
                    logger.warn('[handleOvertimeResponse V5] Payment already prepared for this segment', logContext);
                    const existingPayment = await Payment.findOne({'stripe.paymentIntentId': targetSegment.paymentIntentId}).session(sessionDb);
                    await sessionDb.commitTransaction(); sessionDb.endSession(); // Commit before early return
                    return res.json({ success: true, message: 'Payment already prepared.', clientSecret: existingPayment?.stripe?.clientSecret, paymentIntentId: targetSegment.paymentIntentId });
               }

               // Call authorize service (using validated price from segment)
               const authResult = await paymentController.authorizeOvertimePayment(booking, session, userId, segmentPrice); // Pass segmentPrice

               // Update segment (in memory)
               targetSegment.paymentIntentId = authResult.paymentIntentId;
               targetSegment.status = 'pending_confirmation';

               await session.save({ session: sessionDb });
               await sessionDb.commitTransaction(); sessionDb.endSession();
               console.log('[handleOvertimeResponse V5] Overtime payment prepared (manual capture)', { ...logContext, paymentIntentId: authResult.paymentIntentId });
               return res.json({ success: true, message: 'Payment prepared.', clientSecret: authResult.clientSecret, paymentIntentId: authResult.paymentIntentId });

           } else if (choice === 'confirm_authorize') {
               // --- Refined V5: Explicit Payment record update ---
               if (targetSegment.status !== 'pending_confirmation') {
                   if (targetSegment.status === 'authorized') {
                        logger.warn('[handleOvertimeResponse V5] Overtime already confirmed for this segment', logContext);
                        await sessionDb.commitTransaction(); sessionDb.endSession();
                        return res.json({ success: true, message: 'Overtime already confirmed.', actualEndTime: session.actualEndTime });
                   }
                   throw new Error(`Cannot confirm authorization for segment in status: ${targetSegment.status}`);
               }

               // Verify Stripe Intent Status directly
               logger.debug('[handleOvertimeResponse V6] Verifying Stripe Intent status for confirm_authorize', logContext);
               const intent = await paymentService.retrievePaymentIntent(paymentIntentId);
               logContext.stripeIntentStatus = intent.status; // Log the fetched status
               console.log('[handleOvertimeResponse V6] Stripe Intent status verified', logContext);
               if (intent.status !== 'requires_capture') {
                  logger.error('[handleOvertimeResponse V5] Stripe Intent not ready for capture', { ...logContext, status: intent.status });
                  targetSegment.status = 'failed'; // Mark segment as failed
                  targetSegment.captureResult = { status: 'failed', error: `Invalid Stripe intent status: ${intent.status}` };
                  await Payment.updateOne( // Update associated Payment record
                      { 'stripe.paymentIntentId': paymentIntentId },
                      { $set: { status: 'failed', error: { message: `Invalid Stripe intent status: ${intent.status}` } } },
                      { session: sessionDb }
                  );
                  await session.save({ session: sessionDb });
                  await sessionDb.commitTransaction(); sessionDb.endSession(); // Commit failure state
                  throw new Error(`Payment not ready for confirmation (Status: ${intent.status}). Please try again or contact support.`);
               }
               console.log('[handleOvertimeResponse V5] Stripe Intent status verified as requires_capture', logContext);

               // --- Update Session Segment (In Memory) ---
               targetSegment.status = 'authorized';
               targetSegment.authorizedAt = new Date();
               targetSegment.captureResult = null;

               // --- Update Session End Time (In Memory) ---
               let baseEndTimeMs;
                const baseBookingDurationMs = (new Date(booking.end).getTime() - new Date(booking.start).getTime());
                const graceMs = 5 * 60000; // 5 minutes grace period
                const freeOvertimeMs = (booking.overtime?.freeOvertimeDuration || 0) * 60000;

                // Find latest segment that's *already* authorized and *before* the current targetSegment
                // This correctly handles cumulative overtime.
                const previousAuthorizedSegments = session.overtimeSegments
                    .filter(s => s.status === 'authorized' && s.authorizedAt && s._id.toString() !== targetSegment._id.toString())
                    .sort((a, b) => new Date(b.authorizedAt).getTime() - new Date(a.authorizedAt).getTime()); // Sort by most recent authorizedAt

                if (previousAuthorizedSegments.length > 0) {
                    const lastPrevSegment = previousAuthorizedSegments[0];
                    // The new base is the end time of the previously authorized segment
                    baseEndTimeMs = new Date(lastPrevSegment.authorizedAt).getTime() + (lastPrevSegment.requestedDuration * 60000);
                     logger.debug('[handleOvertimeResponse V7] Calculated baseEndTimeMs from previous authorized segment', { ...logContext, prevSegmentEnd: new Date(baseEndTimeMs).toISOString() });
                } else {
                    // No previous *paid* segments, base off original schedule + free OT + grace
                    // Use session.actualStartTime if available (coach started late), else booking.start
                    const sessionEffectiveStartTime = session.actualStartTime || new Date(booking.start);
                    baseEndTimeMs = new Date(sessionEffectiveStartTime).getTime() + baseBookingDurationMs + graceMs + freeOvertimeMs;
                     logger.debug('[handleOvertimeResponse V7] Calculated baseEndTimeMs from original schedule + free/grace', { ...logContext, sessionEffectiveStartTime: sessionEffectiveStartTime.toISOString(), baseBookingDurationMs, graceMs, freeOvertimeMs, initialBaseEnd: new Date(baseEndTimeMs).toISOString() });
                }
                
                session.actualEndTime = new Date(baseEndTimeMs + (targetSegment.requestedDuration * 60000));
                logContext.newActualEndTime = session.actualEndTime.toISOString();
                logger.info('[handleOvertimeResponse V7] Updated session.actualEndTime in memory', { ...logContext, calculatedBaseEndTime: new Date(baseEndTimeMs).toISOString(), finalActualEndTime: session.actualEndTime.toISOString() });

               // --- Update Payment Record (Within Transaction) ---
               logger.debug('[handleOvertimeResponse V6] Updating Payment record status to authorized', logContext);
               const paymentUpdateResult = await Payment.updateOne(
                  { 'stripe.paymentIntentId': paymentIntentId },
                  { $set: { status: 'authorized', 'amount.authorized': targetSegment.calculatedMaxPrice.amount, error: null } }, // Set status, authorized amount, clear errors
                  { session: sessionDb }
               );
               logContext.paymentUpdateResult = paymentUpdateResult; 
               logger.debug('[handleOvertimeResponse V6] Payment record update result', logContext);
               if (paymentUpdateResult.matchedCount === 0) {
                    logger.error("[handleOvertimeResponse V5] Failed to find Payment record for update during confirm_authorize!", { ...logContext });
                    throw new Error("Failed to update payment record during confirmation.");
               }
               logger.debug('[handleOvertimeResponse V5] Payment record updated to authorized', logContext);

               console.log(`[${logContext.function}] CONFIRM_AUTHORIZE: BEFORE SAVE. Target Segment:`, {
                ...logContext,
                segmentToSave: {
                    id: targetSegment._id.toString(),
                    status: targetSegment.status, // Should be 'authorized'
                    authorizedAt: targetSegment.authorizedAt, // Should be new Date()
                    paymentIntentId: targetSegment.paymentIntentId,
                    captureResult: targetSegment.captureResult // Should be undefined
                }
            });
          console.log(`[${logContext.function}] CONFIRM_AUTHORIZE: BEFORE SAVE. Full session.overtimeSegments in memory:`, {
                ...logContext,
                allSegmentsInMemory: session.overtimeSegments.map(s => ({
                    id: s._id.toString(),
                    status: s.status,
                    authorizedAt: s.authorizedAt,
                    paymentIntentId: s.paymentIntentId,
                    captureResult: s.captureResult // Log captureResult here
                }))
            });

               // --- Save Session (Includes updated segment) ---
               await session.save({ session: sessionDb });
               logger.debug('[handleOvertimeResponse V5] Session saved with updated segment and end time', logContext);

               // --- Commit Transaction ---
               await sessionDb.commitTransaction(); sessionDb.endSession();
               console.log('[handleOvertimeResponse V5] Overtime authorization confirmed and transaction committed', { ...logContext, newEndTime: session.actualEndTime.toISOString() });

               // --- Emit events AFTER successful commit ---
               if (videoIO) {
                   videoIO.to(roomName).emit('session-continued', { newEndTime: session.actualEndTime.toISOString() });
                   videoIO.to(roomName).emit('overtime-response', { userId, choice: 'authorize', actualEndTime: session.actualEndTime.toISOString() });
                   videoIO.to(roomName).emit('authorization_confirmed', { paymentIntentId, bookingId: booking._id.toString() });
                   console.log('[handleOvertimeResponse V5] Emitted socket events after confirmation', logContext);
               } else {
                   logger.warn('[handleOvertimeResponse V5] videoIO not available, skipping socket events', logContext);
               }
               return res.json({ success: true, message: 'Overtime confirmed.', actualEndTime: session.actualEndTime });

           } else if (choice === 'authorization_failed') {
               if (!targetSegment) throw new Error('Failure reporting failed: Target segment not found.');
               // Only update if pending, prevent overwriting other final states
               if (targetSegment.status === 'pending_confirmation' || targetSegment.status === 'requested') {
                   targetSegment.status = 'failed';
                   targetSegment.captureResult = { status: 'failed', error: 'Client-side SCA failed or cancelled', capturedAt: new Date() };

                   // Update Payment record status
                   await Payment.updateOne(
                       { 'stripe.paymentIntentId': paymentIntentId },
                       { $set: { status: 'failed', error: { message: 'Client-side SCA failed or cancelled' }, updatedAt: new Date() } },
                       { session: sessionDb }
                   );
                   console.log('[handleOvertimeResponse V5] Marked segment and payment as failed due to client-side auth failure', logContext);

                   // Optionally try to cancel the Payment Intent on Stripe side (best effort)
                    try {
                       if(targetSegment.paymentIntentId) { // Ensure we have PI ID
                           await paymentService.cancelPaymentIntent(targetSegment.paymentIntentId);
                           console.log('[handleOvertimeResponse V5] Attempted to cancel Stripe PaymentIntent after client-side failure.', { ...logContext });
                       }
                    } catch (cancelError) {
                       logger.error('[handleOvertimeResponse V5] Failed to cancel Stripe PI after client-side failure', { ...logContext, cancelError: cancelError.message });
                    }

                    await session.save({ session: sessionDb });

               } else {
                   logger.warn('[handleOvertimeResponse V5] Received authorization_failed for segment not in expected state', { ...logContext, segmentStatus: targetSegment.status });
               }
               await sessionDb.commitTransaction(); sessionDb.endSession();
               if (videoIO) videoIO.to(roomName).emit('overtime-response', { userId, choice: 'authorization_failed' });
               return res.json({ success: true, message: 'Authorization failure reported.' });

           } else if (choice === 'decline') {
               if (targetSegment?.status === 'requested') { // Only decline if actually requested
                   targetSegment.status = 'declined';
                    console.log('[handleOvertimeResponse V5] User declined overtime request', logContext);
                   await session.save({ session: sessionDb });
               } else {
                    logger.warn('[handleOvertimeResponse V5] Decline received but no segment in requested state found.', logContext);
               }
               await sessionDb.commitTransaction(); sessionDb.endSession();
               if (videoIO) videoIO.to(roomName).emit('overtime-response', { userId, choice: 'decline' });
               // Notify coach?
               const coachSocket = findUserSocket(booking.coach._id, req.io);
               if (coachSocket && videoIO) {
                    videoIO.to(coachSocket.id).emit('user-overtime-declined', { userId: booking.user._id, name: booking.user.firstName });
                    console.log('[handleOvertimeResponse V5] Notified coach via socket about user decline', { coachId: booking.coach._id });
               }

               return res.json({ success: true, message: 'Overtime declined.' });

           } else {
               throw new Error('Invalid choice from user.');
           }
       } else {
           throw new Error('Unauthorized action.');
       }

  } catch (error) {
      if (sessionDb.inTransaction()) {
          await sessionDb.abortTransaction().catch(abortErr => logger.error("[handleOvertimeResponse V5] Error aborting transaction", { abortErr }));
      }
      sessionDb.endSession();
      logger.error('[handleOvertimeResponse V5] General Error:', { ...logContext, errorMessage: error.message, stack: error.stack });
      const statusCode = error.message.includes('mismatch') || error.message.includes('Invalid') || error.message.includes('required') || error.message.includes('not ready') ? 400
                       : error.message.includes('Unauthorized') ? 403
                       : error.message.includes('not found') ? 404
                       : 500;
      return res.status(statusCode).json({ success: false, message: `Failed to handle overtime response: ${error.message}` });
  }
};

// Placeholder for socket lookup - replace with your actual implementation
const findUserSocket = (userId) => {
    // Example: Loop through connected sockets in the video namespace
    // const videoIO = req.io.of('/video');
    // const sockets = await videoIO.fetchSockets();
    // return sockets.find(socket => socket.data.userId === userId);
    logger.warn('[findUserSocket] Placeholder function called. Implement actual socket lookup.', { userId });
    return null;
};

const setOvertimeChoiceDev = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.warn('[sessionController.setOvertimeChoiceDev] Attempted access outside development environment.');
    return res.status(403).json({ success: false, message: 'Forbidden: Dev endpoint only.' });
  }

  const { sessionId } = req.params; // sessionLink.sessionId
  const { coachChoice, requestedDuration, calculatedOvertimePrice } = req.body; // Add price
  const userId = req.user._id.toString();

  console.log('[sessionController.setOvertimeChoiceDev] Received request', {
    sessionLinkSessionId: sessionId, coachChoice, requestedDuration, calculatedOvertimePrice, userId, timestamp: new Date().toISOString()
  });

  // Validation
  if (!coachChoice || !['free', 'paid', 'reset'].includes(coachChoice)) return res.status(400).json({ success: false, message: "Invalid 'coachChoice'." });
  if (coachChoice === 'paid' && (typeof requestedDuration !== 'number' || requestedDuration <= 0)) return res.status(400).json({ success: false, message: "Valid 'requestedDuration' required for 'paid'." });
  if (coachChoice === 'paid' && (!calculatedOvertimePrice || typeof calculatedOvertimePrice.amount !== 'number' || calculatedOvertimePrice.amount < 0 || typeof calculatedOvertimePrice.currency !== 'string')) {
      return res.status(400).json({ success: false, message: "Valid 'calculatedOvertimePrice' object {amount, currency} required for 'paid'." });
  }

  const sessionDb = await mongoose.startSession();
  sessionDb.startTransaction();
  try {
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId }).session(sessionDb);
    if (!booking) { await sessionDb.abortTransaction(); sessionDb.endSession(); return res.status(404).json({ success: false, message: 'Booking not found' }); }
    const session = await Session.findOne({ bookingId: booking._id }).session(sessionDb);
    if (!session) {
      logger.warn('[sessionController.setOvertimeChoiceDev] Session document missing, creating one.');
      session = new Session({ bookingId: booking._id, state: 'active', participants: [] });
    } else if (session.state === 'ended') {
      console.log('[sessionController.setOvertimeChoiceDev] Resetting ended session to active for DEV testing');
      session.state = 'active';
      session.endedAt = null;
      session.terminationReason = null;
      session.sessionCompleted = false;
    }

    session.overtimeSegments = session.overtimeSegments || [];
    // Remove existing 'requested' or 'pending_confirmation' segments
     session.overtimeSegments = session.overtimeSegments.filter(s => !['requested', 'pending_confirmation'].includes(s.status));

    if (coachChoice === 'reset') {
        console.log('[sessionController.setOvertimeChoiceDev] Resetting overtime state', { sessionId: session._id });
    } else if (coachChoice === 'paid') {
         const newSegment = {
            status: 'requested',
            requestedAt: new Date(),
            requestedDuration: requestedDuration,
            calculatedMaxPrice: calculatedOvertimePrice, // Store the price
        };
        session.overtimeSegments.push(newSegment);
         console.log('[sessionController.setOvertimeChoiceDev] Setting state to PAID/REQUESTED', { sessionId: session._id, segment: newSegment });
    } else if (coachChoice === 'free') {
        console.log('[sessionController.setOvertimeChoiceDev] Setting state to FREE', { sessionId: session._id });
    }

    await session.save({ session: sessionDb });
    await sessionDb.commitTransaction();
    sessionDb.endSession();

    const latestSegment = session.overtimeSegments[session.overtimeSegments.length - 1];

    console.log('[sessionController.setOvertimeChoiceDev] Session overtime state updated successfully via DEV endpoint', {
      sessionId: session._id, newState: coachChoice, newSegmentId: latestSegment?._id, newSegmentStatus: latestSegment?.status,
    });

    res.json({
      success: true, message: `Session overtime state DEV set to '${coachChoice}'`,
      updatedSession: { _id: session._id, overtimeSegments: session.overtimeSegments }
    });

  } catch (error) {
    if (sessionDb.inTransaction()) await sessionDb.abortTransaction().catch(e => logger.error("Abort err", {e}));
    sessionDb.endSession();
    logger.error('[sessionController.setOvertimeChoiceDev] Error updating session state', { error: error.message, stack: error.stack, sessionLinkSessionId: sessionId });
    res.status(500).json({ success: false, message: 'Failed to update session state', error: error.message });
  }
};

const simulateUserOvertimeAuthorizationDev = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.warn('[sessionController.simulateUserAuthDev] Attempted access outside dev environment.');
    return res.status(403).json({ success: false, message: 'Forbidden: Dev endpoint only.' });
  }

  const { sessionId } = req.params; 
  const devActionUserId = req.user._id.toString(); 

  const logContext = {
    sessionLinkSessionId: sessionId,
    devActionUserId,
    function: 'simulateUserOvertimeAuthorizationDev_V5' // Incremented version
  };
  logger.info(`[${logContext.function}] Request received`, logContext);

  const dbTransactionSession = await mongoose.startSession();
  dbTransactionSession.startTransaction({ readPreference: 'primary' });
  try {
    let booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId })
      .populate('user', '_id firstName lastName email stripe.customerId') 
      .populate('coach', '_id firstName lastName settings.professionalProfile.hourlyRate') 
      .session(dbTransactionSession);

    if (!booking) {
      logger.warn(`[${logContext.function}] Booking not found`, logContext);
      throw new Error('Booking not found');
    }
    logContext.bookingId = booking._id.toString();
    const participantUserId = booking.user._id.toString();

    let session = await Session.findOne({ bookingId: booking._id }).session(dbTransactionSession);
    if (!session) {
      logger.warn(`[${logContext.function}] Session not found, cannot simulate auth.`, logContext);
      throw new Error('Session not found. Ensure session exists and coach has requested overtime first.');
    }
    logContext.sessionDocId = session._id.toString();

    if (session.state !== 'active') {
      session.state = 'active';
      if (!session.actualStartTime) session.actualStartTime = new Date();
      logger.info(`[${logContext.function}] DEV: Ensured session is 'active' and has 'actualStartTime'`, { ...logContext, actualStartTime: session.actualStartTime });
    }
    
    let targetSegment = session.overtimeSegments
      ?.filter(s => s.status === 'requested')
      .sort((a, b) => new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0))[0];

    if (!targetSegment) {
      logger.warn(`[${logContext.function}] No 'requested' overtime segment found to simulate authorization for.`, logContext);
      throw new Error("No 'requested' overtime segment found. Did the coach request overtime first using the other DEV button?");
    }
    logContext.segmentId = targetSegment._id.toString(); // This ID is from the original session fetch
    logContext.requestedDuration = targetSegment.requestedDuration;
    logContext.segmentMaxPrice = targetSegment.calculatedMaxPrice;

    logger.info(`[${logContext.function}] Found 'requested' segment. Simulating authorization...`, logContext);

    // Step 1: Call paymentController.authorizeOvertimePayment
    // It will modify the 'session' object in memory and return the 'paymentDocument' (unsaved if in transaction)
    logger.info(`[${logContext.function}] Calling paymentController.authorizeOvertimePayment for user ${participantUserId}`, logContext);
    const authResult = await paymentController.authorizeOvertimePayment(booking, session, participantUserId, targetSegment.calculatedMaxPrice, dbTransactionSession);
    
    let paymentDocument = authResult.paymentDocument; // This is the Mongoose document for Payment
    // The 'session' object passed to authorizeOvertimePayment is modified by reference
    // and its overtimeSegments array now has the paymentIntentId and status set for the target segment.
    
    const updatedTargetSegment = session.overtimeSegments.find(s => s.paymentIntentId === authResult.paymentIntentId);
    if (!updatedTargetSegment) {
        logger.error(`[${logContext.function}] Segment with PI ${authResult.paymentIntentId} not found on session object after authorizeOvertimePayment.`, logContext);
        throw new Error("DEV Simulation Error: Segment not updated correctly by authorizeOvertimePayment.");
    }
    logger.info(`[${logContext.function}] Segment on session object now has PI: ${updatedTargetSegment.paymentIntentId}, Status: ${updatedTargetSegment.status}`, logContext);

    // Step 2: Simulate client-side Stripe confirmation
    let confirmedStripeIntent;
    try {
        logger.info(`[${logContext.function}] Simulating Stripe client-side confirmation for PI: ${updatedTargetSegment.paymentIntentId}`, logContext);
        confirmedStripeIntent = await paymentService.stripe.paymentIntents.confirm(
            updatedTargetSegment.paymentIntentId,
            { payment_method: 'pm_card_visa' } 
        );
        logContext.simulatedStripeConfirmationStatus = confirmedStripeIntent.status;
        logger.info(`[${logContext.function}] Stripe PaymentIntent DEV confirmation attempted. PI: ${confirmedStripeIntent.id}, New Status: ${confirmedStripeIntent.status}`, logContext);

        if (confirmedStripeIntent.status !== 'requires_capture' && confirmedStripeIntent.status !== 'succeeded') {
            logger.error(`[${logContext.function}] DEV Stripe Intent not 'requires_capture' or 'succeeded' after simulated confirmation. Status: ${confirmedStripeIntent.status}`, logContext);
            throw new Error(`DEV Simulation Error: Stripe intent status is ${confirmedStripeIntent.status}, expected 'requires_capture' or 'succeeded'.`);
        }
    } catch (stripeError) {
        logger.error(`[${logContext.function}] Error during DEV Stripe PI confirmation: ${stripeError.message}`, { ...logContext, stripeError });
        throw new Error(`DEV Simulation Error: Failed to confirm Stripe PaymentIntent: ${stripeError.message}`);
    }
    
    // Step 3: Update local database states to 'authorized'
    updatedTargetSegment.status = 'authorized';
    updatedTargetSegment.authorizedAt = new Date();

    // Update the paymentDocument instance received from authorizeOvertimePayment
    paymentDocument.status = 'authorized';
    paymentDocument.amount.authorized = updatedTargetSegment.calculatedMaxPrice.amount;
    paymentDocument.error = null;
    paymentDocument.stripe.paymentMethodId = 'pm_card_visa';
    paymentDocument.updatedAt = new Date();
    
    let baseEndTimeMs;
    // Re-fetch booking within transaction if needed, or ensure `booking` object is up-to-date
    // booking = await Booking.findById(session.bookingId).select('+start +end +overtime').session(dbTransactionSession); // if booking fields could change
    const baseBookingDurationMs = (new Date(booking.end).getTime() - new Date(booking.start).getTime());
    const graceMs = 5 * 60000;
    const freeOvertimeMs = (booking.overtime?.freeOvertimeDuration || 0) * 60000;

    const previousAuthorizedSegments = session.overtimeSegments
      .filter(s => s.status === 'authorized' && s.authorizedAt && s._id.toString() !== updatedTargetSegment._id.toString())
      .sort((a, b) => new Date(b.authorizedAt).getTime() - new Date(a.authorizedAt).getTime());

    if (previousAuthorizedSegments.length > 0) {
      const lastPrevSegment = previousAuthorizedSegments[0];
      baseEndTimeMs = new Date(lastPrevSegment.authorizedAt).getTime() + (lastPrevSegment.requestedDuration * 60000);
    } else {
      const sessionEffectiveStartTime = session.actualStartTime || new Date(booking.start);
      baseEndTimeMs = new Date(sessionEffectiveStartTime).getTime() + baseBookingDurationMs + graceMs + freeOvertimeMs;
    }
    session.actualEndTime = new Date(baseEndTimeMs + (updatedTargetSegment.requestedDuration * 60000));
    logContext.newActualEndTime = session.actualEndTime.toISOString();
    logger.info(`[${logContext.function}] Session actualEndTime updated to ${session.actualEndTime.toISOString()}`, logContext);

    await paymentDocument.save({ session: dbTransactionSession }); // Save Payment document
    logger.info(`[${logContext.function}] Payment record (ID: ${paymentDocument._id}) saved with status 'authorized'`, logContext);
    await session.save({ session: dbTransactionSession }); // Save Session document with updated segment
    logger.info(`[${logContext.function}] Session record (ID: ${session._id}) saved with segment 'authorized'`, logContext);

    await dbTransactionSession.commitTransaction();
    logger.info(`[${logContext.function}] User overtime authorization SIMULATED successfully. Segment and Payment 'authorized'. Stripe PI status: ${confirmedStripeIntent.status}`, { ...logContext, finalActualEndTime: session.actualEndTime?.toISOString() });

    const videoIO = req.io?.of('/video');
    if (videoIO) {
      const roomName = `session:${sessionId}`;
      videoIO.to(roomName).emit('session-continued', { newEndTime: session.actualEndTime.toISOString(), reason: 'dev_user_authorized_ot' });
      videoIO.to(roomName).emit('authorization_confirmed', { paymentIntentId: updatedTargetSegment.paymentIntentId, bookingId: booking._id.toString() });
      
      // Re-fetch coach user if lean was used or ensure booking.coach is full User doc
      const coachUserForSocket = await User.findById(booking.coach._id).lean().session(dbTransactionSession); // Use session for consistency if needed
      if (coachUserForSocket) {
        const coachSocket = findUserSocket(coachUserForSocket._id.toString(), req.io);
        if(coachSocket) {
          videoIO.to(coachSocket.id).emit('overtime-response', { userId: participantUserId, choice: 'authorize', actualEndTime: session.actualEndTime.toISOString() });
        }
      }
      logger.info(`[${logContext.function}] Emitted socket events for simulated authorization`, { roomName });
    }

    res.json({
      success: true,
      message: 'User overtime authorization simulated successfully. Session extended.',
      actualEndTime: session.actualEndTime,
      segmentStatus: updatedTargetSegment.status,
      paymentIntentId: updatedTargetSegment.paymentIntentId,
      stripePIStatus: confirmedStripeIntent.status
    });

  } catch (error) {
    if (dbTransactionSession.inTransaction()) {
      logger.warn(`[${logContext.function}] Aborting transaction due to error: ${error.message}`, logContext);
      await dbTransactionSession.abortTransaction().catch(abortErr => logger.error(`[${logContext.function}] Error aborting transaction`, { abortErr }));
    }
    logger.error(`[${logContext.function}] Error simulating user authorization`, { ...logContext, error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: `Failed to simulate user authorization: ${error.message}` });
  } finally {
      if (dbTransactionSession && dbTransactionSession.endSession) {
         await dbTransactionSession.endSession().catch(endErr => logger.error(`[${logContext.function}] Error ending dbTransactionSession in finally block`, { endErr }));
      }
  }
};

const getLatestOvertimeRequest = async (req, res) => {
  const { sessionId } = req.params; // sessionLink.sessionId
  const userId = req.user._id.toString();
  const logContext = { sessionLinkSessionId: sessionId, userId };
  console.log('[getLatestOvertimeRequest] Request received', logContext);

  try {
      // Use existing helper for authorization and finding session/booking
      const { session, booking, error, status, isCoach, isUser } = await findSessionByLinkAndAuthorize(sessionId, userId, false); // Allow fetching even if not active

      if (error) {
          logger.warn('[getLatestOvertimeRequest] Authorization/Session find failed', { ...logContext, error, status });
          return res.status(status).json({ success: false, message: error });
      }

      // Find the most recent segment that is either 'requested' or 'pending_confirmation'
      const latestSegment = session.overtimeSegments
          ?.filter(s => ['requested', 'pending_confirmation'].includes(s.status))
          .sort((a, b) => (b.segmentCreatedAt || 0) - (a.segmentCreatedAt || 0))[0]; // Sort by creation time desc

      if (!latestSegment) {
          console.log('[getLatestOvertimeRequest] No active overtime request segment found', { ...logContext, bookingId: booking._id });
          return res.status(404).json({ success: false, message: 'No active overtime request found.' });
      }

      console.log('[getLatestOvertimeRequest] Found latest requested/pending segment', { ...logContext, bookingId: booking._id, segmentId: latestSegment._id, segmentStatus: latestSegment.status });
      res.json({
          success: true,
          requestedDuration: latestSegment.requestedDuration,
          calculatedMaxPrice: latestSegment.calculatedMaxPrice, // This was stored during request_paid
          status: latestSegment.status,
          segmentId: latestSegment._id
      });

  } catch (error) {
      logger.error('[getLatestOvertimeRequest] General Error:', {
          ...logContext,
          errorMessage: error.message,
          stack: error.stack,
      });
      res.status(500).json({ success: false, message: 'Failed to get latest overtime request', error: error.message });
  }
};

const simulateOvertimeUsageDev = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ success: false, message: 'Forbidden: Dev endpoint only.' });
  }

  const { sessionId } = req.params; 
  const { minutesUsed } = req.body;
  const devActionUserId = req.user._id.toString();

  const logContext = {
    sessionLinkSessionId: sessionId,
    devActionUserId,
    minutesUsed,
    function: 'simulateOvertimeUsageDev_V7' // Incremented version for clarity
  };
  console.log(`[${logContext.function}] Request received`, logContext);

  if (typeof minutesUsed !== 'number' || minutesUsed < 0) {
    return res.status(400).json({ success: false, message: 'Invalid or missing "minutesUsed". Must be a non-negative number.' });
  }

  const dbTransactionSession = await mongoose.startSession();
  dbTransactionSession.startTransaction({ readPreference: 'primary' });

  try {
    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId })
      .populate('coach', '_id settings.professionalProfile.hourlyRate firstName lastName email')
      .populate('user', '_id firstName lastName email')
      .populate('sessionType', 'name')
      .session(dbTransactionSession);

    if (!booking) {
      logger.warn(`[${logContext.function}] Booking not found`, logContext);
      throw new Error('Booking not found');
    }
    logContext.bookingId = booking._id.toString();
    logContext.coachRate = booking.coach?.settings?.professionalProfile?.hourlyRate;
    logContext.overtimeRatePercent = booking.overtime?.overtimeRate;

    let session = await Session.findOne({ bookingId: booking._id }).session(dbTransactionSession);
    if (!session) {
      logger.warn(`[${logContext.function}] Session not found.`, logContext);
      throw new Error('Session not found. Ensure session exists and an overtime segment is authorized.');
    }
    logContext.sessionDocId = session._id.toString();

    console.log(`[${logContext.function}] SIMULATE USAGE: Fetched session document. All overtimeSegments state:`, {
      ...logContext,
      allSegments: session.overtimeSegments.map(s => ({
          id: s._id.toString(), status: s.status, requestedAt: s.requestedAt, authorizedAt: s.authorizedAt,
          paymentIntentId: s.paymentIntentId, captureResult: s.captureResult,
          isCaptureResultNullOrUndefined: s.captureResult == null,
          captureResultHasStatus: s.captureResult && typeof s.captureResult.status === 'string'
      }))
    });
    
    if (session.state !== 'active') {
      console.log(`[${logContext.function}] Session not active (state: ${session.state}). Forcing to 'active' for DEV simulation.`, logContext);
      session.state = 'active'; // This change will be part of the transaction if saved
      if (!session.actualStartTime) session.actualStartTime = new Date();
    }
        
    const latestAuthorizedSegment = session.overtimeSegments
      ?.filter(s => {
          const isAuthorized = s.status === 'authorized';
          const isNotFinalized = s.captureResult == null || (typeof s.captureResult === 'object' && typeof s.captureResult.status !== 'string');
          if (isAuthorized) {
            logger.debug(`[${logContext.function}] SIMULATE USAGE: Checking segment for finalization:`, {
                ...logContext, segmentId: s._id.toString(), isAuthorized, isNotFinalized, cr_raw: s.captureResult
            });
          }
          return isAuthorized && isNotFinalized;
      })
      .sort((a, b) => new Date(b.authorizedAt || 0).getTime() - new Date(a.authorizedAt || 0).getTime())[0];

    if (!latestAuthorizedSegment) {
      logger.warn(`[${logContext.function}] No 'authorized' and unfinalized overtime segment found for simulation.`, {
          ...logContext,
          allSegmentsForFailureDiagnosis: session.overtimeSegments.map(s => ({
              id: s._id.toString(), status: s.status, authAt: s.authorizedAt, pi: s.paymentIntentId, 
              cr_raw: s.captureResult, 
              cr_is_null_check: s.captureResult === null,
              cr_is_undefined_check: s.captureResult === undefined,
              cr_has_status_prop: s.captureResult && typeof s.captureResult.status === 'string'
          }))
      });
      throw new Error("No 'authorized' and unfinalized overtime segment found. Authorize one first using DEV tools.");
    }
    logContext.segmentId = latestAuthorizedSegment._id.toString();
    logContext.segmentAuthorizedAt = latestAuthorizedSegment.authorizedAt?.toISOString();

    const simulatedFinalEndTime = new Date(new Date(latestAuthorizedSegment.authorizedAt).getTime() + (minutesUsed * 60000));
    logContext.simulatedFinalEndTime = simulatedFinalEndTime.toISOString();
    console.log(`[${logContext.function}] Calculated simulatedFinalEndTime for segment ${logContext.segmentId}`, logContext);
    
    // Call paymentService.finalizeOvertimePayment. It performs Stripe call AND prepares DB updates.
    // Pass the current transaction session (dbTransactionSession) so that finalizeOvertimePayment
    // performs its database reads and prepares updates in the context of this transaction.
    const finalizeResult = await paymentService.finalizeOvertimePayment(booking._id, simulatedFinalEndTime, dbTransactionSession, session); 
    logContext.finalizeResult = finalizeResult;
    console.log(`[${logContext.function}] paymentService.finalizeOvertimePayment service call completed.`, logContext);

    if (!finalizeResult.success) {
      logger.error(`[${logContext.function}] Overtime finalization service call FAILED.`, { ...logContext, serviceError: finalizeResult.error});
      throw new Error(finalizeResult.error || 'Payment service finalization failed during simulation.');
    }
    
    // Apply DB updates prepared by finalizeOvertimePayment WITHIN THIS TRANSACTION
    if (finalizeResult.sessionUpdatePayload && finalizeResult.segmentId) {
      console.log(`[${logContext.function}] Applying Session update payload from finalizeResult`, { ...logContext, segmentId: finalizeResult.segmentId });
      const sessionUpdateResult = await Session.updateOne(
        { _id: session._id, 'overtimeSegments._id': finalizeResult.segmentId },
        finalizeResult.sessionUpdatePayload,
        { arrayFilters: [{ 'elem._id': finalizeResult.segmentId }], session: dbTransactionSession }
      );
      console.log(`[${logContext.function}] Session update result:`, { ...logContext, matched: sessionUpdateResult.matchedCount, modified: sessionUpdateResult.modifiedCount });
      if (sessionUpdateResult.matchedCount === 0 && sessionUpdateResult.modifiedCount === 0 ) {
           logger.error(`[${logContext.function}] Failed to apply Session update payload for segment ${finalizeResult.segmentId}. Matched: ${sessionUpdateResult.matchedCount}`, logContext);
           // Potentially throw an error here if this is considered critical for the DEV endpoint's success
      }
    }

    if (finalizeResult.paymentUpdatePayload && finalizeResult.segmentId) {
      // Re-fetch the session to get the potentially updated overtimeSegments array after the Session.updateOne call
      const updatedSessionForPI = await Session.findById(session._id).session(dbTransactionSession);
      const segmentForPI = updatedSessionForPI.overtimeSegments.find(s => s._id.equals(finalizeResult.segmentId));
      
      if (segmentForPI?.paymentIntentId) {
        console.log(`[${logContext.function}] Applying Payment update payload from finalizeResult`, { ...logContext, paymentIntentId: segmentForPI.paymentIntentId });
        const paymentUpdateResult = await Payment.updateOne(
          { 'stripe.paymentIntentId': segmentForPI.paymentIntentId },
          finalizeResult.paymentUpdatePayload,
          { session: dbTransactionSession }
        );
        console.log(`[${logContext.function}] Payment update result:`, { ...logContext, matched: paymentUpdateResult.matchedCount, modified: paymentUpdateResult.modifiedCount });
      } else {
          logger.warn(`[${logContext.function}] Could not apply Payment update, PI missing on segment ${finalizeResult.segmentId} after session update. This might be okay if segment status changed such that PI is no longer relevant.`, logContext);
      }
    }
    
    // If session state was changed to 'active' for simulation, save it now.
    if (session.isModified('state') || session.isModified('actualStartTime')) {
        await session.save({ session: dbTransactionSession });
        console.log(`[${logContext.function}] Saved session state/actualStartTime changes.`, logContext);
    }

    await dbTransactionSession.commitTransaction();
    console.log(`[${logContext.function}] DEV Overtime Usage Simulation: Database transaction committed with updates.`, logContext);

    // Send notifications based on the actual finalization result
    if (finalizeResult.success && finalizeResult.userId && finalizeResult.coachId) {
      const { userId: clientId, coachId, capturedAmount, currency, status: captureStatusFromService, paymentIntentId: piFromFinalize } = finalizeResult;
      const metadataBase = { bookingId: booking._id.toString(), sessionId: session._id.toString() };
      const notificationBookingData = await Booking.findById(booking._id).populate('user coach'); 

      if (captureStatusFromService === 'captured' || captureStatusFromService === 'partially_captured') {
        await UnifiedNotificationService.sendNotification({ ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_CAPTURED, recipient: clientId, metadata: { ...metadataBase, amount: capturedAmount, currency } }, notificationBookingData, getSocketService());
        await UnifiedNotificationService.sendNotification({ ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_COLLECTED, recipient: coachId, metadata: { ...metadataBase, amount: capturedAmount, currency, clientName: `${booking.user.firstName} ${booking.user.lastName}` } }, notificationBookingData, getSocketService());
      } else if (captureStatusFromService === 'released') {
        await UnifiedNotificationService.sendNotification({ ...metadataBase, type: NotificationTypes.OVERTIME_PAYMENT_RELEASED, recipient: clientId, metadata: { ...metadataBase } }, notificationBookingData, getSocketService());
      }
      console.log(`[${logContext.function}] DEV: Notifications for SIMULATED capture processed based on status: ${captureStatusFromService}.`, logContext);
    }
    
    res.json({
      success: true, 
      message: `DEV: Overtime usage of ${minutesUsed} minutes SIMULATED & FINALIZED. Status: ${finalizeResult.status}, Captured: ${finalizeResult.capturedAmount === undefined ? 'N/A' : finalizeResult.capturedAmount.toFixed(2)} ${finalizeResult.currency || ''}. DB updated.`,
      segmentId: latestAuthorizedSegment._id.toString(),
      simulatedFinalEndTime: simulatedFinalEndTime.toISOString(),
      serviceCallStatus: finalizeResult.status,
      serviceCapturedAmount: finalizeResult.capturedAmount,
      serviceCurrency: finalizeResult.currency,
      serviceError: finalizeResult.error
    });

  } catch (error) {
    if (dbTransactionSession.inTransaction()) {
        await dbTransactionSession.abortTransaction().catch(abortErr => logger.error(`[${logContext.function}] Error aborting transaction after main error`, { abortErr }));
    }
    logger.error(`[${logContext.function}] Error simulating overtime usage`, { ...logContext, error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: `Failed to simulate overtime usage: ${error.message}` });
  } finally {
    if (dbTransactionSession && dbTransactionSession.endSession) { // Check if dbTransactionSession is defined
        await dbTransactionSession.endSession().catch(endErr => logger.error(`[${logContext.function}] Error ending dbTransactionSession in finally block`, { endErr }));
    }
  }
};

const uploadSessionImage = async (req, res) => {
  const { sessionLinkSessionId } = req.params;
  const file = req.file;
  const userId = req.user._id.toString();
  logger.info('[sessionController.uploadSessionImage] Request', { sessionLinkSessionId, userId, filename: file?.originalname });

  if (!file) {
    return res.status(400).json({ success: false, message: 'No image file provided.' });
  }

  try {
    const { session, isCoach, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false);
    if (error) return res.status(status).json({ success: false, message: error });
    if (!isCoach) return res.status(403).json({ success: false, message: 'Only the coach can upload images.' });

    const folderPath = `sessions/${session.bookingId.toString()}/session_images`;
    const imageMetaData = await uploadToCloudinaryHelper(file, folderPath, 'sessionImage_');
    
    session.sessionImages = session.sessionImages || [];
    if (session.sessionImages.length === 0) {
      imageMetaData.isMain = true;
    } else {
      imageMetaData.isMain = false;
    }
    
    const newImage = { ...imageMetaData, _id: new mongoose.Types.ObjectId() };
    session.sessionImages.push(newImage);
    await session.save();
    
    const savedImage = session.sessionImages.find(img => img.publicId === newImage.publicId);

    logger.info('[sessionController.uploadSessionImage] Image uploaded and session updated', { sessionId: session._id, imageUrl: savedImage.url, imageId: savedImage._id });

    const io = req.app.get('io');
    if (io) {
        const videoIO = io.of('/video');
        videoIO.to(`session:${sessionLinkSessionId}`).emit('session-asset-updated', { type: 'sessionImages', data: session.sessionImages });
    }

    res.status(201).json({ success: true, sessionImages: session.sessionImages, newImage: savedImage });
  } catch (error) {
    logger.error('[sessionController.uploadSessionImage] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to upload image.', error: error.message });
  }
};

const deleteSessionImage = async (req, res) => {
  const { sessionLinkSessionId, imageId } = req.params;
  const userId = req.user._id.toString();
  logger.info('[sessionController.deleteSessionImage] Request', { sessionLinkSessionId, imageId, userId });

  try {
    const { session, isCoach, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false);
    if (error) return res.status(status).json({ success: false, message: error });
    if (!isCoach) return res.status(403).json({ success: false, message: 'Only the coach can delete images.' });

    const imageToDelete = session.sessionImages.find(img => img._id.toString() === imageId);
    if (!imageToDelete) {
      return res.status(404).json({ success: false, message: 'Image not found.' });
    }

    if (imageToDelete.publicId) {
      logger.info('[sessionController.deleteSessionImage] Deleting image from Cloudinary', { publicId: imageToDelete.publicId });
      await cloudinary.uploader.destroy(imageToDelete.publicId)
        .catch(err => logger.warn(`[CloudinaryDelete] Failed to delete sessionImage ${imageToDelete.publicId}`, {error: err.message}));
    }
    
    session.sessionImages = session.sessionImages.filter(img => img._id.toString() !== imageId);

    if (imageToDelete.isMain && session.sessionImages.length > 0) {
      session.sessionImages[0].isMain = true;
    }
    
    await session.save();
    logger.info('[sessionController.deleteSessionImage] Image removed from session', { sessionId: session._id, imageId });
    
    const io = req.app.get('io');
    if (io) {
        const videoIO = io.of('/video');
        videoIO.to(`session:${sessionLinkSessionId}`).emit('session-asset-updated', { type: 'sessionImages', data: session.sessionImages });
    }

    res.status(200).json({ success: true, message: 'Image deleted successfully.', sessionImages: session.sessionImages });
  } catch (error) {
    logger.error('[sessionController.deleteSessionImage] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to delete image.', error: error.message });
  }
};


const uploadSessionCourseMaterials = async (req, res) => {
  const { sessionLinkSessionId } = req.params;
  const files = req.files; // From upload.array('courseMaterialFiles')
  const userId = req.user._id.toString();
  logger.info('[sessionController.uploadSessionCourseMaterials] Request', { sessionLinkSessionId, userId, fileCount: files?.length });

  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, message: 'No course material files provided.' });
  }

  try {
    const { session, isCoach, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false);
    if (error) return res.status(status).json({ success: false, message: error });
    if (!isCoach) return res.status(403).json({ success: false, message: 'Only the coach can upload course materials.' });

    const folderPath = `sessions/${session.bookingId.toString()}/course_materials`;
    const uploadedMaterialsMetaData = [];

    for (const file of files) {
      const materialMetaData = await uploadToCloudinaryHelper(file, folderPath);
      uploadedMaterialsMetaData.push(materialMetaData);
    }
    
    session.courseMaterials = (session.courseMaterials || []).concat(uploadedMaterialsMetaData);
    await session.save();
    logger.info('[sessionController.uploadSessionCourseMaterials] Course materials uploaded and session updated', { sessionId: session._id, newMaterialsCount: uploadedMaterialsMetaData.length });

    const io = req.app.get('io');
    if (io) {
        const videoIO = io.of('/video');
        // Send all materials or just the newly added ones
        videoIO.to(`session:${sessionLinkSessionId}`).emit('session-asset-updated', { type: 'courseMaterials', data: session.courseMaterials });
    }

    res.status(201).json({ success: true, courseMaterials: session.courseMaterials });
  } catch (error) {
    logger.error('[sessionController.uploadSessionCourseMaterials] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to upload course materials.', error: error.message });
  }
};

const deleteSessionCourseMaterial = async (req, res) => {
  const { sessionLinkSessionId, materialId } = req.params;
  const userId = req.user._id.toString();
  logger.info('[sessionController.deleteSessionCourseMaterial] Request', { sessionLinkSessionId, materialId, userId });

  try {
    const { session, isCoach, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false);
    if (error) return res.status(status).json({ success: false, message: error });
    if (!isCoach) return res.status(403).json({ success: false, message: 'Only the coach can delete course materials.' });

    const materialToDelete = session.courseMaterials.find(m => m._id.toString() === materialId);
    if (!materialToDelete) {
      return res.status(404).json({ success: false, message: 'Course material not found.' });
    }

    if (materialToDelete.publicId) {
      logger.info('[sessionController.deleteSessionCourseMaterial] Deleting material from Cloudinary', { publicId: materialToDelete.publicId });
      // Specify resource_type if materials can be non-image/video (e.g. "raw" for PDFs)
      await cloudinary.uploader.destroy(materialToDelete.publicId, { resource_type: "raw" })
        .catch(err => logger.warn(`[CloudinaryDelete] Failed to delete courseMaterial ${materialToDelete.publicId}`, {error: err.message}));
    }
    
    session.courseMaterials = session.courseMaterials.filter(m => m._id.toString() !== materialId);
    await session.save();
    logger.info('[sessionController.deleteSessionCourseMaterial] Course material removed from session', { sessionId: session._id, materialId });

    const io = req.app.get('io');
    if (io) {
        const videoIO = io.of('/video');
        videoIO.to(`session:${sessionLinkSessionId}`).emit('session-asset-updated', { type: 'courseMaterials', data: session.courseMaterials });
    }

    res.status(200).json({ success: true, message: 'Course material deleted successfully.' });
  } catch (error) {
    logger.error('[sessionController.deleteSessionCourseMaterial] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to delete course material.', error: error.message });
  }
};

const setMainSessionImage = async (req, res) => {
  const { sessionLinkSessionId, imageId } = req.params;
  const userId = req.user._id.toString();
  logger.info('[sessionController.setMainSessionImage] Request', { sessionLinkSessionId, imageId, userId });

  try {
    const { session, isCoach, error, status } = await findSessionByLinkAndAuthorize(sessionLinkSessionId, userId, false);
    if (error) return res.status(status).json({ success: false, message: error });
    if (!isCoach) return res.status(403).json({ success: false, message: 'Only the coach can set the main image.' });

    let imageFound = false;
    session.sessionImages.forEach(img => {
      if (img._id.toString() === imageId) {
        img.isMain = true;
        imageFound = true;
      } else {
        img.isMain = false;
      }
    });

    if (!imageFound) {
      return res.status(404).json({ success: false, message: 'Image not found to set as main.' });
    }
    
    await session.save();
    logger.info('[sessionController.setMainSessionImage] Main image set', { sessionId: session._id, mainImageId: imageId });
    
    const io = req.app.get('io');
    if (io) {
        const videoIO = io.of('/video');
        videoIO.to(`session:${sessionLinkSessionId}`).emit('session-asset-updated', { type: 'sessionImages', data: session.sessionImages });
    }

    res.status(200).json({ success: true, message: 'Main image set successfully.', sessionImages: session.sessionImages });
  } catch (error) {
    logger.error('[sessionController.setMainSessionImage] Error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: 'Failed to set main image.', error: error.message });
  }
};

console.log('Exporting from sessionController:', { generateSessionLink, validateSessionLink, startSession });
module.exports = {
  generateSessionLink,
  validateSessionLink,
  startSession,
  presenterControls,
  createPoll,
  updatePoll,
  getPolls,
  deletePoll, 
  createQA,
  updateQA,
  getQA,
  deleteQA,
  updateNotesAgenda,
  getNotesAgenda,
  uploadBackground,
  getBackgrounds,
  getSessionAnalytics,
  getResources,     
  uploadResource,    
  deleteResource,
  getPrivateNotes,     
  updatePrivateNotes,   
  getAgenda,           
  updateAgenda,  
  terminateSession,
  triggerOvertimePrompt,
  handleOvertimeResponse,
  setOvertimeChoiceDev,
  getLatestOvertimeRequest,
  simulateUserOvertimeAuthorizationDev,
  simulateOvertimeUsageDev,
  deleteSessionCourseMaterial,
  uploadSessionCourseMaterials,
  deleteSessionImage,
  uploadSessionImage,
  setMainSessionImage
};
