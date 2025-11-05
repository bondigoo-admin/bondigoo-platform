const { logger } = require('../utils/logger');
const i18next = require('i18next');
const TaxService = require('./taxService');
const PriceConfiguration = require('../models/PriceConfiguration');
const Program = require('../models/Program');
const Discount = require('../models/Discount');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { DateTime } = require('luxon');
const mongoose = require('mongoose');

class PriceCalculationError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PriceCalculationError';
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

const _estimateStripeFee = (grossPrice, currency) => {
    const STRIPE_PERCENTAGE = parseFloat(process.env.STRIPE_FEE_PERCENTAGE || '2.9');
    const STRIPE_FIXED_FEE = parseFloat(process.env.STRIPE_FEE_FIXED || '0.30');

    if (grossPrice <= 0) return 0;

    const fee = (grossPrice * (STRIPE_PERCENTAGE / 100)) + STRIPE_FIXED_FEE;
    return parseFloat(fee.toFixed(2));
};

class PricingService {
  
  constructor() {
    this.platformFeePercentage = 9.9;
    this.taxService = new TaxService();
  }

  // VALIDATE PRICE HELPER (PRESERVED)
  validatePrice(price, context = '') {
    if (!price) {
      logger.warn('[PricingService.validatePrice] Invalid price value:', { price, context });
      return null;
    }
    if (typeof price === 'object') {
      if (!price.amount || typeof price.amount !== 'number') {
        logger.warn('[PricingService.validatePrice] Invalid rate amount:', { rate: price, context });
        return null;
      }
      return { amount: price.amount, currency: price.currency || 'CHF' };
    }
    if (typeof price === 'number') {
      return { amount: price, currency: 'CHF' };
    }
    logger.warn('[PricingService.validatePrice] Unsupported price format:', { price, type: typeof price, context });
    return null;
  }

