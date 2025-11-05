const { logger } = require('../utils/logger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const Payment = require('../models/Payment');
const Coach = require('../models/Coach');
const Booking = require('../models/Booking');
const Session = require('../models/Session');
const mongoose = require('mongoose');
const StripeService = require('./stripeService');
const TaxService = require('./taxService');
const { getSocketService } = require('./socketService');
const Transaction = require('../models/Transaction');
const paymentFlowLogger = require('../utils/paymentLogger');

const convertToCents = (amount) => {
  logger.debug('[PaymentService:convertToCents] Converting amount', { inputAmount: amount, inputType: typeof amount });
  if (typeof amount !== 'number' || isNaN(amount)) {
    logger.warn('[PaymentService:convertToCents] Invalid input or NaN detected, returning 0 cents', { inputAmount: amount });
    return 0;
  }
  const roundedAmount = Math.round(amount * 100) / 100;
  const cents = Math.round(roundedAmount * 100);
   if (isNaN(cents)) {
       logger.error('[PaymentService:convertToCents] CRITICAL: Conversion resulted in NaN!', { original: amount, rounded: roundedAmount });
       return 0;
   }
  logger.debug('[PaymentService:convertToCents] Conversion result', { cents });
  return cents;
};

function robustConvertToSmallestUnit(amount, currency) {
    // For currencies like JPY, VND that have no decimal subunits.
    const zeroDecimalCurrencies = ['jpy', 'vnd', 'krw']; // Add more as needed
    if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
        return Math.round(amount);
    }
    // For 2-decimal currencies
    if (typeof amount !== 'number' || isNaN(amount)) {
        logger.warn('[PaymentService:robustConvertToSmallestUnit] Invalid input or NaN detected, returning 0', { inputAmount: amount, currency });
        return 0;
    }
    const roundedAmount = Math.round(amount * 100) / 100;
    const smallestUnit = Math.round(roundedAmount * 100);
    if (isNaN(smallestUnit)) {
       logger.error('[PaymentService:robustConvertToSmallestUnit] CRITICAL: Conversion resulted in NaN!', { original: amount, rounded: roundedAmount, currency });
       return 0;
    }
    return smallestUnit;
}

