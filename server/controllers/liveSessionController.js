const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const Coach = require('../models/Coach');
const LiveSession = require('../models/LiveSession');
const Payment = require('../models/Payment');
const PriceConfiguration = require('../models/PriceConfiguration');
const Discount = require('../models/Discount');
const { _calculateDiscountedPrice, _isDiscountApplicable } = require('./discountController'); 
const Booking = require('../models/Booking');
const paymentService = require('../services/paymentService');
const { getSocketService } = require('../services/socketService');
const { liveSessionQueue, statusResetQueue } = require('../services/jobQueueService');
const { logger } = require('../utils/logger');
const liveSessionManager = require('../services/liveSessionManager');
const analyticsService = require('../services/analyticsService');

const INITIAL_AUTHORIZATION_MINUTES = 15;
const REAUTHORIZATION_MINUTES = 15;

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.requestLiveSession = async (req, res) => {
    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();
    try {
        const clientId = req.user._id;
        const { coachId, appliedDiscount } = req.body;

        const coachUser = await User.findById(coachId).session(dbSession);
        if (!coachUser || coachUser.role !== 'coach' || coachUser.status !== 'online') {
            await dbSession.abortTransaction();
            return res.status(400).json({ message: 'Coach is not available or does not exist.' });
        }
        
        // Step 5.3: Authoritatively fetch the coach's price configuration
        const priceConfig = await PriceConfiguration.findOne({ user: coachId }).session(dbSession);
        if (!priceConfig?.liveSessionRate?.amount > 0) {
            await dbSession.abortTransaction();
            return res.status(400).json({ message: 'Coach has not configured live session pricing.' });
        }

        const basePerMinuteRate = priceConfig.liveSessionRate;
        let effectivePerMinuteRate = basePerMinuteRate;
        let discountDetailsToSave = null;

        // Step 5.3: Perform security re-validation if a discount is provided
        if (appliedDiscount && appliedDiscount.code) {
            const discount = await Discount.findOne({ _id: appliedDiscount._id, code: appliedDiscount.code, coach: coachId, isActive: true }).session(dbSession);
            if (!discount) {
                await dbSession.abortTransaction();
                return res.status(400).json({ message: 'The provided discount is invalid.' });
            }
            // Use the validation logic from discountController
            await _isDiscountApplicable(discount, basePerMinuteRate.amount, 'session', '66ec54ee4a8965b22af33fd1', clientId);
            const priceAfterDiscount = _calculateDiscountedPrice(discount, basePerMinuteRate.amount);
            
            effectivePerMinuteRate = { amount: priceAfterDiscount.finalPrice, currency: basePerMinuteRate.currency };
            // The amountDeducted here is the per-minute deduction
            discountDetailsToSave = { ...priceAfterDiscount.appliedDiscount }; 
        }

        const newSession = new LiveSession({
            client: clientId,
            coach: coachId,
            status: 'requested',
            basePerMinuteRate: basePerMinuteRate,
            effectivePerMinuteRate: effectivePerMinuteRate,
            discountApplied: discountDetailsToSave,
        });

        await newSession.save({ session: dbSession });
        
          const populatedSession = await LiveSession.findById(newSession._id)
            .populate('client', 'firstName lastName profilePicture')
            .populate('coach', '_id')
            .session(dbSession);

        const socketService = getSocketService();
        if (socketService) {
          console.log(`[EVENT EMISSION] Attempting to emit 'live_session_request' to coachId: ${coachId}`);
            socketService.emitToUser(coachId, 'live_session_request', populatedSession);
        }

        analyticsService.trackLiveSessionFunnel(newSession._id, 'requested');
        
        await dbSession.commitTransaction();
        res.status(201).json(populatedSession);

    } catch (error) {
        await dbSession.abortTransaction();
        // Enhanced Logging and Response
        const errorMessage = error.message || 'Server error while requesting session.';
        logger.error('[LiveSessionController] Error requesting live session:', { 
            errorMessage: error.message, 
            errorName: error.name,
            stack: error.stack,
            requestBody: req.body
        });
        res.status(500).json({ message: errorMessage });
    } finally {
        dbSession.endSession();
    }
};

