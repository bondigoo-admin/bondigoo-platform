const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { logger } = require('../utils/logger');
const paymentFlowLogger = require('../utils/paymentLogger');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const Coach = require('../models/Coach');
const User = require('../models/User');
const Session = require('../models/Session');
const Invoice = require('../models/Invoice');
const LiveSession = require('../models/LiveSession');
const WebhookLog = require('../models/WebhookLog');
const stripeService = require('../services/stripeService');
const paymentService = require('../services/paymentService');
const UnifiedNotificationService = require('../services/unifiedNotificationService');
const { getSocketService } = require('../services/socketService');
const { 
  NotificationTypes, 
  NotificationCategories, 
  NotificationPriorities,
  NotificationChannels  
} = require('../utils/notificationHelpers');
const TaxService = require('../services/taxService');
const cacheService = require('../services/cacheService');
const taxService = new TaxService();
const Program = require('../models/Program');
const Enrollment = require('../models/Enrollment');
const mongoose = require('mongoose');
const InvoiceService = require('../services/invoiceService'); 
const coachFinancialService = require('../services/coachFinancialService');
const refundRequestService = require('../services/refundRequestService');
const AdminFinancialService = require('../services/adminFinancialService');

const WEBINAR_TYPE_ID_STRING = '66ec54f94a8965b22af33fd9';
const GROUP_TYPE_ID_STRING = '66ec54f44a8965b22af33fd5';
const WORKSHOP_TYPE_ID_STRING = '66ec54fe4a8965b22af33fdd';

/**
 * Safely extracts numerical amount from potentially nested price structure
 * @param {Object|number} priceData - Price data structure or direct amount
 * @param {string} [currency='CHF'] - Currency code
 * @returns {Object} Extracted amount and currency
 */
const extractAmount = (priceData, defaultCurrency = 'CHF') => {
  console.log('[PaymentController] Extracting amount from:', {
    priceData,
    type: typeof priceData,
    hasAmount: priceData?.amount !== undefined,
    defaultCurrency
  });

  // Handle direct number
  if (typeof priceData === 'number') {
    return { amount: priceData, currency: defaultCurrency };
  }

  // Handle null/undefined
  if (!priceData) {
    return { amount: 0, currency: defaultCurrency };
  }

  // Handle nested amount structure
  if (priceData.amount) {
    if (typeof priceData.amount === 'number') {
      return {
        amount: priceData.amount,
        currency: priceData.currency || defaultCurrency
      };
    }
    if (priceData.amount.amount) {
      return {
        amount: priceData.amount.amount,
        currency: priceData.amount.currency || priceData.currency || defaultCurrency
      };
    }
  }

  // Handle flat structure
  if (priceData.value) {
    return {
      amount: priceData.value,
      currency: priceData.currency || defaultCurrency
    };
  }

  logger.warn('[PaymentController] Could not extract amount from price data:', {
    priceData,
    defaultCurrency
  });

  return { amount: 0, currency: defaultCurrency };
};

/**
 * Converts amount to cents for Stripe, handling decimal precision
 * @param {number} amount - Amount in decimal
 * @returns {number} Amount in cents
 */
const convertToCents = (amount) => {
  if (typeof amount !== 'number') {
    logger.warn('[PaymentController] Invalid amount type:', {
      amount,
      type: typeof amount
    });
    return 0;
  }
  
  // First round to 2 decimal places to avoid floating point issues
  const roundedAmount = Math.round(amount * 100) / 100;
  // Then convert to cents
  const cents = Math.round(roundedAmount * 100);

  console.log('[PaymentController] Amount conversion:', {
    original: amount,
    rounded: roundedAmount,
    cents: cents
  });

  return cents;
};

/**
 * Validates price structure
 * @param {Object} price - Price structure from booking
 * @returns {Object} Validation result
 */
const validatePriceStructure = (price) => {
  if (!price) {
    return { isValid: false, error: 'No price structure provided' };
  }

  const baseAmount = extractAmount(price.base);
  const finalAmount = extractAmount(price.final);

  const isValid = baseAmount.amount > 0 && finalAmount.amount > 0 &&
                 baseAmount.currency === finalAmount.currency;

  return {
    isValid,
    error: isValid ? null : 'Invalid price structure',
    base: baseAmount,
    final: finalAmount,
    currency: finalAmount.currency
  };
};

/**
 * Create a payment intent for a booking
 */