  async calculatePriceFromGross({ grossPrice, currency, coachId, customerLocation }) {
    const finalPrice = grossPrice;

    const taxResult = await this.taxService.calculateTaxForTransaction({
        totalAmount: finalPrice,
        currency,
        customerLocation: customerLocation,
    });

    const netAmountForFeeCalculation = taxResult.netAmount;
    const platformFeeAmount = netAmountForFeeCalculation * (this.platformFeePercentage / 100);
    const estimatedStripeFee = _estimateStripeFee(finalPrice, currency);
    const coachReceives = finalPrice - taxResult.taxAmount - platformFeeAmount - estimatedStripeFee;
    
    return {
        clientPays: parseFloat(finalPrice.toFixed(2)),
        vat: { amount: taxResult.taxAmount, rate: taxResult.taxRate },
        platformFee: { amount: parseFloat(platformFeeAmount.toFixed(2)), percentage: this.platformFeePercentage },
        estimatedStripeFee: estimatedStripeFee,
        coachReceives: parseFloat(coachReceives.toFixed(2)),
        currency
    };
}

async calculateBreakdownsForDisplay({ price, earlyBirdPrice, currency, coachId }) {
    if (!price || price <= 0) {
      return null;
    }

    const standardBreakdown = await this.calculatePriceFromGross({
      grossPrice: price,
      currency,
      coachId
    });

    if (earlyBirdPrice && earlyBirdPrice > 0) {
      const earlyBirdBreakdown = await this.calculatePriceFromGross({
        grossPrice: earlyBirdPrice,
        currency,
        coachId
      });
      standardBreakdown.earlyBird = earlyBirdBreakdown;
    }

    return standardBreakdown;
}

async calculateSessionPrice({ coachId, sessionTypeId, startTime, endTime, timezone = 'Europe/Zurich', userId, priceConfig, discountCode, customerLocation }) {
    const calculationLog = { context: { coachId, sessionTypeId, startTime, endTime, priceConfigVersion: priceConfig?.metadata?.version, discountCode }, steps: [], result: null };

    try {
      const slot = await Booking.findOne({ coach: coachId, start: startTime, isAvailability: true }).lean();
      const isCustomPrice = slot && slot.priceOverride && slot.priceOverride.type === 'custom';

      let grossSessionPrice;
      let currency;
      let baseRateSource;
      let finalPrice;
      let winningDiscount = null;
      
      if (isCustomPrice) {
        logger.debug('[PricingService] Applying custom price override.', { slotId: slot._id });
        const durationInMinutes = (new Date(endTime) - new Date(startTime)) / 60000;
        grossSessionPrice = (durationInMinutes / 60) * slot.priceOverride.customRatePerHour.amount;
        currency = slot.priceOverride.customRatePerHour.currency || 'CHF';
        baseRateSource = 'Custom Price Override';
        calculationLog.steps.push({ step: '1. Custom Price Override', result: grossSessionPrice });

        if (slot.priceOverride.allowDiscounts === false) {
          if (discountCode) {
            throw new PriceCalculationError('This special rate is not eligible for further discounts.', 'DISCOUNTS_NOT_ALLOWED');
          }
          finalPrice = grossSessionPrice;
          calculationLog.steps.push({ step: '2. Discounts Skipped', reason: 'Custom price with discounts disallowed.' });
        } else {
          const { finalPrice: priceWithManualDiscount, appliedDiscount: appliedManualDiscountObj } = await this._applyDiscountCode({
              currentPrice: grossSessionPrice, entityType: 'session', entityId: sessionTypeId, coachId, code: discountCode, userId
          });
          finalPrice = priceWithManualDiscount;
          winningDiscount = appliedManualDiscountObj ? { ...appliedManualDiscountObj, source: 'manual_code' } : null;
          calculationLog.steps.push({ step: '2. Manual Code Offer Only', code: discountCode, result: finalPrice });
        }
      } else {
        // ... (this entire 'else' block for standard pricing remains unchanged)
        if (!priceConfig) throw new PriceCalculationError('No price configuration available', 'INVALID_CONFIG');

        const durationMinutes = DateTime.fromISO(endTime).diff(DateTime.fromISO(startTime), 'minutes').minutes;
        if (durationMinutes <= 0) throw new PriceCalculationError('Invalid session duration', 'INVALID_DURATION');
        calculationLog.steps.push({ step: '1. Duration Calculation', durationMinutes });

        let baseRate = null;
        currency = 'CHF';
        baseRateSource = 'N/A';
        
        const sessionTypeRate = priceConfig.sessionTypeRates?.find(r => r.sessionType.toString() === sessionTypeId);
        if (sessionTypeRate?.rate) {
            baseRate = sessionTypeRate.rate;
            baseRateSource = 'Session Type Rate';
        } else if (priceConfig.baseRate) {
            baseRate = priceConfig.baseRate;
            baseRateSource = 'Coach Base Rate';
        } else {
            throw new PriceCalculationError('No base rate could be determined for the session.', 'NO_RATE_FOUND');
        }
        currency = baseRate.currency || 'CHF';
        calculationLog.steps.push({ step: '2. Base Rate Determination', source: baseRateSource, rate: baseRate });

        grossSessionPrice = this.calculateBasePrice(baseRate, durationMinutes);
        calculationLog.steps.push({ step: '3. Calculate Gross Price', result: grossSessionPrice });

        const applicableTimeRate = this.findApplicableTimeRate(priceConfig.timeBasedRates, startTime, timezone, sessionTypeId);
        const applicableSpecialPeriod = this.findApplicableSpecialPeriod(priceConfig.specialPeriods, startTime, endTime, sessionTypeId);
        
        const automaticRules = [];
        if (applicableTimeRate) automaticRules.push(applicableTimeRate);
        if (applicableSpecialPeriod) automaticRules.push(applicableSpecialPeriod);

        automaticRules.sort((a, b) => (b.rate.amount || 0) - (a.rate.amount || 0));
        const bestAutomaticRule = automaticRules.length > 0 ? automaticRules[0] : null;
        
        let priceWithAutomaticDiscount = grossSessionPrice;
        let appliedAutomaticDiscount = null;

        if (bestAutomaticRule) {
            const discountValue = bestAutomaticRule.rate.amount;
            const discountAmount = grossSessionPrice * (discountValue / 100);
            priceWithAutomaticDiscount = Math.max(0, grossSessionPrice - discountAmount);
            
            appliedAutomaticDiscount = {
                _id: bestAutomaticRule._id.toString(),
                name: bestAutomaticRule.name,
                isTimeBased: !bestAutomaticRule.name,
                dayOfWeek: bestAutomaticRule.dayOfWeek,
                timeRange: bestAutomaticRule.timeRange,
                type: 'percent',
                value: discountValue,
                amountDeducted: parseFloat((grossSessionPrice - priceWithAutomaticDiscount).toFixed(2)),
                source: 'automatic_rule'
            };
        }
        
        calculationLog.steps.push({ step: '4. Best Automatic Offer', winningRule: appliedAutomaticDiscount?.name, result: priceWithAutomaticDiscount });
        
        const { finalPrice: priceWithManualDiscount, appliedDiscount: appliedManualDiscountObj } = await this._applyDiscountCode({
            currentPrice: grossSessionPrice, entityType: 'session', entityId: sessionTypeId, coachId, code: discountCode, userId
        });
        let appliedManualDiscount = appliedManualDiscountObj ? { ...appliedManualDiscountObj, source: 'manual_code' } : null;
        calculationLog.steps.push({ step: '5. Manual Code Offer', code: discountCode, result: priceWithManualDiscount });

        finalPrice = grossSessionPrice;

        if (appliedManualDiscount && appliedAutomaticDiscount) {
            if (priceWithManualDiscount <= priceWithAutomaticDiscount) {
                finalPrice = priceWithManualDiscount;
                winningDiscount = appliedManualDiscount;
            } else {
                finalPrice = priceWithAutomaticDiscount;
                winningDiscount = appliedAutomaticDiscount;
            }
        } else if (appliedManualDiscount) {
            finalPrice = priceWithManualDiscount;
            winningDiscount = appliedManualDiscount;
        } else if (appliedAutomaticDiscount) {
            finalPrice = priceWithAutomaticDiscount;
            winningDiscount = appliedAutomaticDiscount;
        }
        calculationLog.steps.push({ step: '6. Final Price Decision', finalPrice, winningRuleSource: winningDiscount?.source });
      }
      
       let customer;
      let customerLocationData = customerLocation;
      if (!customerLocationData || !customerLocationData.country) {
          if (userId) customer = await User.findById(userId).lean();
          if (customer && customer.billingDetails?.address) {
              customerLocationData = {
                  country: customer.billingDetails.address.countryCode || customer.billingDetails.address.country,
                  postalCode: customer.billingDetails.address.postalCode,
                  ipAddress: customer.taxInfo?.lastIpAddress
              };
          }
      }
  
      const taxResult = await this.taxService.calculateTaxForTransaction({
          totalAmount: finalPrice,
          currency,
          customerLocation: customerLocationData,
          vatNumber: customer?.billingDetails?.vatNumber
      });
      calculationLog.steps.push({ step: '7. Tax Deconstruction', result: taxResult });
      
      const netAmountForFeeCalculation = taxResult.netAmount;
      const platformFeeAmount = netAmountForFeeCalculation * (this.platformFeePercentage / 100);
      const estimatedStripeFee = _estimateStripeFee(finalPrice, currency);
      const coachReceives = finalPrice - taxResult.taxAmount - platformFeeAmount - estimatedStripeFee;
      calculationLog.steps.push({ step: '8. Platform Fee Calculation', platformFeeAmount, basis: netAmountForFeeCalculation });

      const finalResult = {
        base: { amount: { amount: parseFloat(grossSessionPrice.toFixed(2)), currency }, currency },
        final: { amount: { amount: parseFloat(finalPrice.toFixed(2)), currency }, currency },
        netAfterDiscount: parseFloat(netAmountForFeeCalculation.toFixed(2)),
        currency,
        discounts: winningDiscount ? [winningDiscount] : [],
        platformFee: {
          amount: parseFloat(platformFeeAmount.toFixed(2)),
          percentage: this.platformFeePercentage
        },
        vat: {
          amount: taxResult.taxAmount,
          rate: taxResult.taxRate,
          included: true
        },
        estimatedStripeFee: estimatedStripeFee,
        coachReceives: parseFloat(coachReceives.toFixed(2)),
      _calculationDetails: { baseRateSource, winningDiscount }
      };

      calculationLog.result = finalResult;
      logger.debug('[PricingService] Session Price Calculation Trace:', { calculationLog });
      return finalResult;

    } catch (error) {
      calculationLog.error = { message: error.message, code: error.code };
      logger.error('[PricingService] Error during session price calculation:', { calculationLog });
      if (error instanceof PriceCalculationError) throw error;
      throw new PriceCalculationError(error.message || 'An unexpected error occurred during price calculation.', error.code || 'UNEXPECTED_ERROR');
    }
}

async calculateProgramPrice({ programId, coachId, discountCode, userId }) {
    const program = await Program.findById(programId).populate('coach').lean();
    if (!program) throw new PriceCalculationError('Program not found.', 'NOT_FOUND');

    const startingPrice = program.salePrice?.amount ?? program.basePrice.amount;
    const currency = program.salePrice?.currency ?? program.basePrice.currency;
    
    const { finalPrice: discountedInclusivePrice, appliedDiscount } = await this._applyDiscountCode({
        currentPrice: startingPrice, entityType: 'program', entityId: programId, coachId: program.coach._id, code: discountCode, userId
    });
    
    const customer = await User.findById(userId).lean();
    const customerLocationData = {
        country: customer?.billingDetails?.address?.countryCode || customer?.billingDetails?.address?.country,
        postalCode: customer?.billingDetails?.address?.postalCode,
        ipAddress: customer?.taxInfo?.lastIpAddress
    };
    
    const taxResult = await this.taxService.calculateTaxForTransaction({
        totalAmount: discountedInclusivePrice,
        currency,
        customerLocation: customerLocationData,
        vatNumber: customer?.billingDetails?.vatNumber
    });
    
    const netAmountForFeeCalculation = discountedInclusivePrice;
    const platformFeeAmount = netAmountForFeeCalculation * (this.platformFeePercentage / 100);

    return {
        base: { amount: { amount: parseFloat(startingPrice.toFixed(2)), currency }, currency },
        final: { amount: { amount: parseFloat(discountedInclusivePrice.toFixed(2)), currency }, currency },
        netAfterDiscount: parseFloat((taxResult.netAmount ?? discountedInclusivePrice).toFixed(2)),
        currency,
        discounts: appliedDiscount ? [appliedDiscount] : [],
        platformFee: {
          amount: parseFloat(platformFeeAmount.toFixed(2)),
          percentage: this.platformFeePercentage
        },
        vat: {
          amount: taxResult.taxAmount,
          rate: taxResult.taxRate,
          included: true
        },
        _calculationDetails: { appliedDiscount }
    };
}

async _applyDiscountCode({ currentPrice, entityType, entityId, coachId, code, userId }) {
    // This function from V3 is correct and can remain as is.
    if (!code) return { finalPrice: currentPrice, appliedDiscount: null };

    const discount = await Discount.findOne({ coach: coachId, code: code.toUpperCase().trim(), isActive: true });
    if (!discount) throw new PriceCalculationError("Invalid or expired discount code.", "INVALID_OR_EXPIRED_CODE");

    const now = new Date();
    if (discount.startDate && now < discount.startDate) throw new PriceCalculationError('This discount is not active yet.', 'DISCOUNT_NOT_ACTIVE_YET');
    if (discount.expiryDate && now > discount.expiryDate) throw new PriceCalculationError('This discount has expired.', 'DISCOUNT_EXPIRED');
    if (discount.usageLimit && discount.timesUsed >= discount.usageLimit) throw new PriceCalculationError('This discount has reached its usage limit.', 'USAGE_LIMIT_REACHED');
    if (discount.minimumPurchaseAmount && currentPrice < discount.minimumPurchaseAmount) {
        throw new PriceCalculationError('The order total does not meet the minimum for this discount.', 'MINIMUM_PURCHASE_NOT_MET', { amount: discount.minimumPurchaseAmount, currency: 'CHF' });
    }
    if (discount.limitToOnePerCustomer) {
        if (!userId) throw new PriceCalculationError('You must be logged in to use this discount.', 'LOGIN_REQUIRED');
        const usage = await mongoose.model('DiscountUsage').findOne({ discount: discount._id, user: userId });
        if (usage) throw new PriceCalculationError('You have already used this discount code.', 'ALREADY_USED');
    }

    const entityObjectId = new mongoose.Types.ObjectId(entityId);
    let isApplicable = false;
    switch (discount.appliesTo.scope) {
        case 'platform_wide': isApplicable = true; break;
        case 'all_programs': isApplicable = (entityType === 'program'); break;
        case 'specific_programs': isApplicable = (entityType === 'program' && discount.appliesTo.entityIds.some(id => id.equals(entityObjectId))); break;
        case 'all_sessions': isApplicable = (entityType === 'session'); break;
        case 'specific_session_types': isApplicable = (entityType === 'session' && discount.appliesTo.entityIds.some(id => id.equals(entityObjectId))); break;
    }

    if (!isApplicable) throw new PriceCalculationError("This code is not valid for the selected item.", 'NOT_APPLICABLE_TO_ITEM');

    let discountAmount = 0;
    if (discount.type === 'percent') {
        discountAmount = currentPrice * (discount.value / 100);
    } else {
        discountAmount = discount.value;
    }

    const finalPrice = Math.max(0, currentPrice - discountAmount);
    const actualAmountDeducted = currentPrice - finalPrice;

    const appliedDiscount = {
        _id: discount._id.toString(),
        code: discount.code,
        type: discount.type,
        value: discount.value,
        amountDeducted: parseFloat(actualAmountDeducted.toFixed(2))
    };
    
    return { finalPrice, appliedDiscount };
  }

