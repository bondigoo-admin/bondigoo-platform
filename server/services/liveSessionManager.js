const mongoose = require('mongoose');
const connection = require('../redisClient');

const LiveSession = require('../models/LiveSession');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Coach = require('../models/Coach');

const paymentService = require('./paymentService');
const { getSocketService } = require('./socketService');
const { logger } = require('../utils/logger');
const unifiedNotificationService = require('./unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');
const analyticsService = require('./analyticsService');
const TaxService = require('./taxService');
const taxService = new TaxService();

const REAUTHORIZATION_MINUTES = 15;
const REAUTH_WARNING_THRESHOLD_MINUTES = 5;
const GRACE_PERIOD_SECONDS = 180;
const MAX_SESSION_LIFETIME_HOURS = 12;

const endSessionLogic = async (sessionId, enderUserId, options = {}) => {
    const { skipPayment = false, reason = null } = options;
    const { liveSessionQueue } = require('./jobQueueService');
  
    try {
      const liveSession = await LiveSession.findById(sessionId);
  
      if (!liveSession) { 
          throw { statusCode: 404, message: 'Live session not found.' };
      }
      
      if (['completed', 'completed_payment_failed', 'pending_settlement', 'completed_payment_skipped'].includes(liveSession.status)) {
        logger.info(`[LiveSessionManager] Session ${sessionId} already completed or processing. No action taken.`);
        return { success: true, message: 'Session already completed.', data: liveSession.toObject() };
      }

      if (enderUserId) {
        const isClient = liveSession.client.toString() === enderUserId;
        const isCoach = liveSession.coach.toString() === enderUserId;
        if (!isClient && !isCoach) {
          throw { statusCode: 403, message: 'You are not authorized to end this session.'};
        }
      }
      
      if (!['in_progress', 'error_reauth_failed'].includes(liveSession.status)) {
        throw { statusCode: 400, message: `Session cannot be ended. Current status: ${liveSession.status}` };
      }
  
      const repeatableJobKey = `monitor:${sessionId}`;
      await liveSessionQueue.removeRepeatableByKey(repeatableJobKey);
      logger.info(`[LiveSessionManager] Removed monitor job for session ${sessionId}.`);
  
      const endTime = new Date();
      const startTime = new Date(liveSession.startTime);
      const durationInSeconds = Math.floor((endTime - startTime) / 1000);
      const finalDurationInSeconds = Math.max(0, durationInSeconds);
      
      liveSession.endTime = endTime;
      liveSession.durationInSeconds = finalDurationInSeconds;
      liveSession.status = 'pending_settlement';
      
      let finalCostBreakdownForResponse;

      if (skipPayment) {
          logger.warn(`[LiveSessionManager] System-terminating session ${sessionId} without payment.`, { reason });
          liveSession.status = 'completed_payment_skipped';
          liveSession.cancellationReason = reason || 'System terminated session.';
          finalCostBreakdownForResponse = { grossAmount: 0, currency: liveSession.effectivePerMinuteRate.currency.toUpperCase() };
          liveSession.finalCost = finalCostBreakdownForResponse;
      } else {
          const finalDurationMinutes = finalDurationInSeconds / 60;
          const currency = liveSession.basePerMinuteRate.currency;
          const grossAmount = finalDurationMinutes * liveSession.basePerMinuteRate.amount;
          const finalAmount = finalDurationMinutes * liveSession.effectivePerMinuteRate.amount;
          const totalDiscountDeducted = grossAmount - finalAmount;

          const client = await User.findById(liveSession.client).select('billingDetails taxInfo');
          const clientTaxInfo = {
              country: client?.taxInfo?.billingAddress?.country,
              postalCode: client?.taxInfo?.billingAddress?.postalCode
          };

          const taxDeconstruction = await taxService.calculateTaxForTransaction({
              totalAmount: finalAmount,
              currency,
              customerLocation: clientTaxInfo
          });
          
          const PLATFORM_FEE_PERCENTAGE = 0.15;
          const platformFeeAmount = taxDeconstruction.netAmount * PLATFORM_FEE_PERCENTAGE;

          const priceDetailsForPayment = {
            base: { amount: { amount: parseFloat(grossAmount.toFixed(2)), currency }, currency },
            final: { amount: { amount: parseFloat(finalAmount.toFixed(2)), currency }, currency },
            netAfterDiscount: parseFloat(taxDeconstruction.netAmount.toFixed(2)),
            currency,
            vat: { 
                rate: taxDeconstruction.taxRate || 0, 
                amount: parseFloat(taxDeconstruction.taxAmount.toFixed(2)), 
                included: true 
            },
            platformFee: { 
                percentage: PLATFORM_FEE_PERCENTAGE * 100, 
                amount: parseFloat(platformFeeAmount.toFixed(2)) 
            },
            discounts: liveSession.discountApplied && totalDiscountDeducted > 0 ? [{
                _id: liveSession.discountApplied._id,
                code: liveSession.discountApplied.code,
                type: liveSession.discountApplied.type,
                value: liveSession.discountApplied.value,
                amountDeducted: parseFloat(totalDiscountDeducted.toFixed(2))
            }] : [],
          };
          
          finalCostBreakdownForResponse = {
              grossAmount: priceDetailsForPayment.final.amount.amount,
              currency: currency.toUpperCase(),
          };
          liveSession.finalCost = { ...finalCostBreakdownForResponse, durationInSeconds: finalDurationInSeconds };
          
          await paymentService.createChargeForCompletedSession(liveSession, priceDetailsForPayment);
      }
      
      await liveSession.save();
  
      const socketService = getSocketService();
      if (socketService) {
          const payload = { sessionId, status: liveSession.status, finalCost: liveSession.finalCost, durationInSeconds: finalDurationInSeconds };
          socketService.emitToUser(liveSession.client.toString(), 'live_session_ended', payload);
          socketService.emitToUser(liveSession.coach.toString(), 'live_session_ended', payload);
      }
  
      return { success: true, message: 'Live session ended and payment is processing.', data: liveSession.toObject() };
  
    } catch (error) {
      logger.error('[LiveSessionManager] Error in endSessionLogic:', { sessionId, error: error.message, stack: error.stack, code: error.statusCode });
      throw error;
    }
};