const createPaymentIntent = async (req, res) => {
  try {
    const { bookingId, type = 'booking', price: priceFromRequest } = req.body;
    const userId = req.user._id;

    console.log('[PaymentController] Creating payment intent', {
      entityId: bookingId,
      type,
      userId,
      timestamp: new Date().toISOString()
    });

    const booking = await Booking.findById(bookingId)
      .populate('coach')
      .populate('user')
      .populate('sessionType');

    if (!booking) {
      logger.error('[PaymentController] Booking not found', { bookingId, timestamp: new Date().toISOString() });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.user._id.toString() !== req.user._id.toString()) {
      logger.error('[PaymentController] Unauthorized payment attempt', {
        bookingId,
        userId: req.user._id,
        bookingUserId: booking.user._id,
        timestamp: new Date().toISOString()
      });
      return res.status(403).json({ success: false, message: 'Unauthorized payment attempt' });
    }
    
    const priceDetails = priceFromRequest || booking.price;

    const priceValidation = validatePriceStructure(priceDetails);
    if (!priceValidation.isValid) {
      logger.error('[PaymentController] Invalid price structure', {
        bookingId,
        error: priceValidation.error,
        price: priceDetails,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ success: false, message: priceValidation.error });
    }

    const { base: baseAmount, final: finalAmount, currency } = priceValidation;

    const totalAmount = finalAmount.amount;
    const vatAmount = priceDetails.vat?.amount || 0;
    const platformFeeAmount = priceDetails.platformFee?.amount || 0;
    const stripeAmount = convertToCents(totalAmount);
    const stripeFeeAmount = convertToCents(platformFeeAmount);

    let customer = await User.findById(req.user._id);
    if (!customer) {
      logger.error('[PaymentController] User not found in database', {
        userId: req.user._id,
        bookingId,
        timestamp: new Date().toISOString()
      });
      return res.status(500).json({ success: false, message: 'User not found' });
    }

    let stripeCustomerId = customer.stripe?.customerId;
    if (!stripeCustomerId) {
      console.log('[PaymentController] Creating Stripe customer for user', {
        userId: customer._id,
        email: customer.email,
        bookingId,
        timestamp: new Date().toISOString()
      });

      const stripeCustomer = await paymentService.createOrUpdateCustomer({
        userId: customer._id,
        email: customer.email,
        name: `${customer.firstName} ${customer.lastName}`.trim()
      });
      stripeCustomerId = stripeCustomer.id;

      await User.findByIdAndUpdate(
        customer._id,
        { 
          $set: { 
            'stripe.customerId': stripeCustomerId,
            'stripe.createdAt': new Date()
          } 
        },
        { new: true, runValidators: false }
      );
    }

    const coach = await Coach.findOne({ user: booking.coach._id });
    if (!coach?.settings?.paymentAndBilling?.stripe?.accountId) {
      logger.error('[PaymentController] Coach not setup for payments', {
        coachId: booking.coach._id,
        bookingId,
        hasSettings: !!coach?.settings,
        hasPaymentAndBilling: !!coach?.settings?.paymentAndBilling,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({
        success: false,
        message: 'Coach payments not configured',
        code: 'COACH_PAYMENTS_NOT_CONFIGURED'
      });
    }

    const paymentIntent = await paymentService.createPaymentIntent({
      bookingId: booking._id.toString(),
      priceDetails: priceDetails,
      currency: currency.toLowerCase(),
      stripeCustomerId,
      userId: req.user._id.toString(),
      coachStripeAccountId: coach.settings.paymentAndBilling.stripe.accountId,
      metadata: {
        bookingId: booking._id.toString(),
        coachId: booking.coach._id.toString(),
        userId: booking.user._id.toString(),
        sessionType: booking.sessionType.name,
        vatAmount: convertToCents(vatAmount),
        vatRate: priceDetails.vat?.rate || 8.1,
        platformFee: stripeFeeAmount,
        originalAmount: convertToCents(baseAmount.amount),
         customerIpAddress: req.ip
      }
    });

   const payment = new Payment({
      booking: booking._id,
      payer: booking.user._id,
      recipient: booking.coach._id,
      coachStripeAccountId: coach.settings.paymentAndBilling.stripe.accountId,
      type: 'charge', 
      priceSnapshot: priceDetails,
      amount: {
        base: baseAmount.amount,
        platformFee: platformFeeAmount,
        vat: {
          rate: priceDetails.vat?.rate || 8.1,
          amount: vatAmount,
          included: priceDetails.vat?.included !== false
        },
        total: totalAmount,
        currency
      },
      status: 'pending',
      stripe: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        customerId: stripeCustomerId
      }
    });

    await payment.save();

    booking.payment.status = 'pending';
    booking.payment.stripe = { 
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret 
    };
    booking.payment.paymentRecord = payment._id;
    await booking.save();

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntent: {
        id: paymentIntent.id,
        amount: stripeAmount,
        currency: currency.toLowerCase()
      }
    });

  } catch (error) {
    logger.error('[PaymentController] Error creating payment intent', {
      error: error.message,
      stack: error.stack,
      bookingId: req.body.bookingId,
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      message: 'Error creating payment intent',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};

/**
 * Handle Stripe webhooks
 */
const webhookHandler = async (req, res) => {
  console.log('[PaymentController:Webhook] RAW REQUEST RECEIVED Top of webhookHandler. Headers:', JSON.stringify(req.headers, null, 2));
  console.log('[Webhook] Received a request from Stripe.');
  let event;
  let logPayload;

  try {
    const sig = req.headers['stripe-signature'];
    console.log('[PaymentController:Webhook] Stripe signature from header:', sig);
    console.log('[PaymentController:Webhook] STRIPE_WEBHOOK_SECRET used:', process.env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'NOT SET');
    
    // Use req.body directly as it's a raw buffer from express.raw()
    logPayload = req.body.toString('utf8');
    
    event = stripe.webhooks.constructEvent(
      req.body, // Use the raw buffer
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log('[PaymentController:Webhook] Stripe event constructed successfully. Event Type:', event.type, 'Event ID:', event.id);

    // Attach io to req if not already present (useful if coming directly from Stripe without middleware)
    if (!req.io && req.app?.get) {
        req.io = req.app.get('io');
        console.log('[PaymentController:Webhook] Attached io instance to request from app context.');
    }

    console.log('[PaymentController:Webhook] Processing event:', {
      type: event.type,
      id: event.id,
      apiVersion: event.api_version,
      timestamp: new Date().toISOString()
    });

  switch (event.type) {
  case 'payment_intent.succeeded':
        console.log(`[Webhook] Processing 'payment_intent.succeeded' event.`, { paymentIntentId: event.data.object.id });

        console.log('[PaymentController:Webhook] Entered payment_intent.succeeded case. Event ID:', event.id, 'PaymentIntent ID:', event.data.object.id);
        const paymentIntentSucceeded = event.data.object;
        const customerIp = paymentIntentSucceeded.metadata.customerIpAddress;
        console.log('[[[WEBHOOK-CASE-MATCH]]] Entered switch case: payment_intent.succeeded.', { paymentIntentId: paymentIntentSucceeded.id });
if (paymentIntentSucceeded.metadata && paymentIntentSucceeded.metadata.type === 'program_purchase') {
            const webhookLogContext = {
                entryPoint: '[Webhook:ProgramPurchase]',
                paymentIntentId: paymentIntentSucceeded.id,
                programId: paymentIntentSucceeded.metadata.programId,
                userId: paymentIntentSucceeded.metadata.userId,
                timestamp: new Date().toISOString()
            };
            console.log(`${webhookLogContext.entryPoint} Start processing event.`, webhookLogContext);

            const mongoSession = await mongoose.startSession();
            
            try {
                await mongoSession.withTransaction(async () => {
                    console.log(`${webhookLogContext.entryPoint} [DB Transaction] Start.`, webhookLogContext);
                    const payment = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntentSucceeded.id }).session(mongoSession);

                    if (!payment) {
                        logger.error(`${webhookLogContext.entryPoint} [DB Transaction] CRITICAL: Payment record not found.`, webhookLogContext);
                        throw new Error('Payment record not found');
                    }
                    webhookLogContext.paymentId = payment._id.toString();

                    if (payment.status === 'completed') {
                        console.log(`${webhookLogContext.entryPoint} [DB Transaction] Idempotency: Payment already completed.`, webhookLogContext);
                        return;
                    }

                    payment.status = 'completed';
                    payment.stripe.chargeId = paymentIntentSucceeded.latest_charge || paymentIntentSucceeded.charges?.data[0]?.id;
                    payment.metadata = { ...payment.metadata, ip: customerIp };
                    await payment.save({ session: mongoSession });
                    console.log(`${webhookLogContext.entryPoint} [DB Transaction] Payment record updated to 'completed'.`, webhookLogContext);
                    
                    const enrollmentUpdateResult = await Enrollment.updateOne(
                        { payment: payment._id, status: 'pending_payment' },
                        { $set: { status: 'active' } },
                        { session: mongoSession }
                    );

                    if (enrollmentUpdateResult.matchedCount > 0 && enrollmentUpdateResult.modifiedCount > 0) {
                        await Program.updateOne(
                            { _id: payment.program },
                            { $inc: { enrollmentsCount: 1 } },
                            { session: mongoSession }
                        );
                        console.log(`${webhookLogContext.entryPoint} [DB Transaction] Enrollment activated and program count incremented.`, webhookLogContext);
                    } else {
                        console.log(`${webhookLogContext.entryPoint} [DB Transaction] Idempotency: Enrollment already active or not found in pending state.`, { ...webhookLogContext, updateResult: enrollmentUpdateResult });
                    }

                    const transactionPayload = {
                        program: payment.program,
                        payment: payment._id,
                        type: 'charge',
                        amount: { value: paymentIntentSucceeded.amount / 100, currency: paymentIntentSucceeded.currency.toUpperCase() },
                        status: 'completed',
                        stripe: { transactionId: paymentIntentSucceeded.id, chargeId: payment.stripe.chargeId },
                        metadata: { ip: customerIp }
                    };
            
                    await Transaction.findOneAndUpdate(
                        { 'stripe.transactionId': paymentIntentSucceeded.id, type: 'charge' },
                        { $setOnInsert: transactionPayload },
                        { upsert: true, new: true, runValidators: true, session: mongoSession }
                    );
                    console.log(`${webhookLogContext.entryPoint} [DB Transaction] 'charge' transaction ensured.`, webhookLogContext);
                });

                console.log(`${webhookLogContext.entryPoint} Database transaction committed. Starting post-transaction services.`, webhookLogContext);

                const finalPaymentRecord = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntentSucceeded.id })
                    .populate('program')
                    .populate('payer')
                    .populate('recipient'); // This will now work correctly

                if (!finalPaymentRecord) {
                    logger.error(`${webhookLogContext.entryPoint} [Post-Transaction] CRITICAL: Could not re-fetch payment record.`, webhookLogContext);
                    return res.status(200).json({ received: true, status: 'processed_db_ok_post_processing_failed' });
                }
                
                console.log(`${webhookLogContext.entryPoint} [Post-Transaction] Fetched final payment record. Validating populated fields.`, {
                    ...webhookLogContext,
                    hasProgram: !!finalPaymentRecord.program,
                    hasPayer: !!finalPaymentRecord.payer,
                    hasRecipient: !!finalPaymentRecord.recipient,
                    payerEmail: finalPaymentRecord.payer?.email,
                    recipientEmail: finalPaymentRecord.recipient?.email
                });

                if (!finalPaymentRecord.program || !finalPaymentRecord.payer || !finalPaymentRecord.recipient) {
                    logger.error(`${webhookLogContext.entryPoint} [Post-Transaction] CRITICAL: Population of essential fields failed. Aborting services.`, webhookLogContext);
                    return res.status(200).json({ received: true, status: 'processed_db_ok_population_failed' });
                }

                try {
                    console.log(`${webhookLogContext.entryPoint} [Post-Transaction] Calling InvoiceService.`, webhookLogContext);
                    await InvoiceService.createAndFinalizeForPayment(finalPaymentRecord);
                    console.log(`${webhookLogContext.entryPoint} [Post-Transaction] InvoiceService executed successfully.`, webhookLogContext);
                } catch (invoiceError) {
                    logger.error(`${webhookLogContext.entryPoint} [Post-Transaction] NON-FATAL: InvoiceService failed.`, { ...webhookLogContext, error: invoiceError.message, stack: invoiceError.stack });
                }
        
                try {
                    console.log(`${webhookLogContext.entryPoint} [Post-Transaction] Calling UnifiedNotificationService.`, webhookLogContext);
                    const clientNotificationConfig = {
                        type: NotificationTypes.PROGRAM_PURCHASE_CONFIRMED,
                        recipient: finalPaymentRecord.payer._id.toString(),
                        recipientType: 'client',
                        metadata: { 
                            programId: finalPaymentRecord.program._id,
                            programTitle: finalPaymentRecord.program.title,
                            coachName: `${finalPaymentRecord.recipient.firstName} ${finalPaymentRecord.recipient.lastName}`,
                            amount: paymentIntentSucceeded.amount / 100, 
                            currency: paymentIntentSucceeded.currency.toUpperCase() 
                        }
                    };
                    await UnifiedNotificationService.sendNotification(clientNotificationConfig, finalPaymentRecord);
        
                    const coachNotificationConfig = {
                        type: NotificationTypes.PROGRAM_SALE_COACH,
                        recipient: finalPaymentRecord.recipient._id.toString(),
                        recipientType: 'coach',
                        metadata: { 
                            programId: finalPaymentRecord.program._id,
                            programTitle: finalPaymentRecord.program.title, 
                            clientName: `${finalPaymentRecord.payer.firstName} ${finalPaymentRecord.payer.lastName}`,
                            amount: paymentIntentSucceeded.amount / 100, 
                            currency: paymentIntentSucceeded.currency.toUpperCase() 
                        }
                    };
                    await UnifiedNotificationService.sendNotification(coachNotificationConfig, finalPaymentRecord);
                    console.log(`${webhookLogContext.entryPoint} [Post-Transaction] UnifiedNotificationService executed successfully.`, webhookLogContext);
                } catch (notificationError) {
                    logger.error(`${webhookLogContext.entryPoint} [Post-Transaction] NON-FATAL: UnifiedNotificationService failed.`, { ...webhookLogContext, error: notificationError.message, stack: notificationError.stack });
                }
        
                try {
                    console.log(`${webhookLogContext.entryPoint} [Post-Transaction] Emitting socket events.`, webhookLogContext);
                    const socketService = getSocketService();
                    if (socketService) {
                        socketService.emitToUser(finalPaymentRecord.payer._id.toString(), 'enrollment_activated', { programId: finalPaymentRecord.program._id });
                        socketService.emitToUser(finalPaymentRecord.payer._id.toString(), 'program_purchase_confirmed', { programId: finalPaymentRecord.program._id, programTitle: finalPaymentRecord.program.title });
                        socketService.emitToUser(finalPaymentRecord.recipient._id.toString(), 'program_new_enrollment', { programId: finalPaymentRecord.program._id, programTitle: finalPaymentRecord.program.title, clientName: `${finalPaymentRecord.payer.firstName} ${finalPaymentRecord.payer.lastName}` });
                        console.log(`${webhookLogContext.entryPoint} [Post-Transaction] Socket events emitted successfully.`, webhookLogContext);
                    }
                } catch (socketError) {
                    logger.error(`${webhookLogContext.entryPoint} [Post-Transaction] NON-FATAL: Socket event emission failed.`, { ...webhookLogContext, error: socketError.message });
                }
                
            } catch (error) {
                logger.error(`${webhookLogContext.entryPoint} FATAL: Unhandled error during webhook processing.`, { 
                    ...webhookLogContext,
                    error: error.message, 
                    stack: error.stack, 
                });
                if (mongoSession.inTransaction()) {
                    await mongoSession.abortTransaction();
                    logger.error(`${webhookLogContext.entryPoint} Database transaction was aborted due to the error.`, webhookLogContext);
                }
                return res.status(500).json({ received: true, status: 'internal_error' });
            } finally {
                await mongoSession.endSession();
                console.log(`${webhookLogContext.entryPoint} MongoDB session ended.`, webhookLogContext);
            }
            
            if (!res.headersSent) {
                console.log(`${webhookLogContext.entryPoint} End of processing. Sending final response.`, webhookLogContext);
                return res.json({ received: true, status: 'processed_program_purchase' });
            }
        } else if (paymentIntentSucceeded.metadata && paymentIntentSucceeded.metadata.type === 'webinar_registration') {
            const webinarBookingId = paymentIntentSucceeded.metadata.bookingId;
            const payingUserId = paymentIntentSucceeded.metadata.userId;
            const paymentIntentIdFromWebhook = paymentIntentSucceeded.id;

            console.log('[Webhook] Processing webinar_registration PI.succeeded', { webinarBookingId, payingUserId, paymentIntentId: paymentIntentIdFromWebhook, PI_status: paymentIntentSucceeded.status, amount: paymentIntentSucceeded.amount, currency: paymentIntentSucceeded.currency, customer: paymentIntentSucceeded.customer, metadata: paymentIntentSucceeded.metadata, timestamp: new Date().toISOString() });

            const mongoSession = await mongoose.startSession();
            mongoSession.startTransaction();
            try {
                const booking = await Booking.findById(webinarBookingId).session(mongoSession);

                if (!booking) {
                    logger.error('[Webhook] Webinar Booking not found for webinar_registration PI.succeeded', { webinarBookingId, paymentIntentId: paymentIntentIdFromWebhook });
                    await mongoSession.abortTransaction();
                    mongoSession.endSession();
                    await paymentService.processRefund({ paymentIntentId: paymentIntentIdFromWebhook, reason: 'Booking not found post-payment (webhook).' });
                    console.log('[Webhook] Refund initiated for PI.succeeded because booking was not found.', { webinarBookingId, paymentIntentId: paymentIntentIdFromWebhook });
                    res.json({ received: true, status: 'refund_initiated_booking_not_found' });
                    return; 
                }

                const existingAttendeeWebhookIndex = booking.attendees.findIndex(att => att.user.toString() === payingUserId);

                if (existingAttendeeWebhookIndex > -1) {
                    const attendee = booking.attendees[existingAttendeeWebhookIndex];
                     const activeAttendeeStatusesWebhook = ['confirmed', 'attended', 'pending_reschedule_confirmation', 'confirmed_rescheduled'];
                    if (activeAttendeeStatusesWebhook.includes(attendee.status)) {
                        console.log('[Webhook] User already actively registered (idempotency via webhook).', { webinarBookingId, payingUserId, paymentIntentId: paymentIntentIdFromWebhook, status: attendee.status });
                    } else {
                        attendee.status = 'confirmed';
                        attendee.joinedAt = new Date();
                        attendee.rescheduleStatus = 'confirmed_original';
                        booking.markModified('attendees');
                        console.log('[Webhook] Re-activated existing attendee to confirmed via webhook.', { webinarBookingId, payingUserId, paymentIntentId: paymentIntentIdFromWebhook, previousStatus: booking.attendees[existingAttendeeWebhookIndex].status });
                    }
                } else {
                    const currentActiveConfirmedAttendeesWebhook = booking.attendees.filter(a => 
                        ['confirmed', 'attended', 'pending_reschedule_confirmation', 'confirmed_rescheduled'].includes(a.status)
                    ).length;

                    if (booking.maxAttendees != null && currentActiveConfirmedAttendeesWebhook >= booking.maxAttendees) {
                        logger.error('[Webhook] CRITICAL RACE (webhook): Webinar full at PI.succeeded confirmation! User not added. REFUND REQUIRED.', { webinarBookingId, payingUserId, currentAttendees: currentActiveConfirmedAttendeesWebhook, maxAttendees: booking.maxAttendees, paymentIntentId: paymentIntentIdFromWebhook });
                        await paymentService.processRefund({ paymentIntentId: paymentIntentIdFromWebhook, reason: 'Webinar became full during payment confirmation (webhook).' });
                        await mongoSession.abortTransaction();
                        mongoSession.endSession();
                        const userToNotifyFull = await User.findById(payingUserId);
                        if (userToNotifyFull) {
                            await UnifiedNotificationService.sendNotification({
                                type: NotificationTypes.WEBINAR_BOOKING_FAILED_FULL,
                                recipient: payingUserId,
                                recipientType: 'client',
                                category: NotificationCategories.BOOKING,
                                priority: NotificationPriorities.HIGH,
                                channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
                                metadata: {
                                    bookingId: webinarBookingId,
                                    webinarTitle: booking.title,
                                    reason: 'Webinar became full during payment processing. Your payment has been refunded.'
                                }
                            }, booking);
                        }
                        res.json({ received: true, status: 'refund_initiated_webinar_full_webhook' });
                        return; 
                    } else {
                        booking.attendees.push({ user: payingUserId, joinedAt: new Date(), status: 'confirmed', rescheduleStatus: 'confirmed_original' });
                        booking.markModified('attendees');
                        console.log('[Webhook] Added new attendee via webhook.', { webinarBookingId, payingUserId, paymentIntentId: paymentIntentIdFromWebhook });
                    }
                }
                
                const confirmedAttendeesCountWebhook = booking.attendees.filter(a => a.status === 'confirmed').length;
                if (booking.status === 'pending_minimum_attendees' && booking.minAttendees > 0 && confirmedAttendeesCountWebhook >= booking.minAttendees) {
                    booking.status = 'scheduled';
                } else if (booking.status === 'pending_minimum_attendees' && (booking.minAttendees === 0 || !booking.minAttendees)) {
                    booking.status = 'scheduled';
                }
                if (booking.status !== 'confirmed' && booking.status !== 'scheduled') {
                    booking.status = 'confirmed';
                }
                if (booking.payment && booking.payment.status !== 'completed'){ 
                    booking.payment.status = 'completed';
                }

                await booking.save({ session: mongoSession });
                
                const chargeId = paymentIntentSucceeded.latest_charge || paymentIntentSucceeded.charges?.data[0]?.id;
                let paymentRecord = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntentIdFromWebhook }).session(mongoSession);

                if (paymentRecord) {
                    paymentRecord.status = 'completed';
                    paymentRecord.stripe.chargeId = chargeId;
                    paymentRecord.metadata = { ...paymentRecord.metadata, ip: customerIp };
                    if (!paymentRecord.priceSnapshot) {
                      logger.warn(`[Webhook] Payment record ${paymentRecord._id} was missing priceSnapshot. Falling back to generic booking price. Invoice may be incorrect if discount was applied.`, { webinarBookingId, paymentIntentId: paymentIntentIdFromWebhook });
                      paymentRecord.priceSnapshot = booking.price;
                    }
                    paymentRecord.amount.total = paymentIntentSucceeded.amount / 100;
                    paymentRecord.amount.currency = paymentIntentSucceeded.currency.toUpperCase();
                } else {
                    logger.warn("[Webhook] Payment record not found for PI.succeeded (webinar_registration), creating new one.", { paymentIntentId: paymentIntentIdFromWebhook, webinarBookingId });
                    const priceDetailsForRecord = booking.price || { base: { amount: { amount: 0 } }, platformFee: { amount: 0 }, vat: { rate: 0, amount: 0, included: true} };
                    paymentRecord = new Payment({
                        booking: webinarBookingId,
                        payer: payingUserId,
                        recipient: booking.coach,
                        priceSnapshot: booking.price,
                        amount: { 
                            total: paymentIntentSucceeded.amount / 100, 
                            currency: paymentIntentSucceeded.currency.toUpperCase(),
                            base: priceDetailsForRecord.base?.amount?.amount,
                            platformFee: priceDetailsForRecord.platformFee?.amount,
                            vat: priceDetailsForRecord.vat,
                        },
                        status: 'completed',
                        stripe: { 
                            paymentIntentId: paymentIntentIdFromWebhook, 
                            chargeId, 
                            customerId: paymentIntentSucceeded.customer 
                        },
                        metadata: { type: 'webinar_registration', source: 'webhook_creation', ip: customerIp }
                    });
                }

                console.log('[Webhook] State before commitTransaction for webinar', {
                  webinarBookingId,
                  bookingAttendees: booking.attendees.map(a => ({ user: a.user.toString(), status: a.status })),
                  bookingStatus: booking.status,
                  paymentRecordId: paymentRecord?._id,
                  paymentRecordStatus: paymentRecord?.status
              });

                await paymentRecord.save({ session: mongoSession });

                await Transaction.create([{
                  booking: webinarBookingId,
                  payment: paymentRecord._id,
                  type: 'charge',
                  amount: { value: paymentIntentSucceeded.amount / 100, currency: paymentIntentSucceeded.currency.toUpperCase() },
                  status: 'completed',
                  stripe: { transactionId: paymentIntentIdFromWebhook, chargeId: chargeId },
                  metadata: { ip: customerIp }
                }], { session: mongoSession });

                if (booking.status !== 'confirmed') {
                    const oldBookingStatusWebhook = booking.status;
                    booking.status = 'confirmed';
                    if (booking.payment && booking.payment.status !== 'completed') {
                        booking.payment.status = 'completed';
                    }
                    await booking.save({ session: mongoSession });
                    console.log('[Webhook:payment_intent.succeeded] Webinar Booking status updated to confirmed via webhook.', {
                        bookingId: booking._id,
                        oldStatus: oldBookingStatusWebhook,
                        newStatus: booking.status,
                        paymentIntentId: paymentIntentSucceeded.id,
                        timestamp: new Date().toISOString(),
                    });
                } else if (booking.payment && booking.payment.status !== 'completed') {
                    booking.payment.status = 'completed';
                    await booking.save({ session: mongoSession });
                    console.log('[Webhook:payment_intent.succeeded] Webinar Booking payment.status updated to completed via webhook (booking was already confirmed).', {
                        bookingId: booking._id,
                        paymentIntentId: paymentIntentSucceeded.id,
                        timestamp: new Date().toISOString(),
                    });
                }

                const sessionDocWebinarWebhook = await Session.findOne({ bookingId: booking._id }).session(mongoSession);
                if (sessionDocWebinarWebhook && sessionDocWebinarWebhook.state !== 'confirmed') {
                    const oldSessionStateWebinarWebhook = sessionDocWebinarWebhook.state;
                    sessionDocWebinarWebhook.state = 'confirmed';
                    sessionDocWebinarWebhook.lastUpdated = new Date();
                    await sessionDocWebinarWebhook.save({ session: mongoSession });
                    console.log('[Webhook:payment_intent.succeeded] Webinar Session document state updated to confirmed via webhook.', {
                        sessionId: sessionDocWebinarWebhook._id,
                        bookingId: booking._id,
                        oldState: oldSessionStateWebinarWebhook,
                        newState: sessionDocWebinarWebhook.state,
                        timestamp: new Date().toISOString(),
                    });
                }

                await mongoSession.commitTransaction();

                if (paymentIntentSucceeded.invoice) {
                  try {
                    const InvoiceService = require('../services/invoiceService');
                    await InvoiceService.createAndFinalizeForPayment(paymentRecord);
                    console.log(`[Webhook] Successfully initiated invoice generation for webinar payment ${paymentRecord._id}`);
                  } catch (invoiceError) {
                    logger.error(`[Webhook] CRITICAL: Webinar payment ${paymentRecord._id} succeeded but invoice generation failed. Manual intervention required.`, {
                        paymentIntentId: paymentIntentSucceeded.id,
                        invoiceId: paymentIntentSucceeded.invoice,
                        error: invoiceError.message,
                    });
                  }
                }

                console.log('[Webhook] After mongoSession.commitTransaction() for webinar', { webinarBookingId });

                if (paymentRecord) {
                  try {
                    const populatedPaymentRecordForInvoice = await Payment.findById(paymentRecord._id)
                      .populate('payer')
                      .populate({
                        path: 'booking',
                        populate: [
                          { path: 'coach', select: 'firstName lastName' },
                          { path: 'sessionType', select: 'name title' }
                        ]
                      });

                    if (populatedPaymentRecordForInvoice) {
                      await InvoiceService.createAndFinalizeForPayment(populatedPaymentRecordForInvoice);
                      console.log(`[Webhook] Successfully initiated invoice generation for webinar payment ${paymentRecord._id}`);
                    } else {
                      logger.error(`[Webhook] CRITICAL: Could not re-fetch payment record ${paymentRecord._id} after transaction for invoice generation.`);
                    }
                  } catch (invoiceError) {
                    logger.error(`[Webhook] CRITICAL: Webinar payment ${paymentRecord._id} succeeded but invoice generation failed. Manual intervention required.`, {
                        paymentIntentId: paymentIntentSucceeded.id,
                        error: invoiceError.message,
                    });
                  }
                } else {
                    logger.error(`[Webhook] CRITICAL: paymentRecord variable was not available after transaction commit. Cannot generate invoice for PI ${paymentIntentIdFromWebhook}.`);
                }

                const payingUserForSocket = await User.findById(payingUserId).select('firstName lastName').lean();
                const socketService = req.io ? getSocketService(req.io) : getSocketService();

                if (socketService) {
                    socketService.emitToUser(payingUserId, 'webinar_registration_confirmed', {
                        bookingId: webinarBookingId,
                        title: booking.title,
                    });
                    console.log('[Webhook] Emitted webinar_registration_confirmed to user', { userId: payingUserId, webinarBookingId });
                    socketService.emitToUser(booking.coach._id.toString(), 'webinar_new_attendee', {
                        bookingId: webinarBookingId,
                        webinarTitle: booking.title,
                        attendeeId: payingUserId,
                        attendeeName: payingUserForSocket ? `${payingUserForSocket.firstName} ${payingUserForSocket.lastName}` : 'A new user',
                        currentAttendeeCount: booking.attendees.length,
                        maxAttendees: booking.maxAttendees
                    });
                    console.log('[Webhook] Emitted webinar_new_attendee to coach', { coachId: booking.coach._id.toString(), webinarBookingId });
                    
                    const allRecipientIds = booking.attendees.map(att => att.user.toString());
                    if (!allRecipientIds.includes(booking.coach._id.toString())) {
                      allRecipientIds.push(booking.coach._id.toString());
                    }
                    socketService.emitBookingUpdate(webinarBookingId, booking.toObject(), allRecipientIds);

                    console.log('[Webhook] Socket emissions completed for webinar PI.succeeded.', { webinarBookingId });
                } else {
                  console.log('[Webhook] SocketService not available, skipping socket emissions for webinar registration.');
                }
                
                console.log('[Webhook] User added to webinar & payment record finalized for PI.succeeded.', { webinarBookingId, payingUserId, paymentId: paymentRecord._id });

             const bookingForNotifications = await Booking.findById(webinarBookingId)
                        .populate({
                            path: 'coach', 
                            select: 'firstName lastName email _id' 
                        })
                        .populate({
                            path: 'attendees.user', 
                            select: 'firstName lastName email _id'
                        })
                        .populate('sessionType', 'name title'); 

                    if (bookingForNotifications && bookingForNotifications.coach && payingUserId) {
                        const clientUserObjectFromAttendees = bookingForNotifications.attendees.find(att => att.user && att.user._id && att.user._id.toString() === payingUserId)?.user;
                        const clientUserObject = clientUserObjectFromAttendees || await User.findById(payingUserId).select('firstName lastName email _id').lean();

                        if (clientUserObject && clientUserObject._id) {
                            await UnifiedNotificationService.sendNotification({
                                type: NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT,
                                recipient: clientUserObject._id.toString(),
                                recipientType: 'client', 
                                category: NotificationCategories.BOOKING,
                                priority: NotificationPriorities.HIGH,
                                channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
                                metadata: { 
                                    bookingId: webinarBookingId,
                                    coachName: `${bookingForNotifications.coach.firstName || ''} ${bookingForNotifications.coach.lastName || ''}`.trim(),
                                    webinarTitle: bookingForNotifications.title || bookingForNotifications.sessionType?.name,
                                    date: new Date(bookingForNotifications.start).toLocaleDateString(),
                                    time: new Date(bookingForNotifications.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
                                    paymentStatus: 'completed', 
                                    webinarLink: bookingForNotifications.webinarLink || bookingForNotifications.sessionLink?.url,
                                    amount: paymentIntentSucceeded.amount / 100,
                                    currency: paymentIntentSucceeded.currency.toUpperCase()
                                }
                            }, bookingForNotifications); 
                            console.log('[Webhook] Sent WEBINAR_REGISTRATION_CONFIRMED_CLIENT notification.', { webinarBookingId, userId: clientUserObject._id.toString() });
                        } else {
                          logger.error("[Webhook] Could not send WEBINAR_REGISTRATION_CONFIRMED_CLIENT: Client user object not found.", { 
                            webinarBookingId, 
                            payingUserId
                          });
                        }

                        const newAttendeeNameForCoachNotification = clientUserObject ? `${clientUserObject.firstName} ${clientUserObject.lastName}` : 'A new participant';
                        await UnifiedNotificationService.sendNotification({
                            type: NotificationTypes.WEBINAR_NEW_ATTENDEE_COACH,
                            recipient: bookingForNotifications.coach._id.toString(), 
                            recipientType: 'coach', 
                            category: NotificationCategories.BOOKING,
                            priority: NotificationPriorities.MEDIUM,
                            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
                            metadata: {
                                bookingId: webinarBookingId,
                                attendeeName: newAttendeeNameForCoachNotification,
                                webinarTitle: bookingForNotifications.title || bookingForNotifications.sessionType?.name,
                                date: new Date(bookingForNotifications.start).toLocaleDateString(),
                                time: new Date(bookingForNotifications.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
                                currentAttendeeCount: bookingForNotifications.attendees.length,
                                maxAttendees: bookingForNotifications.maxAttendees,
                            }
                        }, bookingForNotifications);
                        console.log('[Webhook] Sent WEBINAR_NEW_ATTENDEE_COACH notification.', { webinarBookingId, coachId: bookingForNotifications.coach._id.toString() });
                    } else {
                    logger.error("[Webhook] Could not send notifications after PI.succeeded (webinar_registration) due to missing bookingForNotifications, bookingForNotifications.coach, or payingUserId.", { 
                        webinarBookingId, 
                        hasBookingForNotif: !!bookingForNotifications,
                        hasCoach: !!bookingForNotifications?.coach,
                        hasPayingUser: !!payingUserId
                    });
                }

            } catch (error) {
              console.log('[Webhook] Transaction CATCH block for webinar_registration PI.succeeded', { error: error.message, stack: error.stack, webinarBookingId, payingUserId, paymentIntentId: paymentIntentIdFromWebhook, mongoSessionInTransaction: mongoSession.inTransaction() });
                if (mongoSession.inTransaction()) {
                  await mongoSession.abortTransaction();
                  console.log('[Webhook] Transaction aborted for webinar_registration PI.succeeded', { webinarBookingId });
                }
                logger.error('[Webhook] Error processing webinar_registration PI.succeeded webhook:', { error: error.message, stack: error.stack, webinarBookingId, payingUserId, paymentIntentId: paymentIntentIdFromWebhook });
                res.status(500).json({ received: true, status: 'internal_error_processing_webinar_succeeded' });
                return;
              } finally {
                console.log('[Webhook] FINALLY block for webinar_registration PI.succeeded. Ending session.', { webinarBookingId, mongoSessionInTransactionBeforeEnd: mongoSession.inTransaction() });
                if (mongoSession.inTransaction()) {
                    console.log('[Webhook] WARNING: Transaction was still active in finally block. Aborting.', { webinarBookingId });
                    await mongoSession.abortTransaction();
                }
                mongoSession.endSession();
                console.log('[Webhook] MongoDB session ended for webinar PI.succeeded.', { webinarBookingId });
            }
            if (!res.headersSent) {
                res.json({ received: true, status: 'processed_webinar_registration' });
                 return;
            }
      } else {
          console.log('[Webhook] Processing standard/live_session PI.succeeded', { paymentIntentId: paymentIntentSucceeded.id, metadata: paymentIntentSucceeded.metadata, timestamp: new Date().toISOString() });
          
          const payment = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntentSucceeded.id })
            .populate({
              path: 'booking',
              populate: [{ path: 'user' }, { path: 'coach' }, { path: 'sessionType' }]
            })
            .populate('payer')
            .populate('recipient')
            .populate('program')
            .populate('liveSession');

          if (!payment) {
            logger.error('[Webhook] CRITICAL: Payment record not found for succeeded PI.', { paymentIntentId: paymentIntentSucceeded.id });
            return res.json({ received: true, status: 'error_not_found' });
          }

          if (payment.status === 'completed') {
            console.log(`[Webhook] Idempotency Check: Payment ${payment._id} (type: ${payment.type}) is already completed. No action taken.`, { paymentIntentId: paymentIntentSucceeded.id });
            return res.json({ received: true, status: 'processed_successfully_idempotent' });
          }

          payment.status = 'completed';
          payment.stripe.chargeId = paymentIntentSucceeded.latest_charge || paymentIntentSucceeded.charges?.data[0]?.id;
          payment.metadata = { ...payment.metadata, ip: customerIp };

          if (payment.type === 'authorization') {
            payment.type = 'overtime_charge';
            payment.amount.total = paymentIntentSucceeded.amount_received / 100;
            console.log(`[Webhook] Transitioned Payment record from 'authorization' to 'overtime_charge'.`, { paymentId: payment._id });
          }

          await payment.save();
          console.log(`[Webhook] Payment record ${payment._id} updated. Status: completed, Type: ${payment.type}.`, { paymentIntentId: paymentIntentSucceeded.id });
        
          await handlePaymentSuccess(payment, paymentIntentSucceeded);
        
          return res.json({ received: true, status: 'processed_successfully' });
        }
        break;
      
        case 'payment_intent.payment_failed':
        // Handle failures, checking metadata for overtime context
        if (event.data.object.metadata?.type === 'overtime_authorization' || event.data.object.metadata?.manualCapture === 'true') {
           logger.warn('[Webhook] Payment failed during overtime authorization step', { paymentIntentId: event.data.object.id });
           await handleInSessionPaymentFailure(event.data.object, req.io); // Pass io instance
        } else {
           await handlePaymentFailure(event.data.object);
        }
        break;


      case 'payment_intent.amount_capturable_updated':
        const intent = event.data.object;
        // Check if it's a manual capture intent relevant to our flow
        if (intent.capture_method === 'manual' && intent.status === 'requires_capture') {
            console.log('[Webhook] PI amount_capturable_updated (Manual Capture Authorization Success)', {
               paymentIntentId: intent.id,
               status: intent.status,
               amount_capturable: intent.amount_capturable,
               metadata: intent.metadata,
               timestamp: new Date().toISOString()
            });

            // Update associated Payment record status to 'authorized' if it's 'pending_confirmation'
            // This acts as a reliable confirmation mechanism
            const payment = await Payment.findOneAndUpdate(
               { 'stripe.paymentIntentId': intent.id, status: 'pending_confirmation' }, // Condition: PI matches AND status is pending
               {
                   $set: {
                       status: 'authorized',
                       'amount.authorized': intent.amount_capturable / 100, // Store the amount ready for capture
                       error: null, // Clear any previous errors
                       updatedAt: new Date()
                    }
               },
               { new: true } // Return the updated document
            ).populate({
                path: 'booking',
                select: 'sessionLink coach user _id' // Select necessary fields
            });

            if (payment) {
                console.log('[Webhook] Updated Payment record status to authorized via amount_capturable_updated event', { paymentId: payment._id, paymentIntentId: intent.id });

                // Emit socket event to confirm authorization to the frontend session room
                const bookingSessionId = payment.booking?.sessionLink?.sessionId;
                const videoIO = req.io?.of('/video');

                if (bookingSessionId && videoIO) {
                    const roomName = `session:${bookingSessionId}`;
                    videoIO.to(roomName).emit('authorization_confirmed', {
                      paymentIntentId: intent.id,
                      bookingId: payment.booking._id.toString(),
                      timestamp: new Date().toISOString()
                    });
                    console.log('[Webhook] Emitted authorization_confirmed socket event via amount_capturable_updated', { roomName, paymentIntentId: intent.id });
                } else {
                    logger.warn('[Webhook] Could not emit authorization_confirmed: Missing booking/sessionLink/io instance', { paymentId: payment._id, hasBooking: !!payment.booking, hasSessionLink: !!payment.booking?.sessionLink, hasIo: !!req.io });
                }
            } else {
               console.log('[Webhook] Payment record already authorized or not found for amount_capturable_updated event.', { paymentIntentId: intent.id });
            }
        } else {
             console.log('[Webhook] Ignoring amount_capturable_updated event (not manual/requires_capture or irrelevant)', { paymentIntentId: intent.id, status: intent.status, capture_method: intent.capture_method });
        }
        break;

        
      case 'transfer.created':
      case 'transfer.updated':
      case 'transfer.paid':
        const transfer = event.data.object;
        
        if (transfer.status !== 'paid') {
          console.log(`[Webhook] Received '${event.type}' for transfer ${transfer.id}, but status is '${transfer.status}'. Final confirmation will be on 'paid' status. No action taken.`);
          break;
        }

        const internalPaymentId = transfer.metadata.internalPaymentId;
        console.log(`[Webhook] Processing paid transfer from '${event.type}' event.`, { stripeTransferId: transfer.id, internalPaymentId });
        
        if (internalPaymentId) {
            try {
                const paymentUpdateResult = await Payment.updateOne(
                  { _id: internalPaymentId, stripeTransferId: transfer.id, payoutStatus: { $ne: 'paid_out' } },
                  { $set: { payoutStatus: 'paid_out' } }
                );

                if (paymentUpdateResult.matchedCount > 0) {
                    await Transaction.updateOne(
                      { 'stripe.transferId': transfer.id, type: 'payout' },
                      { $set: { status: 'completed' } }
                    );

                    const paymentRecord = await Payment.findById(internalPaymentId)
                        .populate({ path: 'booking', populate: [{ path: 'user' }, { path: 'coach' }, { path: 'sessionType' }] })
                        .populate('payer')
                        .populate('recipient')
                        .populate('program');
                    
                    if (paymentRecord) {
                        await coachFinancialService.generateAndStoreStatement(paymentRecord);
                        console.log(`[Webhook] Successfully generated coach statement after transfer was paid.`, { internalPaymentId, transferId: transfer.id });
                    } else {
                        logger.error(`[Webhook] CRITICAL: Could not find payment record ${internalPaymentId} to generate statement after transfer was paid. Manual intervention required.`, { transfer });
                    }
                } else {
                    console.log(`[Webhook] Paid transfer event for payment ${internalPaymentId} ignored. Payment was already marked as 'paid_out' (idempotency).`, { transfer });
                }

            } catch (error) {
                logger.error(`[Webhook] CRITICAL: Error processing paid transfer from '${event.type}' event for payment ${internalPaymentId}. Manual intervention required.`, { error: error.message, stack: error.stack, transfer });
            }

        } else {
            logger.error(`[Webhook] CRITICAL: Paid transfer event received from '${event.type}' without internalPaymentId in metadata. Manual reconciliation required.`, { transfer });
        }
        break;

     case 'charge.refunded':
        const charge = event.data.object;
        logger.info(`[Webhook] Received 'charge.refunded' for charge ${charge.id}. Processing refunds.`);
        for (const refund of charge.refunds.data) {
          await paymentService.handleRefundCompletion(refund);
        }
        break;

      case 'account.updated':
        await handleConnectedAccountUpdate(event.data.object);
        break;

      default:
        console.log(`[PaymentController:Webhook] Unhandled event type: ${event.type}`);
    }

    // --- Log successful processing ---
    await WebhookLog.create({
      source: 'stripe',
      eventType: event.type,
      payload: logPayload,
      headers: req.headers,
      status: 'processed'
    });
    console.log(`[Webhook Logging] Successfully processed and logged event: ${event.type} (${event.id})`);

    res.json({ received: true });

  } catch (error) {
    logger.error('[PaymentController:Webhook] Error processing webhook:', {
      error: error.message,
      stack: error.stack,
      type: error.type // Include Stripe error type if available
    });

   // --- Log the failure ---
    if (event) { // If event was constructed but processing failed
      await WebhookLog.create({
        source: 'stripe',
        eventType: event.type,
        payload: logPayload,
        headers: req.headers,
        status: 'failed',
        errorMessage: error.message
      });
      console.log(`[Webhook Logging] Failed to process event, logged as 'failed': ${event.type} (${event.id})`);
    } else { // If event construction itself failed (e.g., signature error)
      await WebhookLog.create({
        source: 'stripe',
        eventType: 'unknown',
        payload: logPayload,
        headers: req.headers,
        status: 'failed',
        errorMessage: `Webhook construction failed: ${error.message}`
      });
      console.log(`[Webhook Logging] Failed to construct event, logged as 'failed'.`);
    }

    const statusCode = error.type === 'StripeSignatureVerificationError' ? 400 : 500;
    return res.status(statusCode).json({
      success: false,
      message: `Webhook error: ${error.message}`
    });
  }
};