   async applyPriceOverrides({
    priceConfig,
    sessionTypeId,
    startTime,
    endTime,
    timezone,
    duration,
    participantCount,
    currentRate
  }) {
    let finalRate = { ...currentRate };

    const sessionOverrideRule = priceConfig.sessionTypeOverrides?.find(override =>
      override.sessionType.equals(sessionTypeId) &&
      override.active &&
      this.meetsConditions(override.conditions, { duration, participantCount })
    );

    const timeBasedRule = this.findApplicableTimeRate(
      priceConfig.timeBasedRates,
      startTime,
      timezone,
      sessionTypeId
    );

    const specialPeriodRule = this.findApplicableSpecialPeriod(
      priceConfig.specialPeriods,
      startTime,
      endTime,
      sessionTypeId
    );

    const applicableRules = [];
    if (sessionOverrideRule) {
      applicableRules.push({ type: 'absolute', priority: sessionOverrideRule.priority || 0, rule: sessionOverrideRule });
    }
    if (timeBasedRule) {
      applicableRules.push({ type: 'percentage', priority: timeBasedRule.priority || 0, rule: timeBasedRule });
    }
    if (specialPeriodRule) {
      applicableRules.push({ type: 'percentage', priority: specialPeriodRule.priority || 0, rule: specialPeriodRule });
    }

    if (applicableRules.length === 0) {
      return finalRate;
    }

    applicableRules.sort((a, b) => b.priority - a.priority);
    const winningRule = applicableRules[0];

    if (winningRule.type === 'absolute') {
      finalRate = winningRule.rule.rate;
    } else if (winningRule.type === 'percentage') {
      const discountPercentage = winningRule.rule.rate.amount;
      const newAmount = finalRate.amount * (1 - discountPercentage / 100);
      finalRate.amount = parseFloat(newAmount.toFixed(2));
    }

    logger.debug('[PricingService] Applied price override:', {
      winningRuleType: winningRule.type,
      winningRuleName: winningRule.rule.name,
      initialRate: currentRate.amount,
      finalRate: finalRate.amount,
    });

    return finalRate;
  }

