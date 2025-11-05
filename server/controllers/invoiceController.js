// server/controllers/invoiceController.js

console.log('[DEBUG] ==> Loading invoiceController.js...');

const Invoice = require('../models/Invoice');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { logger } = require('../utils/logger');

/**
 * @desc    Get all invoices for the logged-in user
 * @route   GET /api/invoices/my-invoices
 * @access  Private
 */
const fetchAllUserInvoices = async (req, res) => {
    try {
        // --- THIS IS THE FIX ---
        // We are consolidating the enhanced population logic directly into the
        // function that is being correctly exported and used by the router.
        const invoices = await Invoice.find({ user: req.user._id })
            .populate({
                path: 'payment',
                // We now select the detailed priceSnapshot and discountApplied fields
                select: 'priceSnapshot discountApplied program booking',
                populate: [
                    { path: 'program', select: 'title' },
                    { path: 'booking', select: 'title' }
                ]
            })
            .sort({ createdAt: -1 });

        res.json(invoices);
    } catch (error) {
        logger.error('[invoiceController] CRITICAL FAILURE in fetchAllUserInvoices', { userId: req.user._id, error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};

/**
 * @desc    Get a fresh, temporary download URL for an invoice PDF
 * @route   GET /api/invoices/download-link/:invoiceId
 * @access  Private
 */
const generateInvoiceDownloadUrl = async (req, res) => {
    try {
        const invoice = await Invoice.findOne({ _id: req.params.invoiceId, user: req.user._id });

        if (!invoice) {
            logger.warn(`[invoiceController] Invoice not found or access denied`, { invoiceId: req.params.invoiceId, userId: req.user._id });
            return res.status(404).json({ msg: 'Invoice not found' });
        }

        const stripeInvoice = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
        
        if (!stripeInvoice || !stripeInvoice.invoice_pdf) {
             logger.warn(`[invoiceController] Stripe invoice or PDF URL not available`, { stripeInvoiceId: invoice.stripeInvoiceId });
             return res.status(404).json({ msg: 'PDF not available for this invoice.' });
        }

        res.json({ url: stripeInvoice.invoice_pdf });
    } catch (error) {
        logger.error('[invoiceController] CRITICAL FAILURE in generateInvoiceDownloadUrl', { invoiceId: req.params.invoiceId, error: error.message, stack: error.stack });
        res.status(500).send('Server Error');
    }
};

const exportsObject = {
    fetchAllUserInvoices,
    generateInvoiceDownloadUrl,
};

console.log('[DEBUG] <== Preparing to export from invoiceController.js. Object keys:', Object.keys(exportsObject));

// Export all controller functions in a single object
module.exports = exportsObject;