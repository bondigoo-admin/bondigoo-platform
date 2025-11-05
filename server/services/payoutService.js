const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { logger } = require('../utils/logger');
const Payment = require('../models/Payment');
const Coach = require('../models/Coach');
const Transaction = require('../models/Transaction');
const coachInvoiceService = require('./coachInvoiceService');
const mongoose = require('mongoose');

class PayoutService {
async processPayoutForPayment(paymentRecord) {
    const logContext = { paymentId: paymentRecord._id.toString(), coachId: paymentRecord.recipient.toString(), chargeId: paymentRecord.stripe.chargeId };
    console.log('[PayoutService] Initiating payout process.', logContext);
    
    const session = await mongoose.startSession();
    session.startTransaction();

     try {
      const coachStripeAccountId = paymentRecord.coachStripeAccountId;
      console.log('[PayoutService] Found Stripe Account ID from payment record.', { ...logContext, coachStripeAccountId });

      if (!coachStripeAccountId) {
        throw new Error(`Payment record ${paymentRecord._id} is missing the required coachStripeAccountId.`);
      }

      const charge = await stripe.charges.retrieve(logContext.chargeId, { expand: ['balance_transaction'] });
      console.log('[PayoutService] Retrieved Stripe Charge and Balance Transaction.', { ...logContext, chargeId: charge.id, balanceTransactionId: charge.balance_transaction.id });
      
      const availableForTransfer = charge.amount - charge.amount_refunded;
      if (availableForTransfer <= 0) {
        logger.warn('[PayoutService] Source charge has no available funds for transfer, likely due to a full refund. Skipping payout.', { 
            ...logContext, 
            chargeAmount: charge.amount / 100, 
            amountRefunded: charge.amount_refunded / 100 
        });
        
        await Transaction.findOneAndUpdate(
            { payment: paymentRecord._id, type: 'payout' },
            {
                $setOnInsert: {
                    payment: paymentRecord._id,
                    type: 'payout',
                    status: 'skipped',
                    description: `Payout skipped because the source charge ${charge.id} was fully refunded.`,
                    amount: { value: 0, currency: paymentRecord.amount.currency },
                    stripe: { chargeId: charge.id }
                }
            },
            { upsert: true, new: true, session }
        );
        
        await session.commitTransaction();
        session.endSession();
        return { status: 'skipped_fully_refunded', transferId: null, netPayoutAmount: 0 };
      }

      if (!charge.balance_transaction) {
        throw new Error(`Could not retrieve balance_transaction for charge ${logContext.chargeId}. Payout cannot be processed at this time.`);
      }
      
      const actualStripeFee = charge.balance_transaction.fee / 100;
      const feeCurrency = charge.balance_transaction.currency.toUpperCase();

      const stripeFeeTx = await Transaction.findOneAndUpdate(
          { payment: paymentRecord._id, type: 'fee' },
          { 
            $setOnInsert: {
                payment: paymentRecord._id,
                booking: paymentRecord.booking,
                program: paymentRecord.program,
                liveSession: paymentRecord.liveSession,
                type: 'fee',
                amount: { value: actualStripeFee, currency: feeCurrency },
                status: 'completed',
                stripe: { chargeId: logContext.chargeId, balanceTransactionId: charge.balance_transaction.id },
                description: `Stripe processing fee for charge ${logContext.chargeId}`
            }
          },
          { upsert: true, new: true, runValidators: true, session }
      );
      console.log('[PayoutService] Ensured fee transaction exists before B2B invoicing.', { ...logContext, feeAmount: actualStripeFee, feeTxId: stripeFeeTx._id });

      const coach = await Coach.findOne({ user: paymentRecord.recipient }).populate('user').session(session);
      if (!coach) {
        logger.error(`[PayoutService] CRITICAL: Coach profile not found for recipient user ${paymentRecord.recipient}. B2B invoice generation will fail, but payout will proceed. Manual intervention may be required for invoicing.`, logContext);
      }

      console.log('[PayoutService] Calling coachInvoiceService.generateForPayout...', logContext);
      
      const { finalPayoutAmount } = await coachInvoiceService.generateForPayout(paymentRecord, session);
      console.log('[PayoutService] Successfully returned from coachInvoiceService.', { ...logContext, finalPayoutAmount });
      let netPayoutAmount = finalPayoutAmount;
      
      const adjustments = await Payment.find({
        recipient: paymentRecord.recipient,
        type: 'adjustment',
        status: 'pending_deduction'
      }).session(session);

      let totalDeductions = 0;
      const appliedAdjustments = [];
      if (adjustments.length > 0) {
        for (const adj of adjustments) {
          if (netPayoutAmount + adj.amount.total >= 0.50) {
            totalDeductions += adj.amount.total;
            appliedAdjustments.push(adj._id);
          }
        }
        netPayoutAmount += totalDeductions;
        console.log(`[PayoutService] Applied pending deductions to payout.`, { ...logContext, totalDeductions, finalNetPayout: netPayoutAmount });
      }
      
      if (netPayoutAmount < 0.50) {
        logger.warn('[PayoutService] Net payout amount is below minimum threshold. Skipping transfer.', { ...logContext, netPayoutAmount });
        if (appliedAdjustments.length > 0) {
            await Payment.updateMany({ _id: { $in: appliedAdjustments } }, { $set: { status: 'deducted' } }, { session });
            console.log('[PayoutService] Marked adjustments as deducted as they were absorbed by this earning, even though payout is skipped.', { ...logContext, appliedAdjustments });
        }
        await session.commitTransaction();
        session.endSession();
        return { status: 'skipped_below_minimum', transferId: null, netPayoutAmount: 0 };
      }

      console.log('[PayoutService] Preparing to create Stripe transfer.', { ...logContext, destination: coachStripeAccountId, amount: netPayoutAmount });

      const transfer = await stripe.transfers.create({
        amount: Math.round(netPayoutAmount * 100),
        currency: paymentRecord.amount.currency.toLowerCase(),
        destination: coachStripeAccountId,
        source_transaction: paymentRecord.stripe.chargeId,
        metadata: {
          internalPaymentId: paymentRecord._id.toString(),
          coachUserId: paymentRecord.recipient.toString(),
          clientUserId: paymentRecord.payer.toString(),
        }
      });

      if (appliedAdjustments.length > 0) {
        await Payment.updateMany(
            { _id: { $in: appliedAdjustments } },
            { $set: { status: 'deducted' } },
            { session }
        );
      }

      const coachName = coach ? `${coach.user.firstName} ${coach.user.lastName}` : `Coach ID ${paymentRecord.recipient}`;

      await Transaction.create([{
        payment: paymentRecord._id,
        type: 'payout',
        amount: {
          value: netPayoutAmount,
          currency: paymentRecord.amount.currency
        },
        status: 'processing',
        stripe: {
          transferId: transfer.id,
          chargeId: paymentRecord.stripe.chargeId
        },
        description: `Payout to ${coachName} for payment ${paymentRecord._id}.`
      }], { session });

      await session.commitTransaction();
      console.log('[PayoutService] Stripe transfer created and transaction logged successfully.', { ...logContext, stripeTransferId: transfer.id, netPayoutAmount });
      return { status: 'created', transferId: transfer.id, netPayoutAmount };

    } catch (error) {
      if(session.inTransaction()) {
        await session.abortTransaction();
      }
      logger.error('[PayoutService] CRITICAL: Failed to create Stripe transfer. Transaction rolled back.', { ...logContext, error: error.message, stack: error.stack });
      await Transaction.create({
          payment: paymentRecord._id,
          type: 'payout',
          status: 'failed',
          error: { code: 'PAYOUT_SERVICE_FAILURE', message: error.message }
      }).catch(txError => logger.error('Failed to even log the payout failure transaction', { txError }));
      throw error;
    } finally {
        session.endSession();
    }
  }
}

module.exports = new PayoutService();