exports.respondToLiveSessionRequest = async (req, res) => {
  const { sessionId } = req.params;
  const { response, message } = req.body;
  const coachId = req.user.id;
  const io = req.app.get('io');

  console.log(`[DEBUG-LIVESESSION] respondToLiveSessionRequest received. SessionID: ${sessionId}, Response: ${response}, Message: "${message}"`);
  
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const liveSession = await LiveSession.findById(sessionId).populate('client coach').session(dbSession);
    if (!liveSession) {
        await dbSession.abortTransaction();
        return res.status(404).json({ message: 'Live session not found.' });
    }
    if (liveSession.coach._id.toString() !== coachId) {
        await dbSession.abortTransaction();
        return res.status(403).json({ message: 'Unauthorized.' });
    }
    if (liveSession.status !== 'requested') {
        await dbSession.abortTransaction();
        return res.status(400).json({ message: `Session status is not 'requested'.` });
    }
    if (!['accepted', 'declined'].includes(response)) {
        await dbSession.abortTransaction();
        return res.status(400).json({ message: "Invalid response." });
    }

    const socketService = getSocketService();
    if (socketService) {
        socketService.io = io;
    }

    liveSession.status = response;
    if (response === 'declined') {
        liveSession.cancellationReason = message || 'declined_by_coach';
        console.log(`[DEBUG-LIVESESSION] Set liveSession.cancellationReason to: "${liveSession.cancellationReason}" before saving.`);
      } else if (response === 'accepted') {
        // This logic is now fully compliant with the specification document.
        
        // Use the BASE per-minute rate for the placeholder booking price.
        const baseRateAmount = liveSession.basePerMinuteRate.amount;
        const baseRateCurrency = liveSession.basePerMinuteRate.currency;

        // START FIX: Construct the priceForBooking object with the correct nested structure AND using the base rate.
        const priceForBooking = {
            base: {
                amount: { amount: baseRateAmount, currency: baseRateCurrency },
                currency: baseRateCurrency 
            },
            final: {
                amount: { amount: baseRateAmount, currency: baseRateCurrency },
                currency: baseRateCurrency
            },
            currency: baseRateCurrency,
        };
        // END FIX
        
        logger.debug('[LiveSessionController] Creating booking for live session with price object based on BASE per-minute rate:', { priceForBooking });

        const coachUser = await User.findById(liveSession.coach).select('settings.timeZone').session(dbSession);

        const newBooking = new Booking({
            coach: liveSession.coach._id,
            user: liveSession.client._id,
            start: new Date(),
            end: new Date(Date.now() + 60 * 60 * 1000), // Placeholder end time
            status: 'pending_payment',
            isLiveSession: true,
            title: `Live Session with ${liveSession.coach.firstName}`,
            timezone: coachUser?.settings?.timeZone || 'UTC',
            sessionType: '66ec54ee4a8965b22af33fd1',
            price: priceForBooking,
            // Add discount details to the booking as well for consistency, if present
            discountApplied: liveSession.discountApplied ? {
                _id: liveSession.discountApplied._id,
                code: liveSession.discountApplied.code,
                type: liveSession.discountApplied.type,
                value: liveSession.discountApplied.value
            } : null,
        });
        try {
            console.log('[DIAGNOSTIC] Attempting to save new Booking for Live Session:', JSON.stringify(newBooking.toObject(), null, 2));
            await newBooking.save({ session: dbSession });
        } catch (validationError) {
            console.error('[DIAGNOSTIC] Booking validation failed:', validationError);
            logger.error('[LiveSessionController] Failed to save placeholder booking for live session.', { error: validationError.message, stack: validationError.stack });
            await dbSession.abortTransaction();
            return res.status(500).json({ message: 'Internal server error: Could not create session booking record.' });
        }
        liveSession.booking = newBooking._id;
        console.log(`[LiveSessionController] Created valid lightweight Booking ${newBooking._id} for Live Session ${liveSession._id}`);

          const otherRequests = await LiveSession.find({
            coach: coachId,
            status: 'requested',
            _id: { $ne: sessionId }
        }).select('_id client').session(dbSession);

        if (otherRequests.length > 0) {
            const ids = otherRequests.map(r => r._id);
            const declineReason = 'The coach accepted another session.';
            
            await LiveSession.updateMany(
                { _id: { $in: ids } },
                { $set: { status: 'declined', cancellationReason: declineReason } },
                { session: dbSession }
            );

            if (socketService) {
                for (const request of otherRequests) {
                    const payload = {
                        _id: request._id,
                        status: 'declined',
                        cancellationReason: declineReason
                    };
                    socketService.emitToUser(request.client.toString(), 'live_session_declined', payload);
                }
            }
        }

        const declineReason = 'The coach accepted another session.';
        for (const requestToDecline of otherRequests) {
            requestToDecline.status = 'declined';
            requestToDecline.cancellationReason = declineReason;
            await requestToDecline.save({ session: dbSession });
            analyticsService.trackLiveSessionFunnel(requestToDecline._id, 'declined', { reason: declineReason });
            if (socketService) {
                const clientToNotifyId = requestToDecline.client.toString();
                socketService.emitToUser(clientToNotifyId, 'live_session_declined', requestToDecline.toObject());
            }
        }
    }

    await liveSession.save({ session: dbSession });
    analyticsService.trackLiveSessionFunnel(liveSession._id, response, {
          reason: response === 'declined' ? liveSession.cancellationReason : undefined
      });
      
    await dbSession.commitTransaction();

    if(socketService) {
        const clientTargetId = liveSession.client._id;
        const eventName = `live_session_${response}`;
        const payload = liveSession.toObject(); 
        console.log(`[DEBUG-LIVESESSION] Emitting '${eventName}' to client UserID: ${clientTargetId}. Payload being sent:`, payload);
        socketService.emitToUser(clientTargetId, eventName, payload);
    }
    res.json(liveSession);
  } catch (error) {
    await dbSession.abortTransaction();
    logger.error('[LiveSessionController] Error responding to live session request:', { error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Server error while responding.' });
  } finally {
      dbSession.endSession();
  }
};

exports.createAuthorization = async (req, res) => {
  const { sessionId } = req.params;
  const clientId = req.user.id;
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const liveSession = await LiveSession.findById(sessionId).session(dbSession);
    if (!liveSession) throw new Error('Live session not found.');
    if (liveSession.client.toString() !== clientId) throw new Error('Unauthorized.');
    if (liveSession.status !== 'accepted') throw new Error(`Cannot authorize. Session status: ${liveSession.status}`);

    const client = await User.findById(clientId).select('stripe.customerId').session(dbSession);
    if (!client?.stripe?.customerId) {
      throw new Error('Stripe customer ID not found for client.');
    }

    liveSession.status = 'pending_authorization';
    
    // Create a SetupIntent instead of a PaymentIntent
    const setupIntent = await paymentService.createSetupIntentForSession({
      stripeCustomerId: client.stripe.customerId,
      metadata: { 
        liveSessionId: liveSession._id.toString(), 
        bookingId: liveSession.booking.toString(),
        userId: clientId,
      }
    });
    
    // We NO LONGER create a Payment record here. One will be created upon final capture.
    
    await liveSession.save({ session: dbSession });
    analyticsService.trackLiveSessionFunnel(sessionId, 'pending_authorization');

    await dbSession.commitTransaction();
    res.json({ clientSecret: setupIntent.client_secret, setupIntentId: setupIntent.id });

  } catch (error) {
    await dbSession.abortTransaction();
    logger.error('[LiveSessionController] Error creating payment authorization (SetupIntent):', { error: error.message, stack: error.stack, sessionId });
    res.status(500).json({ message: error.message || 'Server error while creating authorization.' });
  } finally {
    dbSession.endSession();
  }
};