class PaymentService {
  constructor() {
    console.log('[PaymentService] Initializing payment service');
    this.stripe = stripe;
  }

/**
 * Create a payment intent for a booking
 * @param {Object} params
 * @param {string} params.bookingId - ID of the booking
 * @param {number} params.amount - Amount in decimal (e.g., 73.50)
 * @param {string} params.currency - Currency code (default: CHF)
 * @param {string} [params.stripeCustomerId] - Stripe customer ID (e.g., "cus_...")
 * @param {string} [params.userId] - MongoDB user ID (optional fallback)
 * @param {string} params.coachStripeAccountId - Coach's Stripe account ID
 * @param {Object} params.metadata - Additional metadata for the payment intent
 */

async createPaymentIntent({
  bookingId,
  priceDetails,
  currency = 'chf',
  stripeCustomerId,
  userId,
  coachStripeAccountId,
  metadata = {}
}) {
  try {
    console.log('[PaymentService.createPaymentIntent] 1. Received parameters for PI creation', {
      bookingId,
      priceDetails,
      currencyArgument: currency,
      stripeCustomerIdArgument: stripeCustomerId,
      userIdArgument: userId,
      coachStripeAccountIdArgument: coachStripeAccountId,
      metadataArgumentKeys: Object.keys(metadata),
      timestamp: new Date().toISOString()
    });
    if (!priceDetails || typeof priceDetails.final?.amount?.amount !== 'number') {
      logger.error('[PaymentService] Invalid priceDetails provided', { 
        bookingId,
        priceDetails,
        timestamp: new Date().toISOString()
      });
      throw new Error('Invalid priceDetails provided');
    }

    const amountInCents = Math.round(priceDetails.final.amount.amount * 100);

   console.log('[PaymentService:createPaymentIntent] Calculated amountInCents for Stripe API', {
      bookingId,
      finalAmountFromPriceDetails: priceDetails.final.amount.amount,
      calculatedAmountInCents: amountInCents,
      timestamp: new Date().toISOString()
    });

    if (amountInCents < 50) {
      console.log('[PaymentService] Skipping payment intent creation for amount below minimum threshold', { 
        bookingId,
        amountInCents,
        timestamp: new Date().toISOString()
      });
      return null;
    }

    let customerIdToUse = stripeCustomerId;
    const platformFeeInCents = Math.round(priceDetails.platformFee.amount * 100);
    const vatAmountInCents = Math.round((priceDetails.vat?.amount || 0) * 100);
    const totalApplicationFeeInCents = platformFeeInCents + vatAmountInCents;
    const idempotencyKey = `${bookingId}-${Date.now()}`;

    console.log('[PaymentService:createPaymentIntent] PRE-STRIPE-API-CALL: Preparing to call stripe.paymentIntents.create', {
      bookingId,
      amountForStripe: amountInCents,
      currencyForStripe: currency.toLowerCase(),
      customerForStripe: customerIdToUse,
      applicationFeeForStripe: totalApplicationFeeInCents,
      destinationForStripe: coachStripeAccountId,
      metadataForStripe: {
        bookingId,
        platformFeeInCents,
        vatAmountInCents,
        ...metadata
      },
      idempotencyKey,
      timestamp: new Date().toISOString()
    });
    
    if (!customerIdToUse && userId) {
      logger.debug('[PaymentService] No Stripe customer ID provided, looking up via userId', {
        userId,
        bookingId,
        timestamp: new Date().toISOString()
      });
      const user = await User.findById(userId);
      if (!user) {
        logger.error('[PaymentService] User not found for userId', {
          userId,
          bookingId,
          timestamp: new Date().toISOString()
        });
        throw new Error('User not found');
      }

      customerIdToUse = user.stripe?.customerId;
      if (!customerIdToUse) {
        console.log('[PaymentService] Creating new Stripe customer for user', {
          userId,
          email: user.email,
          bookingId,
          timestamp: new Date().toISOString()
        });
        const customer = await this.createOrUpdateCustomer({
          userId,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          language: user.settings?.language,
          metadata: { bookingId }
        });
        customerIdToUse = customer.id;

        await User.findByIdAndUpdate(userId, { 
          'stripe.customerId': customerIdToUse,
          'stripe.updatedAt': new Date()
        });
        console.log('[PaymentService] Stripe customer ID saved to user', {
          userId,
          stripeCustomerId: customerIdToUse,
          bookingId,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.debug('[PaymentService] Using existing Stripe customer from user', {
          userId,
          stripeCustomerId: customerIdToUse,
          bookingId,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (!customerIdToUse) {
      logger.error('[PaymentService] No valid Stripe customer ID available', {
        bookingId,
        userId,
        stripeCustomerId,
        timestamp: new Date().toISOString()
      });
      throw new Error('No valid Stripe customer ID provided or found');
    }

    try {
      await this.stripe.customers.retrieve(customerIdToUse);
      logger.debug('[PaymentService] Verified Stripe customer exists', {
        stripeCustomerId: customerIdToUse,
        bookingId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.warn('[PaymentService] Stripe customer verification failed, attempting to recreate', {
        stripeCustomerId: customerIdToUse,
        bookingId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          const customer = await this.createOrUpdateCustomer({
            userId,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim(),
            language: user.settings?.language,
            metadata: { bookingId }
          });
          customerIdToUse = customer.id;
          await User.findByIdAndUpdate(userId, { 
            'stripe.customerId': customerIdToUse,
            'stripe.updatedAt': new Date()
          });
          console.log('[PaymentService] Recreated Stripe customer', {
            userId,
            stripeCustomerId: customerIdToUse,
            bookingId,
            timestamp: new Date().toISOString()
          });
        } else {
          throw new Error('Cannot recreate Stripe customer without valid userId');
        }
      } else {
        throw new Error('Invalid or deleted Stripe customer ID');
      }
    }

    logger.debug('[PaymentService] Calculated fees from priceDetails', {
      platformFeeInCents,
      vatAmountInCents,
      totalApplicationFeeInCents,
      totalAmountInCents: amountInCents,
      bookingId,
      timestamp: new Date().toISOString()
    });
    
   const intentParameters = {
      amount: amountInCents,
      currency: currency.toLowerCase(),
      customer: customerIdToUse,
      metadata: {
         bookingId: bookingId,
        platformFeeInCents,
        vatAmountInCents,
        ...metadata
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      }
    };

    console.log('[PaymentService.createPaymentIntent] 2. FINAL PARAMS for stripe.paymentIntents.create:', { intentParameters });
    
    const paymentIntent = await this.stripe.paymentIntents.create(
      intentParameters, 
      { idempotencyKey }
    );

    console.log('[PaymentService] Payment intent created successfully', {
      paymentIntentId: paymentIntent.id,
      bookingId,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      platformFeeInCents,
      vatAmountInCents,
      totalApplicationFeeInCents,
      stripeCustomerId: customerIdToUse,
      coachStripeAccountId,
      idempotencyKey,
      timestamp: new Date().toISOString()
    });

    return paymentIntent;

  } catch (error) {
    logger.error('[PaymentService] Error creating payment intent', {
      error: error.message,
      code: error.code,
      type: error.type,
      bookingId,
      stripeCustomerId,
      userId,
      priceDetails,
      coachStripeAccountId,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    throw this.enhanceStripeError(error);
  }
}

  /**
   * Confirm a payment intent
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @param {string} paymentMethodId - Stripe payment method ID
   */
  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      console.log('[PaymentService] Confirming payment intent:', {
        paymentIntentId,
        paymentMethodId
      });

      const paymentIntent = await this.stripe.paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: paymentMethodId,
          return_url: `${process.env.FRONTEND_URL}/payment/complete`
        }
      );

      console.log('[PaymentService] Payment intent confirmed:', {
        paymentIntentId,
        status: paymentIntent.status
      });

      return paymentIntent;

    } catch (error) {
      logger.error('[PaymentService] Error confirming payment intent:', {
        error: error.message,
        paymentIntentId,
        paymentMethodId
      });
      throw this.enhanceStripeError(error);
    }
  }

  /**
   * Process a refund for a payment
   * @param {Object} params
   * @param {string} params.paymentIntentId - Stripe payment intent ID
   * @param {number} params.amount - Amount to refund (optional)
   * @param {string} params.reason - Reason for refund
   */
  async processRefund({ paymentIntentId, amount, currency, reason }) { // Added currency here
  try {
    console.log('[PaymentService:processRefund] Processing refund:', {
      paymentIntentId,
      amountDecimal: amount,
      currency,
      reason
    });

    const originalPaymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    if (!originalPaymentIntent) {
      logger.error('[PaymentService:processRefund] Original PaymentIntent not found', { paymentIntentId });
      throw new Error('Original payment intent not found.');
    }
    
    // Use the currency from the original PI if not provided or if it differs, log warning
    const effectiveCurrency = currency ? currency.toLowerCase() : originalPaymentIntent.currency.toLowerCase();
    if (currency && currency.toLowerCase() !== originalPaymentIntent.currency.toLowerCase()) {
        logger.warn(`[PaymentService:processRefund] Provided refund currency (${currency}) differs from PI currency (${originalPaymentIntent.currency}). Using PI currency.`, { paymentIntentId });
    }


    const sanitizedReason = reason ? String(reason).substring(0, 500) : 'requested_by_customer';

    const refundParams = {
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer', // Use a standard reason for the API
      metadata: {
        internal_reason: sanitizedReason // Store our detailed reason in metadata
      }
    };

    if (amount !== undefined && amount !== null) {
      if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
        logger.error('[PaymentService:processRefund] Invalid refund amount provided', { paymentIntentId, amount });
        throw new Error('Invalid refund amount.');
      }
      const amountToRefundCents = robustConvertToSmallestUnit(amount, effectiveCurrency);
      
      const currentlyRefundable = originalPaymentIntent.amount_received - (originalPaymentIntent.amount_refunded || originalPaymentIntent.total_amount_refunded || 0);
      if (amountToRefundCents > currentlyRefundable) {
         logger.error('[PaymentService:processRefund] Refund amount exceeds refundable amount', {
           paymentIntentId,
           requestedRefundCents: amountToRefundCents,
           refundableCents: currentlyRefundable,
         });
         throw new Error(`Refund amount ${amount} ${effectiveCurrency.toUpperCase()} exceeds refundable amount ${(currentlyRefundable / (zeroDecimalCurrencies.includes(effectiveCurrency) ? 1 : 100) ).toFixed(2)} ${effectiveCurrency.toUpperCase()}.`);
       }
      if (amountToRefundCents > 0) { // Only add amount if it's a partial refund and > 0
          refundParams.amount = amountToRefundCents;
      } else if (amount === 0 && amountToRefundCents === 0) {
          // If a $0 refund is explicitly requested, Stripe might not allow it or it might mean "release auth".
          // For a $0 refund to client, we typically wouldn't call Stripe. This path assumes a positive refund amount usually.
          // If the intent is to log a $0 refund without calling Stripe, this function might need adjustment.
          // For now, if amount is 0, we don't set refundParams.amount, implying full refund if Stripe is called.
          // But if amount is 0, we probably shouldn't call Stripe.
          // The controller should ideally not call this service if calculated refund is 0.
          // However, if it does, this ensures we don't send `amount: 0` to Stripe unless that's explicitly allowed.
          // Stripe's API might error on `amount: 0`. A full refund is done by omitting `amount`.
          // For now, if amount is 0, this means we won't set `refundParams.amount`, and Stripe will attempt full refund.
          // This might be undesired if it's a "no refund due" cancellation.
          // The bookingController should ensure this is only called if GrossRefundToClient > 0.
          logger.warn('[PaymentService:processRefund] Received request to refund $0. Stripe will attempt full refund if amount param is omitted. Ensure this is intended.', { paymentIntentId });
      }
    }


    const refund = await this.stripe.refunds.create(refundParams);

    console.log('[PaymentService:processRefund] Refund processed successfully:', {
      refundId: refund.id,
      paymentIntentId,
      status: refund.status,
      amountRefundedCents: refund.amount,
      currency: refund.currency
    });

    return refund;

  } catch (error) {
    logger.error('[PaymentService:processRefund] Error processing refund:', {
      error: error.message,
      paymentIntentId,
      amountDecimal: amount,
      currency,
      reason
    });
    throw this.enhanceStripeError(error);
  }
}

  /**
   * Create or update a Stripe customer
   * @param {Object} params
   * @param {string} params.userId - User ID
   * @param {string} params.email - User email
   * @param {string} params.name - User name
   */
  async createOrUpdateCustomer({ userId, email, name, language, metadata = {} }) {
    try {
      console.log('[PaymentService] Creating/updating Stripe customer:', {
        userId,
        email,
        language
      });
  
      const customerMetadata = {
        userId: userId.toString(),
        ...metadata
      };

      const customerParams = {
        email,
        name,
        metadata: customerMetadata
      };

      if (language) {
        customerParams.preferred_locales = [language];
      }
  
      const existingCustomers = await this.stripe.customers.search({
        query: `metadata['userId']:'${userId.toString()}'`,
      });
  
      let customer;
  
      if (existingCustomers.data.length > 0) {
        customer = await this.stripe.customers.update(
          existingCustomers.data[0].id,
          customerParams
        );
        console.log('[PaymentService] Updated existing customer:', {
          customerId: customer.id,
          userId
        });
      } else {
        customer = await this.stripe.customers.create(customerParams);
        console.log('[PaymentService] Created new customer:', {
          customerId: customer.id,
          userId
        });
      }
  
      return customer;
  
    } catch (error) {
      logger.error('[PaymentService] Error creating/updating customer:', {
        error: error.message,
        userId,
        email
      });
      throw this.enhanceStripeError(error);
    }
  }

  /**
   * Add a payment method to a customer
   * @param {string} customerId - Stripe customer ID
   * @param {string} paymentMethodId - Stripe payment method ID
   */
  async attachPaymentMethod(customerId, paymentMethodId) {
    try {
      console.log('[PaymentService] Attaching payment method:', {
        customerId,
        paymentMethodId
      });

      const paymentMethod = await this.stripe.paymentMethods.attach(
        paymentMethodId,
        { customer: customerId }
      );

      console.log('[PaymentService] Payment method attached successfully:', {
        customerId,
        paymentMethodId,
        type: paymentMethod.type
      });

      return paymentMethod;

    } catch (error) {
      logger.error('[PaymentService] Error attaching payment method:', {
        error: error.message,
        customerId,
        paymentMethodId
      });
      throw this.enhanceStripeError(error);
    }
  }

  /**
   * Enhance Stripe errors with more context and handling instructions
   * @private
   */
  enhanceStripeError(error) {
    const baseError = new Error(error.message);
    baseError.original = error;
    baseError.type = error.type;
    baseError.code = error.code;
  
    // Add specific handling for amount-related errors
    if (error.code === 'parameter_invalid_integer') {
      baseError.code = 'INVALID_AMOUNT';
      baseError.message = 'Invalid payment amount provided';
      baseError.recoveryInstructions = 'Please try again with a valid amount';
    } else {
      // Default error handling remains the same
      switch (error.type) {
        case 'card_error':
          baseError.recoveryInstructions = 'Please check your card details and try again';
          break;
        case 'validation_error':
          baseError.recoveryInstructions = 'Please verify all payment information';
          break;
        case 'authentication_error':
          baseError.recoveryInstructions = 'Please try again or use a different payment method';
          break;
        default:
          baseError.recoveryInstructions = 'Please try again later or contact support';
      }
    }
  
    return baseError;
  }

  /**
 * Retrieve a payment intent
 * @param {string} paymentIntentId - Stripe payment intent ID
 */
async retrievePaymentIntent(paymentIntentId) {
  try {
    console.log('[PaymentService] Retrieving payment intent:', {
      paymentIntentId
    });

    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

    console.log('[PaymentService] Payment intent retrieved:', {
      paymentIntentId,
      status: paymentIntent.status
    });

    return paymentIntent;

  } catch (error) {
    logger.error('[PaymentService] Error retrieving payment intent:', {
      error: error.message,
      paymentIntentId
    });
    throw this.enhanceStripeError(error);
  }
}

  /**
   * Handle Stripe webhook events
   * @param {Object} event - Stripe webhook event
   */
  async handleWebhookEvent(event) {
    try {
      console.log('[PaymentService] Processing webhook event:', {
        type: event.type,
        id: event.id
      });

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object);
          break;
        case 'charge.refunded':
          await this.handleRefund(event.data.object);
          break;
        default:
          console.log('[PaymentService] Unhandled webhook event type:', event.type);
      }

      return { received: true };

    } catch (error) {
      logger.error('[PaymentService] Error processing webhook:', {
        error: error.message,
        eventType: event.type,
        eventId: event.id
      });
      throw error;
    }
  }

  /**
   * Handle successful payment webhook
   * @private
   */
  async handlePaymentSuccess(paymentIntent) {
    console.log('[PaymentService] Handling successful payment:', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      bookingId: paymentIntent.metadata.bookingId
    });
    // Implementation will depend on your booking update logic
  }

  /**
   * Handle failed payment webhook
   * @private
   */
  async handlePaymentFailure(paymentIntent) {
    logger.error('[PaymentService] Handling failed payment:', {
      paymentIntentId: paymentIntent.id,
      error: paymentIntent.last_payment_error,
      bookingId: paymentIntent.metadata.bookingId
    });
    // Implementation will depend on your booking update logic
  }

  /**
   * Handle refund webhook
   * @private
   */
async handleRefundCompletion(stripeRefund, options = {}) {
    const { initiatorId = null } = options;
    const logContext = {
      stripeRefundId: stripeRefund.id,
      paymentIntentId: stripeRefund.payment_intent,
      chargeId: stripeRefund.charge,
      initiatorId,
    };
    paymentFlowLogger.info('[PaymentService] Handling refund completion.', logContext);

    const payment = await Payment.findOne({ 'stripe.paymentIntentId': stripeRefund.payment_intent });
    if (!payment) {
      paymentFlowLogger.error('[PaymentService] Payment record not found for refund completion.', logContext);
      return;
    }
    logContext.paymentId = payment._id.toString();

    if (payment.refunds && payment.refunds.some(r => r.stripeRefundId === stripeRefund.id)) {
      paymentFlowLogger.info('[PaymentService] Refund already recorded (idempotency).', logContext);
      return payment;
    }

    const booking = await Booking.findById(payment.booking);
    if (!booking) {
      paymentFlowLogger.error('[PaymentService] Booking not found for refunded payment.', logContext);
    }
    
    const amountRefundedToClient = stripeRefund.amount / 100;
    const originalTotalRefunded = payment.amount.refunded || 0;
    payment.amount.refunded = originalTotalRefunded + amountRefundedToClient;
    
    const originalClientPaymentTotal = payment.amount.total;
    const newTotalRefunded = payment.amount.refunded;

    if (Math.abs(originalClientPaymentTotal - newTotalRefunded) < 0.01 && newTotalRefunded > 0) {
        payment.status = 'refunded';
    } else if (newTotalRefunded > 0) {
        payment.status = 'partially_refunded';
    }
    
    payment.refunds = payment.refunds || [];
    payment.refunds.push({
      amount: amountRefundedToClient,
      currency: stripeRefund.currency.toUpperCase(),
      reason: stripeRefund.metadata?.internal_reason || stripeRefund.reason || 'No reason provided',
      status: stripeRefund.status,
      stripeRefundId: stripeRefund.id,
      processedAt: new Date(stripeRefund.created * 1000),
      processedBy: initiatorId ? new mongoose.Types.ObjectId(initiatorId) : null,
    });

    await payment.save();
    paymentFlowLogger.info('[PaymentService] Payment document updated for refund.', { ...logContext, newStatus: payment.status });

    if (booking && booking.payment.status !== payment.status) {
        booking.payment.status = payment.status;
        await booking.save();
        paymentFlowLogger.info('[PaymentService] Booking payment status updated.', { ...logContext, bookingId: booking._id });
    }

    await Transaction.create({
      booking: booking?._id,
      payment: payment._id,
      type: 'refund',
      amount: {
        value: amountRefundedToClient,
        currency: stripeRefund.currency.toUpperCase()
      },
      status: stripeRefund.status === 'succeeded' ? 'completed' : 'pending_stripe',
      stripe: {
        transactionId: stripeRefund.id,
        chargeId: stripeRefund.charge
      },
      notes: `Refund processed. Reason: ${stripeRefund.metadata?.internal_reason || 'N/A'}.`
    });
    paymentFlowLogger.info('[PaymentService] Refund transaction created.', logContext);
    
    return payment;
  }

 /**
   * Creates a specific Payment Intent for authorizing overtime payments (manual capture).
   * @param {object} payload - Payload containing necessary details.
   * @param {number} payload.amount - The maximum amount to authorize (in decimal).
   * @param {string} payload.currency - Currency code (e.g., 'chf').
   * @param {string} payload.stripeCustomerId - Stripe Customer ID.
   * @param {string} payload.userId - MongoDB User ID.
   * @param {object} payload.metadata - Metadata including bookingId, sessionId, type='overtime_authorization'.
   * @returns {Promise<object|null>} Stripe PaymentIntent object or null if amount is too low.
   */
 async createOvertimeAuthorizationIntent({ amount, currency = 'chf', stripeCustomerId, userId, metadata = {} }) {
  const logContext = {
      function: 'createOvertimeAuthorizationIntent',
      stripeCustomerId,
      userId,
      bookingId: metadata?.bookingId,
      sessionId: metadata?.sessionId,
      timestamp: new Date().toISOString()
  };
  console.log('[PaymentService] Creating Overtime Authorization Intent - START', { ...logContext, amount, currency });

  try {
      if (amount === undefined || amount === null || typeof amount !== 'number' || isNaN(amount)) {
          logger.error('[PaymentService] Invalid or missing amount for overtime authorization', { ...logContext, amount });
          throw new Error('Invalid or missing amount for overtime authorization.');
      }
       if (!stripeCustomerId) {
          logger.error('[PaymentService] Missing stripeCustomerId for overtime authorization', { ...logContext });
          throw new Error('Missing Stripe Customer ID for overtime authorization.');
       }

      const amountInCents = convertToCents(amount);

      if (amountInCents < 50) {
          logger.warn(`[PaymentService] Overtime auth amount ${amountInCents} cents is below Stripe minimum. Skipping intent creation.`, logContext);
          throw new Error('Amount too low for payment processing.');
      }

      const stripeParams = {
          amount: amountInCents,
          currency: currency.toLowerCase(),
          customer: stripeCustomerId,
          metadata: {
              ...metadata, // Includes bookingId, sessionId
              type: 'overtime_authorization', // Explicitly mark type
              authorizationTimestamp: new Date().toISOString()
          },
          capture_method: 'manual', // ** CRITICAL **
          automatic_payment_methods: { enabled: true },
          setup_future_usage: 'off_session'
      };

      const idempotencyKey = `overtime-auth-${metadata?.bookingId || stripeCustomerId}-${Date.now()}`;
      console.log('[PaymentService] Calling stripe.paymentIntents.create (Manual Capture) with params:', { ...logContext, params: { ...stripeParams, clientSecret: undefined } });

      const paymentIntent = await this.stripe.paymentIntents.create(stripeParams, {
          idempotencyKey,
      });

      console.log('[PaymentService] MANUAL CAPTURE Payment intent created successfully', {
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          capture_method: paymentIntent.capture_method,
          ...logContext
      });

      return paymentIntent;

  } catch (error) {
      logger.error('[PaymentService] Error creating MANUAL CAPTURE payment intent', {
          ...logContext,
          errorMessage: error.message,
          stripeErrorCode: error.code,
          stripeErrorType: error.type,
      });
      throw this.enhanceStripeError(error);
    }
  }


/**
   * Captures an authorized PaymentIntent or cancels it if the amount is too low.
   * Makes direct calls to Stripe SDK.
   * @param {string} paymentIntentId - The ID of the PaymentIntent.
   * @param {number} finalAmountToCapture - The final amount to capture in decimal format (e.g., 10.50).
   * @returns {Promise<object>} Result object { success: boolean, chargeId: string|null, capturedAmount: number|null, status: string }
   */
async captureAuthorizedPayment(paymentIntentId, finalAmountToCapture) {
  const logContext = { paymentIntentId, finalAmountToCapture };
  console.log('[PaymentService] Processing capture/cancel for authorized PaymentIntent', logContext);

  try {
    const finalAmountInCents = convertToCents(finalAmountToCapture);
    logger.debug('[PaymentService] Amount converted to cents', { ...logContext, finalAmountInCents });

    // Stripe minimum capture amount is typically 50 cents (e.g., 0.50 CHF/USD/EUR)
    const minimumCaptureAmountCents = 50;

    if (finalAmountInCents < minimumCaptureAmountCents) {
      logger.warn(`[PaymentService] Final amount ${finalAmountInCents} cents is below minimum threshold (${minimumCaptureAmountCents}). Cancelling intent.`, logContext);

      // Cancel the PaymentIntent directly instead of capturing
      const cancelledIntent = await this.cancelAuthorizedPayment(paymentIntentId, 'abandoned'); // Use the cancel method below
      return {
        success: true,
        chargeId: null,
        capturedAmount: 0,
        status: cancelledIntent.status === 'canceled' ? 'cancelled' : 'cancel_failed', // Reflect cancellation status
      };
    }

    // Proceed with capture using the direct Stripe SDK call
    console.log('[PaymentService] Calling stripe.paymentIntents.capture', { paymentIntentId, amount_to_capture: finalAmountInCents });
    const capturedIntent = await this.stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: finalAmountInCents,
    });

    console.log('[PaymentService] Payment captured successfully via Stripe SDK', {
      paymentIntentId,
      capturedAmountInCents: capturedIntent.amount_received, // Use amount_received from Stripe response
      chargeId: capturedIntent.latest_charge,
      status: capturedIntent.status, // Should be 'succeeded' or potentially 'processing'
    });

    return {
      success: true,
      chargeId: capturedIntent.latest_charge,
      capturedAmount: capturedIntent.amount_received / 100, // Convert back to decimal for consistency
      status: 'captured', // Use a clear status for successful capture
    };

  } catch (error) {
    logger.error('[PaymentService] Error processing authorized payment capture/cancel', {
      ...logContext,
      errorMessage: error.message,
      stripeErrorCode: error.code, // Stripe errors have a 'code'
      stripeErrorType: error.type,
      stack: error.stack,
    });
     // Enhance error before returning structure
    const enhancedError = new Error(`Payment processing failed: ${error.message}`);
    enhancedError.original = error; // Attach original Stripe error
    enhancedError.code = error.code;
    enhancedError.type = error.type;

    return {
      success: false,
      chargeId: null,
      capturedAmount: null,
      status: 'capture_failed',
      error: enhancedError.message, // Use enhanced message
      originalError: enhancedError // Keep enhanced error for deeper debugging if needed
    };
  }
}

/**
   * Cancels an authorized PaymentIntent directly via Stripe SDK.
   * @param {string} paymentIntentId - The ID of the PaymentIntent to cancel.
   * @param {string} reason - The reason for cancellation.
   * @returns {Promise<object>} The cancelled PaymentIntent object from Stripe.
   */
async cancelAuthorizedPayment(paymentIntentId, reason = 'abandoned') {
  const logContext = { paymentIntentId, reason };
  console.log('[PaymentService] Processing cancellation for authorized PaymentIntent', logContext);
  try {
    // Call Stripe SDK directly
    console.log('[PaymentService] Calling stripe.paymentIntents.cancel', logContext);
    const cancelledIntent = await this.stripe.paymentIntents.cancel(paymentIntentId, {
      cancellation_reason: reason,
    });
    console.log('[PaymentService] PaymentIntent cancelled successfully via Stripe SDK', {
       paymentIntentId, status: cancelledIntent.status // Should be 'canceled'
      });
    return cancelledIntent; // Return the full Stripe object
  } catch (error) {
    logger.error('[PaymentService] Error cancelling authorized payment', {
      ...logContext,
      errorMessage: error.message,
      stripeErrorCode: error.code,
      stripeErrorType: error.type,
      stack: error.stack,
    });

    // Check if it couldn't be cancelled because it was already processed
    if (error.code === 'payment_intent_unexpected_state') {
       logger.warn('[PaymentService] PaymentIntent cancellation failed, likely already processed.', logContext);
       // We still need to throw or indicate failure. Let's enhance and throw.
    }
    // Enhance error before throwing
    const enhancedError = new Error(`Stripe cancellation failed: ${error.message}`);
    enhancedError.original = error;
    enhancedError.code = error.code;
    enhancedError.type = error.type;
    throw enhancedError; // Re-throw the enhanced error
    }
  }