  calculateDiscounts({
    priceConfig,
    basePrice,
    isConnected,
    startTime,
    bookingTime = new Date(),
    connectionDuration = 0
  }) {
    const userType = isConnected ? 'connected' : 'all';
    const advanceHours = DateTime.fromISO(startTime)
      .diff(DateTime.fromISO(bookingTime), 'hours').hours;
    
    const applicableDiscounts = priceConfig.findApplicableDiscounts(basePrice, advanceHours, userType);
    
    console.log('[PricingService] Calculating discounts:', {
      basePrice,
      isConnected,
      advanceHours,
      userType,
      applicableDiscountsCount: applicableDiscounts.length
    });
  
    // Add automatic discounts first
    const autoDiscounts = [];
    
    // Early booking discount
    const earlyBookingDiscount = this.calculateEarlyBookingDiscount(basePrice, bookingTime, startTime);
    if (earlyBookingDiscount > 0) {
      autoDiscounts.push({
        type: 'early_bird',
        amount: earlyBookingDiscount,
        description: 'Early booking discount'
      });
    }
  
    // Connection discount
    const connectionDiscount = this.calculateConnectionDiscount(basePrice, isConnected, connectionDuration);
    if (connectionDiscount > 0) {
      autoDiscounts.push({
        type: 'connection',
        amount: connectionDiscount,
        description: 'Connected client discount'
      });
    }
  
    // Combine with configured discounts
    return [...autoDiscounts, ...applicableDiscounts.map(discount => {
      const discountAmount = discount.isPercentage 
        ? (basePrice * discount.value / 100)
        : discount.value;
      
      return {
        type: discount.type,
        amount: Math.min(discountAmount, discount.conditions?.maxDiscountAmount || Infinity),
        description: `${discount.type} discount`
      };
    })];
  }

