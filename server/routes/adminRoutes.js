const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const coachController = require('../controllers/coachController');
const { auth } = require('../middleware/auth');
const checkRole = require('../middleware/checkRole');
const adminNotificationController = require('../controllers/adminNotificationController');
const { check, validationResult } = require('express-validator');
const supportController = require('../controllers/supportController'); 
const jobQueueController = require('../controllers/jobQueueController');
const featureFlagController = require('../controllers/featureFlagController');
const announcementController = require('../controllers/announcementController');

router.get('/meta/user-roles', auth, checkRole('admin'), adminController.getUserRoles);
router.get('/users/unique-countries', auth, checkRole('admin'), adminController.getUniqueUserCountries);
router.get('/users/safety-profiles', auth, checkRole('admin'), adminController.getSafetyProfiles);
router.get('/users/blocked-pairs', auth, checkRole('admin'), adminController.getBlockedPairs);

// SECTION 1: PULSE DASHBOARD
router.get('/dashboard/overview', auth, checkRole('admin'), adminController.getDashboardOverviewStats);
router.patch('/dashboard-preferences', auth, checkRole('admin'), adminController.updateDashboardPreferences);

// SECTION 2: USER & COACH MANAGEMENT ("ROSTER")
router.get('/users', auth, checkRole('admin'), adminController.getUsers);
router.get('/users/:userId', auth, checkRole('admin'), adminController.getUserDetail);
router.patch('/users/:userId', auth, checkRole('admin'), adminController.updateUserByAdmin);
router.put('/users/:userId/fee-override', auth, checkRole('admin'), adminController.updateFeeOverride);
router.post('/users/:userId/remove-warning', auth, checkRole('admin'), adminController.removeUserWarning);
router.post('/users/:userId/impersonate', auth, checkRole('admin'), adminController.impersonateUser);
router.post('/users/:userId/reset-password', auth, checkRole('admin'), adminController.requestPasswordResetByAdmin);
router.post('/users/:userId/verify-email', auth, checkRole('admin'), adminController.verifyUserEmailByAdmin);
router.delete('/users/:id', auth, checkRole('admin'), adminController.deleteUser);
router.patch('/coaches/:userId', auth, checkRole('admin'), adminController.updateCoachByAdmin);

// SECTION 3: FINANCIAL COMMAND CENTER
router.get('/payments', auth, checkRole('admin'), adminController.getPaymentsLedger);
router.get('/payouts', auth, checkRole('admin'), adminController.getPayouts);
router.patch('/payouts/:paymentId/status', auth, checkRole('admin'), adminController.updatePayoutStatus);
router.post('/refunds/execute/:paymentId', auth, checkRole('admin'), adminController.executeAdminRefund);
router.get('/disputes', auth, checkRole('admin'), adminController.getAdminDisputes);
router.get('/discounts', auth, checkRole('admin'), adminController.getDiscounts);
router.get('/disputes/:ticketId', auth, checkRole('admin'), adminController.getDisputeDetail);
router.post('/disputes/:ticketId/resolve', auth, checkRole('admin'), adminController.resolveDispute);
router.post('/discounts', auth, checkRole('admin'), adminController.createDiscountByAdmin);
router.patch('/discounts/:discountId', auth, checkRole('admin'), adminController.updateDiscountByAdmin);
router.delete('/discounts/:discountId', auth, checkRole('admin'), adminController.deleteDiscountByAdmin);
router.get('/forms/discount-data', auth, checkRole('admin'), adminController.getFormData);
router.get('/financials/vat-threshold-summary', auth, checkRole('admin'), adminController.getVatThresholdSummary);
router.get('/financials/vat-report', auth, checkRole('admin'), adminController.getVatReport);
router.get('/documents/:invoiceId', auth, checkRole('admin'), adminController.getB2bDocumentForAdmin);
router.get('/financials/settlement-advice/:paymentId', auth, checkRole('admin'), adminController.downloadSettlementAdviceForCoach);