/**
 * Handle successful payment webhook
 */
const handlePaymentSuccess = async (paymentRecord, paymentIntentSucceeded) => {
  const logContext = {
    paymentId: paymentRecord._id.toString(),
    bookingId: paymentRecord.booking?._id?.toString(),
    liveSessionId: paymentRecord.liveSession?._id?.toString(),
    programId: paymentRecord.program?._id?.toString(),
    paymentIntentId: paymentIntentSucceeded.id,
    chargeId: paymentIntentSucceeded.latest_charge || paymentIntentSucceeded.charges?.data[0]?.id
  };
  console.log('[handlePaymentSuccess] V-FINAL - Received successful payment event.', logContext);

  if (paymentRecord.liveSession) {
    const sessionToCheck = await LiveSession.findById(logContext.liveSessionId).select('status').lean();
    if (sessionToCheck && sessionToCheck.status === 'completed') {
        console.log(`[Idempotency Check] LiveSession ${logContext.liveSessionId} is already completed. Skipping post-payment actions.`, logContext);
        return;
    }
  } else if (paymentRecord.booking) {
    const bookingToCheck = await Booking.findById(logContext.bookingId).select('status').lean();
    if (bookingToCheck && ['confirmed', 'completed', 'scheduled'].includes(bookingToCheck.status)) {
      console.log(`[Idempotency Check] Booking ${logContext.bookingId} is already confirmed/completed. Skipping post-payment actions.`, logContext);
      return;
    }
  }

  try {
    if (paymentRecord.program) {
        console.log('[handlePaymentSuccess] V-FINAL - Entering program purchase flow.', logContext);
        
        if (!logContext.chargeId) {
            logger.error(`[handlePaymentSuccess] V-FINAL - CRITICAL: No chargeId on succeeded PaymentIntent for program purchase. Cannot create transaction.`, logContext);
            return;
        }

        const transactionPayload = {
            program: paymentRecord.program._id,
            payment: paymentRecord._id,
            type: 'charge',
            amount: { value: paymentIntentSucceeded.amount / 100, currency: paymentIntentSucceeded.currency.toUpperCase() },
            status: 'completed',
            stripe: { transactionId: paymentIntentSucceeded.id, chargeId: logContext.chargeId }
        };

        await Transaction.findOneAndUpdate(
            { 'stripe.transactionId': paymentIntentSucceeded.id, type: 'charge' },
            { $setOnInsert: transactionPayload },
            { upsert: true, new: true, runValidators: true }
        );
        console.log(`[handlePaymentSuccess] V-FINAL - 'charge' transaction ensured for program purchase.`, logContext);
        
        try {
          await InvoiceService.createAndFinalizeForPayment(paymentRecord);
          console.log(`[handlePaymentSuccess] V-FINAL - Client invoice generation initiated for program purchase.`, logContext);
        } catch (invoiceError) {
          logger.error(`[handlePaymentSuccess] V-FINAL - NON-FATAL: Program payment succeeded but invoice generation failed.`, { ...logContext, error: invoiceError.message });
        }

        const program = paymentRecord.program;
        const client = paymentRecord.payer;
        const coach = paymentRecord.recipient;

        try {
            await UnifiedNotificationService.sendNotification({
                type: NotificationTypes.PROGRAM_PURCHASE_CONFIRMED,
                recipient: client._id,
                metadata: { programTitle: program.title, coachName: `${coach.firstName} ${coach.lastName}`, amount: paymentIntentSucceeded.amount / 100, currency: paymentIntentSucceeded.currency.toUpperCase() }
            });

            await UnifiedNotificationService.sendNotification({
                type: NotificationTypes.PROGRAM_SALE_COACH,
                recipient: coach._id,
                metadata: { programTitle: program.title, clientName: `${client.firstName} ${client.lastName}`, amount: paymentIntentSucceeded.amount / 100, currency: paymentIntentSucceeded.currency.toUpperCase() }
            });
        } catch (notificationError) {
            logger.error('[handlePaymentSuccess] V-FINAL - NON-FATAL: Failed to send notifications for program purchase.', { ...logContext, error: notificationError.message });
        }
        
        try {
            const socketService = getSocketService();
            if (socketService) {
                socketService.emitToUser(client._id.toString(), 'program_purchase_confirmed', { programId: program._id, programTitle: program.title });
                socketService.emitToUser(coach._id.toString(), 'program_new_enrollment', { programId: program._id, programTitle: program.title, clientName: `${client.firstName} ${client.lastName}` });
            }
        } catch (socketError) {
            logger.error('[handlePaymentSuccess] V-FINAL - NON-FATAL: Failed to emit socket events for program purchase.', { ...logContext, error: socketError.message });
        }

        console.log(`[handlePaymentSuccess] V-FINAL - Program purchase notifications sent. Processing complete.`, logContext);

    } else if (paymentRecord.booking) {
        if (paymentRecord.status !== 'completed') {
          paymentRecord.status = 'completed';
          paymentRecord.stripe.chargeId = logContext.chargeId;
          await paymentRecord.save();
          console.log(`[handlePaymentSuccess] V-FINAL - Payment record updated to 'completed'.`, logContext);
        }

        const IS_LIVE_SESSION = !!paymentRecord.liveSession;
        const bookingId = paymentRecord.booking;
        if (!bookingId) {
          throw new Error(`Booking ID not found on payment record ${paymentRecord._id}`);
        }

        const booking = await Booking.findById(bookingId).populate('user coach sessionType');
        if (!booking) {
          throw new Error(`Booking ${bookingId} not found during update.`);
        }

        if (IS_LIVE_SESSION) {
            await LiveSession.updateOne({ _id: paymentRecord.liveSession }, { $set: { status: 'completed' } });
            console.log('[handlePaymentSuccess] V-FINAL - LiveSession state updated to completed.', { liveSessionId: paymentRecord.liveSession });
            booking.status = 'completed';
        } else {
            const sessionTypeIdString = booking.sessionType?._id?.toString() || '';
            const IS_WEBINAR = sessionTypeIdString === WEBINAR_TYPE_ID_STRING;

            if (IS_WEBINAR) {
              const payingUserId = paymentRecord.payer.toString();
              const attendeeIndex = booking.attendees.findIndex(att => att.user.toString() === payingUserId);
              if (attendeeIndex !== -1) {
                if (booking.attendees[attendeeIndex].status !== 'confirmed') {
                  booking.attendees[attendeeIndex].status = 'confirmed';
                  booking.markModified('attendees');
                }
              } else {
                booking.attendees.push({ user: paymentRecord.payer._id, status: 'confirmed', joinedAt: new Date(), paymentIntentId: paymentIntentSucceeded.id });
                booking.markModified('attendees');
              }
              const confirmedCount = booking.attendees.filter(a => a.status === 'confirmed').length;
              if (booking.status === 'pending_minimum_attendees' && confirmedCount >= (booking.minAttendees || 1) ) {
                booking.status = 'scheduled';
              }
            } else {
              booking.status = 'confirmed';
            }
            await Session.updateOne({ bookingId }, { $set: { state: 'confirmed', lastUpdated: new Date() } });
            console.log('[handlePaymentSuccess] V-FINAL - Session state updated to confirmed.', { bookingId });
        }

        booking.payment.status = 'completed';
        const updatedBooking = await booking.save();
        console.log('[handlePaymentSuccess] V-FINAL - Booking status updated.', { bookingId: updatedBooking._id, newStatus: updatedBooking.status });

        if (!logContext.chargeId) {
            logger.error(`[handlePaymentSuccess] V-FINAL - CRITICAL: No chargeId on succeeded PaymentIntent. Cannot create transactions.`, logContext);
            return;
        }
        
        const transactionPayload = {
            booking: bookingId,
            payment: paymentRecord._id,
            type: 'charge',
            amount: { value: paymentIntentSucceeded.amount / 100, currency: paymentIntentSucceeded.currency.toUpperCase() },
            status: 'completed',
            stripe: { transactionId: paymentIntentSucceeded.id, chargeId: logContext.chargeId }
        };
        if (IS_LIVE_SESSION) {
            transactionPayload.liveSession = paymentRecord.liveSession;
        }

        await Transaction.findOneAndUpdate(
            { 'stripe.transactionId': paymentIntentSucceeded.id, type: 'charge' },
            { $setOnInsert: transactionPayload },
            { upsert: true, new: true, runValidators: true }
        );
        console.log(`[handlePaymentSuccess] V-FINAL - 'charge' transaction ensured.`, logContext);
        
        const finalPaymentRecordForDocs = await Payment.findById(paymentRecord._id)
          .populate({ path: 'booking', populate: [{ path: 'user' }, { path: 'coach' }, { path: 'sessionType' }] })
          .populate('payer')
          .populate('recipient')
          .populate('program')
          .populate('liveSession');

        if (!finalPaymentRecordForDocs) {
            logger.error('[handlePaymentSuccess] V-FINAL - CRITICAL: Could not re-fetch final payment record before document generation.', logContext);
            return;
        }
        
        try {
          await InvoiceService.createAndFinalizeForPayment(finalPaymentRecordForDocs, paymentIntentSucceeded);
          console.log(`[handlePaymentSuccess] V-FINAL - Client invoice generation initiated.`, logContext);
        } catch (invoiceError) {
          logger.error(`[handlePaymentSuccess] V-FINAL - NON-FATAL: Payment succeeded but invoice generation failed.`, { ...logContext, error: invoiceError.message });
        }

        const sessionTypeIdString = updatedBooking.sessionType?._id?.toString() || '';
        const IS_WEBINAR = sessionTypeIdString === WEBINAR_TYPE_ID_STRING;
        const coach = updatedBooking.coach;
        const clientForNotification = IS_WEBINAR || IS_LIVE_SESSION ? await User.findById(paymentRecord.payer) : updatedBooking.user;
        
        if (clientForNotification && coach) {
          const clientNotificationType = IS_LIVE_SESSION
              ? NotificationTypes.LIVE_SESSION_RECEIPT_CLIENT
              : (IS_WEBINAR ? NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT : NotificationTypes.BOOKING_CONFIRMED);

          const coachNotificationType = IS_LIVE_SESSION
              ? NotificationTypes.LIVE_SESSION_EARNINGS_COACH
              : (IS_WEBINAR ? NotificationTypes.WEBINAR_NEW_ATTENDEE_COACH : NotificationTypes.BOOKING_CONFIRMED);
            
            try {
                await UnifiedNotificationService.sendNotification({
                    type: clientNotificationType,
                    recipient: clientForNotification._id.toString(),
                    metadata: { 
                        bookingId: updatedBooking._id, 
                        coachName: `${coach.firstName} ${coach.lastName}`.trim(),
                        webinarTitle: updatedBooking.title,
                        amount: paymentIntentSucceeded.amount / 100,
                        currency: paymentIntentSucceeded.currency.toUpperCase(),
                        otherPartyName: `${coach.firstName} ${coach.lastName}`.trim()
                    }
                }, updatedBooking);
            
                await UnifiedNotificationService.sendNotification({
                    type: coachNotificationType,
                    recipient: coach._id.toString(),
                    metadata: { 
                        bookingId: updatedBooking._id, 
                        attendeeName: `${clientForNotification.firstName} ${clientForNotification.lastName}`.trim(),
                        webinarTitle: updatedBooking.title,
                        otherPartyName: `${clientForNotification.firstName} ${clientForNotification.lastName}`.trim()
                    }
                }, updatedBooking);
            } catch (notificationError) {
                logger.error('[handlePaymentSuccess] V-FINAL - NON-FATAL: Failed to send notifications for booking.', { ...logContext, error: notificationError.message });
            }
        }

        try {
            const socketService = getSocketService();
            if (socketService) {
                const recipients = [updatedBooking.coach._id.toString()];
                if (updatedBooking.user?._id) {
                    recipients.push(updatedBooking.user._id.toString());
                }
                socketService.emitBookingUpdate(updatedBooking._id, updatedBooking.toObject(), recipients);
            }
        } catch (socketError) {
            logger.error('[handlePaymentSuccess] V-FINAL - NON-FATAL: Failed to emit socket events for booking.', { ...logContext, error: socketError.message });
        }
        
        console.log(`[handlePaymentSuccess] V-FINAL - Notifications sent. Processing complete.`, logContext);
    } else {
        throw new Error(`Payment record ${paymentRecord._id} has neither a booking nor a program associated.`);
    }
  } catch (error) {
    logger.error('[handlePaymentSuccess] V-FINAL - Unhandled CRITICAL error in handler.', {
      paymentId: paymentRecord?._id?.toString(),
      paymentIntentId: paymentIntentSucceeded?.id,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

/**
 * Confirm a payment
 */
const confirmPayment = async (req, res) => {
  let paymentIntentId;
  try {
    const { paymentMethodId } = req.body;
    paymentIntentId = req.body.paymentIntentId;

    console.log('[PaymentController:confirmPayment] Request received.', {
      paymentIntentId,
      hasPaymentMethodId: !!paymentMethodId,
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    if (!paymentIntentId || !paymentMethodId) {
      return res.status(400).json({ success: false, message: 'Missing paymentIntentId or paymentMethodId' });
    }

    const existingPaymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (existingPaymentIntent.status === 'succeeded') {
      console.log('[PaymentController:confirmPayment] Payment already succeeded (idempotency).', {
        paymentIntentId,
        status: existingPaymentIntent.status,
      });
      const booking = await Booking.findOne({ 'payment.stripe.paymentIntentId': paymentIntentId });
      return res.json({
        success: true,
        status: 'succeeded',
        bookingId: booking?._id,
        recipientId: booking?.user?.toString(),
        amount: existingPaymentIntent.amount / 100,
        currency: existingPaymentIntent.currency,
        message: 'Payment already confirmed'
      });
    }

    const paymentIntent = await paymentService.confirmPaymentIntent(paymentIntentId, paymentMethodId);

    const booking = await Booking.findOne({ 'payment.stripe.paymentIntentId': paymentIntentId });

    res.json({
      success: true,
      status: paymentIntent.status,
      bookingId: booking?._id,
      recipientId: booking?.user?.toString(),
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency
    });

  } catch (error) {
    paymentIntentId = paymentIntentId || req.body?.paymentIntentId || 'unknown';
    logger.error('[PaymentController:confirmPayment] Error confirming payment:', {
      error: error.message,
      stack: error.stack,
      paymentIntentId,
      userId: req.user._id,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      message: 'Error confirming payment',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};

/**
 * Process a refund
 */
const refundPayment = async (req, res) => {
  try {
    const { paymentIntentId, amount, reason, currency } = req.body;
    const initiatorId = req.user?._id;

    paymentFlowLogger.info('[PaymentController:refundPayment] Processing refund request:', {
      paymentIntentId,
      amountDecimal: amount,
      currency,
      reason,
      userId: initiatorId,
    });

    if (!paymentIntentId || typeof amount !== 'number' || amount < 0 || !currency) {
      paymentFlowLogger.error('[PaymentController:refundPayment] Invalid parameters for refund.', { paymentIntentId, amount, currency });
      return res.status(400).json({ success: false, message: 'Payment Intent ID, valid amount, and currency are required for refund.' });
    }

    // Step 1: Process the refund via Stripe
    const stripeRefund = await paymentService.processRefund({
      paymentIntentId,
      amount,
      currency,
      reason: reason || 'Platform initiated refund'
    });

    // Step 2: Use the centralized service to handle core DB updates
    // This function will update Payment status, refunds array, and Booking status.
    const payment = await paymentService.handleRefundCompletion(stripeRefund, { initiatorId });

    if (!payment) {
        // The service function logs the error, we just need to respond.
        return res.status(404).json({ success: false, message: 'Original payment record not found after refund.' });
    }

    // Step 3: Perform the detailed financial calculations and create the rich Transaction record.
    // This logic is preserved from your original function.
    const amountRefundedToClient = stripeRefund.amount / 100;
    const originalClientPaymentTotal = payment.amount.total;
    const GLOBAL_PLATFORM_FEE_PERCENTAGE = parseFloat(process.env.PLATFORM_FEE_PERCENTAGE) || 0.15;

    const amountKeptByCoachAndPlatform = parseFloat((originalClientPaymentTotal - amountRefundedToClient).toFixed(2));
    const platformFeeEarnedByPlatform = parseFloat((amountKeptByCoachAndPlatform * GLOBAL_PLATFORM_FEE_PERCENTAGE).toFixed(2));
    const netCoachEarningFromBooking = parseFloat((amountKeptByCoachAndPlatform - platformFeeEarnedByPlatform).toFixed(2));
    
    let originalPlatformFeeCharged = 0;
    if (payment.amount.platformFee && typeof payment.amount.platformFee === 'number') {
        originalPlatformFeeCharged = payment.amount.platformFee;
    } else if (payment.amount.base && typeof payment.amount.base === 'number') {
        originalPlatformFeeCharged = parseFloat((payment.amount.base * GLOBAL_PLATFORM_FEE_PERCENTAGE).toFixed(2));
    } else {
        originalPlatformFeeCharged = parseFloat((originalClientPaymentTotal / (1 + (payment.amount.vat?.rate || 0)/100) * GLOBAL_PLATFORM_FEE_PERCENTAGE).toFixed(2));
    }

    const platformFeeAdjustmentEffect = parseFloat((originalPlatformFeeCharged - platformFeeEarnedByPlatform).toFixed(2));
    const originalNetCoachEarning = payment.amount.base ? (payment.amount.base - originalPlatformFeeCharged) : (amountKeptByCoachAndPlatform + amountRefundedToClient - (payment.amount.vat?.amount || 0) - originalPlatformFeeCharged);
    const coachPayoutEffect = parseFloat((netCoachEarningFromBooking - originalNetCoachEarning).toFixed(2));

    // Find and update the refund transaction created by the service to add financial effects
    await Transaction.updateOne(
      { 'stripe.transactionId': stripeRefund.id, type: 'refund' },
      {
        $set: {
          financialEffects: {
            platformFeeAdjusted: platformFeeAdjustmentEffect,
            platformFeeCurrency: payment.amount.currency,
            coachPayoutAdjusted: coachPayoutEffect,
            coachPayoutCurrency: payment.amount.currency,
            newPlatformFeeEarned: platformFeeEarnedByPlatform,
            newNetCoachEarning: netCoachEarningFromBooking,
            amountRetainedBySystem: amountKeptByCoachAndPlatform
          },
          notes: `Refund processed. Reason: ${reason || 'N/A'}. Original Platform Fee: ${originalPlatformFeeCharged}. New Fee Earned: ${platformFeeEarnedByPlatform}.`
        }
      }
    );
    
    paymentFlowLogger.info('[PaymentController:refundPayment] Refund processed successfully and transaction enriched:', {
        refundId: stripeRefund.id,
        paymentIntentId,
    });
    
    res.json({
      success: true,
      refund: stripeRefund,
      bookingId: payment.booking,
      amount: amountRefundedToClient,
      currency: stripeRefund.currency.toUpperCase(),
      newPaymentStatus: payment.status
    });

  } catch (error) {
    paymentFlowLogger.error('[PaymentController:refundPayment] Error processing refund:', {
      error: error.message,
      stack: error.stack,
      paymentIntentId: req.body.paymentIntentId,
      userId: req.user?._id
    });

    res.status(500).json({
      success: false,
      message: 'Error processing refund',
      error: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message
    });
  }
};

/**
 * Get payment status
 */
const getPaymentStatus = async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const userId = req.user._id.toString();

    // Debug level for routine status check
    console.log('[PaymentController] Fetching payment status:', {
      paymentIntentId,
      userId,
      timestamp: new Date().toISOString()
    });

   let payment = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntentId });

    if (!payment) {
      if (mongoose.Types.ObjectId.isValid(paymentIntentId)) {
        payment = await Payment.findById(paymentIntentId);
      }
    }

    if (!payment) {
      const booking = await Booking.findById(paymentIntentId); // Fallback for legacy flows
      if (booking) {
        console.log('[PaymentController] Payment not yet initialized for booking:', {
          bookingId: booking._id,
          status: booking.status,
          timestamp: new Date().toISOString()
        });
        return res.json({
          status: 'initializing',
          bookingId: booking._id,
          timestamp: new Date().toISOString()
        });
      }
      console.log('[PaymentController] Payment not found:', {
        paymentIntentId
      });
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const stripePaymentIntent = await stripe.paymentIntents.retrieve(payment.stripe.paymentIntentId);

    // Info level for important state changes
    console.log('[PaymentController] Payment status fetched:', {
      paymentIntentId,
      status: stripePaymentIntent.status,
      bookingId: payment.booking
    });

    res.json({
      success: true,
      status: stripePaymentIntent.status,
      amount: stripePaymentIntent.amount / 100,
      currency: stripePaymentIntent.currency,
      paymentMethod: stripePaymentIntent.payment_method,
      created: new Date(stripePaymentIntent.created * 1000).toISOString(),
      bookingId: payment.booking
    });

  } catch (error) {
    // Keep error logging at error level
    logger.error('[PaymentController] Error fetching payment status:', {
      error: error.message,
      paymentIntentId: req.params.paymentIntentId,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching payment status',
      error: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message
    });
  }
};

/**
 * Get transaction history
 */
const getTransactionHistory = async (req, res) => {
  try {
    const { userId, startDate, endDate, type } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    console.log('[PaymentController] Fetching transaction history:', {
      userId,
      startDate,
      endDate,
      type,
      page,
      limit,
      requesterId: req.user._id,
      timestamp: new Date().toISOString()
    });

    const query = {};
    if (userId) {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      query.$or = [
        { 'payment.payer': userId },
        { 'payment.recipient': userId }
      ];
    }

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (type) {
      query.type = type;
    }

    const totalCount = await Transaction.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: 'booking',
        select: 'sessionType start end',
        populate: {
          path: 'sessionType',
          select: 'name'
        }
      })
      .populate('payment', 'amount.total amount.currency status');

    console.log('[PaymentController] Transaction history retrieved:', {
      count: transactions.length,
      page,
      totalPages
    });

    res.json({
      success: true,
      transactions,
      currentPage: page,
      totalPages,
      totalCount
    });

  } catch (error) {
    logger.error('[PaymentController] Error fetching transaction history:', {
      error: error.message,
      stack: error.stack,
      userId: req.query.userId,
      requesterId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching transaction history',
      error: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message
    });
  }
};

/**
 * Get saved payment methods
 */
const getPaymentMethods = async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user._id.toString() && req.user.role !== 'admin') {
      logger.error('[PaymentController] Unauthorized payment methods access:', {
        requestedUserId: userId,
        authenticatedUserId: req.user._id,
        timestamp: new Date().toISOString()
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    console.log('[PaymentController] Fetching payment methods:', {
      userId,
      authenticatedUserId: req.user._id,
      timestamp: new Date().toISOString()
    });

    const user = await User.findById(userId);
    if (!user) {
      logger.error('[PaymentController] User not found:', { userId });
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.stripe?.customerId) {
      return res.json({ paymentMethods: [] });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: user.stripe.customerId,
      type: 'card'
    });

    console.log('[PaymentController] Payment methods retrieved:', {
      count: paymentMethods.data.length,
      userId
    });

    res.json({
      success: true,
      paymentMethods: paymentMethods.data.map(method => ({
        id: method.id,
        brand: method.card.brand,
        last4: method.card.last4,
        expMonth: method.card.exp_month,
        expYear: method.card.exp_year,
        isDefault: method.id === user.stripe?.defaultPaymentMethodId
      }))
    });

  } catch (error) {
    logger.error('[PaymentController] Error fetching payment methods:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId
    });

    res.status(500).json({
      success: false,
      message: 'Error fetching payment methods',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};

/**
 * Add payment method
 */
const addPaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId, isDefault } = req.body;

    console.log('[PaymentController] Adding payment method:', {
      userId: req.user._id,
      paymentMethodId,
      isDefault,
      timestamp: new Date().toISOString()
    });

    const user = await User.findById(req.user._id);
    
    // Create Stripe customer if doesn't exist
    if (!user.stripe?.customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`
      });
      user.stripe = { customerId: customer.id };
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripe.customerId,
    });

    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripe.customerId,
    });

    // Set as default if requested or if it's the first payment method
    if (isDefault || !user.stripe.defaultPaymentMethodId) {
      await stripe.customers.update(user.stripe.customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      user.stripe.defaultPaymentMethodId = paymentMethodId;
    }

    await user.save();

    console.log('[PaymentController] Payment method added successfully:', {
      userId: req.user._id,
      paymentMethodId
    });

    res.json({
      success: true,
      message: 'Payment method added successfully',
      paymentMethod
    });

  } catch (error) {
    logger.error('[PaymentController] Error adding payment method:', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id
    });

    res.status(500).json({
      success: false,
      message: 'Error adding payment method',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};

/**
 * Delete payment method
 */
const deletePaymentMethod = async (req, res) => {
  try {
    const { methodId } = req.params;

    console.log('[PaymentController] Deleting payment method:', {
      userId: req.user._id,
      methodId,
      timestamp: new Date().toISOString()
    });

    const user = await User.findById(req.user._id);
    
    if (!user.stripe?.customerId) {
      return res.status(404).json({
        success: false,
        message: 'No payment methods found'
      });
    }

    await stripe.paymentMethods.detach(methodId);

    // If this was the default method, remove it from user
    if (user.stripe.defaultPaymentMethodId === methodId) {
      user.stripe.defaultPaymentMethodId = undefined;
      
      // Find another payment method to set as default
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripe.customerId,
        type: 'card'
      });

      if (paymentMethods.data.length > 0) {
        user.stripe.defaultPaymentMethodId = paymentMethods.data[0].id;
        await stripe.customers.update(user.stripe.customerId, {
          invoice_settings: {
            default_payment_method: paymentMethods.data[0].id,
          },
        });
      }
    }

    await user.save();

    console.log('[PaymentController] Payment method deleted successfully:', {
      userId: req.user._id,
      methodId
    });

    res.json({
      success: true,
      message: 'Payment method deleted successfully'
    });

  } catch (error) {
    logger.error('[PaymentController] Error deleting payment method:', {
      error: error.message,
      stack: error.stack,
      userId: req.user._id,
      methodId: req.params.methodId
    });

    res.status(500).json({
      success: false,
      message: 'Error deleting payment method',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};

/**
 * Handle failed payment webhook
 */
async function handlePaymentFailure(paymentIntent) {
  try {
    logger.error('[PaymentController] Processing payment failure:', {
      paymentIntentId: paymentIntent.id,
      error: paymentIntent.last_payment_error,
      metadata: paymentIntent.metadata
    });

    const payment = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntent.id });

    if (!payment) {
      logger.error('[PaymentController] Payment record not found for failed PI. Cannot update entity status.', { paymentIntentId: paymentIntent.id });
      return;
    }

    payment.status = 'failed';
    payment.error = {
      code: paymentIntent.last_payment_error?.code,
      message: paymentIntent.last_payment_error?.message,
      declineCode: paymentIntent.last_payment_error?.decline_code,
      retriable: true
    };
    await payment.save();

    if (payment.liveSession) {
      await LiveSession.updateOne(
        { _id: payment.liveSession },
        { $set: { status: 'completed_payment_failed' } }
      );
    }

    if (payment.booking) {
        const booking = await Booking.findById(payment.booking).populate('user');
        if (booking) {
            booking.payment.status = 'failed';
            await booking.save();

            await UnifiedNotificationService.sendNotification({
              type: NotificationTypes.PAYMENT_FAILED,
              recipient: booking.user._id,
              category: NotificationCategories.PAYMENT,
              priority: NotificationPriorities.HIGH,
              channels: ['in_app', 'email'],
              metadata: {
                bookingId: booking._id,
                error: paymentIntent.last_payment_error?.message,
                recoveryInstructions: 'Please try again or use a different payment method'
              }
            });
        }
    }

  } catch (error) {
    logger.error('[PaymentController] Error processing payment failure:', {
      error: error.message,
      stack: error.stack,
      paymentIntentId: paymentIntent.id
    });
    throw error;
  }
}

const setDefaultPaymentMethod = async (req, res) => {
  try {
    const { userId } = req.params;
    const { paymentMethodId } = req.body;

    if (userId !== req.user._id.toString() && req.user.role !== 'admin') {
      logger.error('[PaymentController] Unauthorized default payment method update:', {
        requestedUserId: userId,
        authenticatedUserId: req.user._id,
        timestamp: new Date().toISOString()
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    if (!paymentMethodId) {
      logger.error('[PaymentController] Missing payment method ID');
      return res.status(400).json({
        success: false,
        message: 'Payment method ID is required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      logger.error('[PaymentController] User not found:', { userId });
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.stripe?.customerId) {
      logger.error('[PaymentController] No Stripe customer found for user:', {
        userId
      });
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Update Stripe customer's default payment method
    await stripe.customers.update(user.stripe.customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Update user record
    user.stripe.defaultPaymentMethodId = paymentMethodId;
    await user.save();

    console.log('[PaymentController] Default payment method set successfully:', {
      userId,
      paymentMethodId,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Default payment method updated successfully',
      customerId: user.stripe.customerId
    });

  } catch (error) {
    logger.error('[PaymentController] Error setting default payment method:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId
    });

    res.status(500).json({
      success: false,
      message: 'Error setting default payment method',
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
  }
};

const processOvertimePayment = async (booking, session, userId) => {
  try {
    console.log('[paymentController.processOvertimePayment] Processing overtime payment', {
      bookingId: booking._id.toString(),
      sessionId: session._id.toString(),
      userId
    });

    const coach = await Coach.findOne({ user: booking.coach._id });
    if (!coach) {
      logger.error('[paymentController.processOvertimePayment] Coach not found', { 
        coachId: booking.coach._id 
      });
      return { success: false, error: 'Coach not found' };
    }

    const hourlyRate = coach.settings?.professionalProfile?.hourlyRate || 100;
    const overtimeCost = (hourlyRate * (booking.overtime.overtimeRate / 100) * booking.overtime.paidOvertimeDuration) / 60;

    const user = await User.findById(userId);
    if (!user) {
      logger.error('[paymentController.processOvertimePayment] User not found', { userId });
      return { success: false, error: 'User not found' };
    }

    const paymentIntent = await stripeService.createPaymentIntent(
      overtimeCost,
      booking.price.currency.toLowerCase(),
      user.stripe?.customerId,
      {
        bookingId: booking._id.toString(),
        sessionId: session._id.toString(),
        type: 'overtime'
      }
    );

    if (!paymentIntent) {
      logger.warn('[paymentController.processOvertimePayment] Zero amount, skipping payment', { 
        bookingId: booking._id.toString(),
        overtimeCost 
      });
      return { success: false, error: 'Zero amount' };
    }

    const payment = new Payment({
      booking: booking._id,
      payer: userId,
      recipient: booking.coach._id,
      amount: {
        base: overtimeCost,
        total: overtimeCost,
        currency: booking.price.currency
      },
      status: 'pending',
      stripe: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        customerId: user.stripe?.customerId
      }
    });
    await payment.save();
    console.log('[paymentController.processOvertimePayment] Payment record created', { 
      paymentId: payment._id,
      paymentIntentId: paymentIntent.id 
    });

    booking.payment.paymentRecord = payment._id;
    await booking.save();
    console.log('[paymentController.processOvertimePayment] Booking updated with payment record', { 
      bookingId: booking._id.toString() 
    });

    return { 
      success: true, 
      clientSecret: paymentIntent.client_secret, 
      paymentIntentId: paymentIntent.id 
    };
  } catch (error) {
    logger.error('[paymentController.processOvertimePayment] Error:', { 
      error: error.message, 
      stack: error.stack,
      bookingId: booking._id.toString() 
    });
    return { success: false, error: error.message };
  }
};

const terminateSessionForPayment = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id.toString();
    console.log('[paymentController.terminateSessionForPayment] Request received', { 
      sessionId, 
      userId 
    });

    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId }).populate('coach user');
    if (!booking) {
      logger.warn('[paymentController.terminateSessionForPayment] Booking not found', { sessionId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const session = await Session.findOne({ bookingId: booking._id });
    if (!session) {
      logger.warn('[paymentController.terminateSessionForPayment] Session not found', { 
        bookingId: booking._id.toString() 
      });
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (booking.coach._id.toString() !== userId) {
      logger.warn('[paymentController.terminateSessionForPayment] Unauthorized access', { 
        userId, 
        coachId: booking.coach._id.toString() 
      });
      return res.status(403).json({ success: false, message: 'Only coach can terminate session' });
    }

    session.terminationReason = 'Payment failure';
    session.state = 'ended';
    session.endedAt = new Date();
    session.actualEndTime = new Date();

    session.participants.forEach((participant) => {
      if (!participant.leftAt) {
        participant.leftAt = new Date();
      }
    });

    await session.save();
    console.log('[paymentController.terminateSessionForPayment] Session terminated', { 
      sessionId: session._id.toString() 
    });

    const videoIO = req.io.of('/video');
    videoIO.to(`session:${sessionId}`).emit('session-ended', {
      endedBy: userId,
      timestamp: new Date().toISOString(),
      reason: 'Payment failure'
    });
    console.log('[paymentController.terminateSessionForPayment] Emitted session-ended event', { sessionId });

    await UnifiedNotificationService.sendNotification(
      {
        type: 'SESSION_TERMINATED',
        recipient: booking.user._id,
        category: 'session',
        priority: 'high',
        channels: ['in_app', 'email'],
        content: {
          title: 'Session Terminated',
          message: 'Session ended due to payment failure.'
        },
        metadata: { bookingId: booking._id, sessionId: session._id }
      },
      booking
    );
    console.log('[paymentController.terminateSessionForPayment] Notified user of termination', { 
      sessionId: session._id.toString() 
    });

    res.json({ success: true, message: 'Session terminated successfully' });
  } catch (error) {
    logger.error('[paymentController.terminateSessionForPayment] Error:', { 
      error: error.message, 
      stack: error.stack,
      sessionId: req.params.sessionId 
    });
    res.status(500).json({ success: false, message: 'Failed to terminate session', error: error.message });
  }
};

const continueSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id.toString();
    console.log('[paymentController.continueSession] Request received', { 
      sessionId, 
      userId 
    });

    const booking = await Booking.findOne({ 'sessionLink.sessionId': sessionId }).populate('coach user');
    if (!booking) {
      logger.warn('[paymentController.continueSession] Booking not found', { sessionId });
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const session = await Session.findOne({ bookingId: booking._id });
    if (!session) {
      logger.warn('[paymentController.continueSession] Session not found', { 
        bookingId: booking._id.toString() 
      });
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (booking.coach._id.toString() !== userId) {
      logger.warn('[paymentController.continueSession] Unauthorized access', { 
        userId, 
        coachId: booking.coach._id.toString() 
      });
      return res.status(403).json({ success: false, message: 'Only coach can continue session' });
    }

    if (session.state !== 'active') {
      logger.warn('[paymentController.continueSession] Session not active', { 
        sessionId, 
        sessionState: session.state 
      });
      return res.status(400).json({ success: false, message: 'Session is not active' });
    }

    session.actualEndTime = new Date(
      session.actualEndTime.getTime() + booking.overtime.paidOvertimeDuration * 60000
    );
    await session.save();
    console.log('[paymentController.continueSession] Session continued with extended end time', { 
      sessionId, 
      newEndTime: session.actualEndTime 
    });

    const videoIO = req.io.of('/video');
    videoIO.to(`session:${sessionId}`).emit('session-continued', {
      newEndTime: session.actualEndTime,
      timestamp: new Date().toISOString()
    });
    console.log('[paymentController.continueSession] Emitted session-continued event', { sessionId });

    await UnifiedNotificationService.sendNotification(
      {
        type: 'SESSION_CONTINUED',
        recipient: booking.user._id,
        category: 'session',
        priority: 'high',
        channels: ['in_app'],
        content: {
          title: 'Session Continued',
          message: 'Coach has chosen to continue the session despite payment failure.'
        },
        metadata: { bookingId: booking._id, sessionId: session._id }
      },
      booking
    );
    console.log('[paymentController.continueSession] Notified user of session continuation', { 
      sessionId: session._id.toString() 
    });

    res.json({ success: true, message: 'Session continued successfully', newEndTime: session.actualEndTime });
  } catch (error) {
    logger.error('[paymentController.continueSession] Error:', { 
      error: error.message, 
      stack: error.stack,
      sessionId: req.params.sessionId 
    });
    res.status(500).json({ success: false, message: 'Failed to continue session', error: error.message });
  }
};

/**
 * Handles payment_intent.payment_failed specifically for overtime authorization attempts.
 * Notifies the coach with options to continue or terminate.
 * @param {object} paymentIntent - The Stripe PaymentIntent object that failed.
 * @param {object} ioInstance - The Socket.IO server instance (passed from webhook handler).
 */
async function handleInSessionPaymentFailure(paymentIntent, ioInstance) {
  const logContext = {
      paymentIntentId: paymentIntent.id,
      bookingId: paymentIntent.metadata?.bookingId,
      sessionId: paymentIntent.metadata?.sessionId, // sessionLink.sessionId
      userId: paymentIntent.metadata?.userId,
      failureReason: paymentIntent.last_payment_error?.message,
      failureCode: paymentIntent.last_payment_error?.code,
      timestamp: new Date().toISOString()
  };
  // Refined Log V2
  logger.error('[handleInSessionPaymentFailure V2] Processing in-session payment failure', logContext);

  try {
      if (!logContext.bookingId) {
          logger.error('[handleInSessionPaymentFailure V2] Missing bookingId in PaymentIntent metadata.', logContext);
          return; // Cannot proceed without booking context
      }

      const booking = await Booking.findById(logContext.bookingId).populate('coach user');
      if (!booking) {
          logger.error('[handleInSessionPaymentFailure V2] Booking not found', logContext);
          return; // Cannot proceed
      }
       // Add booking's sessionLink.sessionId to context if available
      logContext.sessionLinkSessionId = booking.sessionLink?.sessionId;


      const session = await Session.findOne({ bookingId: booking._id });
      if (!session) {
          logger.error('[handleInSessionPaymentFailure V2] Session document not found', { ...logContext, bookingId: booking._id.toString() });
          // Should we still notify the coach? Maybe, but actions might be limited.
          // For now, we'll stop if session doc is missing.
          return;
      }
       logContext.sessionDocId = session._id.toString();

      // Update the associated Payment record status to 'failed'
      const paymentUpdateResult = await Payment.updateOne(
          { 'stripe.paymentIntentId': paymentIntent.id },
          { $set: { status: 'failed', error: { message: logContext.failureReason, code: logContext.failureCode }, updatedAt: new Date() } }
      );
      if (paymentUpdateResult.matchedCount > 0) {
           console.log('[handleInSessionPaymentFailure V2] Updated associated Payment record to failed', logContext);
      } else {
            logger.warn('[handleInSessionPaymentFailure V2] Associated Payment record not found for update.', logContext);
      }

      // Update the corresponding segment in the Session document to 'failed'
      const segmentIndex = session.overtimeSegments.findIndex(s => s.paymentIntentId === paymentIntent.id);
      if (segmentIndex !== -1) {
          session.overtimeSegments[segmentIndex].status = 'failed';
          session.overtimeSegments[segmentIndex].captureResult = { status: 'failed', error: logContext.failureReason || 'Payment Authorization Failed' };
          await session.save(); // Save the updated session
           console.log('[handleInSessionPaymentFailure V2] Updated Session overtimeSegment status to failed', { ...logContext, segmentId: session.overtimeSegments[segmentIndex]._id });
      } else {
           logger.warn('[handleInSessionPaymentFailure V2] Could not find matching segment in Session document to mark as failed.', logContext);
      }


      // --- Notify Coach via UnifiedNotificationService ---
      const coachRecipientId = booking.coach._id.toString();
      const sessionLinkSessionId = booking.sessionLink?.sessionId; // Needed for API endpoints

      if (!sessionLinkSessionId) {
           logger.error('[handleInSessionPaymentFailure V2] Cannot create notification actions: Missing sessionLink.sessionId on booking.', logContext);
           // Proceed without actions? Or stop? Let's proceed but log the issue.
      }

      const notificationPayload = {
          type: NotificationTypes.IN_SESSION_PAYMENT_FAILED,
          recipient: coachRecipientId,
          category: NotificationCategories.PAYMENT,
          priority: NotificationPriorities.HIGH,
          channels: ['in_app', 'email'], // Send email as well for critical failures
          content: {
              title: 'Overtime Payment Failed',
              message: `Payment authorization for overtime failed during the session with ${booking.user.firstName} ${booking.user.lastName}. Reason: ${logContext.failureReason || 'Unknown'}. Choose an action:`,
              data: {
                  // Provide clear actions with relative API paths using sessionLinkSessionId
                  actions: sessionLinkSessionId ? [
                      { type: 'continue_session', label: 'Continue Session (Free)', method:'POST', endpoint: `/api/sessions/${sessionLinkSessionId}/continue`, isApi: true },
                      { type: 'terminate_session', label: 'End Session Now', method:'POST', endpoint: `/api/sessions/${sessionLinkSessionId}/terminate`, isApi: true }
                  ] : [] // No actions if sessionLink ID is missing
              }
          },
          metadata: {
               bookingId: booking._id.toString(),
               sessionId: session._id.toString(),
               sessionLinkSessionId: sessionLinkSessionId, // Include for reference
               clientName: `${booking.user.firstName} ${booking.user.lastName}`,
               failureReason: logContext.failureReason || 'Unknown',
               failureCode: logContext.failureCode || 'N/A'
          }
      };

      await UnifiedNotificationService.sendNotification(notificationPayload, booking); // Pass booking context if needed
      console.log('[handleInSessionPaymentFailure V2] Notified coach of payment failure', { ...logContext, coachId: coachRecipientId });

      // --- Emit Socket Event to Session Room (Targeting Coach UI) ---
      const videoIO = ioInstance?.of('/video');
      const roomName = sessionLinkSessionId ? `session:${sessionLinkSessionId}` : null;

      if (videoIO && roomName) {
          // Emit specifically to the coach's socket(s) if possible, otherwise to the room
          // (Finding coach socket might require mapping userId to socketId - complex)
          // Emitting to room is simpler for now. Frontend coach client will handle visibility.
          const socketPayload = {
              paymentIntentId: paymentIntent.id,
              bookingId: booking._id.toString(),
              sessionId: session._id.toString(), // Actual Session doc ID
              reason: logContext.failureReason || 'Payment Authorization Failed',
              // Provide data needed for frontend actions if UI handles them directly
              actions: sessionLinkSessionId ? [
                 { type: 'continue', label: 'Continue For Free' }, // Frontend maps this type to API call
                 { type: 'terminate', label: 'End Session Now' } // Frontend maps this type to API call
              ] : []
          };
          videoIO.to(roomName).emit('payment-failure', socketPayload);
          console.log('[handleInSessionPaymentFailure V2] Emitted payment-failure socket event', { roomName, socketPayload });
      } else {
           logger.error('[handleInSessionPaymentFailure V2] Cannot emit socket event: Missing ioInstance or sessionLink sessionId', { hasIo: !!ioInstance, sessionLinkSessionId });
      }

  } catch (error) {
    // Log error, but don't re-throw from webhook handler unless needed
    logger.error('[handleInSessionPaymentFailure V2] Error during processing:', {
      ...logContext, // Include context in error log
      errorMessage: error.message,
      stack: error.stack,
    });
  }
}

const authorizeOvertimePayment = async (booking, session, userId, maxPrice, dbSession = null) => {
  const logContext = {
      bookingId: booking?._id?.toString(),
      sessionId: session?._id?.toString(),
      userId,
      maxPriceAmount: maxPrice?.amount,
      maxPriceCurrency: maxPrice?.currency,
      function: 'authorizeOvertimePayment V6', 
      isTransactional: !!dbSession,
      timestamp: new Date().toISOString()
  };
  console.log(`[${logContext.function}] Authorizing overtime - START`, logContext);

  try {
    if (!booking || !session || !userId || !maxPrice || typeof maxPrice.amount !== 'number' || typeof maxPrice.currency !== 'string') {
      logger.error(`[${logContext.function}] Missing or invalid required parameters`, logContext);
      throw new Error('Internal server error: Missing data for authorization.');
    }
    const amountToAuthorize = maxPrice.amount;
    const currencyToUse = maxPrice.currency.toLowerCase();
    const amountInCents = convertToCents(amountToAuthorize);

    if (isNaN(amountInCents) || amountInCents < 50) {
      if (amountInCents !== 0) { 
         logger.error(`[${logContext.function}] Invalid amount for Stripe intent`, { ...logContext, amountInCents });
         throw new Error(`Invalid amount for payment intent: ${amountToAuthorize} (${amountInCents} cents)`);
      } else {
         logger.warn(`[${logContext.function}] Authorizing zero amount.`, { ...logContext });
      }
    }
    console.log(`[${logContext.function}] Amount and currency validated`, { ...logContext, amountToAuthorize, currencyToUse, amountInCents });

    const user = await User.findById(userId).session(dbSession); 
    if (!user || !user.stripe?.customerId) {
      logger.error(`[${logContext.function}] User or Stripe customer ID not found`, { ...logContext, hasStripeId: !!user?.stripe?.customerId });
      throw new Error('User or Stripe customer ID not found for payment authorization.');
    }
    const stripeCustomerId = user.stripe.customerId;

    const coachUser = await Coach.findOne({ user: booking.coach._id }).session(dbSession);
    if (!coachUser || !coachUser.settings?.paymentAndBilling?.stripe?.accountId) {
        logger.error(`[${logContext.function}] Coach Stripe account ID not found`, { ...logContext, coachUserId: booking.coach._id });
        throw new Error('Coach payment configuration not found.');
    }
    const coachStripeAccountId = coachUser.settings.paymentAndBilling.stripe.accountId;
    const platformFeePercentage = 0.15; 
    const platformFeeInCents = Math.round(amountInCents * platformFeePercentage);

    console.log(`[${logContext.function}] Fetched coach Stripe ID and calculated platform fee`, { ...logContext, coachStripeAccountId, platformFeeInCents });

    // **ADD THIS STATE CHECK BEFORE CALLING createManualCaptureIntent**
    try {
      const paymentIntent = await stripeService.retrievePaymentIntent(session.overtimeSegments[targetSegmentIndex].paymentIntentId);
        // Validating that the payment intent is available
        if(paymentIntent == undefined) {
            throw new Error ("Payment Intent is undefined. No payment intent could be created");
        }
        // Validate amount, description and other required values here against previously stored values
        logger.log(`[${logContext.function}] PaymentIntent amount after authorization is: ` + paymentIntent.amount)
    } catch(stripeError) {
        logger.error(`[${logContext.function}] Call to Stripe API Failed. Please verify if the user is setup with required information`, { ...logContext });
        throw new Error("There was an issue with the call to stripe, try to ensure your stripe keys work");
    }
    

    const servicePayload = {
      amount: amountToAuthorize,
      currency: currencyToUse,
      stripeCustomerId: stripeCustomerId,
      userId: userId, 
      metadata: {
        bookingId: booking._id.toString(),
        sessionId: session._id.toString(),
        sessionLinkSessionId: booking.sessionLink.sessionId, 
        type: 'overtime_authorization',
        authorizedMaxAmount: amountToAuthorize.toFixed(2),
        authorizedCurrency: currencyToUse.toUpperCase(),
        coachStripeAccountId: coachStripeAccountId,
        platformFeeInCents: platformFeeInCents
      }
    };
    console.log(`[${logContext.function}] Preparing to call paymentService.createManualCaptureIntent`, { ...logContext, amountInCents, servicePayloadMetadata: servicePayload.metadata });

    const paymentIntent = await paymentService.createManualCaptureIntent(servicePayload);

    if (!paymentIntent) {
      logger.error(`[${logContext.function}] Manual Capture Intent creation failed in service`, logContext );
      throw new Error('Failed to initialize overtime payment authorization.');
    }
    
    // Find the specific segment on the session object that matches the criteria for this authorization request
    // This relies on the coach's 'request_paid' flow having correctly created and stored this segment.
    const targetSegmentIndex = session.overtimeSegments.findIndex(seg => 
        seg.status === 'requested' && 
        seg.calculatedMaxPrice.amount === maxPrice.amount && // Ensure price matches
        seg.calculatedMaxPrice.currency.toUpperCase() === maxPrice.currency.toUpperCase() &&
        !seg.paymentIntentId // Only pick segments that haven't been processed yet
    );

    if (targetSegmentIndex === -1) {
        logger.error(`[${logContext.function}] Could not find a matching 'requested' segment to update on the session object. This might mean the segment was already processed or never created correctly by the coach's request.`, { ...logContext, overtimeSegments: session.overtimeSegments.map(s => ({id: s._id, status: s.status, pi: s.paymentIntentId, price: s.calculatedMaxPrice})) });
        throw new Error("Failed to link PaymentIntent: No matching overtime request segment found.");
    }

    session.overtimeSegments[targetSegmentIndex].paymentIntentId = paymentIntent.id;
    session.overtimeSegments[targetSegmentIndex].status = 'pending_confirmation';
    
    if (dbSession) {
        session.markModified('overtimeSegments'); // Mark as modified for transactional save by caller
    } else {
        await session.save(); // Save session immediately if not in a transaction
    }
    console.log(`[${logContext.function}] Session segment (ID: ${session.overtimeSegments[targetSegmentIndex]._id}) updated with PI: ${paymentIntent.id} and status 'pending_confirmation'`, { ...logContext });

    let paymentDoc = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntent.id }).session(dbSession);
    const paymentData = {
        booking: booking._id,
        payer: userId,
        recipient: booking.coach._id,
        coachStripeAccountId: coachStripeAccountId,
        type: 'authorization',
        amount: {
            base: amountToAuthorize,
            platformFee: parseFloat((platformFeeInCents / 100).toFixed(2)),
            total: 0, 
            authorized: amountToAuthorize,
            currency: maxPrice.currency.toUpperCase(),
        },
        status: 'pending_confirmation',
        stripe: {
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            customerId: stripeCustomerId,
        },
        metadata: {
            overtimeDurationRequested: session.overtimeSegments[targetSegmentIndex].requestedDuration,
            authorizationType: 'overtime'
        },
        updatedAt: new Date(),
    };

    if (!paymentDoc) {
        paymentDoc = new Payment({ ...paymentData, createdAt: new Date() });
    } else {
        paymentDoc.set(paymentData);
    }
    
    if (!dbSession) { // If not part of an external transaction, save it here.
        await paymentDoc.save();
        console.log(`[${logContext.function}] Payment record (ID: ${paymentDoc._id}) saved directly. Status: ${paymentDoc.status}`, logContext);
    } else {
        // If part of an external transaction, the calling function is responsible for saving.
        // The paymentDoc instance is already associated with dbSession by findOneAndUpdate or new Payment() with session.
        console.log(`[${logContext.function}] Payment record (ID: ${paymentDoc._id}) prepared for transactional save. Status: ${paymentDoc.status}`, logContext);
    }
    
    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      paymentDocument: paymentDoc, // Return the Mongoose document instance for transactional handling
      paymentId: paymentDoc._id.toString(), // Also return ID for convenience
      modifiedSession: session // Return the session object that was modified in memory
    };

  } catch (error) {
    logger.error(`[${logContext.function}] Error during authorization`, {
      ...logContext,
      errorMessage: error.message,
      stripeErrorCode: error.code || error.raw?.code,
      stack: error.stack
    });
    throw new Error(`Failed to prepare overtime payment authorization: ${error.message}`);
  }
};