    /**
   * Retrieves the minimum charge amount for a given currency from Stripe (or uses a default).
   * @param {string} currency - The currency code (lowercase, e.g., 'chf', 'usd').
   * @returns {number} Minimum charge amount in the currency's smallest unit (cents).
   */
    getMinimumChargeAmount(currency = 'chf') {
      // Stripe minimums (common examples, verify for your specific account/region)
      const minimums = {
        usd: 50,
        eur: 50,
        gbp: 30,
        chf: 50,
        // Add other currencies as needed
      };
      const defaultMinimum = 50; // Default to 50 cents if currency not listed
      const minAmount = minimums[currency.toLowerCase()] || defaultMinimum;
      logger.debug(`[PaymentService] Minimum charge amount for ${currency.toUpperCase()}: ${minAmount} cents`);
      return minAmount;
    }
  
    /**
     * Creates a specific Payment Intent for authorizing payments with manual capture.
     * Used for scenarios like overtime where the final amount isn't known initially.
     * @param {object} payload - Payload containing necessary details.
     * @param {number} payload.amount - The maximum amount to authorize (in decimal).
     * @param {string} payload.currency - Currency code (e.g., 'chf').
     * @param {string} payload.stripeCustomerId - Stripe Customer ID.
     * @param {string} payload.userId - MongoDB User ID.
     * @param {object} payload.metadata - Metadata including bookingId, sessionId, type='overtime_authorization'.
     * @returns {Promise<object>} Stripe PaymentIntent object.
     */
    async createManualCaptureIntent({ amount, currency = 'chf', stripeCustomerId, userId, metadata = {} }) {
      const logContext = {
        function: 'createManualCaptureIntent V2', // Version V2
        stripeCustomerId, userId,
        bookingId: metadata?.bookingId,
        sessionId: metadata?.sessionId,
        amount, currency,
        timestamp: new Date().toISOString()
      };
      console.log('[PaymentService] Creating Manual Capture Intent - START', logContext);
    
      try {
        if (amount === undefined || amount === null || typeof amount !== 'number' || isNaN(amount)) {
          throw new Error('Invalid or missing amount.');
        }
        if (!stripeCustomerId) {
          throw new Error('Missing Stripe Customer ID.');
        }
    
        const amountInCents = convertToCents(amount);
        const minChargeCents = this.getMinimumChargeAmount(currency);
    
        if (amountInCents < minChargeCents) {
          if (amountInCents === 0) { // Allow zero amount for testing or specific free scenarios if explicitly intended
              logger.warn(`[PaymentService] Creating manual capture intent with ZERO amount.`, { ...logContext, amountInCents });
          } else {
              logger.error(`[PaymentService] Amount ${amountInCents} cents is below minimum ${minChargeCents} cents. Cannot create intent.`, logContext);
              throw new Error(`Amount too low for payment processing (Minimum: ${(minChargeCents / 100).toFixed(2)} ${currency.toUpperCase()}).`);
          }
        }
    
        const stripeParams = {
          amount: amountInCents,
          currency: currency.toLowerCase(),
          customer: stripeCustomerId,
          metadata: { // Pass all received metadata through
            ...metadata,
            manualCapture: 'true', // Ensure this flag is always set
            authorizationTimestamp: new Date().toISOString()
          },
          capture_method: 'manual',
          automatic_payment_methods: { 
            enabled: true,
            allow_redirects: 'never'
          },
          // setup_future_usage: 'off_session', // Consider if needed for saving card for future overtime
        };
    
        // Explicitly check for coachStripeAccountId and platformFeeInCents in metadata
        if (metadata.coachStripeAccountId) {
            stripeParams.transfer_data = {
                destination: metadata.coachStripeAccountId,
            };
            // Only add application_fee_amount if platformFeeInCents is valid and positive
            if (typeof metadata.platformFeeInCents === 'number' && metadata.platformFeeInCents > 0) {
                stripeParams.application_fee_amount = metadata.platformFeeInCents;
            }
            console.log('[PaymentService] Added transfer_data and potentially application_fee_amount for Connect account to manual capture intent', { 
                ...logContext, 
                coachAccountId: metadata.coachStripeAccountId,
                applicationFee: stripeParams.application_fee_amount 
            });
        } else {
            logger.warn('[PaymentService] coachStripeAccountId not found in metadata for manual capture intent. Intent will be direct charge.', logContext);
        }
    
        const idempotencyKey = `manual-auth-${metadata?.bookingId || stripeCustomerId}-${Date.now()}`;
        console.log('[PaymentService] Calling stripe.paymentIntents.create (Manual Capture V2) with params:', { ...logContext, paramsForStripe: { ...stripeParams, clientSecret: undefined } }); // Log params before call
    
        const paymentIntent = await this.stripe.paymentIntents.create(stripeParams, {
          idempotencyKey,
        });
    
        console.log('[PaymentService] MANUAL CAPTURE Payment Intent (V2) created successfully', {
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          capture_method: paymentIntent.capture_method,
          amount: paymentIntent.amount,
          application_fee_amount: paymentIntent.application_fee_amount,
          transfer_data: paymentIntent.transfer_data,
          ...logContext
        });
    
        return paymentIntent;
    
      } catch (error) {
        logger.error('[PaymentService] Error creating MANUAL CAPTURE payment intent (V2)', {
          ...logContext,
          errorMessage: error.message,
          stripeErrorCode: error.code,
          stripeErrorType: error.type,
        });
        throw this.enhanceStripeError(error);
      }
    }
  