  meetsConditions(conditions, { duration, participantCount }) {
    if (!conditions) return true;

    if (conditions.minDuration && duration < conditions.minDuration) return false;
    if (conditions.maxDuration && duration > conditions.maxDuration) return false;
    
    if (conditions.participantCount) {
      if (conditions.participantCount.min && participantCount < conditions.participantCount.min) return false;
      if (conditions.participantCount.max && participantCount > conditions.participantCount.max) return false;
    }

    return true;
  }

  findApplicableTimeRate(timeBasedRates, startTime, timezone, sessionTypeId) {
    const sessionDateTime = DateTime.fromISO(startTime).setZone(timezone);
    const dayOfWeek = sessionDateTime.weekday % 7; // 0-6, Sunday-Saturday
    const timeString = sessionDateTime.toFormat('HH:mm');
  
    logger.debug('[PricingService] Finding applicable time rate:', {
      sessionTypeId,
      dayOfWeek,
      timeString,
      ratesCount: timeBasedRates?.length
    });
    
    if (!timeBasedRates) {
        return null;
    }
  
    return timeBasedRates
      .filter(rate => rate.active)
      .find(rate => {
        const sessionTypeMatch = rate.sessionTypes.some(st => st.toString() === sessionTypeId);
        return sessionTypeMatch &&
               rate.dayOfWeek.includes(dayOfWeek) &&
               timeString >= rate.timeRange.start &&
               timeString <= rate.timeRange.end;
      });
  }