/**
 * Controller function to capture (or cancel) an authorized payment.
 * Delegates the core logic to the paymentService.captureOrCancelManualIntent.
 * @param {string} paymentIntentId - The ID of the PaymentIntent.
 * @param {number} finalAmountToCaptureDecimal - The final amount to capture in decimal format.
 * @returns {Promise<object>} Result object from the paymentService { success: boolean, status: string, chargeId?: string, capturedAmount?: number, error?: string, originalError?: object }.
 */
const captureAuthorizedPayment = async (paymentIntentId, finalAmountToCaptureDecimal) => {
  const logContext = { paymentIntentId, finalAmountToCaptureDecimal };
  // Refined Log Message V3
  console.log('[PaymentController:captureAuthorizedPayment V3] Request received, delegating to paymentService.captureOrCancelManualIntent', logContext);

  try {
    // ---> Delegate to the primary service function <---
    const result = await paymentService.captureOrCancelManualIntent(paymentIntentId, finalAmountToCaptureDecimal);

    // Log the outcome received *from* the service
    if (result.success) {
       // Refined Log Message V3
      console.log(`[PaymentController:captureAuthorizedPayment V3] Service call successful. Status: ${result.status}`, {
        ...logContext,
        serviceStatus: result.status,
        chargeId: result.chargeId,
        capturedAmount: result.capturedAmount,
      });
    } else {
       // Refined Log Message V3
      logger.error('[PaymentController:captureAuthorizedPayment V3] Service call failed.', {
        ...logContext,
        serviceStatus: result.status,
        serviceError: result.error,
        // Log the original Stripe error details if the service provided them
        originalStripeErrorCode: result.originalError?.code,
        originalStripeErrorType: result.originalError?.type,
      });
    }

    // Return the exact result object received from the service
    return result;

  } catch (error) {
    // Catch unexpected errors *only* during the delegation call itself
     // Refined Log Message V3
    logger.error('[PaymentController:captureAuthorizedPayment V3] Unexpected error during delegation to paymentService', {
      ...logContext,
      errorMessage: error.message,
      stack: error.stack,
    });

    // Return a standard failure object consistent with the service's potential failure structure
    return {
       success: false,
       status: 'failed', // General failure status for the controller action
       error: `Internal server error during capture/cancel delegation: ${error.message}`,
       originalError: error // Include the raw error for debugging
    };
  }
};