    /**
     * Captures an authorized PaymentIntent or cancels it if the amount is zero/too low.
     * @param {string} paymentIntentId - The ID of the PaymentIntent.
     * @param {number} finalAmountToCaptureDecimal - The final amount to capture in decimal format (e.g., 10.50). Amount <= 0 will trigger cancellation.
     * @returns {Promise<object>} Result object { success: boolean, chargeId: string|null, capturedAmount: number|null, status: string, error?: string }
     */
    async captureOrCancelManualIntent(paymentIntentId, finalAmountToCaptureDecimal) {
      const logContext = { paymentIntentId, finalAmountToCaptureDecimal };
      console.log('[PaymentService.captureOrCancelManualIntent V2] Processing capture/cancel START', logContext);
  
      try {
        const intent = await this.retrievePaymentIntent(paymentIntentId); // Check current status first
  
        if (intent.status === 'succeeded') {
           logger.warn(`[PaymentService] Intent ${paymentIntentId} already succeeded (captured). Cannot process again.`, logContext);
           return { success: true, status: 'already_captured', chargeId: intent.latest_charge, capturedAmount: intent.amount_received / 100 };
        }
        if (intent.status === 'canceled') {
            logger.warn(`[PaymentService] Intent ${paymentIntentId} already canceled.`, logContext);
            return { success: true, status: 'already_canceled', chargeId: null, capturedAmount: 0 };
        }
        // Only proceed if requires_capture or potentially requires_confirmation (though latter shouldn't happen here ideally)
        if (intent.status !== 'requires_capture') {
            logger.error(`[PaymentService] Intent ${paymentIntentId} not in 'requires_capture' state. Current status: ${intent.status}. Cannot capture/cancel.`, logContext);
            throw new Error(`Payment cannot be processed. Status: ${intent.status}`);
        }
  
  
        const finalAmountInCents = convertToCents(finalAmountToCaptureDecimal);
        const minChargeCents = this.getMinimumChargeAmount(intent.currency);
        logContext.finalAmountInCents = finalAmountInCents;
        logContext.minChargeCents = minChargeCents;
  
        if (finalAmountInCents < minChargeCents) {
          console.log(`[PaymentService.captureOrCancelManualIntent V2] Amount ${finalAmountInCents}c < min ${minChargeCents}c. Calling cancelPaymentIntent...`, logContext);
          const cancelledIntent = await this.cancelPaymentIntent(paymentIntentId, 'abandoned');
          console.log('[PaymentService.captureOrCancelManualIntent V2] Intent Cancelled', { ...logContext, finalStatus: cancelledIntent.status });
          return {
            success: true, status: 'released', chargeId: null, capturedAmount: 0,
          };
        } else {
          console.log('[PaymentService.captureOrCancelManualIntent V2] Amount >= min. Calling stripe.paymentIntents.capture...', { ...logContext, amount_to_capture: finalAmountInCents });
          const capturedIntent = await this.stripe.paymentIntents.capture(paymentIntentId, {
            amount_to_capture: finalAmountInCents,
          });
          logContext.captureResponseStatus = capturedIntent.status;
          logContext.captureResponseCharge = capturedIntent.latest_charge;
          logContext.captureResponseAmountReceived = capturedIntent.amount_received;
    
          console.log('[PaymentService.captureOrCancelManualIntent V2] Capture successful', {
              ...logContext,
              capturedAmountDecimal: capturedIntent.amount_received / 100 // Log captured amount
          });
  
          console.log('[PaymentService] Payment captured successfully', {
            paymentIntentId,
            capturedAmountInCents: capturedIntent.amount_received,
            chargeId: capturedIntent.latest_charge,
            status: capturedIntent.status, // Should be 'succeeded'
          });
  
          const isPartial = Math.abs(capturedIntent.amount_received - intent.amount_capturable) > 1 && capturedIntent.amount_received > 0; // Check against amount_capturable, allow for minor rounding diffs
  
          return {
            success: true,
            status: isPartial ? 'partially_captured' : 'captured',
            chargeId: capturedIntent.latest_charge,
            capturedAmount: capturedIntent.amount_received / 100, // Convert back to decimal
          };
        }
      } catch (error) {
        logger.error('[PaymentService] Error during capture/cancel of manual intent', {
          ...logContext,
          errorMessage: error.message,
          stripeErrorCode: error.code,
          stripeErrorType: error.type,
          stack: error.stack
        });
        const enhancedError = this.enhanceStripeError(error); // Enhance error
        return {
            success: false,
            status: error.code === 'payment_intent_unexpected_state' ? 'already_processed' : 'capture_failed', // More specific failure status if possible
            chargeId: null,
            capturedAmount: null,
            error: enhancedError.message, // Return enhanced message
            originalError: enhancedError // Keep enhanced original error
        };
      }
    }

/**
 * Creates and confirms a PaymentIntent for a completed Live Session using a saved payment method.
 * This is an "off-session" charge.
 * @param {object} liveSession - The Mongoose LiveSession document.
 * @param {object} finalCostBreakdown - The final calculated cost object.
 * @param {object} dbSession - The active Mongoose transaction session.
 * @returns {Promise<object>} An object containing the success status and the created Payment document.
 */
async createChargeForCompletedSession(liveSession, finalCostBreakdown, dbSession) {
  const logContext = { liveSessionId: liveSession._id, finalGrossAmount: finalCostBreakdown.final.amount.amount };
  logger.info('[PaymentService] Creating FINAL STANDARD charge for completed session.', logContext);

  const finalAmount = finalCostBreakdown.final.amount.amount;
  const currency = finalCostBreakdown.currency.toLowerCase();
  const amountInCents = Math.round(finalAmount * 100);
  const minChargeCents = this.getMinimumChargeAmount(currency);

  if (amountInCents < minChargeCents) {
    logger.warn(`[PaymentService] Final charge amount ${amountInCents}c is below minimum. Creating zero-value record and skipping charge.`, logContext);
    const zeroPayment = new Payment({
        liveSession: liveSession._id,
        booking: liveSession.booking,
        payer: liveSession.client,
        recipient: liveSession.coach,
        type: 'live_session_charge',
        status: 'completed',
        payoutStatus: 'not_applicable',
        priceSnapshot: finalCostBreakdown,
        amount: { total: 0, currency: finalCostBreakdown.currency.toUpperCase() },
    });
    await zeroPayment.save({ session: dbSession });
    return { success: true, paymentRecord: zeroPayment, message: "Zero charge, skipped." };
  }

  const client = await User.findById(liveSession.client).select('stripe.customerId').session(dbSession);
  if (!client?.stripe?.customerId) {
    throw new Error('Client Stripe Customer ID is missing.');
  }

  const coachProfile = await Coach.findOne({ user: liveSession.coach }).select('settings.paymentAndBilling.stripe.accountId').session(dbSession);
  if (!coachProfile?.settings?.paymentAndBilling?.stripe?.accountId) {
    throw new Error(`Coach for live session ${liveSession._id} is missing a Stripe Account ID.`);
  }
  
  const setupIntents = await stripe.setupIntents.list({ customer: client.stripe.customerId });
  const successfulSetup = setupIntents.data.find(si => si.metadata.liveSessionId === liveSession._id.toString() && si.status === 'succeeded');

  if (!successfulSetup || !successfulSetup.payment_method) {
    throw new Error(`No valid saved payment method found from SetupIntent for live session ${liveSession._id}`);
  }

  const paymentRecord = new Payment({
    liveSession: liveSession._id,
    booking: liveSession.booking,
    payer: liveSession.client,
    recipient: liveSession.coach,
    coachStripeAccountId: coachProfile.settings.paymentAndBilling.stripe.accountId,
    type: 'live_session_charge',
    status: 'pending',
    priceSnapshot: finalCostBreakdown,
    amount: {
      total: finalCostBreakdown.final.amount.amount,
      base: finalCostBreakdown.base.amount.amount,
      platformFee: finalCostBreakdown.platformFee.amount,
      vat: { 
          rate: finalCostBreakdown.vat.rate, 
          amount: finalCostBreakdown.vat.amount, 
          included: true 
      },
      currency: finalCostBreakdown.currency.toUpperCase(),
    },
    discountApplied: finalCostBreakdown.discounts && finalCostBreakdown.discounts.length > 0 ? {
        _id: finalCostBreakdown.discounts[0]._id,
        code: finalCostBreakdown.discounts[0].code,
        type: finalCostBreakdown.discounts[0].type,
        value: finalCostBreakdown.discounts[0].value,
        amountDeducted: finalCostBreakdown.discounts[0].amountDeducted
    } : undefined,
    stripe: {
      customerId: client.stripe.customerId,
    },
  });
  await paymentRecord.save({ session: dbSession });
  logger.info('[PaymentService] Created pending payment record for live session charge.', { paymentId: paymentRecord._id });

  const paymentIntent = await this.stripe.paymentIntents.create({
    amount: amountInCents,
    currency,
    customer: client.stripe.customerId,
    payment_method: successfulSetup.payment_method,
    off_session: true,
    confirm: true,
    metadata: {
      paymentId: paymentRecord._id.toString(),
      liveSessionId: liveSession._id.toString(),
      bookingId: liveSession.booking.toString(),
      type: 'live_session_charge',
    },
  });

  paymentRecord.stripe.paymentIntentId = paymentIntent.id;
  await paymentRecord.save({ session: dbSession });

  if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') {
    paymentRecord.status = 'failed';
    paymentRecord.error = { message: `Final charge failed with status: ${paymentIntent.status}` };
    await paymentRecord.save({ session: dbSession });
    throw new Error(`Final charge failed with status: ${paymentIntent.status}`);
  }