exports.monitorSession = async (sessionId) => {
  const { liveSessionQueue } = require('./jobQueueService');
  const repeatableJobKey = `monitor:${sessionId}`;

  try {
    const liveSession = await LiveSession.findById(sessionId).populate('paymentRecords');

    if (!liveSession || liveSession.status !== 'in_progress') {
      logger.info(`[LiveSessionManager] Monitor check: Session ${sessionId} no longer active or found. Removing job.`);
      await liveSessionQueue.removeRepeatableByKey(repeatableJobKey);
      return;
    }

    const now = new Date();
    const startTime = new Date(liveSession.startTime);
    const elapsedTimeMinutes = (now - startTime) / 60000;

    const elapsedTimeHours = elapsedTimeMinutes / 60;
    if (elapsedTimeHours > MAX_SESSION_LIFETIME_HOURS) {
        logger.error(`[LiveSessionManager] ZOMBIE SESSION DETECTED. Session ${sessionId} has been running for ${elapsedTimeHours.toFixed(2)} hours, exceeding the max of ${MAX_SESSION_LIFETIME_HOURS}. Forcefully ending.`);
        await endSessionLogic(sessionId, null, { skipPayment: true, reason: 'Terminated: Exceeded max lifetime.' }); 
        return;
    }

    if (!liveSession.participants || liveSession.participants.length === 0) {
        logger.error(`[LiveSessionManager] CRITICAL: Session ${sessionId} is 'in_progress' but has no participants. Ending session to prevent orphan.`);
        await endSessionLogic(sessionId, null, { skipPayment: true, reason: 'Terminated: No participants found.' });
        return;
    }

    for (const participant of liveSession.participants) {
        const lastHeartbeat = participant.lastHeartbeat || startTime;
        const secondsSinceHeartbeat = (now.getTime() - new Date(lastHeartbeat).getTime()) / 1000;
        
        if (secondsSinceHeartbeat > GRACE_PERIOD_SECONDS) {
            logger.warn(`[LiveSessionManager] Participant ${participant.userId} in session ${sessionId} missed heartbeat. Ending session after grace period.`);
            await endSessionLogic(sessionId, null);
            return; 
        }
    }

  } catch (error) {
    logger.error(`[LiveSessionManager] Error monitoring session ${sessionId}. The job will retry.`, { error: error.message, stack: error.stack });
    // Do not remove the job here. BullMQ will handle retries based on its configuration.
    // If it continuously fails, the MAX_SESSION_LIFETIME check will eventually kill it.
  }
};

exports.forceEndSession = async (sessionId) => {
    logger.info(`[LiveSessionManager] Worker starting forceEndSession for ${sessionId}`);
    try {
        await endSessionLogic(sessionId, null);
    } catch(error) {
        logger.error(`[LiveSessionManager] forceEndSession failed for ${sessionId}`, { error: error.message });
    }
};

exports.resetCoachStatus = async (coachId, expectedStatus) => {
    try {
        const coachUser = await User.findById(coachId);
        if (coachUser) {
            if (coachUser.status === 'busy') {
                coachUser.status = expectedStatus;
                await coachUser.save();
                logger.info(`[LiveSessionManager] Reset coach ${coachId} status to ${expectedStatus}.`);
            } else {
                logger.warn(`[LiveSessionManager] Did not reset coach ${coachId} status. Current status is '${coachUser.status}', not 'busy'.`);
            }
        }
    } catch (error) {
        logger.error(`[LiveSessionManager] Error resetting coach status for ${coachId}`, { error: error.message });
    }
};

exports.endSession = endSessionLogic;