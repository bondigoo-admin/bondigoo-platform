const mongoose = require('mongoose');
const User = require('../models/User');
const Review = require('../models/Review');
const Program = require('../models/Program');
const AuditLog = require('../models/AuditLog');
const UnifiedNotificationService = require('./unifiedNotificationService');
const { logger } = require('../utils/logger');
const { getSocketService } = require('./socketService');

const resolveFlag = async (jobData) => {
  const { entityType, entityId, flagId, adminId, action, reason } = jobData;
  const logContext = { job: 'resolve-flag', entityType, entityId, flagId, action };
  console.log('Processing moderation action job.', logContext);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let entity, flag, reportedUserId;

    if (entityType === 'review') {
      entity = await Review.findById(entityId).session(session);
      if (!entity) throw new Error(`Review with ID ${entityId} not found.`);
      reportedUserId = entity.raterId.toString();
    } else if (entityType === 'user') {
      entity = await User.findById(entityId).session(session);
      if (!entity) throw new Error(`User with ID ${entityId} not found.`);
      reportedUserId = entity._id.toString();
    } else if (entityType === 'program') {
      entity = await Program.findById(entityId).session(session);
      if (!entity) throw new Error(`Program with ID ${entityId} not found.`);
      reportedUserId = entity.coach.toString();
    } else {
      throw new Error(`Invalid entityType '${entityType}'.`);
    }

    flag = entity.flags.id(flagId);
    if (!flag || flag.status !== 'pending') {
        logger.warn(`Flag ${flagId} on ${entityType} ${entityId} is not pending or does not exist. Aborting job to prevent re-processing.`);
        await session.abortTransaction();
        session.endSession();
        return;
    }
    
    const flaggerId = flag.flaggedBy.toString();
    flag.resolvedBy = adminId;
    flag.resolvedAt = new Date();
    let newAuditLog;

    switch (action) {
      case 'dismiss':
        flag.status = 'resolved_dismissed';
        await User.findByIdAndUpdate(flaggerId, { $inc: { trustScore: -5 } }, { session });
        await UnifiedNotificationService.sendNotification({
            type: 'report_dismissed', recipient: flaggerId, recipientType: 'client'
        }, {});
        break;

      case 'hide':
        if (entityType !== 'review') throw new Error("Invalid action 'hide' for non-review flag.");
        flag.status = 'resolved_hidden';
        entity.isVisible = false;
        await User.findByIdAndUpdate(reportedUserId, { $inc: { trustScore: -15 } }, { session });
        newAuditLog = (await AuditLog.create([{
          adminUserId: adminId, targetUserId: reportedUserId, targetEntity: entityType, targetEntityId: entity._id, action: 'flag_upheld_review_hidden', reason: reason, metadata: { flagId: flag._id, flaggerId: flaggerId, flagReason: flag.reason }
        }], { session }))[0];
       await UnifiedNotificationService.sendNotification({
            type: 'user_content_hidden', recipient: reportedUserId, recipientType: 'client', metadata: { auditId: newAuditLog._id.toString(), flag_reason_translation: flag.reason, truncated_review_comment: entity.comment.substring(0, 100) }
        }, {});
        break;

       case 'warn':
        if (entityType !== 'user') throw new Error("Invalid action 'warn' for non-user flag.");
        flag.status = 'resolved_warning';
        const updatedUserForWarn = await User.findByIdAndUpdate(reportedUserId, { $inc: { 'moderation.warningsCount': 1, trustScore: -10 } }, { new: true, session });
        newAuditLog = (await AuditLog.create([{
            adminUserId: adminId, targetUserId: reportedUserId, targetEntity: entityType, targetEntityId: entity._id, action: 'user_flag_upheld_warning', reason: reason, metadata: { flagId: flag._id, flaggerId: flaggerId, flagReason: flag.reason }
        }], { session }))[0];
        await UnifiedNotificationService.sendNotification({
            type: 'user_account_warning', recipient: reportedUserId, recipientType: 'client', metadata: { auditId: newAuditLog._id.toString(), flag_reason_translation: flag.reason, warning_count: updatedUserForWarn.moderation.warningsCount }
        }, {});
        break;

      case 'suspend':
        if (entityType !== 'user') throw new Error("Invalid action 'suspend' for non-user flag.");
        flag.status = 'resolved_suspension';
        entity.suspension.isSuspended = true;
        entity.suspension.endsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3-day suspension
        entity.suspension.type = 'read_only';
        entity.trustScore = Math.max(0, entity.trustScore - 25);
        newAuditLog = (await AuditLog.create([{
          adminUserId: adminId, targetUserId: reportedUserId, targetEntity: entityType, targetEntityId: entity._id, action: 'user_flag_upheld_suspension', reason: reason, metadata: { flagId: flag._id, flaggerId: flaggerId, flagReason: flag.reason }
        }], { session }))[0];
        await UnifiedNotificationService.sendNotification({
            type: 'user_account_suspended', recipient: reportedUserId, recipientType: 'client', metadata: { auditId: newAuditLog._id.toString(), flag_reason_translation: flag.reason, suspension_end_date: entity.suspension.endsAt.toISOString(), suspension_type: 'Read-Only', suspension_duration: '3 days' }
        }, {});
        break;

      case 'archive':
        if (entityType !== 'program') throw new Error("Invalid action 'archive' for non-program flag.");
        flag.status = 'resolved_archived';
        entity.status = 'archived';
        await User.findByIdAndUpdate(reportedUserId, { $inc: { trustScore: -20 } }, { session });
        break;

      default:
        throw new Error(`Invalid action '${action}'.`);
    }

    if (action !== 'dismiss') {
      await UnifiedNotificationService.sendNotification({
        type: 'report_actioned', recipient: flaggerId, recipientType: 'client'
      }, {});
    }
    
    await entity.save({ session });

    if (!newAuditLog) {
        await AuditLog.create([{
          adminUserId: adminId, targetUserId: reportedUserId, targetEntity: entityType, targetEntityId: entity._id, action: `${entityType}_flag_${action}`, reason: reason, metadata: { flagId: flag._id, flaggerId: flaggerId, flagReason: flag.reason }
        }], { session });
    }

    await session.commitTransaction();
    console.log('Successfully processed moderation action job and committed transaction.', logContext);

    const socketService = getSocketService();
    if (socketService) {
      console.log(`[ModerationService] Emitting 'moderation_action_complete' to admin_room.`);
      socketService.emitToAdmins('moderation_action_complete', { entityId, flagId, status: 'success' });
    }

  } catch (error) {
    await session.abortTransaction();
    logger.error('Error processing moderation action job. Transaction aborted.', { ...logContext, error: error.message, stack: error.stack });
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  resolveFlag,
};