  return { success: true, paymentRecord, message: "Charge initiated. Awaiting webhook for finalization." };
}

/**
 * Creates a SetupIntent to validate and save a customer's card for future use.
 * @param {object} payload - The details for the SetupIntent.
 * @param {string} payload.stripeCustomerId - The Stripe Customer ID.
 * @param {object} payload.metadata - Metadata to attach to the intent.
 * @returns {Promise<object>} The Stripe SetupIntent object.
 */
async createSetupIntentForSession({ stripeCustomerId, metadata = {} }) {
  const logContext = { function: 'createSetupIntentForSession', stripeCustomerId, metadata };
  console.log('[PaymentService] Creating SetupIntent for session.', logContext);
  
  try {
    const setupIntent = await this.stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session', // Indicate we intend to charge this card later
      metadata,
    });

    console.log('[PaymentService] SetupIntent created successfully.', { setupIntentId: setupIntent.id, ...logContext });
    return setupIntent;
  } catch (error) {
    logger.error('[PaymentService] Error creating SetupIntent.', { ...logContext, error: error.message });
    throw this.enhanceStripeError(error);
  }
}
  
    /**
     * Cancels a PaymentIntent directly via Stripe SDK.
     * @param {string} paymentIntentId - The ID of the PaymentIntent to cancel.
     * @param {string} [reason='abandoned'] - The reason for cancellation ('duplicate', 'fraudulent', 'requested_by_customer', 'abandoned').
     * @returns {Promise<object>} The cancelled PaymentIntent object from Stripe.
     */
    async cancelPaymentIntent(paymentIntentId, reason = 'abandoned') {
      const logContext = { paymentIntentId, reason };
      console.log('[PaymentService] Processing cancellation for PaymentIntent', logContext);
      try {
        console.log('[PaymentService] Calling stripe.paymentIntents.cancel', logContext);
        const cancelledIntent = await this.stripe.paymentIntents.cancel(paymentIntentId, {
          cancellation_reason: reason,
        });
        console.log('[PaymentService] PaymentIntent cancelled successfully via Stripe SDK', {
           paymentIntentId, status: cancelledIntent.status // Should be 'canceled'
          });
        return cancelledIntent; // Return the full Stripe object
      } catch (error) {
        logger.error('[PaymentService] Error cancelling payment intent', {
          ...logContext,
          errorMessage: error.message,
          stripeErrorCode: error.code,
          stripeErrorType: error.type,
          stack: error.stack,
        });
  
        // Check if it couldn't be cancelled because it was already processed
        if (error.code === 'payment_intent_unexpected_state' && (error.message.includes('succeeded') || error.message.includes('canceled'))) {
           logger.warn('[PaymentService] PaymentIntent cancellation failed, already processed or cancelled.', logContext);
           // Optionally retrieve and return the current state
           try {
             return await this.retrievePaymentIntent(paymentIntentId);
           } catch (retrieveError) {
             // Fall through to throw original error if retrieve fails
           }
        }
        throw this.enhanceStripeError(error); // Re-throw the enhanced error
      }
    }


  /**
   * Finalizes an authorized overtime payment segment based on session end time.
   * Calculates usage, determines capture amount, calls capture/release, and prepares DB update payloads.
   * NOTE: This function expects to be called within an existing Mongoose transaction (sessionDb).
   *
   * @param {string} bookingId - The ID of the Booking document.
   * @param {Date} finalEndTime - The definitive end time of the user's participation.
   * @param {object} sessionDb - The active Mongoose transaction session.
   * @returns {Promise<object>} Result: { success: boolean, status: string, segment?: object, sessionUpdatePayload?: object, paymentUpdatePayload?: object, error?: string }
   */
  async finalizeOvertimePayment(bookingId, finalEndTime, sessionDb, sessionDoc = null) {
    const logContext = { bookingId, finalEndTime: finalEndTime.toISOString(), function: 'finalizeOvertimePayment V8' };
    console.log(`[${logContext.function}] Finalizing overtime payment. Passed sessionDoc: ${sessionDoc ? `Yes (ID: ${sessionDoc._id})` : 'No'}. Using sessionDb: ${sessionDb ? 'Yes' : 'No'}`, logContext);

    let booking, paymentRecord;
    let effectiveSession;

    try {
      booking = await Booking.findById(bookingId)
        .select('+price +overtime +start +end +coach +user +sessionType')
        .populate({ 
            path: 'coach',
            select: '_id settings.professionalProfile.hourlyRate firstName lastName email' 
        })
        .populate('user', '_id firstName lastName email')
        .populate('sessionType', 'name')
        .session(sessionDb);

      if (!booking) {
          logger.error(`[${logContext.function}] Booking not found.`, logContext);
          throw new Error('Booking not found.');
      }
      logContext.bookingId = booking._id.toString();
      logContext.coachRate = booking.coach?.settings?.professionalProfile?.hourlyRate;
      logContext.overtimeRatePercent = booking.overtime?.overtimeRate;
      logContext.bookingSessionTypeName = booking.sessionType?.name;
      logger.debug(`[${logContext.function}] Fetched Booking & Rates`, { ...logContext, coachId: booking.coach?._id });

      if (sessionDoc) {
        console.log(`[${logContext.function}] Using passed sessionDoc. Validating if it needs to be part of current DB transaction.`, logContext);
        if (sessionDb && sessionDoc.$session && !sessionDoc.$session()) { 
            logger.warn(`[${logContext.function}] Passed sessionDoc is not bound to the current transaction. Re-fetching.`, logContext);
            effectiveSession = await Session.findOne({ bookingId: booking._id }).session(sessionDb);
        } else if (sessionDb && !sessionDoc.$session && typeof sessionDoc.toObject === 'function') { 
            logger.warn(`[${logContext.function}] Passed sessionDoc is a plain object but a DB transaction is active. Re-fetching.`, logContext);
            effectiveSession = await Session.findOne({ bookingId: booking._id }).session(sessionDb);
        }
        else {
            effectiveSession = sessionDoc; 
        }
      } else {
          console.log(`[${logContext.function}] sessionDoc not passed, fetching from DB.`, logContext);
          effectiveSession = await Session.findOne({ bookingId: booking._id }).session(sessionDb);
      }
      
      if (!effectiveSession) {
          logger.error(`[${logContext.function}] Session document could not be obtained.`, logContext);
          throw new Error('Session document could not be obtained.');
      }
      logContext.sessionDocId = effectiveSession._id.toString();
      logger.debug(`[${logContext.function}] Using Session doc`, { ...logContext, state: effectiveSession.state, overtimeSegmentsCount: effectiveSession.overtimeSegments?.length });
      logger.debug(`[${logContext.function}] Segments in effectiveSession for filtering:`, { segments: effectiveSession.overtimeSegments.map(s => ({id: s._id, status: s.status, authAt: s.authorizedAt, cr: s.captureResult, cr_is_null: s.captureResult === null, cr_is_undefined: s.captureResult === undefined}))});

      const latestAuthorizedSegment = effectiveSession.overtimeSegments
        ?.filter(s => {
            const isAuthorized = s.status === 'authorized';
            // --- THIS IS THE CRITICAL FILTER, aligning with simulateOvertimeUsageDev ---
            const isNotFinalized = s.captureResult == null || (typeof s.captureResult === 'object' && typeof s.captureResult.status !== 'string');
            // --- END CRITICAL FILTER ---
            
            if(isAuthorized){
                 logger.debug(`[${logContext.function}] Checking segment for finalization (inside finalizeOvertimePayment):`, {
                    segmentId: s._id.toString(), status: s.status, isAuthorized, isNotFinalized, 
                    captureResultRaw: s.captureResult, 
                    typeOfCaptureResult: typeof s.captureResult,
                    isCaptureResultStrictlyNull: s.captureResult === null,
                    isCaptureResultStrictlyUndefined: s.captureResult === undefined,
                    captureResultHasStatusField: s.captureResult ? typeof s.captureResult.status === 'string' : false
                });
            }
            return isAuthorized && isNotFinalized;
        })
        .sort((a, b) => new Date(b.authorizedAt).getTime() - new Date(a.authorizedAt).getTime())[0];

      if (!latestAuthorizedSegment) {
        console.log(`[${logContext.function}] No 'authorized' and unfinalized segment found in effectiveSession. No capture needed.`, {...logContext });
        return { success: true, status: 'no_capture_needed', message: "No segment to finalize." };
      }
      
      const paymentIntentId = latestAuthorizedSegment.paymentIntentId;
      const segmentId = latestAuthorizedSegment._id; 
      logContext.paymentIntentId = paymentIntentId;
      logContext.segmentId = segmentId.toString();
      logContext.segmentRequestedDuration = latestAuthorizedSegment.requestedDuration;
      logContext.segmentAuthorizedAt = latestAuthorizedSegment.authorizedAt?.toISOString();
      logContext.segmentMaxPrice = latestAuthorizedSegment.calculatedMaxPrice;
      console.log(`[${logContext.function}] Found segment to finalize: ${segmentId}`, logContext);

      paymentRecord = await Payment.findOne({ 'stripe.paymentIntentId': paymentIntentId })
        .select('+stripe.clientSecret') 
        .session(sessionDb); 

        if (!paymentRecord) {
          const errorMsg = `Payment record not found for PI ${paymentIntentId}. Cannot finalize segment ${segmentId}.`;
          logger.error(`[${logContext.function}] ${errorMsg}`, logContext);
          // Update segment to failed if payment record is missing entirely
          const sessionUpdatePayload = {
            $set: { 'overtimeSegments.$[elem].status': 'failed', 
                    'overtimeSegments.$[elem].captureResult': { status: 'failed', error: 'Associated payment record missing', capturedAt: new Date() },
                    'overtimeSegments.$[elem].finalizedAt': new Date() }
          };
          return { success: false, status: 'payment_record_missing', sessionUpdatePayload, paymentUpdatePayload: null, error: errorMsg, segmentId };
        }
  
        // If payment record is 'pending_confirmation' BUT the segment is 'authorized' 
        // AND Stripe PI is 'requires_capture', we can transition payment to 'authorized' here.
        if (paymentRecord.status === 'pending_confirmation' && latestAuthorizedSegment.status === 'authorized') {
          const stripePI = await this.retrievePaymentIntent(paymentIntentId); // Ensure stripeService has retrievePaymentIntent or use this.stripe
          if (stripePI.status === 'requires_capture') {
            logger.warn(`[${logContext.function}] Payment record for PI ${paymentIntentId} is 'pending_confirmation' but segment is 'authorized' and Stripe PI is 'requires_capture'. Transitioning Payment to 'authorized'.`, logContext);
            paymentRecord.status = 'authorized';
            paymentRecord.updatedAt = new Date();
            // Ensure amount.authorized is set if not already
            if (!paymentRecord.amount.authorized || paymentRecord.amount.authorized !== latestAuthorizedSegment.calculatedMaxPrice.amount) {
              paymentRecord.amount.authorized = latestAuthorizedSegment.calculatedMaxPrice.amount;
            }
            await paymentRecord.save({ session: sessionDb }); // Save within the transaction
            console.log(`[${logContext.function}] Payment record ${paymentRecord._id} status updated to 'authorized' within finalizeOvertimePayment transaction.`, logContext);
          } else {
            const errorMsg = `Payment record ${paymentRecord._id} is 'pending_confirmation', segment 'authorized', but Stripe PI status is '${stripePI.status}' (not 'requires_capture'). Cannot finalize.`;
            logger.error(`[${logContext.function}] ${errorMsg}`, { ...logContext, stripePIStatus: stripePI.status });
            const sessionUpdatePayload = {
              $set: { 'overtimeSegments.$[elem].status': 'failed', 
                      'overtimeSegments.$[elem].captureResult': { status: 'failed', error: `Stripe PI state issue: ${stripePI.status}`, capturedAt: new Date() },
                      'overtimeSegments.$[elem].finalizedAt': new Date() }
            };
            return { success: false, status: 'stripe_pi_state_invalid', sessionUpdatePayload, paymentUpdatePayload: null, error: errorMsg, segmentId };
          }
        } else if (paymentRecord.status !== 'authorized') {
          const errorMsg = `Payment record ${paymentRecord._id} invalid state (Status: ${paymentRecord.status}). Cannot finalize segment ${segmentId}. Expected 'authorized'.`;
          logger.error(`[${logContext.function}] ${errorMsg}`, logContext);
          const sessionUpdatePayload = {
            $set: { 'overtimeSegments.$[elem].status': 'failed', 
                    'overtimeSegments.$[elem].captureResult': { status: 'failed', error: 'Payment record invalid state for finalization', capturedAt: new Date() },
                    'overtimeSegments.$[elem].finalizedAt': new Date() }
          };
          return { success: false, status: 'payment_record_invalid', sessionUpdatePayload, paymentUpdatePayload: null, error: errorMsg, segmentId };
        }
      const currency = paymentRecord.amount.currency || 'CHF';
      logContext.currency = currency;
      logContext.paymentId = paymentRecord._id.toString();
      logger.debug(`[${logContext.function}] Fetched valid Payment record`, logContext);
      
      const paidSegmentStartTimeMs = new Date(latestAuthorizedSegment.authorizedAt).getTime();
      logContext.calculatedSegmentStartTime = new Date(paidSegmentStartTimeMs).toISOString();

      const actualPaidOvertimeMsInSegment = Math.max(0, finalEndTime.getTime() - paidSegmentStartTimeMs);
      const cappedOvertimeMs = Math.min(actualPaidOvertimeMsInSegment, latestAuthorizedSegment.requestedDuration * 60000);
      const actualPaidMinutes = Math.ceil(cappedOvertimeMs / 60000); 
      logContext.actualPaidMinutes = actualPaidMinutes;

      logger.debug(`[${logContext.function}] Calculated Usage`, {
        ...logContext,
        actualMsInSegment: actualPaidOvertimeMsInSegment,
        cappedMs: cappedOvertimeMs,
      });

      const maxPrice = latestAuthorizedSegment.calculatedMaxPrice?.amount;
      const maxPriceCurrency = latestAuthorizedSegment.calculatedMaxPrice?.currency || 'CHF';

      if (maxPrice === undefined || maxPrice === null || typeof maxPrice !== 'number' || isNaN(maxPrice) || maxPrice < 0) {
        const errorMsg = `Invalid or missing calculatedMaxPrice.amount (value: ${maxPrice}) in overtime segment.`;
        logger.error(`[${logContext.function}] Segment price validation failed.`, {
          ...logContext,
          calculatedMaxPrice: latestAuthorizedSegment.calculatedMaxPrice
        });
        const sessionUpdatePayload = {
          $set: {
            'overtimeSegments.$[elem].status': 'failed',
            'overtimeSegments.$[elem].captureResult': { status: 'failed', error: errorMsg, capturedAt: new Date() },
            'overtimeSegments.$[elem].finalizedAt': new Date()
          }
        };
        const paymentUpdatePayload = paymentRecord ? {
          $set: { status: 'capture_failed', error: { message: errorMsg }, updatedAt: new Date() }
        } : null;
        return {
          success: false, status: 'failed', error: errorMsg, sessionUpdatePayload, paymentUpdatePayload, segmentId: segmentId,
          userId: booking.user?._id?.toString(), coachId: booking.coach?._id?.toString(), paymentIntentId
        };
      }
      logContext.maxPrice = maxPrice;
      logContext.maxPriceCurrency = maxPriceCurrency;

      let finalAmountToCaptureDecimal;
      if (actualPaidMinutes <= 0) {
          finalAmountToCaptureDecimal = 0; 
          console.log(`[${logContext.function}] No paid overtime used (actualPaidMinutes: ${actualPaidMinutes}). Setting capture amount to 0.`, { ...logContext });
      } else if (maxPrice === 0) { 
          finalAmountToCaptureDecimal = 0;
          console.log(`[${logContext.function}] Max authorized price is 0. Setting capture amount to 0.`, { ...logContext });
      } else if (actualPaidMinutes < latestAuthorizedSegment.requestedDuration) {
          const requestedDuration = latestAuthorizedSegment.requestedDuration;
          if (requestedDuration === 0) { 
            finalAmountToCaptureDecimal = 0;
            logger.warn(`[${logContext.function}] Segment requestedDuration is 0, cannot calculate partial. Capturing 0.`, { ...logContext });
          } else {
            const pricePerMinute = maxPrice / requestedDuration;
            finalAmountToCaptureDecimal = pricePerMinute * actualPaidMinutes;
            finalAmountToCaptureDecimal = Math.round(finalAmountToCaptureDecimal * 100) / 100; 
            console.log(`[${logContext.function}] Partial paid overtime used. Calculated partial capture amount.`, { ...logContext, actualPaidMinutes, requestedDuration, pricePerMinute, finalAmountToCaptureDecimal });
          }
      } else { 
          finalAmountToCaptureDecimal = maxPrice; 
          console.log(`[${logContext.function}] Full or more than requested paid overtime used. Setting capture amount to max authorized.`, { ...logContext, actualPaidMinutes, requestedDuration: latestAuthorizedSegment.requestedDuration, finalAmountToCaptureDecimal });
      }
      logContext.finalAmountToCapture = finalAmountToCaptureDecimal;

      logger.debug(`[${logContext.function}] Calculated Final Amount to Capture`, {
        ...logContext,
        finalAmountToCaptureDecimal,
      });
      
      console.log(`[${logContext.function}] Calling captureOrCancelManualIntent...`, logContext );
      const captureResult = await this.captureOrCancelManualIntent(paymentIntentId, finalAmountToCaptureDecimal);
      logContext.captureServiceResult = captureResult; 
      console.log(`[${logContext.function}] captureOrCancelManualIntent Returned`, { ...logContext, resultSuccess: captureResult.success, resultStatus: captureResult.status });

      const now = new Date();
      let sessionUpdatePayload = null;
      let paymentUpdatePayload = null;

      if (captureResult.success) {
        const finalSegmentStatus = captureResult.status; 
        const capturedAmountDecimal = captureResult.capturedAmount || 0;
        let finalPaymentStatus;
        switch (finalSegmentStatus) {
            case 'captured': finalPaymentStatus = 'completed'; break;
            case 'partially_captured': finalPaymentStatus = 'partially_refunded'; break; 
            case 'released': finalPaymentStatus = 'cancelled'; break;
            default: finalPaymentStatus = 'failed'; logger.warn(`[${logContext.function}] Unexpected success status from capture: ${finalSegmentStatus}`, logContext);
        }

        sessionUpdatePayload = {
          $set: {
            'overtimeSegments.$[elem].status': finalSegmentStatus,
            'overtimeSegments.$[elem].captureResult': {
              status: 'success', 
              capturedAmount: { amount: capturedAmountDecimal, currency: currency },
              chargeId: captureResult.chargeId, 
              capturedAt: now
            },
            'overtimeSegments.$[elem].finalizedAt': now 
          }
        };
        paymentUpdatePayload = {
          $set: {
            status: finalPaymentStatus,
            'amount.total': capturedAmountDecimal, 
            'amount.captured': capturedAmountDecimal, 
            'stripe.chargeId': captureResult.chargeId || paymentRecord.stripe.chargeId,
            error: null,
            updatedAt: now
          }
        };
         console.log(`[${logContext.function}] Payment ${finalSegmentStatus}. Prepared updates.`, logContext);

      } else {
        logger.error(`[${logContext.function}] Capture/Release FAILED.`, { ...logContext, error: captureResult.error });
        sessionUpdatePayload = {
          $set: {
            'overtimeSegments.$[elem].status': 'failed',
            'overtimeSegments.$[elem].captureResult': { status: 'failed', error: captureResult.error || 'Capture/Release failed', capturedAt: now },
            'overtimeSegments.$[elem].finalizedAt': now 
          }
        };
        paymentUpdatePayload = {
          $set: {
            status: 'capture_failed',
            error: { message: captureResult.error || 'Capture/Release failed', code: captureResult.originalError?.code },
            updatedAt: now
          }
        };
      }

      return {
        success: captureResult.success,
        status: captureResult.success ? captureResult.status : 'failed',
        segmentId: segmentId,
        sessionUpdatePayload: sessionUpdatePayload,
        paymentUpdatePayload: paymentUpdatePayload,
        error: captureResult.success ? null : captureResult.error,
        userId: booking.user?._id?.toString(),
        coachId: booking.coach?._id?.toString(),
        capturedAmount: captureResult.capturedAmount,
        currency: currency,
        paymentIntentId: paymentIntentId,
        originalError: captureResult.originalError
      };

    } catch (error) {
      const errorMsg = `Error during finalizeOvertimePayment: ${error.message}`;
      logger.error(`[${logContext.function}] ${errorMsg}`, {
        ...logContext, errorMessage: error.message, stack: error.stack
      });
      const sessionFailurePayload = {
          $set: { 'overtimeSegments.$[elem].status': 'failed', 
                  'overtimeSegments.$[elem].captureResult': { status: 'failed', error: error.message, capturedAt: new Date() },
                  'overtimeSegments.$[elem].finalizedAt': new Date() 
                }
      };
      const paymentFailurePayload = paymentRecord ? { 
         $set: { status: 'capture_failed', error: { message: error.message }, updatedAt: new Date() }
      } : null;
      const segmentIdOnError = logContext.segmentId ? new mongoose.Types.ObjectId(logContext.segmentId) : null;

      return {
        success: false,
        status: 'failed',
        error: errorMsg,
        sessionUpdatePayload: sessionFailurePayload,
        paymentUpdatePayload: paymentFailurePayload,
        segmentId: segmentIdOnError,
        userId: booking?.user?._id?.toString(),
        coachId: booking?.coach?._id?.toString(),
        paymentIntentId: logContext.paymentIntentId
      };
    }
  }
}

module.exports = new PaymentService();