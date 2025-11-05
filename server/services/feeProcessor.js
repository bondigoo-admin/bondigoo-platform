const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { logger } = require('../utils/logger');

const BATCH_LIMIT = 50;

const processMissingFees = async () => {
    logger.info('[FeeProcessor] Starting job to find completed payments missing fee transactions.');

    try {
        const paymentsWithoutFee = await Payment.aggregate([
            {
                $match: {
                    status: 'completed',
                    'stripe.paymentIntentId': { $exists: true, $ne: null },
                }
            },
            {
                $lookup: {
                    from: 'transactions',
                    let: { paymentId: '$_id' },
                    pipeline: [ { $match: { $expr: { $and: [ { $eq: ['$payment', '$$paymentId'] }, { $eq: ['$type', 'fee'] } ] } } } ],
                    as: 'feeTransactions'
                }
            },
            {
                $match: {
                    feeTransactions: { $size: 0 }
                }
            },
            {
                $limit: BATCH_LIMIT
            }
        ]);

        if (paymentsWithoutFee.length === 0) {
            logger.info('[FeeProcessor] Job finished: No payments found requiring a fee transaction.');
            return;
        }

        logger.info(`[FeeProcessor] Found ${paymentsWithoutFee.length} payments to process for fees.`);

        for (const payment of paymentsWithoutFee) {
            const paymentIntentId = payment.stripe.paymentIntentId;
            const logContext = { paymentId: payment._id.toString(), paymentIntentId };

            logger.info('[FeeProcessor] STEP 1: Processing payment.', logContext);

            try {
                // STEP 2: Use the PAYMENT INTENT ID to retrieve the full PaymentIntent object from Stripe.
                logger.info('[FeeProcessor] STEP 2: Retrieving Payment Intent from Stripe.', logContext);
                const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
                const chargeId = paymentIntent.latest_charge;

                if (!chargeId) {
                    logger.warn('[FeeProcessor] SKIPPING: Payment Intent does not have a charge ID yet. This is a temporary state. Will retry on the next run.', logContext);
                    continue;
                }

                logContext.chargeId = chargeId;
                logger.info('[FeeProcessor] STEP 3: Successfully found Charge ID from Payment Intent.', logContext);

                // STEP 3: Use the correct CHARGE ID to retrieve the charge and its fee.
                const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
                
                if (!charge.balance_transaction) {
                    logger.warn('[FeeProcessor] SKIPPING: Balance transaction not yet available for charge. This is a temporary state. Will retry on the next run.', logContext);
                    continue;
                }
                
                logger.info('[FeeProcessor] STEP 4: Successfully retrieved Charge and Balance Transaction from Stripe.', { ...logContext, balanceTransactionId: charge.balance_transaction.id, feeInCents: charge.balance_transaction.fee });

                const actualStripeFee = charge.balance_transaction.fee / 100;
                const feeCurrency = charge.balance_transaction.currency.toUpperCase();

                // STEP 4: Create the fee transaction in our database.
                await Transaction.findOneAndUpdate(
                    { payment: payment._id, type: 'fee' },
                    { 
                      $setOnInsert: {
                          payment: payment._id,
                          booking: payment.booking,
                          program: payment.program,
                          type: 'fee',
                          amount: { value: actualStripeFee, currency: feeCurrency },
                          status: 'completed',
                          stripe: { chargeId: charge.id, balanceTransactionId: charge.balance_transaction.id },
                          description: `Stripe processing fee for charge ${charge.id}`
                      }
                    },
                    { upsert: true, new: true, runValidators: true }
                );

                logger.info('[FeeProcessor] STEP 5: SUCCESS! Created fee transaction.', { ...logContext, feeAmount: actualStripeFee });

            } catch (error) {
                logger.error('[FeeProcessor] FAILED: Could not process fee for a single payment.', { ...logContext, errorName: error.name, errorMessage: error.message });
            }
        }
        logger.info(`[FeeProcessor] Job cycle finished.`);

    } catch (error) {
        logger.error('[FeeProcessor] CRITICAL: The fee processing job failed entirely during the initial database query.', { error: error.message, stack: error.stack });
    }
};

module.exports = { processMissingFees };