// SECTION 4: PLATFORM & CONTENT MANAGEMENT
router.get('/programs', auth, checkRole('admin'), adminController.getPrograms);
router.patch('/programs/:programId', auth, checkRole('admin'), adminController.updateProgramByAdmin); 
router.get('/translation-overview', auth, checkRole('admin'), adminController.getTranslationOverview);
router.get('/list-types', auth, checkRole('admin'), adminController.getListTypes);
router.get('/translations/:listType', auth, adminController.getTranslations);
router.post('/translations', auth, checkRole('admin'), adminController.addTranslation);
router.put('/translations/:listType/:key', auth, checkRole('admin'), adminController.updateTranslation); // More specific than the one below
router.put('/translations/:key', auth, checkRole('admin'), adminController.updateTranslation);

// SECTION 5: MODERATION & SUPPORT CENTER
router.get('/moderation/queue', auth, checkRole('admin'), adminController.getModerationQueue);
router.post('/moderation/reviews/:reviewId/flags/:flagId/resolve', auth, checkRole('admin'), adminController.resolveReviewFlag);
router.post('/moderation/users/:userId/flags/:flagId/resolve', auth, checkRole('admin'), adminController.resolveUserFlag);
router.post('/moderation/programs/:programId/flags/:flagId/resolve', auth, checkRole('admin'), adminController.resolveProgramFlag);
router.delete('/users/:blockerId/unblock/:blockedId', auth, checkRole('admin'), adminController.forceUnblockUser);

//Insurance verfication
// Allows T&S officers and admins to view the document
router.get('/verifications/document/:coachUserId/:registryName', auth, checkRole('admin'), adminController.getVerificationDocument);

// Allows T&S officers and admins to view the queue
router.get('/verifications/queue', auth, checkRole('admin'), adminController.getVerificationQueue);

// Allows T&S officers and admins to resolve requests
router.post('/verifications/resolve', auth, checkRole('admin'), adminController.resolveVerificationRequest);

// --- USER-FACING SUPPORT & MODERATION ROUTES ---
// These routes are used by regular users, not just admins, so they only use the `auth` middleware.
router.post('/support/tickets', auth, supportController.createSupportTicket);
router.get('/feedback-attachment-signature', auth, coachController.getFeedbackAttachmentSignature);
router.get('/moderation-actions/:auditId', auth, adminController.getModerationActionDetails);

// Support Routes
router.get('/support/tickets', auth, checkRole('admin'), supportController.getSupportTickets);
router.get('/support/tickets/:ticketId', auth, checkRole('admin'), supportController.getTicketDetails);
router.post('/support/tickets/:ticketId/internal-notes', auth, checkRole('admin'), supportController.addInternalNote);
router.patch('/support/tickets/:ticketId', auth, checkRole('admin'), supportController.updateTicket);

// SECTION 6: SYSTEM & DEVELOPER TOOLS
router.get('/system/health', auth, checkRole('admin'), adminController.getSystemHealth);

// Webhook Routes
router.get('/webhook-logs', auth, checkRole('admin'), adminController.getWebhookLogs);
router.post('/webhooks/replay', auth, checkRole('admin'), adminController.replayWebhooksBulk);
router.post('/webhooks/:logId/replay', auth, checkRole('admin'), adminController.replayWebhook);

// Job Queue Routes
router.get('/queues', auth, checkRole('admin'), jobQueueController.getQueues);
router.get('/queues/:queueName/jobs', auth, checkRole('admin'), jobQueueController.getJobs);
router.get('/queues/:queueName/jobs/:jobId', auth, checkRole('admin'), jobQueueController.getJobDetails);
router.post('/queues/:queueName/jobs/action', auth, checkRole('admin'), jobQueueController.performJobAction);
router.post('/queues/:queueName/action', auth, checkRole('admin'), jobQueueController.performQueueAction);

// Feature Flag Routes
router.get('/feature-flags', auth, checkRole('admin'), featureFlagController.getFeatureFlags);
router.post('/feature-flags', auth, checkRole('admin'), featureFlagController.createFeatureFlag);
router.patch('/feature-flags/:flagId', auth, checkRole('admin'), featureFlagController.updateFeatureFlag);
router.delete('/feature-flags/:flagId', auth, checkRole('admin'), featureFlagController.deleteFeatureFlag);

