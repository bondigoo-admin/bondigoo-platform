const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const paymentService = require('./paymentService');
const invoiceService = require('./invoiceService');
const unifiedNotificationService = require('./unifiedNotificationService');
const { NotificationTypes } = require('../utils/notificationHelpers');
const { logger } = require('../utils/logger');
const coachInvoiceService = require('./coachInvoiceService');

class AdminFinancialService {
  /**
   * The single, authoritative function for processing any refund on the platform.
   * @param {object} params - The refund parameters.
   * @param {string} params.paymentId - The internal ID of the Payment record.
   * @param {number} params.amount - The decimal amount to refund to the customer.
   * @param {string} params.reason - The reason for the refund.
   * @param {'standard'|'platform_fault'|'goodwill'} params.policyType - The financial policy to apply.
   * @param {string} params.initiatorId - The ID of the user (admin, coach) initiating the refund.
   * @param {object} params.bookingContext - The populated Mongoose booking document.
   * @param {object} [options] - Optional parameters.
   * @param {mongoose.ClientSession} [options.session] - Mongoose session for transactional operations.
   */
  async processRefund({ paymentId, amount, reason, policyType, initiatorId, bookingContext }, options = {}) {
    const session = options.session;
    const logContext = { paymentId, amount, policyType, initiatorId, hasSession: !!session };
    console.log('[AdminFinancialService] Starting refund process.', logContext);
    console.log(`[AdminFinancialService] ==> processRefund START`, logContext);

    const payment = await Payment.findById(paymentId).populate('payer recipient').session(session);
    if (!payment) {
      throw new Error('Payment record not found.');
    }
    
    const associatedBooking = bookingContext || await Booking.findById(payment.booking).populate('user coach sessionType').session(session);

    const totalRefunded = payment.amount.refunded || 0;
    const maxRefundable = payment.amount.total - totalRefunded;
    if (amount <= 0 || amount > (maxRefundable + 0.001)) { // Add tolerance for float issues
      throw new Error(`Invalid refund amount. Max refundable is ${maxRefundable}.`);
    }

    const sanitizedReason = `Platform Refund: ${reason}`.substring(0, 500);
    const stripeRefund = await paymentService.processRefund({
      paymentIntentId: payment.stripe.paymentIntentId,
      amount,
      currency: payment.amount.currency,
      reason: sanitizedReason,
    });

    if (stripeRefund.status !== 'succeeded') {
      throw new Error(`Stripe refund failed with status: ${stripeRefund.status}`);
    }

    try {
        await invoiceService.generateStripeCreditNoteForRefund(payment, stripeRefund, amount, reason, session);
    } catch (creditNoteError) {
        logger.error(`Non-fatal error during Credit Note generation for payment ${payment._id}`, { error: creditNoteError.message });
    }

    const irrecoverableStripeFee = (await Transaction.findOne({ payment: payment._id, type: 'fee' }).session(session))?.amount.value || 0;
    const vatAmount = payment.amount.vat?.amount || 0;
    const netEarning = payment.amount.total - payment.amount.platformFee - vatAmount - irrecoverableStripeFee;

    const refundedPortion = amount / payment.amount.total;
    let coachDebitAmount = 0;

    switch (policyType) {
      case 'platform_fault':
        coachDebitAmount = amount * (netEarning / payment.amount.total);
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
    console.log(`[AdminFinancialService] Calculated Debit for Coach ${payment.recipient._id}: ${coachDebitAmount.toFixed(2)} CHF`, logContext);

    const platformFeeForfeited = payment.amount.platformFee * refundedPortion;
    const vatReclaimed = (payment.amount.vat?.amount || 0) * refundedPortion;
    const stripeFeeLost = irrecoverableStripeFee * refundedPortion;
    
    await Transaction.create([{
      payment: payment._id,
      booking: associatedBooking?._id,
      type: 'refund',
      status: 'completed',
      amount: { value: -amount, currency: payment.amount.currency },
      stripe: { refundId: stripeRefund.id, chargeId: stripeRefund.charge },
      description: `Refund initiated by ${initiatorId}. Reason: ${reason}`,
      metadata: { 
          refundPolicy: policyType, 
          coachDebitAmount: -coachDebitAmount,
          platformFeeForfeited: parseFloat(platformFeeForfeited.toFixed(2)),
          vatReclaimed: parseFloat(vatReclaimed.toFixed(2)),
          stripeFeeLost: parseFloat(stripeFeeLost.toFixed(2))
      }
    }], { session });

    const originalRefundedAmount = payment.amount.refunded || 0;
    payment.amount.refunded = originalRefundedAmount + amount;
    console.log(`[AdminFinancialService] DATA INTEGRITY UPDATE: Payment ${payment._id} refunded field updated from ${originalRefundedAmount} to ${payment.amount.refunded}.`, logContext);

     if (payment.payoutStatus === 'pending') {
        console.log(`[AdminFinancialService] Handling PRE-PAYOUT case. Payout status: 'pending'.`, logContext);
        if (payment.amount.total - payment.amount.refunded < 0.01) {
            payment.payoutStatus = 'not_applicable';
            console.log(`[AdminFinancialService] Payment ${payment._id} fully refunded pre-payout. Status set to not_applicable.`, logContext);
        }
    } else if (payment.payoutStatus === 'submitted' || payment.payoutStatus === 'paid_out') {
        console.log(`[AdminFinancialService] Handling POST-PAYOUT case. Payout status: '${payment.payoutStatus}'.`, logContext);
        
        let transferIdToReverse = payment.stripeTransferId;
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

        if (coachDebitAmount > 0) {
            try {
                if (!transferIdToReverse && payment.stripe.chargeId) {
                    const transfers = await stripe.transfers.list({ source_transaction: payment.stripe.chargeId, limit: 1 });
                    if (transfers.data.length > 0) {
                        transferIdToReverse = transfers.data[0].id;
                        payment.stripeTransferId = transferIdToReverse;
                    }
                }

                if (transferIdToReverse) {
                    const originalTransfer = await stripe.transfers.retrieve(transferIdToReverse);
                    const maxReversibleAmountCents = originalTransfer.amount - originalTransfer.amount_reversed;

                    if (maxReversibleAmountCents >= 50) {
                        const reversalAmountCents = Math.min(Math.round(coachDebitAmount * 100), maxReversibleAmountCents);
                        console.log(`[AdminFinancialService] Attempting Stripe Transfer Reversal for ${reversalAmountCents / 100} CHF on Transfer ID: ${transferIdToReverse}`, logContext);
                        
                        await stripe.transfers.createReversal(
                            transferIdToReverse,
                            {
                                amount: reversalAmountCents,
                                description: `Partial reversal for refund on payment ${payment._id}. Full debit is ${coachDebitAmount} CHF.`,
                                metadata: {
                                    internalPaymentId: payment._id.toString(),
                                    bookingId: associatedBooking?._id.toString(),
                                    refundInitiatorId: initiatorId
                                }
                            }
                        );
                        console.log(`[AdminFinancialService] SUCCESS: Created Stripe Transfer Reversal.`, { ...logContext, amount: reversalAmountCents / 100 });
                    } else {
                        logger.warn(`[AdminFinancialService] No reversible amount remaining on transfer. Skipping reversal.`, { ...logContext, transferId: transferIdToReverse });
                    }
                } else {
                    logger.warn(`[AdminFinancialService] No Stripe Transfer found to reverse.`, logContext);
                }
            } catch (stripeError) {
                logger.error(`[AdminFinancialService] Non-fatal error during Stripe Transfer Reversal attempt. Internal debit will proceed.`, { ...logContext, error: stripeError.message });
            }

            const adjustment = new Payment({
                booking: associatedBooking?._id,
                type: 'adjustment',
                recipient: payment.recipient._id,
                payer: initiatorId,
                status: 'pending_deduction',
                amount: { total: -coachDebitAmount, currency: payment.amount.currency },
                metadata: {
                    originalPaymentId: payment._id,
                    reason: `Post-payout refund deduction for payment ${payment._id}. Policy: ${policyType}.`
                }
            });
            await adjustment.save({ session });
            console.log(`[AdminFinancialService] Created internal negative adjustment payment record for full calculated debit.`, { ...logContext, adjustmentId: adjustment._id, amount: -coachDebitAmount });
        }
    }

    const newTotalRefunded = payment.amount.refunded || 0;
    payment.status = (payment.amount.total - newTotalRefunded < 0.01) ? 'refunded' : 'partially_refunded';
    payment.refunds.push({
        amount: amount,
        currency: payment.amount.currency,
        reason,
        status: 'succeeded',
        stripeRefundId: stripeRefund.id,
        processedBy: initiatorId,
        processedAt: new Date()
    });
   if (payment.payoutStatus === 'submitted' || payment.payoutStatus === 'paid_out') {
            if (payment.payoutStatus === 'submitted' || payment.payoutStatus === 'paid_out') {
      try {
          await coachInvoiceService.generateCreditNoteForRefund(payment, amount, reason, session);
      } catch (b2bCreditNoteError) {
          logger.error(`Non-fatal: Failed to generate B2B self-billed credit note for payment ${payment._id}. Refund will still be processed.`, { 
              ...logContext, 
              error: b2bCreditNoteError.message 
          });
      }
    }
        }
    await payment.save({ session });

    await unifiedNotificationService.sendNotification({
        type: NotificationTypes.REFUND_PROCESSED_COACH,
        recipient: payment.recipient._id,
        metadata: {
            bookingId: associatedBooking?._id,
            paymentId: payment._id,
            refundAmount: amount,
            currency: payment.amount.currency,
            coachDebitAmount: coachDebitAmount,
            isPostPayout: payment.payoutStatus === 'paid_out' || payment.payoutStatus === 'submitted',
        }
    }, associatedBooking);

    await unifiedNotificationService.sendNotification({
        type: NotificationTypes.REFUND_PROCESSED_CLIENT,
        recipient: payment.payer._id,
        metadata: {
            bookingId: associatedBooking?._id,
            paymentId: payment._id,
            refundAmount: amount,
            currency: payment.amount.currency,
        }
    }, associatedBooking);

    console.log('[AdminFinancialService] Refund process completed successfully.', logContext);
    console.log(`[AdminFinancialService] ==> processRefund END | Payment status: ${payment.status}`, logContext);
    return { payment, stripeRefund };
  }
}

module.exports = new AdminFinancialService();