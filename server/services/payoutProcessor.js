const Payment = require('../models/Payment');
const payoutService = require('../services/payoutService');
const { logger } = require('../utils/logger');

const PAYOUT_BATCH_LIMIT = parseInt(process.env.PAYOUT_BATCH_LIMIT || '50', 10);
const MAX_PAYOUT_ATTEMPTS = parseInt(process.env.MAX_PAYOUT_ATTEMPTS || '5', 10);

const RETRY_DELAYS_MINUTES = [15, 60, 240, 1440]; // 15m, 1h, 4h, 24h

const processPendingPayouts = async () => {
    console.log(`[PayoutProcessor] Starting job. Max attempts: ${MAX_PAYOUT_ATTEMPTS}.`);
    
    let paymentsToProcess;
    try {
        paymentsToProcess = await Payment.find({
            payoutStatus: 'pending',
            nextPayoutAttemptAt: { $lte: new Date() }
        }).limit(PAYOUT_BATCH_LIMIT);
    } catch (error) {
        logger.error('[PayoutProcessor] Error fetching payments for processing.', { error: error.message, stack: error.stack });
        return;
    }

    if (paymentsToProcess.length === 0) {
        console.log('[PayoutProcessor] No payments currently due for payout.');
        return;
    }

    console.log(`[PayoutProcessor] Found ${paymentsToProcess.length} payments to process.`, {
        paymentIds: paymentsToProcess.map(p => p._id.toString())
    });

    let successCount = 0;
    let failureCount = 0;
    let retryCount = 0;

    for (const payment of paymentsToProcess) {
        const logContext = { paymentId: payment._id.toString(), attempt: payment.payoutAttempts + 1 };
        console.log(`[PayoutProcessor] Starting processing for payment.`, logContext);

        try {
            const lockedPayment = await Payment.findOneAndUpdate(
                { _id: payment._id, payoutStatus: 'pending' },
                { $set: { payoutStatus: 'processing', payoutAttempts: payment.payoutAttempts + 1 } },
                { new: true }
            );

            if (!lockedPayment) {
                logger.warn(`[PayoutProcessor] Could not lock payment. It was likely processed by another instance. Skipping.`, { paymentId: payment._id.toString() });
                continue;
            }
            console.log(`[PayoutProcessor] Successfully locked payment and set status to 'processing'.`, logContext);

            console.log(`[PayoutProcessor] Calling payoutService for payment.`, logContext);
            const result = await payoutService.processPayoutForPayment(lockedPayment);
            console.log(`[PayoutProcessor] PayoutService returned SUCCESS.`, { ...logContext, serviceStatus: result.status });

            lockedPayment.stripeTransferId = result.transferId;
            lockedPayment.payoutStatus = result.status === 'skipped_below_minimum' ? 'paid_out' : 'submitted';
            lockedPayment.payoutProcessedAt = new Date();
            
            console.log(`[PayoutProcessor] Preparing to save final status to DB.`, { ...logContext, newPayoutStatus: lockedPayment.payoutStatus, transferId: lockedPayment.stripeTransferId });
            await lockedPayment.save();
            console.log(`[PayoutProcessor] Payment successfully processed and status updated.`, logContext);
            successCount++; 

        } catch (error) {
            // NOTE: The primary error from payoutService is already logged there. This block logs the processor's reaction.
            console.log(`[PayoutProcessor] CATCH BLOCK: Encountered error for payment.`, { ...logContext, errorMessage: error.message });
            
            const currentAttempts = payment.payoutAttempts + 1;

            if (currentAttempts >= MAX_PAYOUT_ATTEMPTS) {
                await Payment.updateOne({ _id: payment._id }, { $set: { payoutStatus: 'failed' } });
                console.log(`[PayoutProcessor] Payment has reached max attempts. Marking as 'failed'.`, logContext);
                logger.error(`[PayoutProcessor] CRITICAL: Payment ${payment._id} has failed all ${MAX_PAYOUT_ATTEMPTS} payout attempts and is now marked as 'failed'. Manual intervention required.`);
                failureCount++;
            } else {
                const delayMinutes = RETRY_DELAYS_MINUTES[currentAttempts - 1] || RETRY_DELAYS_MINUTES[RETRY_DELAYS_MINUTES.length - 1];
                const nextAttemptDate = new Date();
                nextAttemptDate.setMinutes(nextAttemptDate.getMinutes() + delayMinutes);

                await Payment.updateOne(
                    { _id: payment._id }, 
                    { 
                        $set: { 
                            payoutStatus: 'pending', // Set back to pending for the next run
                            nextPayoutAttemptAt: nextAttemptDate 
                        } 
                    }
                );
                console.log(`[PayoutProcessor] Scheduling payment for retry.`, { ...logContext, nextAttemptInMinutes: delayMinutes });
                logger.warn(`[PayoutProcessor] Payment ${payment._id} will be retried in ${delayMinutes} minutes.`, { nextAttempt: nextAttemptDate.toISOString() });
                retryCount++;
            }
        }
    }
    console.log('[PayoutProcessor] Finished payout processing job cycle.', {
        succeeded: successCount,
        permanentlyFailed: failureCount,
        scheduledForRetry: retryCount,
        totalFound: paymentsToProcess.length
    });
};

module.exports = { processPendingPayouts };