// Announcement Routes
router.get('/announcements', auth, checkRole('admin'), announcementController.getAnnouncements);
router.post('/announcements', auth, checkRole('admin'), announcementController.createAnnouncement);
router.patch('/announcements/:id', auth, checkRole('admin'), announcementController.updateAnnouncement);
router.delete('/announcements/:id', auth, checkRole('admin'), announcementController.deleteAnnouncement);
router.post('/announcements/:id/view', auth, checkRole('admin'), announcementController.trackAnnouncementView);
router.post('/announcements/:id/click', auth, checkRole('admin'), announcementController.trackAnnouncementClick);

// Cache Management
router.post('/cache/flush', auth, checkRole('admin'), adminController.flushCacheKey);

// MISC & DEPRECATED-STYLE ROUTES (Placed after specific routes)
router.get('/coaches', auth, checkRole('admin'), adminController.getAllCoaches);
router.get('/coaches/:id', auth, checkRole('admin'), adminController.getCoachById);
router.put('/coaches/:id/status', auth, checkRole('admin'), adminController.updateCoachStatus);
router.get('/stats', auth, checkRole('admin'), adminController.getSystemStats);
router.get('/recent-activity', auth, checkRole('admin'), adminController.getRecentActivity);

// LEAD MANAGEMENT
router.get('/leads', auth, checkRole('admin'), adminController.getLeads);

// BOOKING OVERRIDE
router.post(
  '/bookings/:bookingId/override-cancellation',
  auth,
  checkRole('admin'),
  [
    check('actionType').isIn(['Issue Refund Only', 'Cancel Booking & Issue Refund', 'Change Booking Status Only']).withMessage('Invalid action type.'),
    check('refundAmount').optional().isFloat({ gt: 0 }).withMessage('Refund amount must be a positive number if provided.'),
    check('newBookingStatus').optional().isString().notEmpty().withMessage('New booking status must be a non-empty string if provided.'),
    check('reasonForOverride').isString().notEmpty().withMessage('Reason for override is required.'),
    check('messageToClient').optional().isString(),
    check('messageToCoach').optional().isString(),
    check('notifyClient').optional().isBoolean(),
    check('notifyCoach').optional().isBoolean(),
    check('actionType').custom((value, { req }) => {
      if ((value === 'Cancel Booking & Issue Refund' || value === 'Change Booking Status Only') && !req.body.newBookingStatus) {
        throw new Error('New booking status is required for this action type.');
      }
      return true;
    }),
    check('actionType').custom((value, { req }) => {
      if ((value === 'Issue Refund Only' || value === 'Cancel Booking & Issue Refund') && (req.body.refundAmount !== undefined && parseFloat(req.body.refundAmount) <= 0 ) ) {
        throw new Error('If refundAmount is specified for a refund action, it must be greater than 0.');
      }
      return true;
    })
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  adminController.overrideBookingCancellation
);

// NOTIFICATION SETTINGS
router.get('/settings/notifications', adminNotificationController.getSettings);
router.put('/settings/notifications', adminNotificationController.updateSettings);
router.get('/settings/notifications/stats', adminNotificationController.getDeliveryStats);
router.get('/settings/notifications/templates', adminNotificationController.getNotificationTemplates);
router.put('/settings/notifications/templates/:id', adminNotificationController.updateNotificationTemplate);
router.post('/settings/notifications/reset', adminNotificationController.resetToDefaults);

// --- WILDCARD LIST MANAGEMENT ROUTES (MUST BE LAST) ---
router.get('/:listType', auth, checkRole('admin'), adminController.getListItems);
router.post('/:listType', auth, checkRole('admin'), adminController.addListItem);
router.post('/:listType/bulk-delete', auth, checkRole('admin'), adminController.bulkDeleteListItems);
router.put('/:listType/reorder', auth, checkRole('admin'), adminController.reorderListItems);
router.post('/:listType/import', auth, checkRole('admin'), adminController.importListItems);
router.put('/:listType/:itemId', auth, checkRole('admin'), adminController.updateListItem); // Note: Should be :id to match controller
router.delete('/:listType/:itemId', auth, checkRole('admin'), adminController.deleteListItem); // Note: Should be :id to match controller

module.exports = router;