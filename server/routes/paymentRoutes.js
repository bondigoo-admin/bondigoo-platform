const express = require('express');
const router = express.Router();
const { auth, isCoach } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');
const { logger } = require('../utils/logger');
const connectController = require('../controllers/connectController');
const checkRole = require('../middleware/checkRole');

// Create payment intent
router.post('/create-intent', auth, paymentController.createPaymentIntent);

// Confirm payment
router.post('/confirm', auth, paymentController.confirmPayment);

// Process refund
router.post('/refund-requests', auth, paymentController.createRefundRequest);
router.post('/coach/refunds/initiate', auth, isCoach, paymentController.initiateCoachRefund);
router.post('/refund-requests/:ticketId/respond', auth, isCoach, paymentController.respondToRefundRequest);
router.post('/refund-requests/:ticketId/escalate', auth, paymentController.escalateDisputeByClient);
router.post('/refund', auth, paymentController.refundPayment);

// Get payment status
router.get('/status/:paymentIntentId', auth, paymentController.getPaymentStatus);

// Get transaction history
router.get('/transactions', auth, paymentController.getTransactionHistory);

// Get saved payment methods
router.get('/methods/:userId', auth, paymentController.getPaymentMethods);

router.post('/webhook', express.raw({type: 'application/json'}), paymentController.webhookHandler);

// Add payment method
router.post('/methods/:userId', auth, paymentController.addPaymentMethod);

// Delete payment method
router.delete('/methods/:userId/:methodId', auth, paymentController.deletePaymentMethod);

// Stripe Connect routes
router.post('/connect/account', auth, isCoach, connectController.createAccount);
router.get('/connect/account/status', auth, isCoach, connectController.getAccountStatus);

router.post('/methods/:userId/default', auth, paymentController.setDefaultPaymentMethod);

// Edit existing account
router.get('/connect/account/dashboard', auth, isCoach, connectController.getAccountDashboardLink);

// Error handling middleware
router.use((err, req, res, next) => {
  logger.error('[PaymentRoutes] Error:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    userId: req.user?._id
  });

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

module.exports = {
  router,
  webhookHandler: paymentController.webhookHandler
};