exports.validateSessionLink = async (req, res) => {
  const { sessionId, token } = req.params;
  const userId = req.user.id;

  try {
    const liveSession = await LiveSession.findOne({
      'sessionLink.sessionId': sessionId,
      'sessionLink.token': token,
      'sessionLink.expired': false,
    }).populate('client coach', 'firstName lastName _id role')
      .populate({ path: 'booking', select: '_id' });

    if (!liveSession) {
      logger.warn('[LiveSessionController] Invalid or expired session link used.', { sessionId, token, userId });
      return res.status(404).json({ message: 'Session link is invalid or has expired.' });
    }

    const isParticipant = liveSession.client._id.toString() === userId || liveSession.coach._id.toString() === userId;
    if (!isParticipant) {
      logger.warn('[LiveSessionController] Unauthorized user attempted to validate a session link.', { sessionId, userId });
      return res.status(403).json({ message: 'You are not authorized to join this session.' });
    }

    if (!liveSession.booking) {
        logger.error('[LiveSessionController] CRITICAL: Live session is missing its associated booking reference.', { liveSessionId: liveSession._id });
        return res.status(500).json({ message: 'Session data is incomplete and cannot be loaded.' });
    }

    logger.info(`[LiveSessionController] Session link successfully validated for user ${userId}`, { sessionId });
    res.json({
      success: true,
      session: {
        _id: liveSession._id,
        booking: liveSession.booking,
        client: liveSession.client,
        coach: liveSession.coach,
      },
    });
  } catch (error) {
    logger.error('[LiveSessionController] Error validating session link:', { error: error.message, sessionId });
    res.status(500).json({ message: 'Server error while validating session.' });
  }
};