  calculateBasePrice(rate, duration) {
    if (!rate || typeof rate.amount !== 'number') {
      logger.warn('[PricingService.calculateBasePrice] Invalid rate:', { rate });
      return 0;
    }
    
    // Convert hourly rate to per-minute rate and calculate total
    const perMinuteRate = rate.amount / 60;
    return Math.round(perMinuteRate * duration * 100) / 100; // Round to 2 decimal places
  }

  applySessionTypeRate(basePrice, priceConfig, sessionTypeId, duration) {
    logger.debug('[PricingService.applySessionTypeRate] Starting calculation:', {
      basePrice,
      sessionTypeId,
      duration,
      hasConfig: !!priceConfig,
      configSessionTypes: priceConfig?.sessionTypeRates?.length || 0
    });
  
    // Validate base price first
    const validatedBasePrice = this.validatePrice(basePrice, 'basePrice');
    if (!validatedBasePrice) {
      logger.warn('[PricingService.applySessionTypeRate] Invalid base price, using 0');
      return { amount: 0, currency: 'CHF' };
    }
  
    if (!sessionTypeId || !duration) {
      logger.warn('[PricingService.applySessionTypeRate] Missing required parameters:', {
        hasSessionType: !!sessionTypeId,
        hasDuration: !!duration,
        duration
      });
      return validatedBasePrice;
    }
  
    // Find and validate session type rate
    const sessionTypeRate = priceConfig?.sessionTypeRates?.find(
      rate => rate.sessionType.toString() === sessionTypeId
    );
  
    if (!sessionTypeRate) {
      logger.debug('[PricingService.applySessionTypeRate] No specific rate found, using base price:', {
        basePrice: validatedBasePrice.amount,
        currency: validatedBasePrice.currency
      });
      return validatedBasePrice;
    }
  
    // Validate session type rate
    const validatedRate = this.validatePrice(sessionTypeRate.rate, 'sessionTypeRate');
    if (!validatedRate) {
      logger.warn('[PricingService.applySessionTypeRate] Invalid session rate, using base price:', {
        invalidRate: sessionTypeRate.rate,
        usingBasePrice: validatedBasePrice.amount
      });
      return validatedBasePrice;
    }
  
    // Calculate hourly rate to per-minute rate
    const perMinuteRate = validatedRate.amount / 60;
    const calculatedAmount = Math.round(perMinuteRate * duration);
  
    logger.debug('[PricingService.applySessionTypeRate] Calculation completed:', {
      perMinuteRate,
      duration,
      calculatedAmount,
      currency: validatedRate.currency
    });
  
    return {
      amount: calculatedAmount,
      currency: validatedRate.currency
    };
  }

