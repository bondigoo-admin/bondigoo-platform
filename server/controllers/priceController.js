const { logger } = require('../utils/logger');
const PricingService = require('../services/PricingService');
const { PriceCalculationError } = require('../services/PricingService');
const PriceConfiguration = require('../models/PriceConfiguration');
const Coach = require('../models/Coach');
const Connection = require('../models/Connection');
const Program = require('../models/Program');
const { DateTime } = require('luxon');
const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const cacheConfig = require('../config/cache');
const cacheService = require('../services/cacheService');
const { promisify } = require('util');
const TaxService = require('../services/taxService');

const validateUserId = (userId) => {
  if (!userId || !isValidObjectId(userId)) {
    logger.warn('[priceController] Invalid userId format:', { 
      userId,
      validationError: 'Invalid or missing userId'
    });
    return false;
  }
  return true;
};

// Helper function to find or create price configuration

const getOrCreatePriceConfig = async (userId, session = null) => {
  console.log('[priceController] Finding/creating price config:', { userId });

  let config = await PriceConfiguration.findOne({ user: userId }).session(session);
  
  if (!config) {
    console.log('[priceController] No existing config found, creating new config for user:', { userId });
    
    // First verify the coach exists
    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      logger.error('[priceController] Attempted to create price config for non-existent coach:', { userId });
      throw new Error('Coach not found');
    }

    config = new PriceConfiguration({
      user: userId,  // Store the userId directly
      baseRate: { amount: 0, currency: 'CHF' },
      liveSessionRate: { amount: 1.5, currency: 'CHF' },
      sessionTypeRates: [],
      timeBasedRates: [],
      specialPeriods: [],
      metadata: {
        version: 1,
        lastCalculation: new Date(),
        createdAt: new Date()
      }
    });

    console.log('[priceController] Created new price config object:', { 
      userId,
      configData: {
        baseRate: config.baseRate,
        hasSessionTypeRates: config.sessionTypeRates.length > 0,
        hasTimeBasedRates: config.timeBasedRates.length > 0,
        hasSpecialPeriods: config.specialPeriods.length > 0,
        version: config.metadata.version
      }
    });
    
    if (session) {
      await config.save({ session });
    } else {
      await config.save();
    }
    
    console.log('[priceController] Successfully saved new price config:', {
      userId,
      configId: config._id
    });
  }
  
  return config;
};

const transformConfigData = (rawData) => {
  console.log('[priceController.transformConfigData] Transforming config data:', {
    rawDataKeys: Object.keys(rawData)
  });

  return {
    baseRate: rawData.baseRate,
    sessionTypeRates: (rawData.sessionTypeRates || []).map(rate => ({
      sessionType: rate.sessionType,
      rate: {
        amount: parseFloat(rate.rate),
        currency: rate.currency || 'CHF'
      }
    })),
    timeBasedRates: (rawData.timeBasedRates || []).map(rate => ({
      dayOfWeek: rate.daysOfWeek,
      timeRange: {
        start: rate.timeRange.start,
        end: rate.timeRange.end
      },
      rate: {
        amount: parseFloat(rate.discountPercentage),
        currency: 'CHF'
      },
      timezone: rate.timezone || 'Europe/Zurich',
      active: rate.active !== false
    })),
    specialPeriods: (rawData.specialPeriods || []).map(period => ({
      name: period.name,
      description: period.description,
      rate: {
        amount: parseFloat(period.discountPercentage),
        currency: 'CHF'
      },
      startDate: new Date(period.startDate),
      endDate: new Date(period.endDate),
      active: period.active !== false
    }))
  };
};

// Update base rate

