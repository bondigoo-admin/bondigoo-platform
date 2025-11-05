const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { logger } = require('../utils/logger');
const User = require('../models/User');
const unifiedNotificationService = require('./unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');

/**
 * This service handles the creation of the underlying financial data record
 * for a coach's payout on a per-transaction basis.
 */
class CoachFinancialService {
    /**
     * Generates a clear description for the main line item on the statement.
     * @param {object} paymentRecord - The Mongoose Payment document.
     * @returns {string} A descriptive string for the service provided.
     */
    _generateDescription(paymentRecord) {
        if (paymentRecord.program?.title) return `Client Payment for Program: ${paymentRecord.program.title}`;
        if (paymentRecord.booking?.title) return `Client Payment for Session: ${paymentRecord.booking.title}`;
        if (paymentRecord.liveSession) return `Client Payment for Live Coaching Session`;
        return 'Client Payment for Coaching Service';
    }

    /**
     * Creates an immutable Stripe Invoice object to serve as the auditable "source of truth"
     * for a coach's transaction statement. This function is idempotent.
     * @param {object} paymentRecord - The fully populated Mongoose Payment document.
     */
    async generateAndStoreStatement(paymentRecord) {
        const logContext = { 
            paymentId: paymentRecord._id, 
            coachId: paymentRecord.recipient?._id, 
            paymentIntentId: paymentRecord.stripe?.paymentIntentId 
        };
        console.log('[CoachFinancialService] Starting Stripe DATA RECORD generation.', logContext);

        try {
            // 1. Idempotency: Critical to prevent duplicate financial records.
            if (paymentRecord.coachPayoutStripeInvoiceId) {
                logger.warn('[CoachFinancialService] SKIPPING: A Stripe data record already exists for this payment.', { 
                    ...logContext, 
                    existingStripeInvoiceId: paymentRecord.coachPayoutStripeInvoiceId 
                });
                return;
            }

            // 2. Validation: Ensure we have the necessary data to proceed.
            const { priceSnapshot, recipient: coachUser, payer } = paymentRecord;
            if (!coachUser || !payer || !priceSnapshot?.final?.amount) {
                throw new Error('Payment record is missing critical data (coach, payer, or priceSnapshot) for statement generation.');
            }
            console.log('[CoachFinancialService] Initial data validation passed.', logContext);

             const b2bInvoice = await Invoice.findOne({
            payment: paymentRecord._id,
            invoiceParty: 'coach_to_platform',
            type: 'invoice'
        });

        if (!b2bInvoice) {
            logger.error('[CoachFinancialService] CRITICAL: B2B self-billed invoice record not found for this payment. Cannot generate settlement advice.', logContext);
            throw new Error(`B2B self-billed invoice record not found for payment ${paymentRecord._id}`);
        }

            // 3. Get or Create Coach's Stripe Customer ID
            let stripeCustomerId = coachUser.stripe?.customerId;
            if (!stripeCustomerId) {
                logger.warn(`[CoachFinancialService] Coach User ${coachUser._id} is missing a Stripe Customer ID. Creating one now.`, logContext);
                const stripeCustomer = await stripe.customers.create({
                    email: coachUser.email,
                    name: `${coachUser.firstName} ${coachUser.lastName}`,
                    metadata: { internal_user_id: coachUser._id.toString() }
                });
                stripeCustomerId = stripeCustomer.id;
                await User.findByIdAndUpdate(coachUser._id, { 'stripe.customerId': stripeCustomerId });
                console.log(`[CoachFinancialService] Created and saved new Stripe Customer ID for coach.`, { ...logContext, stripeCustomerId });
            }

            // 4. Create the Stripe Invoice object. This serves ONLY as a data container.
            const draftInvoice = await stripe.invoices.create({
            customer: stripeCustomerId,
            collection_method: 'send_invoice',
            days_until_due: 0,
            description: `Payout Settlement Advice for Payment ${paymentRecord._id}`,
            auto_advance: false,
            footer: `Refers to Self-Billed Invoice: ${b2bInvoice.invoiceNumber}`
        });
            console.log(`[CoachFinancialService] Draft Stripe Invoice (data source) created. ID: ${draftInvoice.id}`, logContext);

            // 5. Add Line Items to build the financial story
            const currency = priceSnapshot.currency.toLowerCase();
            
            await stripe.invoiceItems.create({
                customer: stripeCustomerId, invoice: draftInvoice.id,
                amount: Math.round(priceSnapshot.final.amount.amount * 100),
                currency, description: this._generateDescription(paymentRecord),
            });
            if (priceSnapshot.vat.amount > 0) {
                 await stripe.invoiceItems.create({
                    customer: stripeCustomerId, invoice: draftInvoice.id,
                    amount: Math.round(priceSnapshot.vat.amount * -100),
                    currency, description: `VAT Withheld by Platform (${priceSnapshot.vat.rate}%)`,
                });
            }
            if (priceSnapshot.platformFee.amount > 0) {
                 await stripe.invoiceItems.create({
                    customer: stripeCustomerId, invoice: draftInvoice.id,
                    amount: Math.round(priceSnapshot.platformFee.amount * -100),
                    currency, description: `Platform Fee (${priceSnapshot.platformFee.percentage}%)`,
                });
            }

            const stripeFeeTransaction = await Transaction.findOne({
                payment: paymentRecord._id,
                type: 'fee'
            });

            if (stripeFeeTransaction) {
                 await stripe.invoiceItems.create({
                    customer: stripeCustomerId, 
                    invoice: draftInvoice.id,
                    amount: -Math.round(stripeFeeTransaction.amount.value * 100),
                    currency, 
                    description: `Payment Processing Fee`,
                });
            } else {
                logger.warn(`[CoachFinancialService] Could not find 'fee' transaction for payment ${paymentRecord._id}. Statement will be missing Stripe fee deduction. This should not happen in the new flow.`);
            }

            console.log(`[CoachFinancialService] All line items added to Stripe Invoice.`, { ...logContext, stripeInvoiceId: draftInvoice.id });

            // 6. Finalize and Pay "Out of Band" to lock the record and calculate totals
            const finalizedInvoice = await stripe.invoices.finalizeInvoice(draftInvoice.id);
            const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id, { paid_out_of_band: true });

            // 7. Save the reference ID to our database. This is the crucial link.
            paymentRecord.coachPayoutStripeInvoiceId = paidInvoice.id;
            await paymentRecord.save();
            console.log(`[CoachFinancialService] Successfully created and linked Stripe data record to Payment document.`, { ...logContext, stripeInvoiceId: paidInvoice.id });

            // 8. Notify the coach of their new earning
            const netEarning = paidInvoice.total / 100;
            await unifiedNotificationService.sendNotification({
                type: NotificationTypes.NEW_EARNING_COACH,
                recipient: coachUser._id,
                metadata: {
                    paymentId: paymentRecord._id,
                    netAmount: netEarning.toFixed(2),
                    currency: paidInvoice.currency.toUpperCase(),
                    clientName: `${payer.firstName} ${payer.lastName}`,
                    bookingId: paymentRecord.booking?._id, 
                    programId: paymentRecord.program?._id,
                }
            });

        } catch (error) {
            logger.error('[CoachFinancialService] CRITICAL FAILURE during Stripe data record generation.', {
                ...logContext, error: error.message, stack: error.stack
            });
            throw error; // Propagate error to be caught by the webhook handler
        }
    }
}

module.exports = new CoachFinancialService();