const createRefundRequest = async (req, res) => {
    const { bookingId, reason, requestedAmount, currency } = req.body;
    const client = req.user;

    try {
        const ticket = await refundRequestService.createRefundRequest({
            client,
            bookingId,
            reason,
            requestedAmount: parseFloat(requestedAmount),
            currency
        });
        res.status(201).json({ success: true, message: 'Refund request submitted successfully.', ticket });
    } catch (error) {
        logger.error('[paymentController.createRefundRequest] Failed to create refund request.', { error: error.message, bookingId, clientId: client._id });
        res.status(500).json({ success: false, message: error.message });
    }
};

const respondToRefundRequest = async (req, res) => {
    const { ticketId } = req.params;
    const { decision, clientMessage, adminNote, approvedAmount } = req.body;
    const coachId = req.user._id;

    try {
        const ticket = await refundRequestService.respondToRequest({
            coachId,
            ticketId,
            decision,
            clientMessage,
            adminNote,
            approvedAmount: approvedAmount !== undefined ? parseFloat(approvedAmount) : undefined
        });
        res.status(200).json({ success: true, message: `Request successfully processed.`, ticket });
    } catch (error) {
        logger.error('[paymentController.respondToRefundRequest] Failed to respond to refund request.', { error: error.message, ticketId, coachId });
        res.status(500).json({ success: false, message: error.message });
    }
};

