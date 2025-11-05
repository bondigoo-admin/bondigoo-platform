const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const unifiedNotificationService = require('../services/unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');

const escalateStaleDisputes = async () => {
  const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
  const logContext = { job: 'escalateStaleDisputes', staleThreshold: threeDaysAgo.toISOString() };
  logger.info('[DisputeEscalationJob] Starting job to find stale disputes.', logContext);

  try {
    const systemSender = await User.findOne({ role: 'admin' }).lean();
    if (!systemSender) {
        logger.error('[DisputeEscalationJob] Could not find an admin user to act as system sender. Halting job.', logContext);
        return;
    }

    const staleTickets = await SupportTicket.find({
      status: 'awaiting_coach_response',
      createdAt: { $lte: threeDaysAgo }
    }).populate('booking');

    if (staleTickets.length === 0) {
      logger.info('[DisputeEscalationJob] No stale disputes found.', logContext);
      return;
    }

    logger.info(`[DisputeEscalationJob] Found ${staleTickets.length} stale tickets to escalate.`, { ...logContext, ticketIds: staleTickets.map(t => t._id) });

    for (const ticket of staleTickets) {
      ticket.status = 'escalated_to_admin';
      ticket.messages.push({
        sender: systemSender._id,
        content: 'Request automatically escalated to support due to no response from coach within 72 hours.',
        createdAt: new Date()
      });
      await ticket.save();

      // Notify client that their request has been escalated
      await unifiedNotificationService.sendNotification({
        type: NotificationTypes.REFUND_REQUEST_ESCALATED,
        recipient: ticket.user,
        metadata: {
            bookingId: ticket.booking._id,
            ticketId: ticket._id
        }
      });
    }
  } catch (error) {
    logger.error('[DisputeEscalationJob] Error during job execution.', { ...logContext, error: error.message, stack: error.stack });
  }
};

module.exports = { escalateStaleDisputes };