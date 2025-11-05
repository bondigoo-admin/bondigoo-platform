const invoiceController = require('../controllers/invoiceController');
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');


// @route   GET api/invoices/my-invoices
// @desc    Get all invoices for the currently logged-in user
// @access  Private
router.get('/my-invoices', auth, invoiceController.fetchAllUserInvoices);

// @route   GET api/invoices/download-link/:invoiceId
// @desc    Get a fresh, temporary download URL for an invoice PDF
// @access  Private
router.get('/download-link/:invoiceId', auth, invoiceController.generateInvoiceDownloadUrl);

module.exports = router;