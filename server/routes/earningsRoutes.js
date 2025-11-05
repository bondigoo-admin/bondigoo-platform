const express = require('express');
const router = express.Router();
const { auth, isCoach } = require('../middleware/auth');
const earningsController = require('../controllers/earningsController');
const { logger } = require('../utils/logger');

router.get('/dashboard-stats', auth, isCoach, earningsController.getDashboardStats);
router.get('/transactions', auth, isCoach, earningsController.getTransactions);

router.get(
    '/transaction-statement/:paymentId',
    auth,
    isCoach,
    (req, res, next) => {
        console.log('--- [ROUTE TRACE] ---');
        console.log(`- PDF Route Hit: ${req.originalUrl}`);
        console.log(`- User ID: ${req.user?._id}`);
        console.log('--- [END ROUTE TRACE] ---');
        next();
    },
    earningsController.downloadTransactionStatement
);

router.get('/documents/b2b/:invoiceId', auth, isCoach, earningsController.getB2bDocumentUrl);

router.get('/adjustments', auth, isCoach, earningsController.getAdjustments);

module.exports = router;