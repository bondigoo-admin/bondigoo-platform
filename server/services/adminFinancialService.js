const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const paymentService = require('./paymentService');
const invoiceService = require('./invoiceService');
const Coach = require('../models/Coach'); 
const unifiedNotificationService = require('./unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');
const { logger } = require('../utils/logger');
const coachInvoiceService = require('./coachInvoiceService');
const mongoose = require('mongoose');

class AdminFinancialService {
  /**
   * The single, authoritative function for PROCESSING a confirmed refund event.
   * This is now called EXCLUSIVELY BY THE WEBHOOK HANDLER.
   * @param {object} params - The refund parameters.
   * @param {object} params.payment - The Mongoose Payment document.
   * @param {object} params.stripeRefund - The successful Stripe Refund object (`re_...`).
   * @param {string} params.reason - The reason for the refund.
   * @param {'standard'|'platform_fault'|'goodwill'} params.policyType - The financial policy to apply.
   * @param {string} params.initiatorId - The ID of the user (admin, coach) who initiated the refund.
   */
async processRefund({ payment, stripeRefund, reason, policyType, initiatorId }) {
    const logContext = { paymentId: payment._id, stripeRefundId: stripeRefund.id, policyType, initiatorId };
    console.log(`[AdminFinancialService] ==> processRefund START`, logContext);

    const session = await mongoose.startSession();
    try {
      let finalPaymentState;
      let finalAssociatedBooking;

      await session.withTransaction(async () => {
        const paymentInTransaction = await Payment.findById(payment._id).populate('payer recipient').session(session);
        if (!paymentInTransaction) {
            throw new Error('Payment record not found within transaction.');
        }

        if (paymentInTransaction.refunds.some(r => r.stripeRefundId === stripeRefund.id)) {
            logger.warn(`[AdminFinancialService] Refund ${stripeRefund.id} has already been processed. Idempotency check passed.`, logContext);
            throw new Error(`Duplicate refund event: ${stripeRefund.id}`);
        }

        const amount = stripeRefund.amount / 100;
        const associatedBooking = await Booking.findById(paymentInTransaction.booking).populate('user coach sessionType').session(session);

        const totalPreviouslyRefunded = paymentInTransaction.amount.refunded || 0;
        const maxRefundable = paymentInTransaction.amount.total - totalPreviouslyRefunded;
        if (amount > (maxRefundable + 0.001)) {
          throw new Error(`Invalid refund amount ${amount}. Max refundable is ${maxRefundable}.`);
        }

        try {
            await invoiceService.generateStripeCreditNoteForRefund(paymentInTransaction, stripeRefund, amount, reason, session);
        } catch (creditNoteError) {
            logger.error(`Non-fatal error during B2C Credit Note generation for payment ${paymentInTransaction._id}`, { error: creditNoteError.message });
        }

        const irrecoverableStripeFee = (await Transaction.findOne({ payment: paymentInTransaction._id, type: 'fee' }).session(session))?.amount.value || 0;
        const vatAmount = paymentInTransaction.amount.vat?.amount || 0;
        const netEarning = paymentInTransaction.amount.total - paymentInTransaction.amount.platformFee - vatAmount - irrecoverableStripeFee;
        const refundedPortion = paymentInTransaction.amount.total > 0 ? (amount / paymentInTransaction.amount.total) : 0;
        let coachDebitAmount = 0;

        switch (policyType) {
          case 'platform_fault':
            coachDebitAmount = netEarning * refundedPortion;
            break;
          case 'goodwill':
            coachDebitAmount = 0;
            break;
          case 'standard':
          default:
            coachDebitAmount = (netEarning * refundedPortion) + (irrecoverableStripeFee * refundedPortion);
            break;
        }
        coachDebitAmount = parseFloat(coachDebitAmount.toFixed(2));
        
        await Transaction.create([{
          payment: paymentInTransaction._id,
          booking: associatedBooking?._id,
          type: 'refund',
          status: 'completed',
          amount: { value: -amount, currency: paymentInTransaction.amount.currency },
          stripe: { refundId: stripeRefund.id, chargeId: stripeRefund.charge },
          description: `Refund initiated by ${initiatorId}. Reason: ${reason}`,
          metadata: { 
              refundPolicy: policyType, 
              coachDebitAmount: -coachDebitAmount,
              platformFeeForfeited: parseFloat((paymentInTransaction.amount.platformFee * refundedPortion).toFixed(2)),
              vatReclaimed: parseFloat(((paymentInTransaction.amount.vat?.amount || 0) * refundedPortion).toFixed(2)),
              stripeFeeLost: parseFloat((irrecoverableStripeFee * refundedPortion).toFixed(2))
          }
        }], { session });

        paymentInTransaction.amount.refunded = totalPreviouslyRefunded + amount;

        if (paymentInTransaction.payoutStatus === 'pending') {
            if (paymentInTransaction.amount.total - paymentInTransaction.amount.refunded < 0.01) {
                paymentInTransaction.payoutStatus = 'not_applicable';
            }
        } else if (paymentInTransaction.payoutStatus === 'submitted' || paymentInTransaction.payoutStatus === 'paid_out') {
            if (coachDebitAmount > 0) {
                 console.log('[AdminFinancialService] Preparing to create negative adjustment payment.', {
                    paymentId: paymentInTransaction._id,
                    payoutStatus: paymentInTransaction.payoutStatus,
                    coachDebitAmount: coachDebitAmount,
                    logForStripeId: {
                        paymentInTransaction_id: paymentInTransaction._id,
                        coachStripeAccountId_on_payment: paymentInTransaction.coachStripeAccountId,
                        recipient_id_on_payment: paymentInTransaction.recipient?._id,
                        recipient_is_object: typeof paymentInTransaction.recipient === 'object'
                    }
                });
                
                const coachUser = paymentInTransaction.recipient;
                if (!coachUser || !coachUser._id) {
                    throw new Error(`Cannot create adjustment: Recipient (Coach User) is not populated on payment ${paymentInTransaction._id}.`);
                }

                const coachProfile = await Coach.findOne({ user: coachUser._id }).select('settings.paymentAndBilling.stripe.accountId').session(session).lean();
                const definitiveCoachStripeId = coachProfile?.settings?.paymentAndBilling?.stripe?.accountId;

                if (!definitiveCoachStripeId) {
                    logger.error(`[AdminFinancialService] CRITICAL FAILURE: Cannot find Stripe Account ID for coach during adjustment creation.`, { coachUserId: coachUser._id });
                    throw new Error(`Could not find Stripe Account ID for coach ${coachUser._id}. Cannot create adjustment payment.`);
                }

                const payerId = mongoose.Types.ObjectId.isValid(initiatorId) ? initiatorId : process.env.PLATFORM_USER_ID;

                const adjustment = new Payment({
                    booking: paymentInTransaction.booking,
                    coachStripeAccountId: definitiveCoachStripeId,
                    type: 'adjustment',
                    recipient: paymentInTransaction.recipient._id,
                    payer: payerId,
                    status: 'pending_deduction',
                    amount: { total: -coachDebitAmount, currency: paymentInTransaction.amount.currency },
                    metadata: {
                        originalPaymentId: paymentInTransaction._id.toString(),
                        reason: `Post-payout refund deduction for payment ${paymentInTransaction._id}. Policy: ${policyType}.`
                    }
                });
                await adjustment.save({ session });
            }
        }

        const newTotalRefunded = paymentInTransaction.amount.refunded || 0;
        paymentInTransaction.status = (paymentInTransaction.amount.total - newTotalRefunded < 0.01) ? 'refunded' : 'partially_refunded';
        paymentInTransaction.refunds.push({
            amount: amount,
            currency: paymentInTransaction.amount.currency,
            reason,
            status: 'succeeded',
            stripeRefundId: stripeRefund.id,
            processedBy: initiatorId,
            processedAt: new Date()
        });
        if (paymentInTransaction.payoutStatus === 'submitted' || paymentInTransaction.payoutStatus === 'paid_out') {
          try {
              await coachInvoiceService.generateCreditNoteForRefund(paymentInTransaction, amount, reason, session);
          } catch (b2bCreditNoteError) {
              logger.error(`Non-fatal: Failed to generate B2B self-billed credit note for payment ${paymentInTransaction._id}.`, { ...logContext, error: b2bCreditNoteError.message });
          }
        }
        await paymentInTransaction.save({ session });
        finalPaymentState = paymentInTransaction.toObject();
        finalAssociatedBooking = associatedBooking ? associatedBooking.toObject() : null;
      });

      await unifiedNotificationService.sendNotification({
          type: NotificationTypes.REFUND_PROCESSED_COACH,
          recipient: finalPaymentState.recipient._id,
          metadata: {
              bookingId: finalAssociatedBooking?._id,
              paymentId: finalPaymentState._id,
              refundAmount: stripeRefund.amount / 100,
              currency: finalPaymentState.amount.currency,
          }
      }, finalAssociatedBooking);

      await unifiedNotificationService.sendNotification({
          type: NotificationTypes.REFUND_PROCESSED_CLIENT,
          recipient: finalPaymentState.payer._id,
          metadata: {
              bookingId: finalAssociatedBooking?._id,
              paymentId: finalPaymentState._id,
              refundAmount: stripeRefund.amount / 100,
              currency: finalPaymentState.amount.currency,
          }
      }, finalAssociatedBooking);

      console.log('[AdminFinancialService] Confirmed refund process completed successfully.', logContext);
      return { payment: finalPaymentState, stripeRefund };
    } catch (error) {
      if (error.message.startsWith('Duplicate refund event')) {
        return;
      }
      logger.error('[AdminFinancialService] CRITICAL: DB transaction failed during confirmed refund processing.', { ...logContext, error: error.message, stack: error.stack });
      throw new Error('Database update failed for a confirmed refund.');
    } finally {
      session.endSession();
    }
  }
}

module.exports = new AdminFinancialService();