exports.updateBaseRate = async (req, res) => {
  const session = await mongoose.startSession();
  const startTime = Date.now();
  session.startTransaction();

  try {
    const { userId } = req.params;
    const { baseRate } = req.body;

    console.log('[priceController.updateBaseRate] Starting update:', {
      userId,
      requestedRate: baseRate,
      requestingUserId: req.user?._id
    });

    if (!validateUserId(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    // Verify user exists and is a coach
    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.updateBaseRate] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    // Authorization check
    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.updateBaseRate] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }

    const config = await getOrCreatePriceConfig(userId, session);
    
    // Validate currency
    if (!['CHF', 'EUR', 'USD'].includes(baseRate.currency)) {
      logger.warn('[priceController.updateBaseRate] Invalid currency:', { 
        currency: baseRate.currency,
        userId 
      });
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid currency' });
    }

    // Update base rate
    config.baseRate = {
      amount: Number(baseRate.amount),
      currency: baseRate.currency
    };
    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    console.log('[priceController.updateBaseRate] Saving updated configuration:', {
      userId,
      configId: config._id,
      newBaseRate: config.baseRate,
      version: config.metadata.version
    });

    await config.save({ session });
    await session.commitTransaction();

    // Clear relevant cache entries if they exist
    const cacheKey = `price:${userId}:*`;
    try {
      await cacheService.deletePattern(cacheKey);
      console.log('[priceController.updateBaseRate] Cache cleared:', { userId, pattern: cacheKey });
    } catch (cacheError) {
      logger.warn('[priceController.updateBaseRate] Cache clear failed:', { 
        error: cacheError.message,
        userId 
      });
      // Don't fail the request for cache issues
    }

    console.log('[priceController.updateBaseRate] Update successful:', {
      userId,
      configId: config._id,
      newBaseRate: config.baseRate,
      executionTime: Date.now() - startTime
    });

    res.json({
      success: true,
      config: {
        baseRate: config.baseRate,
        version: config.metadata.version,
        lastUpdated: config.metadata.lastCalculation
      }
    });

  } catch (error) {
    // Only abort if the transaction is still in progress
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('[priceController.updateBaseRate] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId
    });
    
    res.status(500).json({ 
      message: 'Error updating base rate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

// Update session type rate

exports.updateSessionTypeRate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, typeId } = req.params;
    const { rate } = req.body;

    console.log('[priceController.updateSessionTypeRate] Starting update:', {
      userId,
      typeId,
      rate
    });

    if (!validateUserId(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    // Verify user exists and is a coach
    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.updateSessionTypeRate] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    // Authorization check
    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.updateSessionTypeRate] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }

    const config = await getOrCreatePriceConfig(userId, session);
    
    // Handle rate removal
    if (rate === null) {
      console.log('[priceController.updateSessionTypeRate] Removing rate for session type:', {
        userId,
        typeId
      });
      
      config.sessionTypeRates = config.sessionTypeRates.filter(
        r => r.sessionType.toString() !== typeId
      );
    } else {
      // Validate rate data
      if (!rate.amount || !rate.currency || !['CHF', 'EUR', 'USD'].includes(rate.currency)) {
        logger.warn('[priceController.updateSessionTypeRate] Invalid rate data:', { 
          rate,
          userId,
          typeId
        });
        await session.abortTransaction();
        return res.status(400).json({ message: 'Invalid rate data' });
      }

      const rateIndex = config.sessionTypeRates.findIndex(
        r => r.sessionType.toString() === typeId
      );

      if (rateIndex === -1) {
        console.log('[priceController.updateSessionTypeRate] Adding new session type rate:', {
          userId,
          typeId
        });
        
        config.sessionTypeRates.push({
          sessionType: typeId,
          rate: {
            amount: Number(rate.amount),
            currency: rate.currency
          }
        });
      } else {
        console.log('[priceController.updateSessionTypeRate] Updating existing session type rate:', {
          userId,
          typeId,
          existingRate: config.sessionTypeRates[rateIndex]
        });
        
        config.sessionTypeRates[rateIndex].rate = {
          amount: Number(rate.amount),
          currency: rate.currency
        };
      }
    }

    // Update metadata
    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    console.log('[priceController.updateSessionTypeRate] Saving configuration:', {
      userId,
      configId: config._id,
      version: config.metadata.version
    });

    await config.save({ session });
    await session.commitTransaction();

    // Clear cache
    const cacheKey = `price:${userId}:${typeId}:*`;
    try {
      await cacheService.deletePattern(cacheKey);
      console.log('[priceController.updateSessionTypeRate] Cache cleared:', { userId, typeId, pattern: cacheKey });
    } catch (cacheError) {
      logger.warn('[priceController.updateSessionTypeRate] Cache clear failed:', { 
        error: cacheError.message,
        userId,
        typeId
      });
    }

    console.log('[priceController.updateSessionTypeRate] Update successful:', {
      userId,
      typeId,
      newRate: rate,
      configVersion: config.metadata.version
    });

    res.json({
      success: true,
      config: {
        baseRate: config.baseRate,
        sessionTypeRates: config.sessionTypeRates,
        timeBasedRates: config.timeBasedRates,
        specialPeriods: config.specialPeriods,
        version: config.metadata.version,
        lastUpdated: config.metadata.lastCalculation
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('[priceController.updateSessionTypeRate] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId,
      typeId: req.params.typeId
    });
    
    res.status(500).json({ 
      message: 'Error updating session type rate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

// Time-based rate operations

exports.addTimeBasedRate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;
    const rateData = req.body;

    console.log('[priceController.addTimeBasedRate] Starting addition:', {
      userId,
      rateData: {
        sessionTypes: rateData.sessionTypes,
        dayOfWeek: rateData.dayOfWeek,
        timeRange: rateData.timeRange
      }
    });

    if (!validateUserId(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.addTimeBasedRate] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.addTimeBasedRate] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }

    const config = await getOrCreatePriceConfig(userId, session);
    
    const newRate = {
      sessionTypes: rateData.sessionTypes,
      dayOfWeek: rateData.dayOfWeek,
      timeRange: rateData.timeRange,
      rate: {
        amount: Number(rateData.rate.amount),
        isPercentage: true
      },
      timezone: rateData.timezone || 'Europe/Zurich'
    };

    console.log('[priceController.addTimeBasedRate] Adding new rate:', {
      userId,
      newRate: {
        sessionTypesCount: newRate.sessionTypes.length,
        daysOfWeek: newRate.dayOfWeek,
        timeRange: newRate.timeRange
      }
    });

    config.timeBasedRates.push(newRate);
    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    await config.save({ session });
    await session.commitTransaction();

    for (const sessionTypeId of rateData.sessionTypes) {
      const cacheKey = `price:${userId}:${sessionTypeId}:*`;
      try {
        await cacheService.deletePattern(cacheKey);
        console.log('[priceController.addTimeBasedRate] Cache cleared:', { 
          userId, 
          sessionTypeId,
          pattern: cacheKey 
        });
      } catch (cacheError) {
        logger.warn('[priceController.addTimeBasedRate] Cache clear failed:', { 
          error: cacheError.message,
          userId,
          sessionTypeId
        });
      }
    }

    console.log('[priceController.addTimeBasedRate] Addition successful:', {
      userId,
      newRateId: config.timeBasedRates[config.timeBasedRates.length - 1]._id,
      configVersion: config.metadata.version
    });

    res.json({
      success: true,
      config: {
        timeBasedRates: config.timeBasedRates,
        version: config.metadata.version,
        lastUpdated: config.metadata.lastCalculation
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('[priceController.addTimeBasedRate] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId
    });
    
    res.status(500).json({ 
      message: 'Error adding time-based rate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

exports.updateTimeBasedRate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, rateId } = req.params;
    const rateData = req.body;

    console.log('[priceController.updateTimeBasedRate] Starting update:', {
      userId,
      rateId,
      rateData: {
        sessionTypes: rateData.sessionTypes,
        dayOfWeek: rateData.dayOfWeek,
        timeRange: rateData.timeRange
      }
    });

    if (!validateUserId(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.updateTimeBasedRate] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.updateTimeBasedRate] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }

    const config = await getOrCreatePriceConfig(userId, session);
    
    const rateIndex = config.timeBasedRates.findIndex(
      r => r._id.toString() === rateId
    );

    if (rateIndex === -1) {
      logger.warn('[priceController.updateTimeBasedRate] Rate not found:', {
        userId,
        rateId
      });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Time-based rate not found' });
    }

    const oldSessionTypes = config.timeBasedRates[rateIndex].sessionTypes;

    config.timeBasedRates[rateIndex] = {
      ...config.timeBasedRates[rateIndex].toObject(),
      sessionTypes: rateData.sessionTypes,
      dayOfWeek: rateData.dayOfWeek,
      timeRange: rateData.timeRange,
      rate: {
        amount: Number(rateData.rate.amount),
        isPercentage: true
      },
      timezone: rateData.timezone || config.timeBasedRates[rateIndex].timezone,
      active: rateData.active ?? config.timeBasedRates[rateIndex].active
    };

    console.log('[priceController.updateTimeBasedRate] Updating rate:', {
      userId,
      rateId,
      updatedRate: {
        sessionTypesCount: config.timeBasedRates[rateIndex].sessionTypes.length,
        daysOfWeek: config.timeBasedRates[rateIndex].dayOfWeek,
        timeRange: config.timeBasedRates[rateIndex].timeRange
      }
    });

    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    await config.save({ session });
    await session.commitTransaction();

    const sessionTypesToInvalidate = new Set([
      ...oldSessionTypes.map(st => st.toString()),
      ...rateData.sessionTypes.map(st => st.toString())
    ]);

    for (const sessionTypeId of sessionTypesToInvalidate) {
      const cacheKey = `price:${userId}:${sessionTypeId}:*`;
      try {
        await cacheService.deletePattern(cacheKey);
        console.log('[priceController.updateTimeBasedRate] Cache cleared:', { 
          userId, 
          sessionTypeId,
          pattern: cacheKey 
        });
      } catch (cacheError) {
        logger.warn('[priceController.updateTimeBasedRate] Cache clear failed:', { 
          error: cacheError.message,
          userId,
          sessionTypeId
        });
      }
    }

    console.log('[priceController.updateTimeBasedRate] Update successful:', {
      userId,
      rateId,
      configVersion: config.metadata.version
    });

    res.json({
      success: true,
      config: {
        timeBasedRates: config.timeBasedRates,
        version: config.metadata.version,
        lastUpdated: config.metadata.lastCalculation
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('[priceController.updateTimeBasedRate] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId,
      rateId: req.params.rateId
    });
    
    res.status(500).json({ 
      message: 'Error updating time-based rate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

// In priceController.js, replace the entire removeTimeBasedRate function:

exports.removeTimeBasedRate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, rateId } = req.params;

    console.log('[priceController.removeTimeBasedRate] Starting removal:', {
      userId,
      rateId
    });

    if (!validateUserId(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.removeTimeBasedRate] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    // Authorization check
    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.removeTimeBasedRate] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }

    const config = await getOrCreatePriceConfig(userId, session);
    
    // Find rate before removal for cache invalidation
    const rateToRemove = config.timeBasedRates.find(
      rate => rate._id.toString() === rateId
    );

    if (!rateToRemove) {
      logger.warn('[priceController.removeTimeBasedRate] Rate not found:', {
        userId,
        rateId
      });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Time-based rate not found' });
    }

    // Store affected session types before removal
    const affectedSessionTypes = rateToRemove.sessionTypes.map(st => st.toString());

    console.log('[priceController.removeTimeBasedRate] Removing rate:', {
      userId,
      rateId,
      affectedSessionTypes: affectedSessionTypes.length
    });

    // Remove the rate
    config.timeBasedRates = config.timeBasedRates.filter(
      rate => rate._id.toString() !== rateId
    );

    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    await config.save({ session });
    await session.commitTransaction();

    // Clear cache for affected session types
    for (const sessionTypeId of affectedSessionTypes) {
      const cacheKey = `price:${userId}:${sessionTypeId}:*`;
      try {
        await cacheService.deletePattern(cacheKey);
        console.log('[priceController.removeTimeBasedRate] Cache cleared:', { 
          userId, 
          sessionTypeId,
          pattern: cacheKey 
        });
      } catch (cacheError) {
        logger.warn('[priceController.removeTimeBasedRate] Cache clear failed:', { 
          error: cacheError.message,
          userId,
          sessionTypeId
        });
      }
    }

    console.log('[priceController.removeTimeBasedRate] Removal successful:', {
      userId,
      rateId,
      affectedSessionTypesCount: affectedSessionTypes.length,
      configVersion: config.metadata.version
    });

    res.json({
      success: true,
      config: {
        timeBasedRates: config.timeBasedRates,
        version: config.metadata.version,
        lastUpdated: config.metadata.lastCalculation
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('[priceController.removeTimeBasedRate] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId,
      rateId: req.params.rateId
    });
    
    res.status(500).json({ 
      message: 'Error removing time-based rate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

// Special period operations (similar pattern to time-based rates)

exports.addSpecialPeriod = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId } = req.params;
    const periodData = req.body;

    console.log('[priceController.addSpecialPeriod] Starting addition:', {
      userId,
      periodData: {
        name: periodData.name,
        sessionTypes: periodData.sessionTypes,
        startDate: periodData.startDate,
        endDate: periodData.endDate
      }
    });

    if (!validateUserId(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.addSpecialPeriod] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.addSpecialPeriod] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }

    const startDate = new Date(periodData.startDate);
    const endDate = new Date(periodData.endDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
      logger.warn('[priceController.addSpecialPeriod] Invalid date range:', {
        userId,
        startDate: periodData.startDate,
        endDate: periodData.endDate
      });
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const config = await getOrCreatePriceConfig(userId, session);

    const hasOverlap = config.specialPeriods.some(period => {
      const existingStart = new Date(period.startDate);
      const existingEnd = new Date(period.endDate);
      const hasSessionTypeOverlap = period.sessionTypes.some(st => 
        periodData.sessionTypes.includes(st.toString())
      );

      return hasSessionTypeOverlap && (
        (startDate <= existingEnd && endDate >= existingStart) ||
        (existingStart <= endDate && existingEnd >= startDate)
      );
    });

    if (hasOverlap) {
      logger.warn('[priceController.addSpecialPeriod] Overlapping period detected:', {
        userId,
        newPeriod: {
          startDate,
          endDate,
          sessionTypes: periodData.sessionTypes
        }
      });
      await session.abortTransaction();
      return res.status(400).json({ message: 'Period overlaps with existing special period for same session type(s)' });
    }

    const newPeriod = {
      name: periodData.name,
      description: periodData.description,
      sessionTypes: periodData.sessionTypes,
      rate: {
        amount: Number(periodData.rate.amount),
        isPercentage: true
      },
      startDate,
      endDate,
      active: true
    };

    console.log('[priceController.addSpecialPeriod] Adding new period:', {
      userId,
      newPeriod: {
        name: newPeriod.name,
        sessionTypesCount: newPeriod.sessionTypes.length,
        dateRange: `${startDate.toISOString()} - ${endDate.toISOString()}`
      }
    });

    config.specialPeriods.push(newPeriod);
    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    await config.save({ session });
    await session.commitTransaction();

    for (const sessionTypeId of periodData.sessionTypes) {
      const cacheKey = `price:${userId}:${sessionTypeId}:*`;
      try {
        await cacheService.deletePattern(cacheKey);
        console.log('[priceController.addSpecialPeriod] Cache cleared:', { 
          userId, 
          sessionTypeId,
          pattern: cacheKey 
        });
      } catch (cacheError) {
        logger.warn('[priceController.addSpecialPeriod] Cache clear failed:', { 
          error: cacheError.message,
          userId,
          sessionTypeId
        });
      }
    }

    console.log('[priceController.addSpecialPeriod] Addition successful:', {
      userId,
      newPeriodId: config.specialPeriods[config.specialPeriods.length - 1]._id,
      configVersion: config.metadata.version
    });

    res.json({
      success: true,
      config: {
        specialPeriods: config.specialPeriods,
        version: config.metadata.version,
        lastUpdated: config.metadata.lastCalculation
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('[priceController.addSpecialPeriod] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId
    });
    
    res.status(500).json({ 
      message: 'Error adding special period',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

exports.updateSpecialPeriod = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, periodId } = req.params;
    const periodData = req.body;

    console.log('[priceController.updateSpecialPeriod] Starting update:', {
      userId,
      periodId,
      periodData: {
        name: periodData.name,
        sessionTypes: periodData.sessionTypes,
        startDate: periodData.startDate,
        endDate: periodData.endDate
      }
    });

    if (!validateUserId(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.updateSpecialPeriod] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.updateSpecialPeriod] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }

    const config = await getOrCreatePriceConfig(userId, session);
    
    const periodIndex = config.specialPeriods.findIndex(
      p => p._id.toString() === periodId
    );

    if (periodIndex === -1) {
      logger.warn('[priceController.updateSpecialPeriod] Period not found:', {
        userId,
        periodId
      });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Special period not found' });
    }

    const oldSessionTypes = config.specialPeriods[periodIndex].sessionTypes;

    const startDate = new Date(periodData.startDate);
    const endDate = new Date(periodData.endDate);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
      logger.warn('[priceController.updateSpecialPeriod] Invalid date range:', {
        userId,
        periodId,
        startDate: periodData.startDate,
        endDate: periodData.endDate
      });
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const hasOverlap = config.specialPeriods.some((period, index) => {
      if (index === periodIndex) return false;

      const existingStart = new Date(period.startDate);
      const existingEnd = new Date(period.endDate);
      const hasSessionTypeOverlap = period.sessionTypes.some(st => 
        periodData.sessionTypes.includes(st.toString())
      );

      return hasSessionTypeOverlap && (
        (startDate <= existingEnd && endDate >= existingStart) ||
        (existingStart <= endDate && existingEnd >= startDate)
      );
    });

    if (hasOverlap) {
      logger.warn('[priceController.updateSpecialPeriod] Overlapping period detected:', {
        userId,
        periodId,
        updatedPeriod: {
          startDate,
          endDate,
          sessionTypes: periodData.sessionTypes
        }
      });
      await session.abortTransaction();
      return res.status(400).json({ message: 'Period overlaps with existing special period for same session type(s)' });
    }

    config.specialPeriods[periodIndex] = {
      ...config.specialPeriods[periodIndex].toObject(),
      name: periodData.name,
      description: periodData.description || config.specialPeriods[periodIndex].description,
      sessionTypes: periodData.sessionTypes,
      rate: {
        amount: Number(periodData.rate.amount),
        isPercentage: true
      },
      startDate,
      endDate,
      active: periodData.active ?? config.specialPeriods[periodIndex].active
    };

    console.log('[priceController.updateSpecialPeriod] Updating period:', {
      userId,
      periodId,
      updatedPeriod: {
        name: config.specialPeriods[periodIndex].name,
        sessionTypesCount: config.specialPeriods[periodIndex].sessionTypes.length,
        dateRange: `${startDate.toISOString()} - ${endDate.toISOString()}`
      }
    });

    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    await config.save({ session });
    await session.commitTransaction();

    const sessionTypesToInvalidate = new Set([
      ...oldSessionTypes.map(st => st.toString()),
      ...periodData.sessionTypes
    ]);

    for (const sessionTypeId of sessionTypesToInvalidate) {
      const cacheKey = `price:${userId}:${sessionTypeId}:*`;
      try {
        await cacheService.deletePattern(cacheKey);
        console.log('[priceController.updateSpecialPeriod] Cache cleared:', { 
          userId, 
          sessionTypeId,
          pattern: cacheKey 
        });
      } catch (cacheError) {
        logger.warn('[priceController.updateSpecialPeriod] Cache clear failed:', { 
          error: cacheError.message,
          userId,
          sessionTypeId
        });
      }
    }

    console.log('[priceController.updateSpecialPeriod] Update successful:', {
      userId,
      periodId,
      configVersion: config.metadata.version
    });

    res.json({
      success: true,
      config: {
        specialPeriods: config.specialPeriods,
        version: config.metadata.version,
        lastUpdated: config.metadata.lastCalculation
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('[priceController.updateSpecialPeriod] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId,
      periodId: req.params.periodId
    });
    
    res.status(500).json({ 
      message: 'Error updating special period',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

exports.removeSpecialPeriod = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, periodId } = req.params;

    console.log('[priceController.removeSpecialPeriod] Starting removal:', {
      userId,
      periodId
    });

    if (!validateUserId(userId)) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.removeSpecialPeriod] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    // Authorization check
    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.removeSpecialPeriod] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }

    const config = await getOrCreatePriceConfig(userId, session);
    
    // Store affected session types before removal for cache invalidation
    const periodToRemove = config.specialPeriods.find(p => p._id.toString() === periodId);
    if (!periodToRemove) {
      logger.warn('[priceController.removeSpecialPeriod] Period not found:', {
        userId,
        periodId
      });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Special period not found' });
    }

    const affectedSessionTypes = periodToRemove.sessionTypes.map(st => st.toString());

    config.specialPeriods = config.specialPeriods.filter(
      period => period._id.toString() !== periodId
    );

    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    await config.save({ session });
    await session.commitTransaction();

    // Clear cache for affected session types
    try {
      for (const sessionTypeId of affectedSessionTypes) {
        const cacheKey = `price:${userId}:${sessionTypeId}:*`;
        await cacheService.deletePattern(cacheKey);
        console.log('[priceController.removeSpecialPeriod] Cache cleared:', {
          userId,
          sessionTypeId,
          pattern: cacheKey
        });
      }
    } catch (cacheError) {
      // Log but don't fail the request for cache issues
      logger.warn('[priceController.removeSpecialPeriod] Cache clear failed:', {
        error: cacheError.message,
        userId
      });
    }

    console.log('[priceController.removeSpecialPeriod] Removal successful:', {
      userId,
      periodId,
      configVersion: config.metadata.version
    });

    res.json({
      success: true,
      config: {
        specialPeriods: config.specialPeriods,
        version: config.metadata.version,
        lastUpdated: config.metadata.lastCalculation
      }
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('[priceController.removeSpecialPeriod] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId,
      periodId: req.params.periodId
    });
    res.status(500).json({ message: 'Error removing special period' });
  } finally {
    session.endSession();
  }
};

exports.calculateSessionPrice = async (req, res) => {
  const startTime = Date.now();
  try {
    const { userId, sessionTypeId, start, end, timezone, participantCount, discountCode, customerLocation } = req.body;

    console.log('[priceController.calculateSessionPrice] Calculating price:', {
      body: req.body,
      userId: req.user?._id,
      customerLocation // Log the received customer location
    });

    const coach = await Coach.findOne({ user: userId })
      .select('_id user settings.privacySettings settings.coachingPreferences')
      .lean();

    if (!coach) {
      logger.warn('[priceController.calculateSessionPrice] Coach not found:', { userId });
      return res.status(404).json({ message: 'Coach not found' });
    }

    const cachedPrice = await getCachedPrice(userId, sessionTypeId, start, end, discountCode);
    if (cachedPrice) {
      console.log('[priceController.calculateSessionPrice] Returning cached price:', {
        userId,
        sessionTypeId,
        discountCode,
        executionTime: Date.now() - startTime
      });
      return res.json(cachedPrice);
    }

    let isConnected = false;
    let userType = 'all';
    if (req.user) {
      const connection = await Connection.findOne({
        coach: coach._id,
        client: req.user._id,
        status: 'accepted'
      }).lean();
      
      isConnected = !!connection;
      userType = isConnected ? 'connected' : 'all';
      
      console.log('[priceController.calculateSessionPrice] Connection status:', {
        coachId: coach._id,
        userId: req.user._id,
        isConnected,
        userType
      });
    }

    const priceConfig = await PriceConfiguration.findOne({ user: userId })
      .select('-__v')
      .lean();
    
    if (!priceConfig) {
      logger.warn('[priceController.calculateSessionPrice] No price configuration found:', {
        userId
      });
      return res.status(404).json({ message: 'No active price configuration found for coach' });
    }

    console.log('[priceController.calculateSessionPrice] Calling PricingService.calculateSessionPrice with:', {
      coachId: userId,
      sessionTypeId,
      startTime: start,
      endTime: end,
      timezone,
      isConnected,
      participantCount,
      userType,
      bookingTime: new Date(),
      priceConfigId: priceConfig._id,
      discountCode,
      customerLocation, // Pass customerLocation to the service
    });

   const priceCalculation = await PricingService.calculateSessionPrice({
      coachId: userId,
      userId: req.user?._id,
      sessionTypeId,
      startTime: start,
      endTime: end,
      timezone: timezone || 'Europe/Zurich',
      isConnected,
      participantCount: participantCount || 1,
      userType,
      bookingTime: new Date(),
      priceConfig,
      discountCode,
      customerLocation // Pass customerLocation to the service
    });

    await cacheCalculatedPrice(userId, sessionTypeId, start, end, discountCode, priceCalculation);

     console.log('[priceController.calculateSessionPrice] Final price object before response:', {
      priceCalculation: JSON.stringify(priceCalculation)
    });

    console.log('[priceController.calculateSessionPrice] Price calculated successfully:', {
      executionTime: Date.now() - startTime,
      coachId: userId,
      sessionTypeId,
      basePrice: priceCalculation.base,
      finalPrice: priceCalculation.final
    });

     if (priceCalculation && priceCalculation.vat && typeof priceCalculation.vat.rate === 'string') {
      priceCalculation.vat.rate = parseFloat(priceCalculation.vat.rate);
    }
    if (priceCalculation && !Array.isArray(priceCalculation.discounts)) {
      priceCalculation.discounts = [];
    }

    res.json(priceCalculation);
  } catch (error) {
    logger.error('[priceController.calculateSessionPrice] Error:', {
      error: error.message,
      stack: error.stack,
      executionTime: Date.now() - startTime
    });
    
    if (error.code === 'INVALID_CONFIG') {
      return res.status(400).json({
        message: 'Invalid price configuration',
        error: error.message
      });
    }
    
    res.status(500).json({
      message: 'Error calculating price',
      error: error.message
    });
  }
};

const cacheCalculatedPrice = async (userId, sessionTypeId, start, end, discountCode, priceData) => {
  const codePart = discountCode || 'none';
  const cacheKey = `price:${userId}:${sessionTypeId}:${start}:${end}:${codePart}`;
  try {
    await cacheService.set(cacheKey, JSON.stringify(priceData), {
      EX: cacheConfig?.ttl?.priceCalculation || 300
    });
    console.log('[priceController.cacheCalculatedPrice] Price cached successfully:', {
      userId,
      sessionTypeId,
      cacheKey
    });
  } catch (error) {
    logger.warn('[priceController.cacheCalculatedPrice] Cache write failed:', { 
      error: error.message,
      cacheKey 
    });
  }
};

const getCachedPrice = async (userId, sessionTypeId, start, end, discountCode) => {
  const codePart = discountCode || 'none';
  const cacheKey = `price:${userId}:${sessionTypeId}:${start}:${end}:${codePart}`;
  try {
    const cachedData = await cacheService.get(cacheKey);
    if (cachedData) {
      console.log('[priceController.getCachedPrice] Cache hit:', { 
        userId,
        sessionTypeId,
        cacheKey 
      });
      return JSON.parse(cachedData);
    }
  } catch (error) {
    logger.warn('[priceController.getCachedPrice] Cache read failed:', { 
      error: error.message,
      cacheKey 
    });
  }
  return null;
};

const deleteCachePattern = async (pattern) => {
  try {
    if (cacheService.deletePattern) {
      await cacheService.deletePattern(pattern);
    } else if (cacheService.keys && cacheService.del) {
      const keys = await cacheService.keys(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map(key => cacheService.del(key)));
      }
    }
  } catch (error) {
    logger.warn('[cacheService] Cache deletion failed:', {
      error: error.message,
      pattern
    });
  }
};

exports.getCoachPriceConfiguration = async (req, res) => {
  const startTime = Date.now();
  try {
    const { userId } = req.params;
    
    if (!validateUserId(userId)) {
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    console.log('[priceController.getCoachPriceConfiguration] Fetching price config:', {
      requestedUserId: userId,
      requestingUserId: req.user?._id
    });

    const coach = await Coach.findOne({ user: userId });
    
    if (!coach) {
      logger.warn('[priceController.getCoachPriceConfiguration] Coach not found:', { userId });
      return res.status(404).json({ message: 'Coach not found' });
    }

    const config = await PriceConfiguration.findOne({ user: userId })
      .select('baseRate liveSessionRate sessionTypeRates timeBasedRates specialPeriods metadata')
      .lean();

    if (!config) {
      console.log('[priceController.getCoachPriceConfiguration] No config found, creating default:', { userId });
      const defaultConfig = new PriceConfiguration({
        user: userId,
        baseRate: { amount: 0, currency: 'CHF' },
        liveSessionRate: { amount: 0, currency: 'CHF' },
        sessionTypeRates: [],
        timeBasedRates: [],
        specialPeriods: [],
        metadata: {
          version: 1,
          createdAt: new Date()
        }
      });
      await defaultConfig.save();
      return res.json(defaultConfig);
    }

    console.log('[priceController.getCoachPriceConfiguration] Config fetched successfully:', {
      userId,
      configId: config._id,
      executionTime: Date.now() - startTime
    });
    
    res.json(config);
  } catch (error) {
    logger.error('[priceController.getCoachPriceConfiguration] Error:', {
      error: error.message,
      stack: error.stack,
      executionTime: Date.now() - startTime
    });
    res.status(500).json({ message: 'Error fetching price configuration' });
  }
};

exports.updatePriceConfiguration = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.params.userId; // Get userId from params
    const updates = req.body;

    if (!validateUserId(userId)) {
      logger.error('[priceController] Invalid userId format:', { userId });
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid user ID format' });
    }

    console.log('[priceController.updatePriceConfiguration] Received update:', {
      userId,
      updates: JSON.stringify(updates)
    });

    // Find coach first
    const coach = await Coach.findOne({ user: new mongoose.Types.ObjectId(userId) });
    if (!coach) {
      logger.warn('[priceController.updatePriceConfiguration] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    // Validate incoming data
    if (!updates || !Object.keys(updates).length) {
      logger.error('[priceController.updatePriceConfiguration] No update data provided');
      await session.abortTransaction();
      return res.status(400).json({ message: 'No update data provided' });
    }

    // Format the data
    const formattedData = {
      baseRate: {
        amount: Number(updates.baseRate.amount),
        currency: updates.baseRate.currency
      },
      sessionTypeRates: Array.isArray(updates.sessionTypeRates) 
        ? updates.sessionTypeRates.map(rate => ({
            sessionType: rate.sessionType,
            rate: {
              amount: Number(rate.rate.amount),
              currency: rate.rate.currency
            }
          }))
        : [],
      timeBasedRates: updates.timeBasedRates || [],
      specialPeriods: updates.specialPeriods || []
    };

    // Find or create configuration using coach's user ID
    let config = await PriceConfiguration.findOne({ user: coach.user }).session(session);
    
    if (!config) {
      config = new PriceConfiguration({
        user: coach.user,
        ...formattedData
      });
    } else {
      Object.assign(config, formattedData);
    }

    await config.save({ session });
    await session.commitTransaction();

    const cachePattern = cacheConfig.keys.priceCalculation(userId, '*', '*', '*');
    await cacheService.delete(cachePattern);

    console.log('[priceController.updatePriceConfiguration] Successfully updated config:', {
      userId,
      configId: config._id
    });

    res.json(config);
  } catch (error) {
    await session.abortTransaction();
    logger.error('[priceController.updatePriceConfiguration] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId
    });
    res.status(500).json({ 
      message: 'Error updating price configuration',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

exports.createNewConfigVersion = async (req, res) => {
  try {
    const { coachId } = req.params;
    
    console.log('[priceController.createNewConfigVersion] Creating new config version:', {
      coachId,
      creatorId: req.user._id
    });

    const currentConfig = await PriceConfiguration.findOne({
      user: coachId,
      status: 'active'
    });

    if (!currentConfig) {
      logger.warn('[priceController.createNewConfigVersion] No active config found:', { coachId });
      return res.status(404).json({ message: 'No active price configuration found' });
    }

    const newConfig = new PriceConfiguration({
      ...currentConfig.toObject(),
      _id: undefined,
      status: 'draft',
      effectiveFrom: new Date(),
      effectiveUntil: undefined,
      metadata: {
        ...currentConfig.metadata,
        version: currentConfig.metadata.version + 1,
        lastCalculation: new Date()
      }
    });

    await newConfig.save();

    console.log('[priceController.createNewConfigVersion] New config version created:', {
      configId: newConfig._id,
      version: newConfig.metadata.version
    });

    res.json(newConfig);
  } catch (error) {
    logger.error('[priceController.createNewConfigVersion] Error:', error);
    res.status(500).json({ message: 'Error creating new price configuration version' });
  }
};

exports.getConfigHistory = async (req, res) => {
  try {
    const { coachId } = req.params;
    
    console.log('[priceController.getConfigHistory] Fetching config history:', { coachId });

    const configHistory = await PriceConfiguration.find({ user: coachId })
      .sort({ 'metadata.version': -1 })
      .select('status effectiveFrom effectiveUntil metadata');

    res.json(configHistory);
  } catch (error) {
    logger.error('[priceController.getConfigHistory] Error:', error);
    res.status(500).json({ message: 'Error fetching price configuration history' });
  }
};

exports.previewPriceCalculation = async (req, res) => {
  const startTime = Date.now();
  try {
    console.log('[priceController.previewPriceCalculation] Previewing price calculation:', {
      body: req.body,
      userId: req.user?._id
    });

    const {
      coachId,
      sessionTypeId,
      start,
      end,
      timezone,
      participantCount,
      configVersion
    } = req.body;

    let priceConfig;
    if (configVersion) {
      priceConfig = await PriceConfiguration.findOne({
        user: coachId,
        'metadata.version': configVersion
      });
    } else {
      priceConfig = await PriceConfiguration.findActiveForCoach(coachId);
    }

    if (!priceConfig) {
      logger.warn('[priceController.previewPriceCalculation] No config found:', {
        coachId,
        configVersion
      });
      return res.status(404).json({ message: 'Price configuration not found' });
    }

    const priceCalculation = await PricingService.calculateSessionPrice({
      coachId,
      sessionTypeId,
      startTime: start,
      endTime: end,
      timezone: timezone || 'Europe/Zurich',
      participantCount: participantCount || 1,
      priceConfig
    });

    console.log('[priceController.previewPriceCalculation] Price preview calculated:', {
      executionTime: Date.now() - startTime,
      basePrice: priceCalculation.base,
      finalPrice: priceCalculation.final
    });

     if (priceCalculation && !Array.isArray(priceCalculation.discounts)) {
      priceCalculation.discounts = [];
    }

    res.json(priceCalculation);
  } catch (error) {
    logger.error('[priceController.previewPriceCalculation] Error:', {
      error: error.message,
      stack: error.stack,
      executionTime: Date.now() - startTime
    });
    
    res.status(500).json({
      message: 'Error previewing price calculation',
      error: error.message
    });
  }
};

exports.removeSessionTypeRate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userId, typeId } = req.params;

    console.log('[priceController.removeSessionTypeRate] Starting removal:', {
      userId,
      typeId,
      requestingUserId: req.user?._id
    });

    if (userId !== req.user._id.toString()) {
      logger.warn('[priceController.removeSessionTypeRate] Unauthorized access attempt:', {
        requestedUserId: userId,
        requestingUserId: req.user._id
      });
      await session.abortTransaction();
      return res.status(403).json({ message: 'Not authorized to update this price configuration' });
    }
    
    const coach = await Coach.findOne({ user: userId }).session(session);
    if (!coach) {
      logger.warn('[priceController.removeSessionTypeRate] Coach not found:', { userId });
      await session.abortTransaction();
      return res.status(404).json({ message: 'Coach not found' });
    }

    const config = await getOrCreatePriceConfig(userId, session);

    const initialCount = config.sessionTypeRates.length;
    
    config.sessionTypeRates = config.sessionTypeRates.filter(
      rate => rate.sessionType.toString() !== typeId
    );

    if (config.sessionTypeRates.length === initialCount) {
        logger.warn('[priceController.removeSessionTypeRate] Rate not found for removal:', { userId, typeId });
        await session.abortTransaction();
        return res.status(404).json({ message: 'Session type rate not found' });
    }

    config.metadata.version += 1;
    config.metadata.lastCalculation = new Date();

    await config.save({ session });
    await session.commitTransaction();

    const cacheKey = `price:${userId}:${typeId}:*`;
    try {
      await cacheService.deletePattern(cacheKey);
      console.log('[priceController.removeSessionTypeRate] Cache cleared:', { userId, typeId, pattern: cacheKey });
    } catch (cacheError) {
      logger.warn('[priceController.removeSessionTypeRate] Cache clear failed:', { 
        error: cacheError.message,
        userId,
        typeId
      });
    }

    console.log('[priceController.removeSessionTypeRate] Removal successful:', {
      userId,
      typeId,
      configVersion: config.metadata.version
    });

    res.json({
        success: true,
        config: {
          sessionTypeRates: config.sessionTypeRates,
          version: config.metadata.version,
          lastUpdated: config.metadata.lastCalculation
        }
    });

  } catch (error) {
    if (session.inTransaction()) {
        await session.abortTransaction();
    }
    logger.error('[priceController.removeSessionTypeRate] Error:', {
      error: error.message,
      stack: error.stack,
      userId: req.params.userId,
      typeId: req.params.typeId
    });
    res.status(500).json({ 
        message: 'Error removing session type rate',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    session.endSession();
  }
};

exports.getPricingRates = async (req, res) => {
    try {
        console.log('[priceController.getPricingRates] Fetching platform fee and VAT rates.');
        const taxService = new TaxService();
        res.json({
            platformFeePercent: PricingService.platformFeePercentage,
            vatRatePercent: taxService.getVatRate() * 100,
        });
    } catch (error) {
        logger.error('[priceController.getPricingRates] Error fetching pricing rates:', error);
        res.status(500).json({ message: 'Error fetching pricing rates' });
    }
};

exports.calculateProgramPrice = async (req, res) => {
  try {
    const { programId, discountCode } = req.body;
    const program = await Program.findById(programId).select('coach').lean();
    if (!program) {
      return res.status(404).json({ message: 'Program not found' });
    }

    const priceDetails = await PricingService.calculateProgramPrice({
      programId,
      coachId: program.coach,
      userId: req.user?._id,
      discountCode
    });

    res.status(200).json(priceDetails);
  } catch (error) {
    logger.error('[priceController.calculateProgramPrice] Error:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    res.status(500).json({ message: 'Error calculating program price' });
  }
};

exports.updateLiveSessionRate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { userId } = req.params;
    const { rate } = req.body;

    if (!validateUserId(userId) || userId !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ message: 'Unauthorized or invalid user ID' });
    }

    if (!rate || typeof rate.amount !== 'number' || !rate.currency) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Invalid rate data provided' });
    }
    
    const config = await getOrCreatePriceConfig(userId, session);
    
    config.liveSessionRate = {
      amount: Number(rate.amount),
      currency: rate.currency,
    };
    config.metadata.version += 1;
    config.markModified('liveSessionRate');

    await config.save({ session });
    await session.commitTransaction();

    res.json({ success: true, liveSessionRate: config.liveSessionRate });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    logger.error('[priceController.updateLiveSessionRate] Error:', { error: error.message, userId: req.params.userId });
    res.status(500).json({ message: 'Error updating live session rate' });
  } finally {
    session.endSession();
  }
};

exports.calculateForDisplay = async (req, res) => {
    try {
        const { price, earlyBirdPrice, currency, userId, sessionTypeId, start, end, timezone } = req.body;

        const priceCalculation = await PricingService.calculateBreakdownsForDisplay({
            price: parseFloat(price) || 0,
            earlyBirdPrice: earlyBirdPrice ? parseFloat(earlyBirdPrice) : null,
            currency: currency,
            coachId: userId,
        });
        
        res.json(priceCalculation);
    } catch (error) {
        logger.error('[priceController.calculateForDisplay] Error:', {
          error: error.message,
          stack: error.stack,
          body: req.body
        });
        res.status(500).json({ 
          message: 'Error calculating price for display',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


exports.calculateWebinarPrice = async (req, res) => {
  try {
    const { webinarBookingId, discountCode } = req.body;
    const userId = req.user._id; // The user requesting the price

    logger.info('[priceController.calculateWebinarPrice] Calculating webinar price:', {
      webinarBookingId,
      userId,
      hasDiscountCode: !!discountCode
    });

    const priceDetails = await PricingService.calculateWebinarRegistrationPrice({
      webinarBookingId,
      userId,
      discountCode,
    });

    res.status(200).json(priceDetails);

  } catch (error) {
    logger.error('[priceController.calculateWebinarPrice] Error:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });
    if (error instanceof PriceCalculationError) {
      return res.status(400).json({ message: error.message, code: error.code });
    }
    res.status(500).json({ message: 'Error calculating webinar price' });
  }
};