const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { logger } = require('../utils/logger');

class StripeService {
  constructor() {
    this.stripe = stripe;
    logger.info('[StripeService] Initialized with Stripe API version:', stripe.getApiField('version'));
  }

   static _convertToSmallestUnit(amount, currency) {
    // Basic conversion for 2-decimal currencies like CHF, USD, EUR.
    // For a production system, this should be more robust to handle zero-decimal currencies (e.g., JPY).
    if (typeof amount !== 'number' || isNaN(amount)) {
      logger.warn('[StripeService:_convertToSmallestUnit] Invalid input or NaN detected, returning 0', { inputAmount: amount, currency });
      return 0;
    }
    // Assuming currencies like JPY, KRW, etc., would be passed pre-converted or this function enhanced.
    const roundedAmount = Math.round(amount * 100) / 100; // Avoid floating point issues for intermediary step
    const smallestUnit = Math.round(roundedAmount * 100);

    if (isNaN(smallestUnit)) {
       logger.error('[StripeService:_convertToSmallestUnit] CRITICAL: Conversion resulted in NaN!', { original: amount, rounded: roundedAmount, currency });
       return 0; // Or throw error
    }
    return smallestUnit;
  }

 async createPaymentIntent(amount, currency, customerId, metadata = {}) {
    try {
      // Handle null or undefined amount
      amount = amount || 0;
      
      // Convert to cents and ensure it's an integer
      const amountInCents = StripeService._convertToSmallestUnit(amount, currency);

      // If amount is 0, log it and return null instead of creating a payment intent
      if (amountInCents === 0) {
        logger.info('[StripeService] Skipping payment intent creation for zero amount');
        return null;
      }

      logger.info('[StripeService] Creating payment intent:', { amount: amountInCents, currency, customerId });
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountInCents,
        currency,
        customer: customerId,
        metadata,
        automatic_payment_methods: { enabled: true }
      });
      logger.info('[StripeService] Payment intent created:', { paymentIntentId: paymentIntent.id });
      return paymentIntent;
    } catch (error) {
      logger.error('[StripeService] Error creating payment intent:', {
        error: error.message,
        code: error.code,
        type: error.type
      });
      throw error;
    }
  }

  async createLoginLink(accountId, options = {}) {
    try {
      logger.info('[StripeService] Creating login link for Connect account:', {
        accountId,
        redirectUrl: options.redirect_url || 'Not specified',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
      });
      console.log('[StripeService] Initiating login link creation:', {
        accountId,
        redirectUrl: options.redirect_url,
        timestamp: new Date().toISOString()
      });

      const loginLink = await this.stripe.accounts.createLoginLink(accountId, {
        redirect_url: options.redirect_url
      });

      logger.info('[StripeService] Login link created successfully:', {
        accountId,
        url: loginLink.url,
        timestamp: new Date().toISOString()
      });
      console.log('[StripeService] Login link generated:', {
        accountId,
        url: loginLink.url,
        timestamp: new Date().toISOString()
      });

      return loginLink;
    } catch (error) {
      logger.error('[StripeService] Error creating login link:', {
        error: error.message,
        code: error.code,
        type: error.type,
        accountId,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      console.error('[StripeService] Failed to create login link:', {
        accountId,
        errorMessage: error.message,
        errorCode: error.code,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      logger.info('[StripeService] Confirming payment intent:', { paymentIntentId, paymentMethodId });
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });
      logger.info('[StripeService] Payment intent confirmed:', { paymentIntentId, status: paymentIntent.status });
      return paymentIntent;
    } catch (error) {
      logger.error('[StripeService] Error confirming payment intent:', {
        error: error.message,
        code: error.code,
        type: error.type,
        paymentIntentId
      });
      throw error;
    }
  }

  async createCustomer(email, name, metadata = {}) {
    try {
      logger.info('[StripeService] Creating customer:', { email, name });
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata
      });
      logger.info('[StripeService] Customer created:', { customerId: customer.id });
      return customer;
    } catch (error) {
      logger.error('[StripeService] Error creating customer:', {
        error: error.message,
        code: error.code,
        type: error.type,
        email
      });
      throw error;
    }
  }

  async createConnectAccount(email, country, options = {}) {
    try {
      logger.info('[StripeService] Preparing Connect account creation:', { 
        email, 
        country,
        environment: process.env.NODE_ENV,
        hasBusinessProfile: !!options.business_profile,
        hasMetadata: !!options.metadata
      });
  
      const accountData = {
        type: 'express',
        country,
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        settings: {
          payouts: {
            schedule: {
              interval: 'weekly',
              weekly_anchor: 'monday'
            }
          }
        }
      };
  
      // Only add business_profile in production
      if (process.env.NODE_ENV === 'production' && options.business_profile) {
        logger.info('[StripeService] Adding business profile for production');
        accountData.business_profile = options.business_profile;
      } else {
        logger.debug('[StripeService] Skipping business profile in development mode');
      }
  
      // Always add metadata if provided
      if (options.metadata) {
        logger.debug('[StripeService] Adding account metadata');
        accountData.metadata = options.metadata;
      }
  
      logger.debug('[StripeService] Final account creation data:', {
        type: accountData.type,
        country: accountData.country,
        hasBusinessProfile: !!accountData.business_profile,
        hasMetadata: !!accountData.metadata,
        capabilities: accountData.capabilities
      });
  
      const account = await this.stripe.accounts.create(accountData);
      
      logger.info('[StripeService] Connect account created successfully:', { 
        accountId: account.id,
        email: account.email,
        hasChargesEnabled: account.charges_enabled,
        hasPayoutsEnabled: account.payouts_enabled
      });
      
      return account;
    } catch (error) {
      logger.error('[StripeService] Error creating Connect account:', {
        error: error.message,
        code: error.code,
        type: error.type,
        email,
        rawError: error
      });
      throw error;
    }
  }

  async createAccountLink(accountId, refreshUrl, returnUrl) {
    try {
      logger.info('[StripeService] Creating account link:', { accountId });
      const accountLink = await this.stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
      logger.info('[StripeService] Account link created:', { accountId, url: accountLink.url });
      return accountLink;
    } catch (error) {
      logger.error('[StripeService] Error creating account link:', {
        error: error.message,
        code: error.code,
        type: error.type,
        accountId
      });
      throw error;
    }
  }

  async createTransfer(amount, currency, destinationAccountId, metadata = {}) {
    try {
      logger.info('[StripeService] Creating transfer:', { amount, currency, destinationAccountId });
      const transfer = await this.stripe.transfers.create({
        amount,
        currency,
        destination: destinationAccountId,
        metadata
      });
      logger.info('[StripeService] Transfer created:', { transferId: transfer.id });
      return transfer;
    } catch (error) {
      logger.error('[StripeService] Error creating transfer:', {
        error: error.message,
        code: error.code,
        type: error.type,
        destinationAccountId
      });
      throw error;
    }
  }

   async refundPayment(paymentIntentId, amountDecimal, currency, reason = null) {
    try {
      const amountInSmallestUnit = StripeService._convertToSmallestUnit(amountDecimal, currency);
      if (amountInSmallestUnit <= 0 && amountDecimal > 0) { // Check if conversion failed for a positive amount
           logger.error('[StripeService] Refund amount conversion resulted in zero or less for a positive input.', { paymentIntentId, amountDecimal, currency });
           throw new Error('Invalid refund amount after conversion.');
      }

      const refundParams = {
        payment_intent: paymentIntentId,
        currency: currency.toLowerCase(),
      };

      if (amountInSmallestUnit > 0) {
        refundParams.amount = amountInSmallestUnit;
      }
      if (reason) {
        refundParams.reason = reason;
      }

      logger.info('[StripeService] Processing refund:', { paymentIntentId, amountInSmallestUnit, currency: refundParams.currency, reason });
      const refund = await this.stripe.refunds.create(refundParams);
      logger.info('[StripeService] Refund processed:', { refundId: refund.id, status: refund.status });
      return refund;
    } catch (error) {
      logger.error('[StripeService] Error processing refund:', {
        error: error.message,
        code: error.code,
        type: error.type,
        paymentIntentId,
        amountDecimal,
        currency
      });
      throw error;
    }
  }

  async handleWebhookEvent(rawBody, signature) {
    try {
      logger.info('[StripeService] Processing webhook event');
      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      logger.info('[StripeService] Webhook event processed:', { type: event.type, id: event.id });
      return event;
    } catch (error) {
      logger.error('[StripeService] Error processing webhook:', {
        error: error.message,
        code: error.code,
        type: error.type
      });
      throw error;
    }
  }

  async retrieveConnectAccount(accountId) {
    try {
      logger.info('[StripeService] Retrieving Connect account:', { accountId });
      const account = await this.stripe.accounts.retrieve(accountId);
      logger.info('[StripeService] Connect account retrieved:', { 
        accountId,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted
      });
      return account;
    } catch (error) {
      logger.error('[StripeService] Error retrieving Connect account:', {
        error: error.message,
        code: error.code,
        type: error.type,
        accountId
      });
      throw error;
    }
  }
  
  async updateConnectAccount(accountId, data) {
    try {
      logger.info('[StripeService] Updating Connect account:', { 
        accountId,
        updateFields: Object.keys(data)
      });
      const account = await this.stripe.accounts.update(accountId, data);
      logger.info('[StripeService] Connect account updated:', { accountId });
      return account;
    } catch (error) {
      logger.error('[StripeService] Error updating Connect account:', {
        error: error.message,
        code: error.code,
        type: error.type,
        accountId
      });
      throw error;
    }
  }

  // Add more Stripe-related methods as needed
}

module.exports = new StripeService();