const initiateCoachRefund = async (req, res) => {
    const { paymentId, amount, reason } = req.body;
    const coachId = req.user._id;

    try {
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment not found.' });
        }
        if (payment.recipient.toString() !== coachId.toString()) {
            return res.status(403).json({ success: false, message: 'You are not authorized to refund this payment.' });
        }
        const booking = await Booking.findById(payment.booking).populate('user coach sessionType');

        const result = await AdminFinancialService.processRefund({
            paymentId,
            amount: parseFloat(amount),
            reason: reason || 'Refund issued by coach.',
            policyType: 'standard',
            initiatorId: coachId,
            bookingContext: booking
        });

        res.status(200).json({ success: true, message: 'Refund initiated successfully.', data: result });
    } catch (error) {
        logger.error('[paymentController.initiateCoachRefund] Failed to initiate coach refund.', { error: error.message, paymentId, coachId });
        res.status(500).json({ success: false, message: error.message });
    }
};

const escalateDisputeByClient = async (req, res) => {
    const { ticketId } = req.params;
    const { reason } = req.body;
    const client = req.user;

    try {
        const ticket = await refundRequestService.escalateDisputeByClient({
            clientId: client._id,
            ticketId,
            reason
        });
        res.status(200).json({ success: true, message: 'Dispute escalated successfully.', ticket });
    } catch (error) {
        logger.error('[paymentController.escalateDisputeByClient] Failed to escalate dispute.', { error: error.message, ticketId, clientId: client._id });
        res.status(500).json({ success: false, message: error.message });
    }
};


module.exports = {
  createPaymentIntent,
  webhookHandler,
  confirmPayment,
  refundPayment,
  getPaymentStatus,
  getTransactionHistory,
  deletePaymentMethod,
  addPaymentMethod,
  getPaymentMethods,
  setDefaultPaymentMethod,
  processOvertimePayment,
  terminateSessionForPayment,
  continueSession,
  authorizeOvertimePayment,
  captureAuthorizedPayment,
  createRefundRequest,
  respondToRefundRequest,
  initiateCoachRefund,
  escalateDisputeByClient,
  handlePaymentSuccess,
};