exports.startLiveSession = async (req, res) => {
  const { sessionId } = req.params;
  const clientId = req.user.id;
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();
  const io = req.app.get('io');

  try {
    const liveSession = await LiveSession.findById(sessionId).session(dbSession);
    if (!liveSession) throw new Error('Live session not found.');
    if (liveSession.client.toString() !== clientId) throw new Error('Unauthorized.');
    
    // --- START: REVISED VALIDATION LOGIC ---
    // The status should be 'pending_authorization' as the client has just completed the SetupIntent flow.
    if (liveSession.status !== 'pending_authorization') {
      throw new Error(`Cannot start. Session status is '${liveSession.status}', expected 'pending_authorization'.`);
    }

    const client = await User.findById(clientId).select('stripe.customerId').session(dbSession);
    if (!client?.stripe?.customerId) {
        throw new Error('Stripe customer ID not found.');
    }

    // Directly verify with Stripe that the SetupIntent for this session was successful.
    // This is the new source of truth, replacing the old Payment record check.
    const setupIntents = await stripe.setupIntents.list({ customer: client.stripe.customerId });
    const successfulSetup = setupIntents.data.find(si => 
        si.metadata.liveSessionId === sessionId && 
        si.status === 'succeeded'
    );

    if (!successfulSetup) {
      logger.error(`[startLiveSession] CRITICAL: No successful SetupIntent found for session ${sessionId}. Cannot start.`);
      throw new Error('Payment has not been authorized.'); // This is the error you were seeing
    }
    // --- END: REVISED VALIDATION LOGIC ---

    liveSession.status = 'handshake_pending';

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionLinkSessionId = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'default-secret')
      .update(`${liveSession._id.toString()}-${Date.now()}`)
      .digest('hex');

    liveSession.sessionLink = {
        token: sessionToken,
        sessionId: sessionLinkSessionId,
        generatedAt: new Date(),
        expired: false,
    };
    const sessionUrl = `/live-session/${sessionLinkSessionId}/${sessionToken}`;

    if (!liveSession.booking) {
        logger.error('[startLiveSession] CRITICAL: LiveSession is missing the booking reference.', { liveSessionId: liveSession._id });
        throw new Error('Associated booking not found for this live session.');
    }

    const bookingUpdateResult = await Booking.updateOne(
        { _id: liveSession.booking },
        { 
            $set: { 
                'sessionLink.sessionId': sessionLinkSessionId,
                'sessionLink.token': sessionToken,
                'sessionLink.generatedAt': new Date(),
                'sessionLink.expired': false
            } 
        },
        { session: dbSession }
    );

    if (bookingUpdateResult.modifiedCount === 0) {
        logger.warn('[startLiveSession] The associated Booking document was not updated with the sessionLink.', { bookingId: liveSession.booking, liveSessionId: liveSession._id });
    } else {
        logger.info('[startLiveSession] Successfully updated the associated Booking document with the sessionLink.', { bookingId: liveSession.booking, liveSessionId: liveSession._id });
    }

    await liveSession.save({ session: dbSession });
    analyticsService.trackLiveSessionFunnel(sessionId, 'handshake_pending');

    // We no longer need to update a Payment record here, as it doesn't exist yet.
    
    await dbSession.commitTransaction();

    await liveSessionQueue().add('monitor-session', { sessionId }, {
        jobId: `monitor-${sessionId}`,
        repeat: {
            every: 60000, 
        },
    });
    logger.info(`[LiveSessionController] Started persistent monitor job for session: ${sessionId}`);

    // [UPDATED] Commit transaction AFTER queue operation succeeds
    await dbSession.commitTransaction();

    const socketService = getSocketService();
    if(socketService) {
      socketService.io = io;
      const payload = { session: liveSession.toObject(), sessionUrl };
      logger.info(`[LiveSessionController] > SENDING session_authorized_and_ready to client ${liveSession.client.toString()} and coach ${liveSession.coach.toString()}`);
      socketService.emitToUser(liveSession.client.toString(), 'session_authorized_and_ready', payload);
      socketService.emitToUser(liveSession.coach.toString(), 'session_authorized_and_ready', payload);
    }
    
    res.json({ success: true, message: 'Live session authorized and ready.', sessionUrl, session: liveSession });

  } catch (error) {
    await dbSession.abortTransaction();
    logger.error('[LiveSessionController] Error in startLiveSession:', { error: error.message, stack: error.stack, sessionId });
    res.status(500).json({ message: error.message || 'Server error while preparing session.' });
  } finally {
    dbSession.endSession();
  }
};