 findApplicableSpecialPeriod(specialPeriods, startTime, endTime, sessionTypeId) {
    if (!specialPeriods || specialPeriods.length === 0) return null;

    const sessionStart = DateTime.fromISO(startTime);

    const applicablePeriods = specialPeriods
      .filter(period => {
        if (!period.active) return false;

        const periodStart = DateTime.fromJSDate(period.startDate);
        const periodEnd = DateTime.fromJSDate(period.endDate);

        const isWithinDateRange = sessionStart >= periodStart && sessionStart < periodEnd;
        const sessionTypeMatch = period.sessionTypes.some(st => st.toString() === sessionTypeId);

        logger.debug('[PricingService] Evaluating Special Period:', {
          periodName: period.name,
          priority: period.priority,
          sessionTypeMatch,
          isWithinDateRange,
          sessionStart: sessionStart.toISO(),
          periodStart: periodStart.toISO(),
          periodEnd: periodEnd.toISO(),
        });

        return isWithinDateRange && sessionTypeMatch;
      });

    if (applicablePeriods.length === 0) {
      return null;
    }

    // Sort by priority to find the best match
    applicablePeriods.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    logger.debug('[PricingService] Found applicable special period after sorting by priority:', {
      bestMatch: applicablePeriods[0].name,
      priority: applicablePeriods[0].priority,
    });
    
    return applicablePeriods[0];
  }

  calculateDuration(startTime, endTime) {
    return Math.floor((new Date(endTime) - new Date(startTime)) / (1000 * 60));
  }

  calculateBasePrice(rate, duration) {
    // Convert hourly rate to per-minute rate and calculate total
    const perMinuteRate = rate.amount / 60;
    return Math.round(perMinuteRate * duration * 100) / 100; // Round to 2 decimal places
  }

  // Add platform fee calculation method
  calculatePlatformFee(basePrice) {
    const amount = Math.round(basePrice * (this.platformFeePercentage / 100) * 100) / 100;
    const vat = this.taxService.calculateVAT(amount);
    return { amount, vat };
  }

  // Add coach payout calculation method
  calculateCoachPayout(basePrice, platformFee, vatCalculation) {
    return Math.round((basePrice - platformFee.amount - vatCalculation.vatAmount) * 100) / 100;
  }

  calculateEarlyBookingDiscount(basePrice, bookingTime, sessionTime) {
    const hoursBeforeSession = DateTime.fromISO(sessionTime)
      .diff(DateTime.fromISO(bookingTime), 'hours').hours;
    
    logger.debug('[PricingService] Calculating early booking discount:', {
      hoursBeforeSession,
      basePrice
    });
  
    // Example tiers: >72h: 15%, >48h: 10%, >24h: 5%
    if (hoursBeforeSession >= 72) return basePrice * 0.15;
    if (hoursBeforeSession >= 48) return basePrice * 0.10;
    if (hoursBeforeSession >= 24) return basePrice * 0.05;
    return 0;
  }
  
  calculateConnectionDiscount(basePrice, isConnected, connectionDuration) {
    if (!isConnected) return 0;
  
    logger.debug('[PricingService] Calculating connection discount:', {
      isConnected,
      connectionDuration,
      basePrice
    });
  
    // Example: 10% discount for connected clients
    return basePrice * 0.10;
  }

  async calculateWebinarRegistrationPrice({ webinarBookingId, userId, discountCode, customerLocation }) {
    const calculationLog = { context: { webinarBookingId, userId, discountCode }, steps: [], result: null };
    try {
        const webinarBooking = await Booking.findById(webinarBookingId).populate('coach');
        if (!webinarBooking) throw new PriceCalculationError('Webinar booking not found.', 'NOT_FOUND');

        const normalizedPrice = webinarBooking.getPrice();

        const WEBINAR_TYPE_ID_STRING = '66ec54f94a8965b22af33fd9';
        if (webinarBooking.sessionType.toString() !== WEBINAR_TYPE_ID_STRING) {
            throw new PriceCalculationError('This booking is not a webinar.', 'INVALID_ENTITY_TYPE');
        }

        const grossPrice = normalizedPrice?.final?.amount?.amount;
          if (typeof grossPrice !== 'number') {
              throw new PriceCalculationError('Webinar price is not configured correctly.', 'INVALID_CONFIG');
          }
          const currency = normalizedPrice.currency || 'CHF';
        calculationLog.steps.push({ step: '1. Gross Price from Document', result: grossPrice, currency });

        let priceWithAutomaticDiscount = grossPrice;
        let appliedAutomaticDiscount = null;
        if (webinarBooking.earlyBirdPrice != null && webinarBooking.earlyBirdDeadline && new Date() < new Date(webinarBooking.earlyBirdDeadline)) {
            priceWithAutomaticDiscount = webinarBooking.earlyBirdPrice;
            appliedAutomaticDiscount = {
                name: 'Early Bird Offer',
                type: 'fixed_offer',
                value: priceWithAutomaticDiscount,
                amountDeducted: parseFloat((grossPrice - priceWithAutomaticDiscount).toFixed(2)),
                source: 'automatic_rule'
            };
        }
        calculationLog.steps.push({ step: '2. Automatic Offer (Early Bird)', result: priceWithAutomaticDiscount });

        const { finalPrice: priceWithManualDiscount, appliedDiscount: appliedManualDiscountObj } = await this._applyDiscountCode({
            currentPrice: grossPrice,
            entityType: 'session',
            entityId: webinarBooking.sessionType,
            coachId: webinarBooking.coach._id,
            code: discountCode,
            userId
        });
        const appliedManualDiscount = appliedManualDiscountObj ? { ...appliedManualDiscountObj, source: 'manual_code' } : null;
        calculationLog.steps.push({ step: '3. Manual Code Offer', code: discountCode, result: priceWithManualDiscount });

        let finalPrice = grossPrice;
        let winningDiscount = null;

        if (appliedManualDiscount && appliedAutomaticDiscount) {
            if (priceWithManualDiscount <= priceWithAutomaticDiscount) {
                finalPrice = priceWithManualDiscount;
                winningDiscount = appliedManualDiscount;
            } else {
                finalPrice = priceWithAutomaticDiscount;
                winningDiscount = appliedAutomaticDiscount;
            }
        } else if (appliedManualDiscount) {
            finalPrice = priceWithManualDiscount;
            winningDiscount = appliedManualDiscount;
        } else if (appliedAutomaticDiscount) {
            finalPrice = priceWithAutomaticDiscount;
            winningDiscount = appliedAutomaticDiscount;
        }
        calculationLog.steps.push({ step: '4. Final Price Decision', finalPrice, winningRuleSource: winningDiscount?.source });

        let customer;
        let customerLocationData = customerLocation;
        if (!customerLocationData && userId) {
            customer = await User.findById(userId).lean();
            if (customer?.billingDetails?.address) {
                customerLocationData = {
                    country: customer.billingDetails.address.countryCode || customer.billingDetails.address.country,
                    postalCode: customer.billingDetails.address.postalCode,
                    ipAddress: customer.taxInfo?.lastIpAddress
                };
            }
        }
        const taxResult = await this.taxService.calculateTaxForTransaction({
            totalAmount: finalPrice,
            currency,
            customerLocation: customerLocationData,
        });
        const netAmountForFeeCalculation = taxResult.netAmount;
        const platformFeeAmount = netAmountForFeeCalculation * (this.platformFeePercentage / 100);

        const finalResult = {
            base: { amount: { amount: parseFloat(grossPrice.toFixed(2)), currency }, currency },
            final: { amount: { amount: parseFloat(finalPrice.toFixed(2)), currency }, currency },
            netAfterDiscount: parseFloat(netAmountForFeeCalculation.toFixed(2)),
            currency,
            discounts: winningDiscount ? [winningDiscount] : [],
            platformFee: {
                amount: parseFloat(platformFeeAmount.toFixed(2)),
                percentage: this.platformFeePercentage
            },
            vat: {
                amount: taxResult.taxAmount,
                rate: taxResult.taxRate,
                included: true
            },
            _calculationDetails: { winningDiscount }
        };

        calculationLog.result = finalResult;
        logger.debug('[PricingService] Webinar Registration Price Calculation Trace:', { calculationLog });
        return finalResult;
    } catch (error) {
        calculationLog.error = { message: error.message, code: error.code };
        logger.error('[PricingService] Error during webinar registration price calculation:', { calculationLog });
        if (error instanceof PriceCalculationError) throw error;
        throw new PriceCalculationError(error.message || 'An unexpected error occurred during price calculation.', 'UNEXPECTED_ERROR');
    }
}
}

module.exports = new PricingService();
module.exports.PriceCalculationError = PriceCalculationError;