exports.endLiveSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await liveSessionManager.endSession(sessionId, req.user.id);
        res.json({ success: true, message: result.message, data: result.data });
    } catch (error) {
        logger.error('[LiveSessionController] Error ending live session:', { error: error.message, stack: error.stack, code: error.statusCode });
        res.status(error.statusCode || 500).json({ message: error.message || 'Server error while ending session.' });
    }
};

exports.handleAuthorizationFailure = async (req, res) => {
  const { sessionId } = req.params;
  const clientId = req.user.id;
  const { reason } = req.body;

  try {
    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) return res.status(404).json({ message: 'Session not found.' });
    if (liveSession.client.toString() !== clientId) return res.status(403).json({ message: 'Unauthorized.' });

    liveSession.status = 'error_auth_failed';
    liveSession.cancellationReason = reason || 'Client payment authorization failed.';
    await liveSession.save();
    analyticsService.trackLiveSessionFunnel(sessionId, 'error_auth_failed', {
        reason: liveSession.cancellationReason
    });

    const socketService = getSocketService();
    if(socketService) {
        socketService.emitToUser(liveSession.coach, 'session_cancelled_payment_failed', { sessionId, reason: liveSession.cancellationReason });
    }
    
    res.json({ success: true, message: 'Authorization failure handled.' });
  } catch (error) {
    logger.error('[LiveSessionController] Error handling authorization failure:', { error: error.message, stack: error.stack, sessionId });
    res.status(500).json({ message: 'Server error while handling failure.' });
  }
};

exports.cancelLiveSessionRequest = async (req, res) => {
  const { sessionId } = req.params;
  const clientId = req.user.id;

  try {
    const liveSession = await LiveSession.findById(sessionId);
    if (!liveSession) {
      return res.status(404).json({ message: 'Live session not found.' });
    }
    if (liveSession.client.toString() !== clientId) {
      return res.status(403).json({ message: 'Unauthorized.' });
    }
    // A client can only cancel if it's in the 'requested' state.
    if (liveSession.status !== 'requested') {
      return res.status(400).json({ message: `Session cannot be cancelled. Current status: ${liveSession.status}` });
    }

    liveSession.status = 'client_cancelled';
    liveSession.cancellationReason = 'Cancelled by client before start.';
    await liveSession.save();
    analyticsService.trackLiveSessionFunnel(sessionId, 'client_cancelled');

    const socketService = getSocketService();
    if (socketService) {
      socketService.emitToUser(liveSession.coach, 'live_session_cancelled_by_client', { sessionId });
    }

    res.json({ success: true, message: 'Live session request cancelled.' });
  } catch (error) {
    logger.error('[LiveSessionController] Error cancelling live session request:', { error: error.message, stack: error.stack, sessionId });
    res.status(500).json({ message: 'Server error while cancelling request.' });
  }
};

exports.submitFeedback = async (req, res) => {
  const { sessionId } = req.params;
  const { rating, notes } = req.body;
  const userId = req.user.id;

  try {
    const liveSession = await LiveSession.findById(sessionId);

    if (!liveSession) {
      return res.status(404).json({ message: 'Live session not found.' });
    }

    if (liveSession.status !== 'completed' && liveSession.status !== 'completed_payment_failed') {
        return res.status(400).json({ message: `Cannot submit feedback for a session that is not completed. Current status: ${liveSession.status}` });
    }

    const isClient = liveSession.client.toString() === userId;
    const isCoach = liveSession.coach.toString() === userId;

    if (!isClient && !isCoach) {
      return res.status(403).json({ message: 'You are not a participant in this session.' });
    }

    let updated = false;
    if (isClient) {
      if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
        liveSession.clientFeedbackRating = rating;
        updated = true;
      }
      if (typeof notes === 'string') {
        liveSession.clientPrivateNotes = notes;
        updated = true;
      }
    } else if (isCoach) {
      if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
        liveSession.coachFeedbackRating = rating;
        updated = true;
      }
    }
    
    if (updated) {
        await liveSession.save();
    }

    res.json({ success: true, message: 'Feedback submitted successfully.', session: liveSession });

  } catch (error) {
    logger.error('[LiveSessionController] Error submitting feedback:', { error: error.message, stack: error.stack, sessionId });
    res.status(500).json({ message: 'Server error while submitting feedback.' });
  }
};