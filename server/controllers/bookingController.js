const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Coach = require('../models/Coach');
const User = require('../models/User');
const SessionType = require('../models/SessionType');
const Payment = require('../models/Payment');
const Session = require('../models/Session');
const Translation = require('../models/Translation');
const {
  checkCoachSlotAvailability,
  restoreAvailabilityForBooking,
  occupyAvailabilityForNewBookingTime,
  coalesceAndRestoreAvailability
} = require('../utils/bookingHelpers');
const { sendEmail } = require('../utils/emailService');
const moment = require('moment');
const { getSocketService } = require('../services/socketService');
const { BookingStatusToNotification, getNotificationsForBookingStatus } = require('../utils/bookingNotificationMapper');
const UnifiedNotificationService = require('../services/unifiedNotificationService');
const Notification = require('../models/Notification');
const { 
  NotificationTypes, 
  NotificationCategories, 
  NotificationPriorities,
  NotificationStatus,
  NotificationChannels,
  NotificationMetadata 
} = require('../utils/notificationHelpers');
const { logger } = require('../utils/logger');
const paymentService = require('../services/paymentService');
const PricingService = require('../services/PricingService');
const { PriceCalculationError } = require('../services/PricingService');
const { DateTime } = require('luxon');
const PolicyEngine = require('../utils/policyEngine');
const paymentFlowLogger = require('../utils/paymentLogger');
const PriceConfiguration = require('../models/PriceConfiguration');
const Connection = require('../models/Connection');
const Discount = require('../models/Discount');
const DiscountUsage = require('../models/DiscountUsage');

const WEBINAR_TYPE_ID_STRING = '66ec54f94a8965b22af33fd9';
const GROUP_TYPE_ID_STRING = '66ec54f44a8965b22af33fd5';
const WORKSHOP_TYPE_ID_STRING = '66ec54fe4a8965b22af33fdd';
const NON_INDIVIDUAL_SESSION_TYPES = [WEBINAR_TYPE_ID_STRING, GROUP_TYPE_ID_STRING, WORKSHOP_TYPE_ID_STRING];

const normalizePriceStructure = (price) => {
  if (!price) return null;

  return {
    base: {
      amount: {
        amount: price.base?.amount?.amount?.amount || price.base?.amount?.amount || price.base?.amount || 0,
        currency: price.base?.amount?.currency || price.base?.currency || price.currency || 'CHF'
      },
      currency: price.base?.currency || price.currency || 'CHF'
    },
    final: {
      amount: {
        amount: price.final?.amount?.amount?.amount || price.final?.amount?.amount || price.final?.amount || 0,
        currency: price.final?.amount?.currency || price.final?.currency || price.currency || 'CHF'
      },
      currency: price.final?.currency || price.currency || 'CHF'
    },
    currency: price.currency || 'CHF',
    vat: {
      rate: price.vat?.rate || 8.1,
      amount: price.vat?.amount || 0,
      included: price.vat?.included ?? true
    },
    platformFee: {
      percentage: price.platformFee?.percentage || 15,
      amount: price.platformFee?.amount || 0
    },
    discounts: (price.discounts || []).map(d => ({
      type: d.type,
      amount: {
        amount: d.amount?.amount || d.amount || 0,
        currency: d.amount?.currency || price.currency || 'CHF'
      },
      description: d.description
    })),
    calculationMeta: {
      calculatedAt: new Date(),
      version: '1.0'
    }
  };
};

const splitAvailabilitySlot = async (originalSlot, bookedStart, bookedEnd) => {
  console.log('[splitAvailabilitySlot] V3 START - Splitting availability slot', {
    originalSlotId: originalSlot._id,
    originalSlotStart: originalSlot.start,
    originalSlotEnd: originalSlot.end,
    bookedStart,
    bookedEnd,
    originalOvertime: originalSlot.overtime,
    originalAvailableForInstantBooking: originalSlot.availableForInstantBooking
  });

  const newSlots = [];
  const originalSlotObject = originalSlot.toObject({ virtuals: false });
  delete originalSlotObject._id;
  delete originalSlotObject.__v;

  // Create slot before booking
  if (moment(bookedStart).isAfter(moment(originalSlot.start))) {
    const beforeSlotData = {
      ...originalSlotObject,
      start: originalSlot.start,
      end: bookedStart,
    };
    console.log('[splitAvailabilitySlot] V3 PREPARING pre-booking slot.', { 
        start: beforeSlotData.start, 
        end: beforeSlotData.end,
        inheritedOvertime: beforeSlotData.overtime,
        inheritedInstantBooking: beforeSlotData.availableForInstantBooking
    });
    newSlots.push(new Booking(beforeSlotData));
  }

  // Create slot after booking
  if (moment(bookedEnd).isBefore(moment(originalSlot.end))) {
    const afterSlotData = {
      ...originalSlotObject,
      start: bookedEnd,
      end: originalSlot.end,
    };
    console.log('[splitAvailabilitySlot] V3 PREPARING post-booking slot.', { 
        start: afterSlotData.start, 
        end: afterSlotData.end,
        inheritedOvertime: afterSlotData.overtime,
        inheritedInstantBooking: afterSlotData.availableForInstantBooking
    });
    newSlots.push(new Booking(afterSlotData));
  }

  console.log('[splitAvailabilitySlot] V3 END - Created new slots', { count: newSlots.length });
  return newSlots;
};


exports.createBooking = async (req, res) => {
  console.log('[bookingController.createBooking] Function started', {
    requestBody: req.body,
    timestamp: new Date().toISOString(),
  });
  console.log('[bookingController.createBooking] Raw overtime input:', {
    overtime: req.body.overtime,
    overtimeType: typeof req.body.overtime,
    isObject: req.body.overtime && typeof req.body.overtime === 'object',
    hasOvertime: !!req.body.overtime,
    overtimeFields: req.body.overtime ? Object.keys(req.body.overtime) : [],
    timestamp: new Date().toISOString(),
  });
  const session = await mongoose.startSession();
  session.startTransaction();
  let transactionCommitted = false;
  let availabilitySlot = null;

  const initiatorId = req.user._id.toString();
  let priceDetails = null;

  try {
   const { coach, sessionType, start, end, timezone, discountCode, priceOverride, ...otherDataFromRequest } = req.body;

const initiator = req.user;
let targetUser = null;

if (initiator.role === 'client') {
    targetUser = initiator._id;
    if (req.body.user && req.body.user.toString() !== targetUser.toString()) {
        logger.warn(`[bookingController.createBooking] Client user spoofing attempt detected.`, { initiatorId: initiator._id, requestedUser: req.body.user });
        await session.abortTransaction(); session.endSession();
        return res.status(403).json({ message: "You can only create bookings for yourself." });
    }
} else if (initiator.role === 'coach') {
    if (req.body.user) { 
        targetUser = req.body.user;
        if (!req.body.isAvailability) {
            const connection = await Connection.findOne({
                $or: [
                    { coach: initiator._id, client: targetUser },
                    { coach: targetUser, client: initiator._id }
                ],
                status: 'accepted'
            }).session(session);

            if (!connection) {
                logger.warn(`[bookingController.createBooking] Unauthorized booking attempt by coach for non-connected client.`, { coachId: initiator._id, targetClientId: targetUser });
                await session.abortTransaction(); session.endSession();
                return res.status(403).json({ message: "You can only create bookings for clients you are connected with." });
            }
        }
    }
}

const {
  userIds,
  title: requestedTitleFromFrontend,
  description,
  isAvailability,
  location,
  isOnline,
  slots,
  webinarSlots,
  earlyBirdDeadline,
  earlyBirdPrice,
  webinarPlatform,
  webinarLink,
  webinarLanguage,
  isPublic,
  showInWebinarBrowser,
  presenterBio,
  qaSession,
  recordingAvailable,
  replayAccessDuration,
  language,
  tags,
  cancellationPolicy,
  isPartOfPackage,
  packageId,
  certificationOffered,
  certificationDetails,
  sessionGoal,
  clientNotes,
  preparationRequired,
  followUpTasks,
  minAttendees,
  maxAttendees,
  sessionTopic,
  prerequisites,
  learningObjectives,
  materialsProvided,
  whatToBring,
  skillLevel,
  recurringPattern,
  recurringEndDate,
  availableForInstantBooking,
  status: statusFromRequest,
  firmBookingThreshold,
  overtime,
  metadata: requestMetadata,
  sessionImages,
  courseMaterials,
  ...otherData
} = otherDataFromRequest;

     if (targetUser && !isAvailability) {
  const unpaidFutureBookingsCount = await Booking.countDocuments({
    user: targetUser,
    status: 'pending_payment',
    start: { $gte: new Date() }
  }).session(session);

if (unpaidFutureBookingsCount >= 3) {
    logger.warn(`[bookingController.createBooking] User has too many unpaid bookings.`, { userId: targetUser, count: unpaidFutureBookingsCount });
    await session.abortTransaction();
    session.endSession();
    return res.status(403).json({ 
      message: "You have too many unpaid bookings. Please pay for your existing bookings before creating a new one.",
      code: "TOO_MANY_UNPAID_BOOKINGS" 
    });
  }
}
    console.log('[bookingController.createBooking] Received booking payload', {
      sessionType,
      webinarSlots,
      bookingId: req.body._id || 'new',
      payloadKeys: Object.keys(req.body),
      timestamp: new Date().toISOString(),
  });

    const coachDoc = await Coach.findOne({ user: coach }).session(session);
    if (!coachDoc) {
      console.error('[bookingController.createBooking] Coach not found:', { coach, timestamp: new Date().toISOString() });
      await session.abortTransaction();
      session.endSession();
      console.log('[bookingController.createBooking] Returning early due to coach not found', {
        coach: req.body.coach,
        timestamp: new Date().toISOString(),
      });
      return res.status(404).json({ message: 'Coach not found' });
    }

    let sessionTypeDoc = await SessionType.findById(sessionType).session(session);

 if (!coachDoc.settings) {
      console.error('[bookingController.createBooking] Coach settings not found:', { coachId: coach, timestamp: new Date().toISOString() });
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Coach settings are not configured.' });
    }
    const coachSettings = coachDoc.settings;
    const overtimeRules = coachSettings.sessionManagement?.overtime || {};
    const cancellationPolicySnapshot = coachSettings.cancellationPolicy;
    const firmBookingThresholdDefault = coachSettings.firmBookingThreshold || 24;

    console.log('[bookingController.createBooking] Fetching sessionTypeDoc', { sessionTypeId: req.body.sessionType, timestamp: new Date().toISOString() });
    if (!sessionTypeDoc) {
      console.error('[bookingController.createBooking] SessionType not found:', { sessionType, timestamp: new Date().toISOString() });
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid session type' });
    }

    const acceptLanguage = req.headers['accept-language'] || 'de';
    const userLanguage = acceptLanguage.split(',')[0].split('-')[0];

    const Translation = require('../models/Translation');
    let translatedName = sessionTypeDoc.name;
    try {
      const translationDoc = await Translation.findOne({
        key: `sessionTypes_${sessionTypeDoc._id}`,
        listType: 'sessionTypes'
      }).session(session);
      if (translationDoc && translationDoc.translations && translationDoc.translations.get(userLanguage)) {
        translatedName = translationDoc.translations.get(userLanguage);
        console.log('[bookingController.createBooking] Found translation for session type', {
          sessionTypeId: sessionTypeDoc._id,
          language: userLanguage,
          translatedName,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('[bookingController.createBooking] No translation found, using raw name', {
          sessionTypeId: sessionTypeDoc._id,
          language: userLanguage,
          rawName: sessionTypeDoc.name,
          timestamp: new Date().toISOString()
        });
      }
    } catch (translationError) {
      console.error('[bookingController.createBooking] Error fetching translation', {
        error: translationError.message,
        sessionTypeId: sessionTypeDoc._id,
        language: userLanguage,
        timestamp: new Date().toISOString()
      });
    }

     if (!isAvailability && targetUser) {
    const priceConfig = await PriceConfiguration.findOne({ user: coach }).session(session);
    if (!priceConfig) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Coach has not configured their pricing.' });
    }

    priceDetails = await PricingService.calculateSessionPrice({
        coachId: coach,
        sessionTypeId: sessionType,
        startTime: start,
        endTime: end,
        timezone: timezone,
        userId: targetUser,
        priceConfig: priceConfig,
        discountCode: discountCode
    });

   if (!priceDetails || typeof priceDetails.final?.amount?.amount !== 'number') {
    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({ message: 'Could not calculate a valid price for this session.' });
}
}

    const bookingPriceAmount = priceDetails ? priceDetails.final.amount.amount : 0;

    let determinedBookingType = req.body.type;
const isPaymentExplicitlyRequiredByRequest = req.body.payment?.required === true;

if (!determinedBookingType) {
    if (isAvailability) {
        determinedBookingType = 'AVAILABILITY';
    } else if (isPaymentExplicitlyRequiredByRequest && typeof bookingPriceAmount === 'number' && bookingPriceAmount > 0) {
        determinedBookingType = 'FIRM';
    } else {
        determinedBookingType = 'REQUEST';
    }
}

const paymentIsEffectivelyRequired = !isAvailability &&
                                  determinedBookingType === 'FIRM' &&
                                  typeof bookingPriceAmount === 'number' &&
                                  bookingPriceAmount > 0;

let initialBookingStatus;
let initialPaymentStatusOnBooking;

if (isAvailability) {
    initialBookingStatus = 'confirmed';
    initialPaymentStatusOnBooking = 'not_applicable';
} else if (paymentIsEffectivelyRequired) {
    initialBookingStatus = 'pending_payment';
    initialPaymentStatusOnBooking = 'pending';
} else {
    initialBookingStatus = statusFromRequest || 'requested';
    initialPaymentStatusOnBooking = (typeof bookingPriceAmount === 'number' && bookingPriceAmount > 0 && determinedBookingType === 'FIRM') ? 'pending' : 'not_applicable';
    if (determinedBookingType === 'FIRM' && initialPaymentStatusOnBooking === 'not_applicable' && initialBookingStatus === 'requested' && !statusFromRequest) {
         initialBookingStatus = 'confirmed';
    } else if (determinedBookingType === 'FIRM' && initialPaymentStatusOnBooking === 'not_applicable' && statusFromRequest === 'confirmed') {
        initialBookingStatus = 'confirmed';
    }
}

 console.log('[bookingController.createBooking] Determined initial status and payment requirement:', {
        determinedBookingType,
        initialBookingStatus,
        paymentIsEffectivelyRequired,
        initialPaymentStatusOnBooking,
        isAvailability,
        statusFromRequestPassedIn: statusFromRequest,
        priceAmountUsedForDecision: bookingPriceAmount,
        timestamp: new Date().toISOString()
    });

  let bookingTitle;
    if (isAvailability) {
      // For creating/editing an availability slot itself
      bookingTitle = requestedTitleFromFrontend || sessionTypeDoc.name || 'Verfügbarkeit'; // Default for availability
      logger.info('[bookingController.createBooking] Setting title for new/edited availability slot.', { /* logging details */ });
    } else {
      // For creating an actual booking from a client's perspective
      // requestedTitleFromFrontend is likely the title of the availability slot (e.g., "Verfügbarkeit")
      // translatedName is the translation of the actual session type being booked (e.g., "Einzel" for "One on One")

      // Define generic availability titles (expand this list if needed, consider case-insensitivity)
      const genericAvailabilityTitles = ['Verfügbarkeit', 'Availability'];

      // Check if requestedTitleFromFrontend is a generic availability title or not provided
      if (requestedTitleFromFrontend &&
          !genericAvailabilityTitles.some(genericTitle => requestedTitleFromFrontend.toLowerCase() === genericTitle.toLowerCase())) {
        // A specific, non-generic title was provided from the frontend for the booking. Use it.
        bookingTitle = requestedTitleFromFrontend;
        logger.info('[bookingController.createBooking] Using specific non-generic title from request for booking.', {
            finalBookingTitle: bookingTitle,
            requestedTitleFromFrontend,
            translatedSessionTypeName: translatedName,
            sessionTypeId: sessionTypeDoc._id,
            timestamp: new Date().toISOString()
        });
      } else {
        // Default to the translated name of the actual session type being booked.
        // This overrides generic availability titles or if no specific title was provided.
        bookingTitle = translatedName;
        logger.info('[bookingController.createBooking] Setting title for booking from translated session type name (or overriding generic).', {
            finalBookingTitle: bookingTitle,
            originalRequestedTitleFromFrontend: requestedTitleFromFrontend,
            translatedSessionTypeName: translatedName,
            sessionTypeId: sessionTypeDoc._id,
            timestamp: new Date().toISOString()
        });
      }
    }

    const existingBooking = await Booking.findOne({
      coach: coach,
      start: { $lt: end },
      end: { $gt: start },
      isAvailability: false,
      isLiveSession: { $ne: true },
      status: { $nin: [
        'cancelled',
        'declined',
        'cancelled_by_client',
        'cancelled_by_coach',
        'cancelled_by_admin',
        'cancelled_due_to_reschedule'

      ]}
    }).session(session);

    if (existingBooking) {
      console.error('[bookingController.createBooking] Conflicting booking found:', {
        bookingId: existingBooking._id,
        statusOfConflictingBooking: existingBooking.status,
        timestamp: new Date().toISOString()
      });
      await session.abortTransaction();
      session.endSession();
      console.log('[bookingController.createBooking] Returning early due to conflicting booking', {
        existingBookingId: existingBooking._id,
        timestamp: new Date().toISOString(),
      });
      return res.status(409).json({ message: 'This time slot is already booked' });
    }

    if (!isAvailability) {
      let requiresAvailabilityCheck = true; // Default to true
      const currentSessionTypeIdString = sessionTypeDoc._id.toString();

      if (currentSessionTypeIdString === WEBINAR_TYPE_ID_STRING ||
          currentSessionTypeIdString === GROUP_TYPE_ID_STRING ||
          currentSessionTypeIdString === WORKSHOP_TYPE_ID_STRING) {
        requiresAvailabilityCheck = false;
      } else if (sessionTypeDoc.format === 'one_on_one') {
        requiresAvailabilityCheck = true;
      } else {
        logger.warn('[bookingController.createBooking] Session type format is unclear or ID is not a known non-availability type. Assuming availability slot is required.', { sessionTypeId: currentSessionTypeIdString, format: sessionTypeDoc.format, name: sessionTypeDoc.name });
        requiresAvailabilityCheck = true; // Safer default for unknown types
      }

      const isCoachInitiatedRequest = initiatorId === coach;

      if (requiresAvailabilityCheck && !isCoachInitiatedRequest) {
        logger.info('[bookingController.createBooking] Session type requires availability slot check (client-initiated).', { sessionTypeId: currentSessionTypeIdString, sessionTypeName: sessionTypeDoc.name, format: sessionTypeDoc.format });
        availabilitySlot = await Booking.findOne({
          coach: coach,
          start: { $lte: new Date(start) },
          end: { $gte: new Date(end) },
          isAvailability: true
        }).session(session);

        if (!availabilitySlot) {
          logger.error('[bookingController.createBooking] No availability slot found for session requiring it:', {
            start, end, coach, sessionTypeId: currentSessionTypeIdString, sessionTypeName: sessionTypeDoc.name, timestamp: new Date().toISOString()
          });
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'No availability slot found for this time for the selected session type.' });
        }
        logger.info('[bookingController.createBooking] Found availability slot for session:', { slotId: availabilitySlot._id, sessionTypeId: currentSessionTypeIdString });
      } else if (requiresAvailabilityCheck && isCoachInitiatedRequest) {
        logger.info('[bookingController.createBooking] Bypassing availability slot check for coach-initiated booking.', { sessionTypeId: currentSessionTypeIdString, sessionTypeName: sessionTypeDoc.name });
      } else {
        logger.info('[bookingController.createBooking] Session type does not require availability slot check.', { sessionTypeId: currentSessionTypeIdString, sessionTypeName: sessionTypeDoc.name, format: sessionTypeDoc.format });
        if (currentSessionTypeIdString === WEBINAR_TYPE_ID_STRING) {
          if (!webinarSlots || !Array.isArray(webinarSlots) || webinarSlots.length === 0) {
            logger.error('[bookingController.createBooking] webinarSlots are missing or empty for webinar booking.', { webinarSlots });
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Webinar slots are required for this session type.' });
          }
          for (const slot of webinarSlots) {
            if (!slot.date || !slot.startTime || !slot.endTime ||
                !moment(slot.startTime).isValid() || !moment(slot.endTime).isValid() ||
                moment(slot.startTime).isSameOrAfter(moment(slot.endTime))) {
              logger.error('[bookingController.createBooking] Invalid data in webinarSlots.', { slot });
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({ message: 'Invalid data in webinar slots. Ensure date, startTime, and endTime are valid and startTime is before endTime.' });
            }
          }
          logger.info('[bookingController.createBooking] webinarSlots validated successfully for webinar.', { count: webinarSlots.length });
        } else if (currentSessionTypeIdString === GROUP_TYPE_ID_STRING || currentSessionTypeIdString === WORKSHOP_TYPE_ID_STRING) {
          if (!slots || !Array.isArray(slots) || slots.length === 0) {
            logger.error('[bookingController.createBooking] Session slots (field: slots) are missing or empty for group/workshop booking.', { slots });
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Session slots are required for this group/workshop session type.' });
          }
          for (const slot of slots) {
            if (!slot.date || !slot.startTime || !slot.endTime ||
                !moment(slot.startTime).isValid() || !moment(slot.endTime).isValid() ||
                moment(slot.startTime).isSameOrAfter(moment(slot.endTime))) {
              logger.error('[bookingController.createBooking] Invalid data in general session slots for group/workshop.', { slot });
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({ message: 'Invalid data in session slots for group/workshop.' });
            }
          }
          logger.info('[bookingController.createBooking] General session slots (field: slots) validated successfully for group/workshop.', { count: slots.length });
        }
      }
    }

    let newAvailabilitySlots = [];
    if (!isAvailability && availabilitySlot) {
      console.log('[bookingController.createBooking] Processing availability slot:', {
        originalSlotId: availabilitySlot._id,
        bookingStart: start,
        bookingEnd: end,
        preservedSettings: {
          availableForInstantBooking: availabilitySlot.availableForInstantBooking,
          firmBookingThreshold: availabilitySlot.firmBookingThreshold
        },
        timestamp: new Date().toISOString()
      });

      newAvailabilitySlots = await splitAvailabilitySlot(
        availabilitySlot,
        new Date(start),
        new Date(end)
      );

      await Booking.findByIdAndDelete(availabilitySlot._id, { session });

      if (newAvailabilitySlots.length > 0) {
        await Booking.insertMany(newAvailabilitySlots, {
          session,
          setDefaultsOnInsert: false
        });
        console.log('[bookingController.createBooking] Created new availability slots:', {
          count: newAvailabilitySlots.length,
          slots: newAvailabilitySlots.map(slot => ({
            start: slot.start,
            end: slot.end,
            preservedSettings: {
              availableForInstantBooking: slot.availableForInstantBooking,
              firmBookingThreshold: slot.firmBookingThreshold
            }
          })),
          timestamp: new Date().toISOString()
        });
      }
    }

     const overtimeSettings = {
      allowOvertime: overtimeRules.allowOvertime ?? false,
      freeOvertimeDuration: Number.isFinite(overtimeRules.freeOvertimeDuration) ? Number(overtimeRules.freeOvertimeDuration) : 0,
      paidOvertimeDuration: Number.isFinite(overtimeRules.paidOvertimeDuration) ? Number(overtimeRules.paidOvertimeDuration) : 0,
      overtimeRate: Number.isFinite(overtimeRules.overtimeRate) ? Number(overtimeRules.overtimeRate) : 0
    };

    console.log('[bookingController.createBooking] Applied overtime settings', {
      overtimeSettings,
      isAvailability,
      hasOvertimeInput: !!overtime,
      timestamp: new Date().toISOString(),
    });

      if (priceDetails && priceDetails.platformFee) {
      if (!Number.isFinite(priceDetails.platformFee.amount)) {
        logger.warn('[bookingController.createBooking] Invalid platformFee.amount received. Defaulting to 0.', {
          originalAmount: priceDetails.platformFee.amount,
          bookingId: 'PRE_SAVE'
        });
        priceDetails.platformFee.amount = 0;
      }
    }
    const bookingPrice = isAvailability ? null : priceDetails;

      console.log('[bookingController.createBooking] Final authoritative priceDetails object before creating Booking model:', JSON.stringify(priceDetails, null, 2));

    console.log('[bookingController.createBooking] Authoritative priceDetails to be saved:', {
      bookingPrice,
      timestamp: new Date().toISOString()
    });

       let userDoc = null;
    let stripeCustomerId = null;
    const currentSessionTypeIdStringForUserCheck = sessionTypeDoc._id.toString();
    const isCoachCreatedMultiAttendeeSession = !targetUser &&
      (currentSessionTypeIdStringForUserCheck === WEBINAR_TYPE_ID_STRING ||
       currentSessionTypeIdStringForUserCheck === GROUP_TYPE_ID_STRING ||
       currentSessionTypeIdStringForUserCheck === WORKSHOP_TYPE_ID_STRING);

    if (targetUser) {
      userDoc = await User.findById(targetUser).session(session);
      if (!userDoc) {
        logger.error('[bookingController.createBooking] Provided user ID not found in database.', { userIdFromRequest: targetUser, sessionType: sessionTypeDoc.name });
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'The specified user for the booking was not found.' });
      }
      stripeCustomerId = userDoc.stripe?.customerId;
      logger.info('[bookingController.createBooking] User document fetched for booking.', { userId: targetUser, hasStripeId: !!stripeCustomerId, sessionType: sessionTypeDoc.name });

    
    } else if (isCoachCreatedMultiAttendeeSession) {
      logger.info('[bookingController.createBooking] Coach-created multi-attendee session (e.g., Webinar). User field is null as expected. Skipping user-specific Stripe ID check for booking creation itself.', { sessionTypeId: currentSessionTypeIdStringForUserCheck, sessionTypeName: sessionTypeDoc.name });
    } else if (!isAvailability) {
      logger.error('[bookingController.createBooking] User ID is null for a non-availability session type that requires a user (e.g., 1-on-1).', { sessionTypeId: currentSessionTypeIdStringForUserCheck, sessionTypeName: sessionTypeDoc.name });
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'A user must be specified for this session type.' });
    }

    const processedWebinarSlots = webinarSlots?.map(slot => ({
      date: slot.date,
      startTime: new Date(slot.startTime),
      endTime: new Date(slot.endTime)
  }));

    const booking = new Booking({
      coach,
      user: targetUser,
      userIds,
      sessionType: sessionTypeDoc._id,
      start: new Date(start),
      end: new Date(end),
      timezone,
      title: bookingTitle,
      description,
      isAvailability,
      location,
      isOnline,
      slots,
      webinarSlots: processedWebinarSlots,
      earlyBirdDeadline,
      earlyBirdPrice,
      webinarPlatform,
      webinarLink,
      webinarLanguage,
      isPublic,
      showInWebinarBrowser,
      presenterBio,
      qaSession,
      recordingAvailable,
      replayAccessDuration,
      language,
      tags,
      cancellationPolicy,
      isPartOfPackage,
      packageId,
      certificationOffered,
      certificationDetails,
      sessionGoal,
      clientNotes,
      preparationRequired,
      followUpTasks,
      minAttendees,
      maxAttendees,
      sessionTopic,
      prerequisites,
      learningObjectives,
      materialsProvided,
      whatToBring,
      skillLevel,
      status: initialBookingStatus,
      type: determinedBookingType,
      recurringPattern: isAvailability ? recurringPattern : (otherData.isRecurring ? otherData.recurringPattern : 'none'),
      recurringEndDate: isAvailability ? recurringEndDate : (otherData.isRecurring ? otherData.recurringEndDate : null),
      availableForInstantBooking,
      firmBookingThreshold: availabilitySlot?.firmBookingThreshold ?? firmBookingThresholdDefault,
      price: bookingPrice,
      priceOverride,
      payment: req.body.payment === null || req.body.payment === undefined ? { status: 'pending' } : req.body.payment,
      discountApplied: priceDetails?._calculationDetails?.winningDiscount || undefined,
      cancellationPolicy: cancellationPolicySnapshot,
      overtime: overtimeSettings,
      metadata: !isAvailability ? {
          ...(requestMetadata || {}),
          originalAvailability: availabilitySlot?._id,
          availabilitySettings: {
              availableForInstantBooking: availabilitySlot?.availableForInstantBooking,
              firmBookingThreshold: availabilitySlot?.firmBookingThreshold,
              recurringPattern: availabilitySlot?.recurringPattern
          }
      } : (requestMetadata || undefined),
      sessionImages: req.body.sessionImages || [],
      courseMaterials: req.body.courseMaterials || [],
      ...otherData
  });

    console.log('[bookingController.createBooking] booking.payment object BEFORE first save:', JSON.stringify(booking.payment, null, 2));

    console.log('[bookingController.createBooking] Booking initialized with payment:', {
      bookingId: booking._id,
      payment: booking.payment,
      sourcePayment: req.body.payment,
      timestamp: new Date().toISOString()
    });

        booking.payment = req.body.payment === null || req.body.payment === undefined
      ? { status: 'pending' }
      : req.body.payment;
    booking.markModified('payment');

    console.log('[bookingController.createBooking] Payment forced before save:', {
      bookingId: booking._id,
      payment: booking.payment,
      sourcePayment: req.body.payment,
      timestamp: new Date().toISOString()
    });

    console.log('[bookingController.createBooking] Booking overtime settings before save:', {
      bookingId: booking._id,
      overtime: booking.overtime,
      isAvailability: booking.isAvailability,
      timestamp: new Date().toISOString(),
    });

    await booking.save({ session });

    const appliedDiscountDetails = priceDetails?._calculationDetails?.appliedDiscount;
if (appliedDiscountDetails && appliedDiscountDetails._id && targetUser) {
    const discountDoc = await Discount.findById(appliedDiscountDetails._id).session(session);
    if (discountDoc) {
        if (discountDoc.limitToOnePerCustomer) {
            const usage = new DiscountUsage({ discount: discountDoc._id, user: targetUser });
            await usage.save({ session: session });
        }
        await Discount.updateOne({ _id: discountDoc._id }, { $inc: { timesUsed: 1 } }).session(session);
    }
}

     try {
        const bookingAfterFirstSave = await Booking.findById(booking._id).lean().session(session); // Use .lean() for raw DB object
        console.log('[bookingController.createBooking] booking.payment object FROM DB AFTER first save:', JSON.stringify(bookingAfterFirstSave?.payment, null, 2));
    } catch (e) {
        console.error('[bookingController.createBooking] Error fetching booking after first save for logging:', e);
    }

   console.log('[bookingController.createBooking] Booking saved with file metadata:', {
      bookingId: booking._id,
      savedTitlePicture: booking.sessionImages,
      savedCourseMaterialsCount: booking.courseMaterials?.length,
      firstSavedMaterial: booking.courseMaterials && booking.courseMaterials.length > 0 ? booking.courseMaterials[0] : null
    });

    const sessionToken = require('crypto').randomBytes(32).toString('hex');
    const sessionId = require('crypto')
      .createHmac('sha256', process.env.SESSION_SECRET || 'default-secret')
      .update(`${booking._id}-${Date.now()}`)
      .digest('hex');

    booking.sessionLink = {
      token: sessionToken,
      sessionId,
      generatedAt: new Date(),
      expired: false,
    };

    console.log('[bookingController] Session link generated', {
      bookingId: booking._id,
      sessionId,
      token: sessionToken.slice(0, 8) + '...',
      timestamp: new Date().toISOString(),
    });

    await booking.save({ session });
    console.log('[bookingController.createBooking] Booking saved:', {
      bookingId: booking._id,
      price: booking.price,
      timestamp: new Date().toISOString()
    });

    console.debug('[bookingController.createBooking] Starting Session handling for booking', {
      bookingId: booking._id,
      bookingStatus: booking.status,
      timestamp: new Date().toISOString(),
    });

    let sessionDoc;
    try {
      sessionDoc = await Session.findOne({ bookingId: booking._id }).session(session);
      console.debug('[bookingController.createBooking] Session.findOne completed', {
        bookingId: booking._id,
        foundSession: !!sessionDoc,
        sessionDocId: sessionDoc?._id,
        timestamp: new Date().toISOString(),
      });
    } catch (findError) {
      console.error('[bookingController.createBooking] Failed to find Session document', {
        error: findError.message,
        stack: findError.stack,
        bookingId: booking._id,
        timestamp: new Date().toISOString(),
      });
      throw findError;
    }

   const gracePeriodMs = 5 * 60 * 1000;
    const defaultActualEndTime = new Date(new Date(booking.end).getTime() + gracePeriodMs);

    const sessionTargetState = initialBookingStatus; // Directly use the booking's initial status

    console.log('[bookingController.createBooking] Determined initial Session state for document:', { bookingStatus: initialBookingStatus, sessionInitialStateToSet: sessionTargetState });

    if (!sessionDoc) {

      console.debug('[bookingController.createBooking] Creating new Session document', {
        bookingId: booking._id,
         state: sessionTargetState, // Use the directly determined sessionTargetState
        bookingSessionLink: booking.sessionLink,
        timestamp: new Date().toISOString(),
      });

      let sessionLink = booking.sessionLink;
      if (!sessionLink || typeof sessionLink !== 'object' || Object.keys(sessionLink).length === 0) {
        console.warn('[bookingController.createBooking] sessionLink is missing or invalid, generating default', {
          bookingId: booking._id,
          originalSessionLink: sessionLink,
          timestamp: new Date().toISOString(),
        });
        sessionLink = {
          token: require('crypto').randomBytes(32).toString('hex'),
          sessionId: require('crypto').createHmac('sha256', process.env.SESSION_SECRET || 'default-secret')
            .update(`${booking._id}-${Date.now()}`).digest('hex'),
          generatedAt: new Date(),
          expired: false,
        };
      } else if (!sessionLink.token || !sessionLink.sessionId || !sessionLink.generatedAt) {
        console.warn('[bookingController.createBooking] sessionLink missing required fields, updating with defaults', {
          bookingId: booking._id,
          originalSessionLink: sessionLink,
          timestamp: new Date().toISOString(),
        });
        sessionLink = {
          token: sessionLink.token || require('crypto').randomBytes(32).toString('hex'),
          sessionId: sessionLink.sessionId || require('crypto').createHmac('sha256', process.env.SESSION_SECRET || 'default-secret')
            .update(`${booking._id}-${Date.now()}`).digest('hex'),
          generatedAt: sessionLink.generatedAt || new Date(),
          expired: sessionLink.expired !== undefined ? sessionLink.expired : false,
        };
      }

      sessionDoc = new Session({
        bookingId: booking._id,
        state: sessionTargetState, // Ensure this uses sessionTargetState
        start: new Date(booking.start),
        end: new Date(booking.end),
        coach: booking.coach,
        user: booking.user,
        sessionType: booking.sessionType,
        sessionLink: sessionLink,
        actualEndTime: defaultActualEndTime,
      });

      try {
        await sessionDoc.save({ session, validateBeforeSave: true });
        console.debug('[bookingController.createBooking] Session save completed successfully', {
          sessionId: sessionDoc._id,
          bookingId: sessionDoc.bookingId,
          state: sessionDoc.state,
          sessionLink: sessionDoc.sessionLink,
          actualEndTime: sessionDoc.actualEndTime,
          timestamp: new Date().toISOString(),
        });
        console.info('[bookingController.createBooking] Successfully created new Session document', {
          sessionId: sessionDoc._id,
          bookingId: sessionDoc.bookingId,
          state: sessionDoc.state,
          sessionLink: sessionDoc.sessionLink,
          actualEndTime: sessionDoc.actualEndTime,
          timestamp: new Date().toISOString(),
        });
      } catch (saveError) {
        console.error('[bookingController.createBooking] Failed to save new Session document', {
          error: saveError.message,
          stack: saveError.stack,
          sessionId: sessionDoc._id,
          bookingId: sessionDoc.bookingId,

          transactionSession: session?.id,
          sessionLink: sessionLink,
          timestamp: new Date().toISOString(),
        });
        throw saveError;
      }
} else {
      console.debug('[bookingController.createBooking] Updating existing Session document', {
        sessionId: sessionDoc._id,
        bookingId: sessionDoc.bookingId,
        newState: sessionTargetState, // Use the directly determined sessionTargetState
        bookingSessionLink: booking.sessionLink,
        timestamp: new Date().toISOString(),
      });

      let sessionLink = booking.sessionLink;
      if (!sessionLink || typeof sessionLink !== 'object' || Object.keys(sessionLink).length === 0) {
        console.warn('[bookingController.createBooking] sessionLink is missing or invalid, generating default', {
          bookingId: booking._id,
          originalSessionLink: sessionLink,
          timestamp: new Date().toISOString(),
        });
        sessionLink = {
          token: require('crypto').randomBytes(32).toString('hex'),
          sessionId: require('crypto').createHmac('sha256', process.env.SESSION_SECRET || 'default-secret')
            .update(`${booking._id}-${Date.now()}`).digest('hex'),
          generatedAt: new Date(),
          expired: false,
        };
      } else if (!sessionLink.token || !sessionLink.sessionId || !sessionLink.generatedAt) {
        console.warn('[bookingController.createBooking] sessionLink missing required fields, updating with defaults', {
          bookingId: booking._id,
          originalSessionLink: sessionLink,
          timestamp: new Date().toISOString(),
        });
        sessionLink = {
          token: sessionLink.token || require('crypto').randomBytes(32).toString('hex'),
          sessionId: sessionLink.sessionId || require('crypto').createHmac('sha256', process.env.SESSION_SECRET || 'default-secret')
            .update(`${booking._id}-${Date.now()}`).digest('hex'),
          generatedAt: sessionLink.generatedAt || new Date(),
          expired: sessionLink.expired !== undefined ? sessionLink.expired : false,
        };
      }

      sessionDoc.sessionLink = sessionLink;
      sessionDoc.start = new Date(booking.start);
      sessionDoc.end = new Date(booking.end);
      sessionDoc.coach = booking.coach;
      sessionDoc.user = booking.user;
      sessionDoc.sessionType = booking.sessionType;
      sessionDoc.state = sessionTargetState;
      sessionDoc.actualEndTime = defaultActualEndTime;

      try {
        await sessionDoc.save({ session, validateBeforeSave: true });
        console.debug('[bookingController.createBooking] Session save completed successfully', {
          sessionId: sessionDoc._id,
          bookingId: sessionDoc.bookingId,
          state: sessionDoc.state,
          sessionLink: sessionDoc.sessionLink,
          actualEndTime: sessionDoc.actualEndTime,
          timestamp: new Date().toISOString(),
        });
        console.info('[bookingController.createBooking] Successfully updated existing Session document', {
          sessionId: sessionDoc._id,
          bookingId: sessionDoc.bookingId,
          state: sessionDoc.state,
          sessionLink: sessionDoc.sessionLink,
          actualEndTime: sessionDoc.actualEndTime,
          timestamp: new Date().toISOString(),
        });
      } catch (saveError) {
        console.error('[bookingController.createBooking] Failed to save existing Session document', {
          error: saveError.message,
          stack: saveError.stack,
          sessionId: sessionDoc._id,
          bookingId: sessionDoc.bookingId,
          state: validState,
          transactionSession: session?.id,
          sessionLink: sessionLink,
          timestamp: new Date().toISOString(),
        });
        throw saveError;
      }
    }

 let paymentIntentClientSecret = null;
    if (!isAvailability && paymentIsEffectivelyRequired && !stripeCustomerId) {
    logger.error('[bookingController.createBooking] No Stripe customer ID for a booking that requires payment.', { userId: targetUser, bookingType: determinedBookingType });
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ message: 'The specified user is required to have payment details for this booking.' });
}

   if (!isAvailability && paymentIsEffectivelyRequired && stripeCustomerId && userDoc) {
      logger.info('[bookingController.createBooking] Conditions met for creating payment intent: not availability, has price, and has stripeCustomerId.', { userId: userDoc._id, stripeCustomerId });
      
      logger.info('[bookingController.createBooking] Creating payment intent with:', {
        bookingIdToLog: booking._id,
        priceDetails,
        stripeCustomerId,
        timestamp: new Date().toISOString()
      });

const paymentIntent = await paymentService.createPaymentIntent({
    bookingId: booking._id.toString(),
    priceDetails: priceDetails,
    currency: priceDetails.currency,
    stripeCustomerId,
    metadata: {
      sessionType: sessionTypeDoc.name,
      coachId: coach.toString(),
      userId: targetUser.toString(),
      source: 'bookingController.createBooking.userPayment',
      originalDecimalAmountFinal: priceDetails.final.amount.amount,
      originalDecimalAmountBase: priceDetails.base.amount.amount,
    }
  });

   console.log('[bookingController.createBooking] Payment intent created:', {
        bookingId: booking._id,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret ? '[REDACTED]' : null,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        timestamp: new Date().toISOString()
      });

      const Payment = require('../models/Payment');
      const paymentDoc = new Payment({
      booking: booking._id,
      payer: targetUser,
      recipient: coach,
      amount: {
        base: priceDetails.base.amount.amount,
        platformFee: priceDetails.platformFee.amount,
        vat: priceDetails.vat,
        total: priceDetails.final.amount.amount,
        currency: priceDetails.currency
      },
      status: 'pending',
      priceSnapshot: priceDetails,
      translationsSnapshot: req.body.translations || {},
      discountApplied: priceDetails?._calculationDetails?.winningDiscount,
      stripe: {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        chargeId: paymentIntent.latest_charge || null,
        customerId: stripeCustomerId
      }
  });

      await paymentDoc.save({ session });
      console.log('[bookingController.createBooking] Payment saved:', {
        paymentId: paymentDoc._id,
        amount: paymentDoc.amount,
        timestamp: new Date().toISOString()
      });

      console.log('[bookingController.createBooking] Payment data after creation:', {
        bookingId: booking._id,
        paymentId: paymentDoc._id,
        paymentStatus: paymentDoc.status,
        paymentStripeClientSecret: paymentDoc.stripe.clientSecret,
        bookingPaymentStatus: booking.payment?.status,
        bookingPaymentStripeClientSecret: booking.payment?.stripe?.clientSecret,
        bookingType: req.body.type || 'REQUEST',
        timestamp: new Date().toISOString()
      });

      const bookingBeforeUpdate = await Booking.findById(booking._id).session(session);
      console.log('[bookingController.createBooking] Booking state before update:', {
        bookingId: booking._id,
        payment: bookingBeforeUpdate.payment,
        timestamp: new Date().toISOString()
      });

      try {
        const rawBookingBeforeUpdate = await Booking.findById(booking._id).lean().session(session);
        console.log('[bookingController.createBooking] booking.payment object FROM DB JUST BEFORE problematic findByIdAndUpdate:', JSON.stringify(rawBookingBeforeUpdate?.payment, null, 2));
      } catch (e) {
        console.error('[bookingController.createBooking] Error fetching raw booking before findByIdAndUpdate for logging:', e);
      }

      await Booking.findByIdAndUpdate(
        booking._id,
        {
          'payment.paymentRecord': paymentDoc._id,
          'payment.status': determinedBookingType === 'REQUEST' ? 'pending' : (paymentIsEffectivelyRequired ? 'pending' : 'completed'),
          'payment.stripe': {
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            chargeId: paymentIntent.latest_charge || null
          }
        },
        { session }
      );

      console.log('[bookingController.createBooking] Updated booking with payment details:', {
        bookingId: booking._id,
        paymentStatus: determinedBookingType === 'REQUEST' ? 'pending' : (paymentIsEffectivelyRequired ? 'pending' : 'completed'),
        hasClientSecret: !!paymentIntent.client_secret,
        bookingType: determinedBookingType, // Use determinedBookingType for the log
        timestamp: new Date().toISOString()
      });

      paymentIntentClientSecret = paymentIntent.client_secret;
      console.log('[bookingController.createBooking] Payment intent created and linked:', {
        bookingId: booking._id,
        paymentId: paymentDoc._id,
        paymentIntentId: paymentIntent.id,
        amount: paymentDoc.amount.total,
        currency: paymentIntent.currency,
        stripeCustomerId,
        clientSecret: '[REDACTED]',
        timestamp: new Date().toISOString()
      });
    }

    await session.commitTransaction();
    transactionCommitted = true;
    session.endSession();

    const populatedBooking = await Booking.findById(booking._id)
      .populate('coach', 'firstName lastName email')
      .populate('user', 'firstName lastName email stripe.customerId')
      .populate('sessionType')
      .populate('payment.paymentRecord');

    console.log('[bookingController.createBooking] Populated booking:', {
      bookingId: populatedBooking._id,
      price: populatedBooking.price,
      payment: populatedBooking.payment ? {
        status: populatedBooking.payment.status,
        total: populatedBooking.payment.paymentRecord?.amount?.total
      } : null,
      timestamp: new Date().toISOString()
    });

    const bookingType = booking.type || req.body.type || (req.body.payment?.required ? 'FIRM' : 'REQUEST');

    console.log('[bookingController.createBooking] Checking booking type for notification handling:', {
      bookingId: booking._id,
      bookingType: bookingType,
      paymentRequired: booking.payment?.required || false,
      timestamp: new Date().toISOString()
    });

    const coachIdOnBooking = populatedBooking.coach._id.toString();
    const userIdOnBooking = populatedBooking.user ? populatedBooking.user._id.toString() : null;
    const isCoachInitiated = initiatorId === coachIdOnBooking;

    if (!isAvailability && populatedBooking.status === 'requested') {
        if (isCoachInitiated && userIdOnBooking) {
            logger.info('[bookingController.createBooking] Sending COACH_BOOKING_REQUEST notification to client.', { bookingId: populatedBooking._id, clientId: userIdOnBooking });
            await UnifiedNotificationService.sendNotification({
                type: NotificationTypes.COACH_BOOKING_REQUEST,
                recipient: userIdOnBooking,
                recipientType: 'client',
                category: NotificationCategories.BOOKING,
                priority: NotificationPriorities.HIGH,
                channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
                metadata: {
                    bookingId: populatedBooking._id,
                    coachName: `${populatedBooking.coach.firstName} ${populatedBooking.coach.lastName}`,
                    sessionTitle: populatedBooking.title,
                    startTime: populatedBooking.start,
                }
            }, populatedBooking);
        } else if (!isCoachInitiated && initiatorId === userIdOnBooking) {
            logger.info('[bookingController.createBooking] Sending BOOKING_REQUEST notification to coach.', { bookingId: populatedBooking._id, coachId: coachIdOnBooking });
            await sendBookingNotifications(populatedBooking);
        } else {
             logger.warn('[bookingController.createBooking] Ambiguous initiator for requested booking, using default notifications.', { bookingId: populatedBooking._id, initiatorId, coachIdOnBooking, userIdOnBooking });
            await sendBookingNotifications(populatedBooking);
        }
    } else if (bookingType === 'FIRM') {
      console.log('[bookingController.createBooking] Skipping initial notifications for firm booking; awaiting payment confirmation:', {
        bookingId: booking._id,
        paymentStatus: booking.payment?.status,
        timestamp: new Date().toISOString()
      });
    } else if (!isAvailability) {
      await sendBookingNotifications(populatedBooking);
    }

    console.log('[bookingController.createBooking] Booking created successfully:', {
      bookingId: booking._id,
      hasPaymentIntent: !!paymentIntentClientSecret,
      priceStored: populatedBooking.price?.final?.amount?.amount,
      paymentTotal: populatedBooking.payment?.paymentRecord?.amount?.total,
      timestamp: new Date().toISOString()
    });

    if (!isAvailability) {
      logger.info('[bookingController.createBooking] Sending regular booking response.', {
        bookingId: populatedBooking._id,
        hasPaymentIntent: !!paymentIntentClientSecret,
        associatedUserId: populatedBooking.user ? populatedBooking.user._id : null,
        timestamp: new Date().toISOString()
      });

      const responseBookingObject = populatedBooking.toObject();

      // Safely access user and stripe information for the response
      if (responseBookingObject.user && responseBookingObject.user.stripe) {
        responseBookingObject.user.stripe = { customerId: responseBookingObject.user.stripe.customerId };
      } else if (responseBookingObject.user) {
        responseBookingObject.user.stripe = { customerId: null }; // User exists but no stripe object
      } else {
        responseBookingObject.user = null; // No user associated with the booking
      }

      res.status(201).json({
        booking: responseBookingObject,
        paymentIntentClientSecret,
        success: true
      });
    } else {
      logger.info('[bookingController.createBooking] Sending availability response:', {
        bookingId: populatedBooking._id,
        isAvailability: true,
        timestamp: new Date().toISOString()
      });

      res.status(201).json({
        booking: populatedBooking,
        success: true
      });
    }
  } catch (error) {
    if (!transactionCommitted && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error('[bookingController.createBooking] Error aborting transaction:', {
          error: abortError.message,
          originalError: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (session) {
      try {
        session.endSession();
      } catch (sessionError) {
        console.error('[bookingController.createBooking] Error ending session:', {
          error: sessionError.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.error('[bookingController.createBooking] Error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

   if (error instanceof PricingService.PriceCalculationError) {
    return res.status(400).json({ message: error.message, code: error.code });
}
res.status(500).json({
  message: 'Error creating booking',
  error: error.message,
  success: false
});
  }
};

// Add new endpoint for refund calculations
exports.calculateRefund = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { refundType = 'full' } = req.body;

    console.log('[bookingController.calculateRefund] Calculating refund:', {
      bookingId,
      refundType,
      requestedBy: req.user?._id
    });

    const booking = await Booking.findById(bookingId)
      .populate('coach user sessionType');

    if (!booking) {
      console.warn('[bookingController.calculateRefund] Booking not found:', bookingId);
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check authorization
    if (![booking.coach._id.toString(), booking.user._id.toString()].includes(req.user._id.toString())) {
      console.warn('[bookingController.calculateRefund] Unauthorized attempt:', {
        bookingId,
        userId: req.user._id
      });
      return res.status(403).json({ message: 'Not authorized to calculate refund for this booking' });
    }

    if (!booking.price?.final) {
      return res.status(400).json({ message: 'No payment information found for booking' });
    }

    // Calculate refund amount based on type
    const refundAmount = refundType === 'full' ? 
      booking.price.final : 
      (booking.price.final * 0.5); // 50% for partial refunds

    // If the booking includes VAT details, calculate proportional VAT
    const vatAmount = booking.price.vat?.amount ? 
      (refundAmount / booking.price.final) * booking.price.vat.amount :
      0;

    const refundCalculation = {
      amount: refundAmount,
      vat: {
        amount: vatAmount,
        rate: booking.price.vat?.rate || 0,
        included: booking.price.vat?.included || false
      },
      total: refundAmount + (booking.price.vat?.included ? 0 : vatAmount),
      currency: booking.price.currency
    };

    console.log('[bookingController.calculateRefund] Refund calculated:', {
      bookingId,
      amount: refundCalculation.amount,
      total: refundCalculation.total
    });

    res.json(refundCalculation);
  } catch (error) {
    console.error('[bookingController.calculateRefund] Error:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error calculating refund' });
  }
};

exports.getBookings = async (req, res) => {
  const userId = req.user._id;
  if (!userId) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    console.log('[getBookings] Fetching bookings for user:', userId);
    const user = await User.findById(userId);
    let bookings;
    if (user.role === 'coach') {
      bookings = await Booking.find({ coach: userId }).populate('user', 'firstName lastName email');
    } else {
      bookings = await Booking.find({ user: userId }).populate('coach', 'firstName lastName email');
    }
    console.log('[getBookings] Bookings fetched:', bookings.length);

    res.json(bookings);
  } catch (error) {
    console.error('[getBookings] Error fetching bookings:', error);
    res.status(500).json({ message: 'Error fetching bookings' });
  }
};

exports.getBookingSummary = async (req, res) => {
  const { bookingId } = req.params;
  const requesterId = req.user?._id?.toString();

  if (!requesterId) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const booking = await Booking.findById(bookingId)
      .select('title start status coach user attendees.user')
      .lean();

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const isCoach = booking.coach?.toString() === requesterId;
    const isUser = booking.user?.toString() === requesterId;
    const isAttendee = booking.attendees?.some(att => att.user?.toString() === requesterId);

    if (isCoach || isUser || isAttendee) {
      res.json(booking);
    } else {
      res.status(403).json({ message: 'Not authorized to view this booking summary' });
    }
  } catch (error) {
    logger.error('[getBookingSummary] Error fetching booking summary', { error: error.message, bookingId });
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getBooking = async (req, res) => {
  const { bookingId } = req.params;
  const requesterId = req.user?._id?.toString() || req.user?.id;
  const requesterRole = req.user?.role;

  //console.log(`[DEBUG: getBooking] ---- START ----`);
  //console.log(`[DEBUG: getBooking] Request received for bookingId: ${bookingId}`);
  //console.log(`[DEBUG: getBooking] Requester Info: ID = ${requesterId}, Role = ${requesterRole}`);

  try {
    const booking = await Booking.findById(bookingId)
      .populate({
        path: 'coach',
        select: '_id firstName lastName email profilePicture role'
      })
      .populate({
        path: 'user',
        select: '_id firstName lastName email profilePicture role'
      })
      .populate('sessionType')
      .populate({
        path: 'attendees.user',
        select: '_id firstName lastName email profilePicture settings.profileVisibility'
      })
      .populate({
        path: 'disputeTicket',
        populate: {
            path: 'user',
            select: 'firstName lastName'
        }
      })
      .lean();

    if (!booking) {
      //console.log(`[DEBUG: getBooking] FAILED: Booking not found in database for bookingId: ${bookingId}`);
      return res.status(404).json({
        message: 'Booking not found',
        bookingId,
      });
    }

    //console.log(`[DEBUG: getBooking] Successfully fetched booking from DB. Booking ID: ${booking._id?.toString()}`);
    //console.log(`[DEBUG: getBooking] Booking Details: coach ID = ${booking.coach?._id?.toString()}, client/user ID = ${booking.user?._id?.toString()}`);

    let authorized = false;
    let authorizationReason = "No rule matched.";
    const bookingCoachId = booking.coach?._id?.toString();
    const bookingUserId = booking.user?._id?.toString();
    const isWebinarType = booking.sessionType?._id?.toString() === WEBINAR_TYPE_ID_STRING;

    //console.log(`[DEBUG: getBooking] ---- Authorization Check START ----`);
    //console.log(`[DEBUG: getBooking] Auth Vars: requesterId = '${requesterId}' (type: ${typeof requesterId}), requesterRole = '${requesterRole}'`);
    //console.log(`[DEBUG: getBooking] Auth Vars: bookingCoachId = '${bookingCoachId}' (type: ${typeof bookingCoachId})`);
    //console.log(`[DEBUG: getBooking] Auth Vars: bookingUserId = '${bookingUserId}' (type: ${typeof bookingUserId})`);

    //console.log(`[DEBUG: getBooking] Checking Rule 1 (Admin): Is requesterRole 'admin'? Result: ${requesterRole === 'admin'}`);
    if (requesterRole === 'admin') {
      authorized = true;
      authorizationReason = "User is an admin.";
    }
    else if (requesterId && requesterId === bookingCoachId) {
      //console.log(`[DEBUG: getBooking] Checking Rule 2 (Coach): Does requesterId '${requesterId}' match bookingCoachId '${bookingCoachId}'? Result: true`);
      authorized = true;
      authorizationReason = "User is the coach for this booking.";
    }
    else if (requesterId && requesterId === bookingUserId) {
     // console.log(`[DEBUG: getBooking] Checking Rule 3 (Client): Does requesterId '${requesterId}' match bookingUserId '${bookingUserId}'? Result: true`);
      authorized = true;
      authorizationReason = "User is the client for this booking.";
    }
    else if (requesterId && booking.attendees?.length > 0) {
      const isAttendee = booking.attendees.some(att => att.user?._id.toString() === requesterId && att.status === 'confirmed');
      //console.log(`[DEBUG: getBooking] Checking Rule 4 (Attendee): Is requesterId '${requesterId}' a confirmed attendee? Result: ${isAttendee}`);
      if (isAttendee) {
        authorized = true;
        authorizationReason = "User is a confirmed attendee.";
      }
    }
    else if (isWebinarType && (booking.isPublic || booking.showInWebinarBrowser)) {
      //console.log(`[DEBUG: getBooking] Checking Rule 5 (Public Webinar): isWebinarType=${isWebinarType}, isPublic=${booking.isPublic}, showInWebinarBrowser=${booking.showInWebinarBrowser}. Result: true`);
      authorized = true;
      authorizationReason = "Booking is a public webinar.";
    }
    else if (requesterId && booking.userIds?.length > 0) {
      const isInUserIds = booking.userIds.map(id => id.toString()).includes(requesterId);
      //console.log(`[DEBUG: getBooking] Checking Rule 6 (userIds array): Is requesterId '${requesterId}' in userIds array? Result: ${isInUserIds}`);
      if (isInUserIds) {
        authorized = true;
        authorizationReason = "User is in the booking's userIds array.";
      }
    }

    //console.log(`[DEBUG: getBooking] ---- Authorization Check END ----`);
    //console.log(`[DEBUG: getBooking] Final Authorization Status: ${authorized}. Reason: ${authorizationReason}`);

    if (!authorized) {
      //console.log(`[DEBUG: getBooking] Authorization FAILED. Denying access for requesterId '${requesterId}' to bookingId '${bookingId}'.`);
      return res.status(403).json({ message: 'Not authorized to view this booking' });
    }

    let coachProfileData = null;
    if (booking.coach && booking.coach.role === 'coach') {
      coachProfileData = await Coach.findOne({ user: booking.coach._id }).select('profilePicture').lean();
    }
    const sessionDoc = await Session.findOne({ bookingId: booking._id }).select('recordings').lean();
    const recordings = sessionDoc?.recordings || [];

    const responseBooking = {
      ...booking,
      coach: booking.coach ? {
        _id: booking.coach._id,
        firstName: booking.coach.firstName,
        lastName: booking.coach.lastName,
        email: booking.coach.email,
        coachProfilePicture: coachProfileData?.profilePicture || booking.coach.profilePicture,
        profilePicture: booking.coach.profilePicture,
      } : null,
      user: booking.user ? {
        _id: booking.user._id,
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
        email: booking.user.email,
        profilePicture: booking.user.profilePicture
      } : null,
      attendees: booking.attendees.map(att => ({
        user: att.user,
        status: att.status,
        joinedAt: att.joinedAt
      })),
      recordings: recordings.map(rec => ({
        recordingId: rec.recordingId,
        status: rec.status,
        url: rec.status === 'available' ? rec.url : null,
        duration: rec.duration,
        startTime: rec.startTime,
        endTime: rec.endTime,
        consentGiven: rec.consentGiven
      }))
    };

    //console.log(`[DEBUG: getBooking] Successfully authorized and processed booking. Sending response for bookingId: ${bookingId}`);
    res.json(responseBooking);
  } catch (error) {
    /*console.log(`[DEBUG: getBooking] ---- ERROR CATCH ----`);
    console.log(`[DEBUG: getBooking] An unexpected error occurred for bookingId: ${bookingId}`);
    console.log(`[DEBUG: getBooking] Error Name: ${error.name}`);
    console.log(`[DEBUG: getBooking] Error Message: ${error.message}`);
    console.log(`[DEBUG: getBooking] Error Stack: ${error.stack}`);*/
    if (error.name === 'StrictPopulateError') {
        //console.log(`[DEBUG: getBooking] Mongoose StrictPopulateError. Check schema path for populate: ${error.path}`);
        return res.status(500).json({
            message: `Server error during data population. Path issue: ${error.path}`,
            error: error.message,
        });
    }
    res.status(500).json({
      message: 'Error fetching booking',
      error: error.message,
    });
  }
};

exports.getCoachBookings = async (req, res) => {
  const { userId } = req.params;
  const { start, end } = req.query;
  const requester = req.user;
  const requesterId = requester?._id?.toString() || requester?.id;

  //console.log(`[DEBUG: getCoachBookings] ---- START ----`);
  //console.log(`[DEBUG: getCoachBookings] Request received for coach's bookings. Target Coach ID: ${userId}, Requester ID: ${requesterId}`);

  try {
    const coach = await Coach.findOne({ user: userId }).select('settings');
    if (!coach) {
      //console.log(`[DEBUG: getCoachBookings] FAILED: Coach profile not found for user ID: ${userId}`);
      return res.status(404).json({ message: 'Coach not found' });
    }
    //console.log(`[DEBUG: getCoachBookings] Found coach profile for user ID: ${userId}`);

    const isOwner = requesterId && requesterId === userId;
    const calendarVisibility = coach.settings?.privacySettings?.calendarVisibility || 'private';
    let canView = false;
    let authorizationReason = "No rule matched.";

    //console.log(`[DEBUG: getCoachBookings] ---- Authorization Check START ----`);
    //console.log(`[DEBUG: getCoachBookings] Auth Vars: isOwner = ${isOwner} (requesterId '${requesterId}' === userId '${userId}')`);
    //console.log(`[DEBUG: getCoachBookings] Auth Vars: calendarVisibility = '${calendarVisibility}'`);

    //console.log(`[DEBUG: getCoachBookings] Checking Rule 1 (Owner): Is requester the owner? Result: ${isOwner}`);
    if (isOwner) {
      canView = true;
      authorizationReason = "Requester is the owner of the calendar.";
    } else {
      //console.log(`[DEBUG: getCoachBookings] Checking Rule 2 (Public Calendar): Is visibility 'public'? Result: ${calendarVisibility === 'public'}`);
      if (calendarVisibility === 'public') {
        canView = true;
        authorizationReason = "Calendar visibility is 'public'.";
      } else {
        //console.log(`[DEBUG: getCoachBookings] Checking Rule 3 (Connected Only): Is visibility 'connectedOnly'? Result: ${calendarVisibility === 'connectedOnly'}`);
        if (calendarVisibility === 'connectedOnly' && requesterId) {
          //console.log(`[DEBUG: getCoachBookings] Visibility is 'connectedOnly'. Searching for connection between coach '${userId}' and client '${requesterId}'`);
          const connection = await Connection.findOne({
            $or: [{ coach: userId, client: requesterId }, { client: userId, coach: requesterId }],
            status: 'accepted'
          });
          if (connection) {
            //console.log(`[DEBUG: getCoachBookings] Found an 'accepted' connection. ID: ${connection._id}`);
            canView = true;
            authorizationReason = "Calendar is 'connectedOnly' and an accepted connection exists.";
          } else {
            //console.log(`[DEBUG: getCoachBookings] No 'accepted' connection found.`);
          }
        }
      }
    }

    //console.log(`[DEBUG: getCoachBookings] ---- Authorization Check END ----`);
    //console.log(`[DEBUG: getCoachBookings] Final Authorization Status: ${canView}. Reason: ${authorizationReason}`);

    if (!canView) {
      //console.log(`[DEBUG: getCoachBookings] Authorization FAILED. Denying access for requester '${requesterId}' to view calendar of coach '${userId}'.`);
      return res.status(403).json({ message: 'You do not have permission to view this calendar.' });
    }

    //console.log(`[DEBUG: getCoachBookings] Authorization successful. Proceeding to fetch bookings.`);
    const query = { coach: userId };
    if (start && end) {
      query.start = { $gte: new Date(start) };
      query.end = { $lte: new Date(end) };
    }
    //console.log(`[DEBUG: getCoachBookings] Executing Booking.find with query:`, JSON.stringify(query));

    const bookings = await Booking.find(query)
      .populate('sessionType', 'name')
      .populate('user', '_id firstName lastName')
      .populate('coach', '_id firstName lastName');

   // console.log(`[DEBUG: getCoachBookings] Found ${bookings.length} total booking/availability items.`);

    const availability = bookings.filter(b => b.isAvailability);
    let regularBookings = bookings.filter(b => !b.isAvailability);

   if (!isOwner) {
      const showFull = coach.settings?.privacySettings?.showFullCalendar;
      //console.log(`[DEBUG: getCoachBookings] Requester is not owner. Processing regular bookings based on privacy. showFullCalendar=${showFull}`);

      regularBookings = regularBookings.map(booking => {
        const isParticipant = (requesterId && booking.user?._id?.toString() === requesterId) ||
                              (requesterId && Array.isArray(booking.attendees) && booking.attendees.some(att => (att.user?._id || att.user)?.toString() === requesterId));

        const sessionTypeIdString = booking.sessionType?._id?.toString() || '';
        const isWebinarType = sessionTypeIdString === WEBINAR_TYPE_ID_STRING;
        const isPublicEvent = isWebinarType && (booking.isPublic || booking.showInWebinarBrowser);

        if (isParticipant || isPublicEvent) {
          return booking;
        }

        if (showFull) {
          return { ...booking.toObject(), title: 'Busy', user: null, attendees: [], price: null, description: null, isPublicView: true };
        }

        return null;
      }).filter(Boolean);
    }

    const responseData = { availability, regularBookings };
    //console.log(`[DEBUG: getCoachBookings] Sending response. Final counts: availability=${responseData.availability.length}, regularBookings=${responseData.regularBookings.length}`);
    res.json(responseData);
  } catch (error) {
    /*console.log(`[DEBUG: getCoachBookings] ---- ERROR CATCH ----`);
    console.log(`[DEBUG: getCoachBookings] An unexpected error occurred for userId: ${userId}`);
    console.log(`[DEBUG: getCoachBookings] Error Name: ${error.name}`);
    console.log(`[DEBUG: getCoachBookings] Error Message: ${error.message}`);
    console.log(`[DEBUG: getCoachBookings] Error Stack: ${error.stack}`);*/
    res.status(500).json({ message: 'Error fetching coach bookings' });
  }
};

exports.getUpcomingBookings = async (req, res) => {
  const { userId } = req.params;

  console.log(`[DEBUG: getUpcomingBookings] ---- START ----`);
  console.log(`[DEBUG: getUpcomingBookings] Request received to fetch upcoming bookings for userId: ${userId}`);

  if (!userId) {
    console.log('[DEBUG: getUpcomingBookings] FAILED: User ID is missing from request parameters.');
    return res.status(400).json({ message: 'User ID is required' });
  }

  try {
    const currentDate = new Date();
    const query = {
      $or: [{ user: userId }, { coach: userId }],
      start: { $gte: currentDate }
    };
    
    console.log(`[DEBUG: getUpcomingBookings] Current server date for query: ${currentDate.toISOString()}`);
    console.log(`[DEBUG: getUpcomingBookings] Executing Booking.find with query:`, JSON.stringify(query, null, 2));

    const bookings = await Booking.find(query)
      .populate('coach', 'firstName lastName')
      .populate('sessionType');
    
    console.log(`[DEBUG: getUpcomingBookings] Successfully fetched bookings. Count: ${bookings.length}`);
    
    res.json(bookings);
  } catch (error) {
    console.log(`[DEBUG: getUpcomingBookings] ---- ERROR CATCH ----`);
    console.log(`[DEBUG: getUpcomingBookings] An unexpected error occurred for userId: ${userId}`);
    console.log(`[DEBUG: getUpcomingBookings] Error Name: ${error.name}`);
    console.log(`[DEBUG: getUpcomingBookings] Error Message: ${error.message}`);
    console.log(`[DEBUG: getUpcomingBookings] Error Stack: ${error.stack}`);
    res.status(500).json({ message: 'Error fetching upcoming bookings' });
  }
};

exports.getUserSessions = async (req, res) => {
  const startTime = Date.now();
  const { userId } = req.params;
  const { start, end } = req.query;

  console.log('[bookingController.getUserSessions] Fetching sessions:', {
    userId,
    requestedBy: req.user?._id,
    start,
    end,
    method: req.method,
    url: req.originalUrl
  });

  // Verify user is requesting their own sessions
  if (userId !== req.user._id.toString()) {
    console.warn('[bookingController.getUserSessions] Unauthorized access attempt:', {
      requestedUserId: userId,
      authenticatedUserId: req.user._id
    });
    return res.status(403).json({ message: 'Not authorized to view these sessions' });
  }

  try {
    // Build query
    const query = {
      $or: [
        { user: userId }, 
        { 'attendees.user': userId, 'attendees.status': 'confirmed' } 
      ],
      status: { 
        $nin: ['cancelled_by_coach', 'cancelled_by_client', 'declined'] 
      }
    };

    // Add date range if provided
    if (start && end) {
      query.start = { $gte: new Date(start) };
      query.end = { $lte: new Date(end) };
    }

    console.log('[bookingController.getUserSessions] Executing query:', {
      query,
      userId
    });

    const sessions = await Booking.find(query)
      .populate('coach', 'firstName lastName email profilePicture')
      .populate('sessionType')
      .sort({ start: 1 });

    // Format sessions for calendar
    const formattedSessions = sessions.map(session => ({
      _id: session._id,
      title: session.title || session.sessionType?.name || 'Coaching Session',
      start: session.start,
      end: session.end,
      coach: session.coach,
      sessionType: session.sessionType,
      status: session.status,
      price: session.price,
      virtualMeeting: session.virtualMeeting || null,
      timezone: session.timezone || req.user.settings?.timeZone || 'UTC'
    }));

    const executionTime = Date.now() - startTime;
    console.log('[bookingController.getUserSessions] Sessions fetched successfully:', {
      userId,
      sessionCount: formattedSessions.length,
      executionTime
    });

    res.json({
      sessions: formattedSessions,
      metadata: {
        total: formattedSessions.length,
        timezone: req.user.settings?.timeZone || 'UTC',
        executionTime
      }
    });
  } catch (error) {
    console.error('[bookingController.getUserSessions] Error:', {
      userId,
      error: {
        message: error.message,
        stack: error.stack
      },
      executionTime: Date.now() - startTime
    });
    res.status(500).json({ 
      message: 'Error fetching user sessions',
      error: error.message
    });
  }
};

exports.updateBookingStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    console.log('[updateBookingStatus] Updating booking status:', { bookingId, status });

    // Get the booking with its old status
    const oldBooking = await Booking.findById(bookingId);
    if (!oldBooking) {
      console.log('[updateBookingStatus] Booking not found:', bookingId);
      return res.status(404).json({ message: 'Booking not found' });
    }

    const oldStatus = oldBooking.status;

    // Update the booking
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status },
      { new: true }
    ).populate('coach user sessionType');

    let sessionDoc = await Session.findOne({ bookingId: booking._id });
    if (sessionDoc) {
      sessionDoc.state = status;
      sessionDoc.lastUpdated = new Date();
      await sessionDoc.save();
      console.log('[updateBookingStatus] Updated Session state:', {
        sessionId: sessionDoc._id,
        bookingId: booking._id,
        state: sessionDoc.state,
        sessionLink: sessionDoc.sessionLink,
        timestamp: new Date().toISOString(),
      });
    } else {
      sessionDoc = new Session({
        bookingId: booking._id,
        state: status,
        startedAt: new Date(booking.start),
        endedAt: new Date(booking.end),
        participants: [
          { userId: booking.coach, joinedAt: new Date() },
          { userId: booking.user, joinedAt: new Date() }
        ],
        sessionLink: { ...booking.sessionLink },
      });
      await sessionDoc.save();
      console.warn('[updateBookingStatus] Created new Session (unexpected absence during status update)', {
        sessionId: sessionDoc._id,
        bookingId: booking._id,
        state: sessionDoc.state,
        sessionLink: sessionDoc.sessionLink,
        timestamp: new Date().toISOString(),
      });
    }

    // Get notifications based on status change
    const notificationConfigs = await UnifiedNotificationService.getNotificationsForStatusChange(
      booking, oldStatus, status
    );

    // Create and send notifications
    const notifications = await Promise.all(
      notificationConfigs.map(config => 
        UnifiedNotificationService.sendNotification(config, booking)
      )
    );

    // Emit socket notifications
    const socketService = getSocketService();
    if (socketService) {
      const recipients = [booking.coach.toString(), booking.user.toString()];
      notifications.forEach(notification => {
        socketService.emitBookingNotification(notification, recipients, booking);
      });
    }

    console.log('[updateBookingStatus] Booking status updated:', {
      bookingId: booking._id,
      oldStatus,
      newStatus: status,
      notificationsSent: notifications.length
    });

    res.json({ booking, session: sessionDoc.toObject() });
  } catch (error) {
    console.error('[updateBookingStatus] Error updating booking status:', error);
    res.status(500).json({ message: 'Error updating booking status' });
  }
};

const sendBookingNotifications = async (booking) => {
  console.log('[sendBookingNotifications] Sending notifications for booking:', booking._id);

  try {
    const notificationConfigs = await getNotificationsForBookingStatus(booking.status, booking);
    console.log('[sendBookingNotifications] Notification configs:', JSON.stringify(notificationConfigs, null, 2));

    for (const config of notificationConfigs) {
      try {
        console.log('[sendBookingNotifications] Notification config before sending:', {
          config: JSON.stringify(config, null, 2),
          timestamp: new Date().toISOString()
        });
        await UnifiedNotificationService.sendNotification(config, booking);
        console.log('[sendBookingNotifications] Notification sent successfully for config:', JSON.stringify(config, null, 2));
      } catch (notificationError) {
        console.error('[sendBookingNotifications] Error sending notification:', notificationError);
      }
    }

    console.log('[sendBookingNotifications] All notifications processed for booking:', booking._id);
  } catch (error) {
    console.error('[sendBookingNotifications] Error in notification process:', error);
  }
};

exports.createSession = async (req, res) => {
  try {
    const { userId, ...sessionData } = req.body;
    console.log('[createSession] Creating new session:', sessionData);

    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      return res.status(404).json({ message: 'Coach not found' });
    }

    const newSession = new Booking({
      coach: userId,
      ...sessionData
    });

    await newSession.save();
    console.log('[createSession] Session saved to database:', newSession);

    // Update coach's availability if necessary
    if (sessionData.type === 'availability') {
      coach.availability.push(newSession);
      await coach.save();
    }

    res.status(201).json(newSession);
  } catch (error) {
    console.error('[createSession] Error creating session:', error);
    res.status(500).json({ message: 'Error creating session' });
  }
};

exports.updateSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = req.body;
    console.log(`[updateSession] Updating session ${sessionId}:`, sessionData);

    const updatedSession = await Booking.findByIdAndUpdate(sessionId, sessionData, { new: true });
    if (!updatedSession) {
      return res.status(404).json({ message: 'Session not found' });
    }

    console.log('[updateSession] Session updated in database:', updatedSession);

    // Update coach's availability if necessary
    if (sessionData.type === 'availability') {
      const coach = await Coach.findOne({ user: updatedSession.coach });
      if (coach) {
        const availabilityIndex = coach.availability.findIndex(a => a._id.toString() === sessionId);
        if (availabilityIndex !== -1) {
          coach.availability[availabilityIndex] = updatedSession;
          await coach.save();
        }
      }
    }

    res.json(updatedSession);
  } catch (error) {
    console.error('[updateSession] Error updating session:', error);
    res.status(500).json({ message: 'Error updating session' });
  }
};

exports.deleteBooking = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { bookingId } = req.params;
    const userId = req.user._id.toString();
    console.log(`[deleteBooking] Deleting booking ${bookingId}`, {
      bookingId,
      userId,
      timestamp: new Date().toISOString(),
    });

    // Fetch the booking to verify existence and authorization
    const deletedBooking = await Booking.findById(bookingId)
      .populate('coach user')
      .session(session);
    if (!deletedBooking) {
      console.log(`[deleteBooking] Booking not found: ${bookingId}`, {
        bookingId,
        timestamp: new Date().toISOString(),
      });
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Booking not found', success: false });
    }

    // Authorization: Only coach or user can delete
    if (
      ![deletedBooking.coach._id.toString(), deletedBooking.user._id.toString()].includes(
        userId
      )
    ) {
      console.warn(`[deleteBooking] Unauthorized deletion attempt`, {
        bookingId,
        userId,
        coachId: deletedBooking.coach._id.toString(),
        userIdInBooking: deletedBooking.user._id.toString(),
        timestamp: new Date().toISOString(),
      });
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        message: 'Not authorized to delete this booking',
        success: false,
      });
    }

    // Delete the booking
    await Booking.findByIdAndDelete(bookingId, { session });
    console.log(`[deleteBooking] Booking deleted from Booking collection: ${bookingId}`, {
      bookingId,
      timestamp: new Date().toISOString(),
    });

    // Delete related Session document
    const sessionDeleteResult = await Session.deleteOne({ bookingId }, { session });
    console.log(`[deleteBooking] Session deletion result`, {
      bookingId,
      deletedCount: sessionDeleteResult.deletedCount,
      timestamp: new Date().toISOString(),
    });

    // Update related Payment documents (mark as cancelled)
    const paymentUpdateResult = await Payment.updateOne(
      { booking: bookingId },
      {
        $set: {
          status: 'cancelled',
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { session }
    );
    console.log(`[deleteBooking] Payment update result`, {
      bookingId,
      modifiedCount: paymentUpdateResult.modifiedCount,
      timestamp: new Date().toISOString(),
    });

    // Archive related notifications
    const updatedNotifications = await Notification.updateMany(
      { 'metadata.bookingId': bookingId },
      {
        $set: {
          status: NotificationStatus.ARCHIVED,
          'metadata.deletedAt': new Date(),
          'metadata.actionResult': 'booking_deleted',
        },
      },
      { session }
    );
    logger.info('[deleteBooking] Archived related notifications', {
      bookingId,
      notificationCount: updatedNotifications.modifiedCount,
      timestamp: new Date().toISOString(),
    });

    // Commit the transaction
    await session.commitTransaction();
    console.log(`[deleteBooking] Transaction committed for booking: ${bookingId}`, {
      bookingId,
      timestamp: new Date().toISOString(),
    });

    // End the session
    session.endSession();

    // Invalidate backend caches (node-cache)
    try {
      const coachCacheKey = `coach:${deletedBooking.coach._id}`;
      const userCacheKey = `user:${deletedBooking.user._id}`;
      await cacheService.deletePattern(coachCacheKey);
      await cacheService.deletePattern(userCacheKey);
      console.log(`[deleteBooking] Cache invalidated for coach and user`, {
        bookingId,
        coachCacheKey,
        userCacheKey,
        timestamp: new Date().toISOString(),
      });
    } catch (cacheError) {
      console.error(`[deleteBooking] Error invalidating cache`, {
        bookingId,
        error: cacheError.message,
        timestamp: new Date().toISOString(),
      });
    }

    // Emit socket events to notify clients
    const socketService = getSocketService();
    if (socketService) {
      try {
        await socketService.emitBookingStatusUpdate(
          bookingId,
          'deleted',
          [deletedBooking.coach._id.toString(), deletedBooking.user._id.toString()]
        );
        console.log(`[deleteBooking] Emitted socket event for booking deletion`, {
          bookingId,
          recipients: [
            deletedBooking.coach._id.toString(),
            deletedBooking.user._id.toString(),
          ],
          timestamp: new Date().toISOString(),
        });
      } catch (socketError) {
        console.error(`[deleteBooking] Error emitting socket event`, {
          bookingId,
          error: socketError.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Respond with success
    res.status(200).json({
      message: 'Booking deleted successfully',
      bookingId,
      deletedBooking: deletedBooking.toObject(),
      success: true,
    });
    console.log(`[deleteBooking] Response sent for booking deletion: ${bookingId}`, {
      bookingId,
      responseStatus: 200,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Roll back transaction if it hasn't been committed
    if (session.inTransaction()) {
      try {
        await session.abortTransaction();
        console.log(
          `[deleteBooking] Transaction aborted for booking: ${req.params.bookingId}`,
          {
            bookingId: req.params.bookingId,
            timestamp: new Date().toISOString(),
          }
        );
      } catch (abortError) {
        console.error(`[deleteBooking] Error aborting transaction`, {
          bookingId: req.params.bookingId,
          error: abortError.message,
          timestamp: new Date().toISOString(),
        });
      }
    }
    session.endSession();

    console.error('[deleteBooking] Error deleting booking', {
      bookingId: req.params.bookingId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      message: 'Error deleting booking',
      error: error.message,
      success: false,
    });
  }
};

exports.createAvailability = async (req, res) => {
  try {
    const { start, end, isRecurring, recurrencePattern, recurrenceEndDate, availableForInstantBooking, title, sessionTypeId } = req.body;
    const userId = req.user._id;

    console.log('[createAvailability] Creating availability:', req.body);

    const coach = await Coach.findOne({ user: userId });
    if (!coach) {
      console.error('[createAvailability] Coach not found for user ID:', userId);
      return res.status(404).json({ message: 'Coach not found' });
    }

    const availabilitySessionType = await SessionType.findById(sessionTypeId);
    if (!availabilitySessionType) {
      console.error('[createAvailability] Availability session type not found for ID:', sessionTypeId);
      return res.status(404).json({ message: 'Availability session type not found' });
    }

    let availabilitySlots = [];

    if (isRecurring) {
      let currentDate = moment(start);
      const endDate = moment(recurrenceEndDate);

      while (currentDate.isSameOrBefore(endDate)) {
        availabilitySlots.push({
          coach: userId,
          sessionType: availabilitySessionType._id,
          start: currentDate.toDate(),
          end: moment(currentDate).add(moment(end).diff(moment(start), 'minutes'), 'minutes').toDate(),
          title,
          isAvailability: true,
          isRecurring,
          recurrencePattern,
          recurrenceEndDate,
          availableForInstantBooking
        });

        switch (recurrencePattern) {
          case 'daily':
            currentDate.add(1, 'days');
            break;
          case 'weekly':
            currentDate.add(1, 'weeks');
            break;
          case 'monthly':
            currentDate.add(1, 'months');
            break;
        }
      }
    } else {
      availabilitySlots.push({
        coach: userId,
        sessionType: availabilitySessionType._id,
        start,
        end,
        title,
        isAvailability: true,
        availableForInstantBooking
      });
    }

    console.log('[createAvailability] Creating availability slots:', availabilitySlots);

    const createdAvailability = await Booking.insertMany(availabilitySlots);
    console.log('[createAvailability] Availability created:', createdAvailability);
    res.status(201).json(createdAvailability);
  } catch (error) {
    console.error('[createAvailability] Error:', error);
    res.status(500).json({ message: 'Error creating availability', error: error.message });
  }
};

exports.updateAvailability = async (req, res) => {
  try {
    const { availabilityId } = req.params;
    const updateData = req.body;
    const userId = req.user._id;

    const availability = await Booking.findById(availabilityId);
    if (!availability) {
      return res.status(404).json({ message: 'Availability not found' });
    }

    if (availability.coach.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to update this availability' });
    }

    const updatedAvailability = await Booking.findByIdAndUpdate(availabilityId, updateData, { new: true });
    res.json(updatedAvailability);
  } catch (error) {
    console.error('[updateAvailability] Error:', error);
    res.status(500).json({ message: 'Error updating availability', error: error.message });
  }
};

exports.deleteAvailability = async (req, res) => {
  try {
    const { availabilityId } = req.params;
    const userId = req.user._id;

    const availability = await Booking.findById(availabilityId);
    if (!availability) {
      return res.status(404).json({ message: 'Availability not found' });
    }

    if (availability.coach.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to delete this availability' });
    }

    await Booking.findByIdAndDelete(availabilityId);
    res.json({ message: 'Availability deleted successfully' });
  } catch (error) {
    console.error('[deleteAvailability] Error:', error);
    res.status(500).json({ message: 'Error deleting availability', error: error.message });
  }
};

exports.declineBooking = async (req, res) => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second
  let retries = 0;

  while (retries < MAX_RETRIES) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const { bookingId } = req.params;
      const { message } = req.body;

      console.info('[declineBooking] Starting decline process:', {
        bookingId,
        userId: req.user._id,
        timestamp: new Date().toISOString(),
      });

      const booking = await Booking.findById(bookingId)
        .populate(['coach', 'user', 'sessionType'])
        .session(session);

      if (!booking) {
        console.warn('[declineBooking] Booking not found:', { bookingId });
        await session.abortTransaction();
        return res.status(404).json({ message: 'Booking not found' });
      }

      console.info('[declineBooking] Found booking:', {
        bookingId: booking._id,
        client: booking.user._id,
        coach: booking.coach._id,
        status: booking.status,
        timestamp: new Date().toISOString(),
      });

      if (booking.status !== 'requested') {
        console.warn('[declineBooking] Invalid booking status for decline:', {
          bookingId,
          currentStatus: booking.status
        });
        await session.abortTransaction();
        return res.status(400).json({ message: 'Booking cannot be declined in its current state' });
      }

      // Get original availability data if it exists
      const originalAvailabilityId = booking.metadata?.originalAvailability;
      let availabilitySettings = {};
      
      if (originalAvailabilityId) {
        const originalSlot = await Booking.findById(originalAvailabilityId).lean().session(session);
        if (originalSlot) {
          availabilitySettings = {
            availableForInstantBooking: originalSlot.availableForInstantBooking,
            firmBookingThreshold: originalSlot.firmBookingThreshold,
            recurringPattern: originalSlot.recurringPattern,
            sessionType: originalSlot.sessionType,
            price: originalSlot.price
          };
          console.debug('[declineBooking] Retrieved original availability settings:', {
            bookingId: booking._id,
            originalAvailabilityId,
            settings: availabilitySettings,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Update booking status instead of deleting
      booking.status = 'declined';
      booking.declineReason = message;
      booking.updatedAt = new Date();
      await booking.save({ session });

      console.info('[declineBooking] Booking updated to declined:', {
        bookingId: booking._id,
        status: booking.status,
        declineReason: message,
        timestamp: new Date().toISOString(),
      });

      let sessionDoc = await Session.findOne({ bookingId: booking._id }).session(session);
      if (sessionDoc) {
        sessionDoc.state = 'declined';
        sessionDoc.lastUpdated = new Date();
        await sessionDoc.save({ session });
        console.log('[declineBooking] Updated Session state:', {
          sessionId: sessionDoc._id,
          bookingId: booking._id,
          state: sessionDoc.state,
          sessionLink: sessionDoc.sessionLink,
          timestamp: new Date().toISOString(),
        });
      } else {
        sessionDoc = new Session({
          bookingId: booking._id,
          state: 'declined',
          startedAt: new Date(booking.start),
          endedAt: new Date(booking.end),
          participants: [
            { userId: booking.coach, joinedAt: new Date() },
            { userId: booking.user, joinedAt: new Date() }
          ],
          sessionLink: { ...booking.sessionLink },
        });
        await sessionDoc.save({ session });
        console.warn('[declineBooking] Created new Session (unexpected absence during decline)', {
          sessionId: sessionDoc._id,
          bookingId: booking._id,
          state: sessionDoc.state,
          sessionLink: sessionDoc.sessionLink,
          timestamp: new Date().toISOString(),
        });
      }

      const newAvailability = await coalesceAndRestoreAvailability(booking, session);

      console.info('[declineBooking] New availability slot created:', {
        newAvailabilityId: newAvailability._id,
        coach: newAvailability.coach.toString(),
        start: moment(newAvailability.start).format('YYYY-MM-DD HH:mm:ss'),
        end: moment(newAvailability.end).format('YYYY-MM-DD HH:mm:ss'),
        timestamp: new Date().toISOString(),
      });

      // Update original notification
      await Notification.findOneAndUpdate(
        {
          'metadata.bookingId': bookingId,
          type: NotificationTypes.BOOKING_REQUEST,
          status: { $nin: ['actioned', 'deleted'] }
        },
        {
          $set: {
            'metadata.actionResult': 'declined',
            'metadata.actionedAt': new Date(),
            status: NotificationStatus.ARCHIVED
          }
        },
        { session }
      );

      // Create decline notification config
      const notificationConfigs = [{
        type: NotificationTypes.BOOKING_DECLINED,
        recipient: booking.user._id,
        recipientType: 'client',
        priority: NotificationPriorities.MEDIUM,
        category: NotificationCategories.BOOKING,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        metadata: {
          bookingId: booking._id,
          oldStatus: 'requested',
          newStatus: 'declined',
          actionResult: 'declined',
          declineReason: message || undefined,
          restoredAvailabilityId: newAvailability._id
        }
      }];

      await session.commitTransaction();
      session.endSession();

      console.info('[declineBooking] Transaction committed successfully:', {
        bookingId,
        newAvailabilityId: newAvailability._id,
        timestamp: new Date().toISOString(),
      });

      // Process notifications outside the transaction
      for (const config of notificationConfigs) {
        try {
          await UnifiedNotificationService.sendNotification(config, {
            ...booking.toObject(),
            restoredAvailability: newAvailability._id
          });
          console.log('[declineBooking] Sent decline notification:', {
            bookingId: booking._id,
            recipientId: config.recipient,
            type: config.type
          });
        } catch (error) {
          console.error('[declineBooking] Error sending notification:', {
            error: error.message,
            bookingId: booking._id,
            recipientId: config.recipient
          });
        }
      }

      // Emit socket events after successful transaction
      const socketService = getSocketService();
      if (socketService) {
        console.log('[declineBooking] Emitting socket events for declined booking:', {
          bookingId: booking._id,
          newAvailabilityId: newAvailability._id,
          recipients: [booking.coach._id.toString(), booking.user._id.toString()]
        });

        // Emit the decline event
        await socketService.emitBookingStatusUpdate(
          booking._id,
          'declined',
          [booking.coach._id.toString(), booking.user._id.toString()]
        );

        // Emit the new availability event
        await socketService.emitAvailabilityUpdate(
          newAvailability._id,
          'created',
          [booking.coach._id.toString()], // Only send to coach
          {
            originalBookingId: booking._id,
            restoredAvailability: true
          }
        );
      }

      res.json({
        message: 'Booking declined',
        booking: booking.toObject(),
        session: sessionDoc.toObject(),
        newAvailability: newAvailability.toObject()
      });
      return; // Exit the function if successful

    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      console.error('[declineBooking] Error during decline process:', {
        bookingId,
        retryAttempt: retries + 1,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });

      if (error.code === 112 && retries < MAX_RETRIES - 1) {
        // If it's a write conflict and we haven't exceeded max retries, wait and retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        retries++;
        console.warn(`[declineBooking] Retrying operation (attempt ${retries + 1})`, {
          bookingId: req.params.bookingId,
          error: error.message
        });
      } else {
        // If it's not a write conflict or we've exceeded retries, log the error and respond
        console.error('[declineBooking] Error:', error);
        res.status(500).json({ message: error.message });
        return; // Exit the function if we're not retrying
      }
    }
  }

  // If we've exhausted all retries
  res.status(500).json({ message: 'Failed to decline booking after multiple attempts' });
};

exports.acceptBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { message } = req.body;

    console.log('[acceptBooking] Accepting booking:', { 
      bookingId, 
      hasMessage: !!message,
      userId: req.user._id 
    });

    // Get the original booking and notification
    const booking = await Booking.findById(bookingId)
      .populate('coach', 'firstName lastName email')
      .populate('user', 'firstName lastName email')
      .populate('sessionType');

    if (!booking) {
      console.log('[acceptBooking] Booking not found:', bookingId);
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify the coach is authorized to accept
    if (booking.coach._id.toString() !== req.user._id.toString()) {
      console.warn('[acceptBooking] Unauthorized accept attempt:', {
        bookingId,
        requesterId: req.user._id,
        coachId: booking.coach._id
      });
      return res.status(403).json({ message: 'Not authorized to accept this booking' });
    }

    // Find original request notification before updating status
    const originalNotification = await Notification.findOne({
      'metadata.bookingId': bookingId,
      type: 'booking_request',
      recipient: booking.coach._id,
      status: { $nin: ['actioned', 'deleted'] }
    });

    console.log('[acceptBooking] Found original notification:', originalNotification?._id);

    // Update booking status
    booking.status = 'confirmed';
    if (message) {
      booking.notes = message;
    }

    // Placeholder for payment status - will be integrated later
    booking.payment = {
      ...booking.payment,
      status: 'pending'  // Could be 'required', 'pending', 'completed', etc.
    };

    // Placeholder for calendar invite - will be integrated later
    booking.calendar = {
      inviteSent: false,
      inviteId: null
    };

    console.log('[acceptBooking] Saving booking with status:', booking.status);
    await booking.save();

    let sessionDoc = await Session.findOne({ bookingId: booking._id });
    if (sessionDoc) {
      sessionDoc.state = 'confirmed';
      sessionDoc.lastUpdated = new Date();
      await sessionDoc.save();
      console.log('[acceptBooking] Updated Session:', {
        sessionId: sessionDoc._id,
        bookingId: booking._id,
        state: sessionDoc.state,
        sessionLink: sessionDoc.sessionLink,
        timestamp: new Date().toISOString(),
      });
    } else {
      sessionDoc = new Session({
        bookingId: booking._id,
        state: 'confirmed',
        startedAt: new Date(booking.start), // Use startedAt to align with schema
        endedAt: new Date(booking.end),     // Use endedAt to align with schema
        participants: [
          { userId: booking.coach, joinedAt: new Date() },
          { userId: booking.user, joinedAt: new Date() }
        ],
        sessionLink: { ...booking.sessionLink }, // Preserve original sessionLink
      });
      await sessionDoc.save();
      console.warn('[acceptBooking] Created new Session (unexpected absence during confirm)', {
        sessionId: sessionDoc._id,
        bookingId: booking._id,
        state: sessionDoc.state,
        sessionLink: sessionDoc.sessionLink,
        timestamp: new Date().toISOString(),
      });
    }

    // Send accept notifications
    await sendBookingNotifications(booking);

    // Update original notification if found
    if (originalNotification) {
      console.log('[acceptBooking] Marking original notification as archived:', {
        notificationId: originalNotification._id,
        previousStatus: originalNotification.status,
        actionResult: 'confirmed'
      });

      originalNotification.metadata.actionResult = 'confirmed';
      originalNotification.metadata.actionedAt = new Date();
      originalNotification.status = NotificationStatus.ARCHIVED;
      await originalNotification.save();

      // Emit socket event for notification update
      const socketService = getSocketService();
      if (socketService) {
        socketService.emitNotificationAction(
          originalNotification._id,
          'accept',
          'confirmed',
          [booking.coach._id.toString()]
        );
      }
    }

    // Emit socket event for booking update
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitBookingStatusUpdate(
        booking._id,
        'confirmed',
        [booking.coach._id.toString(), booking.user._id.toString()]
      );
    }

    console.log('[acceptBooking] Booking accepted successfully:', booking._id);
    // Single response with both booking and session data
    res.json({ booking, session: sessionDoc.toObject() });
  } catch (error) {
    console.error('[acceptBooking] Error accepting booking:', error);
    res.status(500).json({ message: 'Error accepting booking', error: error.message });
  }
};

exports.acceptBookingByClient = async (req, res) => {
  const { bookingId } = req.params;
  const clientUserId = req.user._id.toString();

  try {
    logger.info('[acceptBookingByClient] Client accepting booking request from coach', { bookingId, clientUserId });

    const booking = await Booking.findById(bookingId)
      .populate('coach', 'firstName lastName email')
      .populate('user', 'firstName lastName email')
      .populate('sessionType');

    if (!booking) {
      logger.warn('[acceptBookingByClient] Booking not found', { bookingId });
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.user._id.toString() !== clientUserId) {
      logger.warn('[acceptBookingByClient] Unauthorized accept attempt', {
        bookingId,
        requesterId: clientUserId,
        bookingUserId: booking.user._id
      });
      return res.status(403).json({ message: 'Not authorized to accept this booking request.' });
    }
    
    if (booking.status !== 'requested') {
        logger.warn('[acceptBookingByClient] Booking not in requested state', { bookingId, currentStatus: booking.status });
        return res.status(400).json({ message: `Booking cannot be accepted. Current status: ${booking.status}` });
    }

    const priceAmount = booking.price?.final?.amount?.amount;
    const requiresPayment = typeof priceAmount === 'number' && priceAmount > 0;

    booking.status = requiresPayment ? 'pending_payment' : 'confirmed';
    if (requiresPayment) {
        booking.payment.status = 'payment_required';
    }
    
    await booking.save();

    let sessionDoc = await Session.findOne({ bookingId: booking._id });
    if (sessionDoc) {
      sessionDoc.state = booking.status;
      sessionDoc.lastUpdated = new Date();
      await sessionDoc.save();
    } else {
       sessionDoc = new Session({
        bookingId: booking._id,
        state: booking.status,
        start: new Date(booking.start),
        end: new Date(booking.end),
        coach: booking.coach,
        user: booking.user,
        sessionType: booking.sessionType,
        sessionLink: booking.sessionLink,
        actualEndTime: new Date(new Date(booking.end).getTime() + (5 * 60 * 1000)),
      });
      await sessionDoc.save();
      logger.warn('[acceptBookingByClient] Created new Session document as one was missing.', { bookingId });
    }

    // Notification to Coach
    await UnifiedNotificationService.sendNotification({
        type: NotificationTypes.BOOKING_CONFIRMED_BY_CLIENT,
        recipient: booking.coach._id,
        recipientType: 'coach',
        category: NotificationCategories.BOOKING,
        priority: NotificationPriorities.HIGH,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        metadata: {
            bookingId: booking._id,
            clientName: `${booking.user.firstName} ${booking.user.lastName}`,
            sessionTitle: booking.title,
            startTime: booking.start
        }
    }, booking);

    // Notification to Client (Confirmation)
    await UnifiedNotificationService.sendNotification({
        type: requiresPayment ? NotificationTypes.BOOKING_CONFIRMED_WITH_PAYMENT : NotificationTypes.BOOKING_CONFIRMED,
        recipient: clientUserId,
        recipientType: 'client',
        category: NotificationCategories.BOOKING,
        priority: NotificationPriorities.HIGH,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        metadata: {
            bookingId: booking._id,
            coachName: `${booking.coach.firstName} ${booking.coach.lastName}`,
            sessionTitle: booking.title,
            startTime: booking.start,
            paymentStatus: requiresPayment ? 'pending' : 'completed'
        }
    }, booking);

    const socketService = getSocketService();
    if (socketService) {
      socketService.emitBookingStatusUpdate(
        booking._id,
        booking.status,
        [booking.coach._id.toString(), booking.user._id.toString()]
      );
    }

    logger.info('[acceptBookingByClient] Booking accepted by client successfully', { bookingId, newStatus: booking.status });
    res.json({ booking, session: sessionDoc.toObject() });
  } catch (error) {
    logger.error('[acceptBookingByClient] Error accepting booking by client', { bookingId, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Error accepting booking', error: error.message });
  }
};

exports.declineBookingByClient = async (req, res) => {
  const { bookingId } = req.params;
  const clientUserId = req.user._id.toString();
  const { message } = req.body;

  try {
    logger.info('[declineBookingByClient] Client declining booking request from coach', { bookingId, clientUserId });

    const booking = await Booking.findById(bookingId)
      .populate('coach', 'firstName lastName email')
      .populate('user', 'firstName lastName email');

    if (!booking) {
      logger.warn('[declineBookingByClient] Booking not found', { bookingId });
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.user._id.toString() !== clientUserId) {
      logger.warn('[declineBookingByClient] Unauthorized decline attempt', {
        bookingId,
        requesterId: clientUserId,
        bookingUserId: booking.user._id
      });
      return res.status(403).json({ message: 'Not authorized to decline this booking request.' });
    }

    if (booking.status !== 'requested') {
        logger.warn('[declineBookingByClient] Booking not in requested state', { bookingId, currentStatus: booking.status });
        return res.status(400).json({ message: `Booking cannot be declined. Current status: ${booking.status}` });
    }

    booking.status = 'declined';
    if (message) {
      booking.declineReason = message;
    }
    booking.updatedAt = new Date();
    await booking.save();

    let sessionDoc = await Session.findOne({ bookingId: booking._id });
    if (sessionDoc) {
      sessionDoc.state = 'declined';
      sessionDoc.lastUpdated = new Date();
      await sessionDoc.save();
    } else {
      sessionDoc = new Session({
        bookingId: booking._id,
        state: 'declined',
        start: new Date(booking.start),
        end: new Date(booking.end),
        coach: booking.coach,
        user: booking.user,
        sessionType: booking.sessionType,
        sessionLink: booking.sessionLink,
        actualEndTime: new Date(new Date(booking.end).getTime() + (5 * 60 * 1000)),
      });
      await sessionDoc.save();
      logger.warn('[declineBookingByClient] Created new Session document as one was missing.', { bookingId });
    }
    
    await UnifiedNotificationService.sendNotification({
        type: NotificationTypes.BOOKING_DECLINED_BY_CLIENT,
        recipient: booking.coach._id,
        recipientType: 'coach',
        category: NotificationCategories.BOOKING,
        priority: NotificationPriorities.MEDIUM,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        metadata: {
            bookingId: booking._id,
            clientName: `${booking.user.firstName} ${booking.user.lastName}`,
            sessionTitle: booking.title,
            declineReason: message
        }
    }, booking);

    const socketService = getSocketService();
    if (socketService) {
      socketService.emitBookingStatusUpdate(
        booking._id,
        'declined',
        [booking.coach._id.toString(), booking.user._id.toString()]
      );
    }

    logger.info('[declineBookingByClient] Booking declined by client successfully', { bookingId });
    res.json({ booking, session: sessionDoc.toObject() });
  } catch (error) {
    logger.error('[declineBookingByClient] Error declining booking by client', { bookingId, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Error declining booking', error: error.message });
  }
};

const validateSuggestedTimes = (times) => {
  if (!Array.isArray(times) || !times.length) {
    return {
      isValid: false,
      error: 'At least one time suggestion is required'
    };
  }

  const now = new Date();
  const validTimes = times.every(time => {
    const start = new Date(time.start);
    const end = new Date(time.end);
    
    return (
      start instanceof Date && !isNaN(start) &&
      end instanceof Date && !isNaN(end) &&
      start > now &&
      end > start
    );
  });

  return {
    isValid: validTimes,
    error: validTimes ? null : 'Invalid time format or times are in the past'
  };
};

exports.suggestAlternativeTime = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { times, message } = req.body;
    const validation = validateSuggestedTimes(times);
    if (!validation.isValid) {
      console.warn('[suggestAlternativeTime] Invalid time suggestions:', validation.error);
      return res.status(400).json({ message: validation.error });
    }

    console.log('[suggestAlternativeTime] Processing suggestion:', { 
      bookingId, 
      suggestedTimes: times,
      hasMessage: !!message,
      userId: req.user._id 
    });

    // Get the original booking and notification
    const booking = await Booking.findById(bookingId)
      .populate('coach', 'firstName lastName email')
      .populate('user', 'firstName lastName email')
      .populate('sessionType');

    if (!booking) {
      console.log('[suggestAlternativeTime] Booking not found:', bookingId);
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify the coach is authorized to suggest times
    if (booking.coach._id.toString() !== req.user._id.toString()) {
      console.warn('[suggestAlternativeTime] Unauthorized suggestion attempt:', {
        bookingId,
        requesterId: req.user._id,
        coachId: booking.coach._id
      });
      return res.status(403).json({ message: 'Not authorized to suggest times for this booking' });
    }

    // Find original request notification
    const originalNotification = await Notification.findOne({
      'metadata.bookingId': bookingId,
      type: 'booking_request',
      recipient: booking.coach._id,
      status: { $nin: ['archived', 'deleted'] }
    });

    console.log('[suggestAlternativeTime] Found original notification:', originalNotification?._id);

    // Update booking with suggested times
    const formattedTimes = times.map(time => ({
      start: new Date(time.start),
      end: new Date(time.end),
      suggestedBy: req.user._id,
      message
    }));

    booking.suggestedTimes = formattedTimes;
    booking.status = 'time_suggested'; // Add this status to the booking model's enum
    if (message) {
      booking.notes = message;
    }

    console.log('[suggestAlternativeTime] Saving booking with suggestions:', {
      bookingId: booking._id,
      suggestedTimesCount: formattedTimes.length
    });
    
    await booking.save();

    let sessionDoc = await Session.findOne({ bookingId: booking._id });
    if (sessionDoc) {
      sessionDoc.state = 'time_suggested';
      sessionDoc.lastUpdated = new Date();
      await sessionDoc.save();
      console.log('[suggestAlternativeTime] Updated Session state:', {
        sessionId: sessionDoc._id,
        bookingId: booking._id,
        state: sessionDoc.state,
        sessionLink: sessionDoc.sessionLink,
        timestamp: new Date().toISOString(),
      });
    } else {
      sessionDoc = new Session({
        bookingId: booking._id,
        state: 'time_suggested',
        startedAt: new Date(booking.start),
        endedAt: new Date(booking.end),
        participants: [
          { userId: booking.coach, joinedAt: new Date() },
          { userId: booking.user, joinedAt: new Date() }
        ],
        sessionLink: { ...booking.sessionLink },
      });
      await sessionDoc.save();
      console.warn('[suggestAlternativeTime] Created new Session (unexpected absence during suggest)', {
        sessionId: sessionDoc._id,
        bookingId: booking._id,
        state: sessionDoc.state,
        sessionLink: sessionDoc.sessionLink,
        timestamp: new Date().toISOString(),
      });
    }

    // Send notifications
    await sendBookingNotifications(booking);

    // Update original notification if found
    if (originalNotification) {
      console.log('[suggestAlternativeTime] Marking original notification as archived:', {
        notificationId: originalNotification._id,
        previousStatus: originalNotification.status,
        actionResult: 'time_suggested'
      });

      originalNotification.metadata.actionResult = 'time_suggested';
      originalNotification.metadata.actionedAt = new Date();
      originalNotification.status = NotificationStatus.ARCHIVED;
      await originalNotification.save();

      // Emit socket event for notification update
      const socketService = getSocketService();
      if (socketService) {
        socketService.emitNotificationAction(
          originalNotification._id,
          'suggest',
          'time_suggested',
          [booking.coach._id.toString()]
        );
      }
    }

    // Emit socket event for booking update
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitBookingStatusUpdate(
        booking._id,
        'time_suggested',
        [booking.coach._id.toString(), booking.user._id.toString()]
      );
    }

    console.log('[suggestAlternativeTime] Alternative times suggested successfully:', booking._id);
    // Single response with both booking and session data
    res.json({ booking, session: sessionDoc.toObject() });
  } catch (error) {
    console.error('[suggestAlternativeTime] Error suggesting alternative times:', error);
    res.status(500).json({ message: 'Error suggesting alternative times', error: error.message });
  }
};

exports.getBookingOvertimeSettings = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user._id.toString();

    console.log('[bookingController.getBookingOvertimeSettings] Fetching overtime settings:', {
      bookingId,
      userId,
    });

    const booking = await Booking.findById(bookingId).populate('coach user');

    if (!booking) {
      console.warn('[bookingController.getBookingOvertimeSettings] Booking not found:', { bookingId });
      return res.status(404).json({ message: 'Booking not found' });
    }

// Authorization: Coach, the booking's user (if exists), or users in userIds can access
let authorized = false;
if (booking.coach && booking.coach._id.toString() === userId) {
  authorized = true;
} else if (booking.user && booking.user._id && booking.user._id.toString() === userId) {
  authorized = true;
} else if (booking.userIds && booking.userIds.map(id => id.toString()).includes(userId)) {
  authorized = true;
}

if (!authorized) {
  logger.warn('[bookingController.getBookingOvertimeSettings] Unauthorized access attempt', {
    bookingId,
    userId,
    coachIdInBooking: booking.coach?._id?.toString(),
    userIdInBooking: booking.user?._id?.toString(),
  });
  return res.status(403).json({ message: 'Not authorized to view overtime settings for this booking' });
}

    res.json({
      success: true,
      overtime: booking.overtime || {
        allowOvertime: false,
        freeOvertimeDuration: 0,
        paidOvertimeDuration: 0,
        overtimeRate: 100,
      },
    });
  } catch (error) {
    console.error('[bookingController.getBookingOvertimeSettings] Error:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Error fetching overtime settings', error: error.message });
  }
};

exports.updateBookingOvertimeSettings = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { overtime } = req.body;
    const userId = req.user._id.toString();

    console.log('[bookingController.updateBookingOvertimeSettings] Updating overtime settings:', {
      bookingId,
      userId,
      overtime,
    });

    const booking = await Booking.findById(bookingId).populate('coach user');

    if (!booking) {
      console.warn('[bookingController.updateBookingOvertimeSettings] Booking not found:', { bookingId });
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Authorization: Only coach can update
    if (booking.coach._id.toString() !== userId) {
      console.warn('[bookingController.updateBookingOvertimeSettings] Unauthorized update attempt:', {
        bookingId,
        userId,
      });
      return res.status(403).json({ message: 'Only the coach can update overtime settings' });
    }

    // Validate overtime settings
    if (
      !overtime ||
      typeof overtime.allowOvertime !== 'boolean' ||
      overtime.freeOvertimeDuration < 0 ||
      overtime.paidOvertimeDuration < 0 ||
      overtime.overtimeRate < 0 ||
      overtime.overtimeRate > 500
    ) {
      console.warn('[bookingController.updateBookingOvertimeSettings] Invalid overtime settings:', { overtime });
      return res.status(400).json({ message: 'Invalid overtime settings' });
    }

    booking.overtime = {
      allowOvertime: overtime.allowOvertime,
      freeOvertimeDuration: Number(overtime.freeOvertimeDuration),
      paidOvertimeDuration: Number(overtime.paidOvertimeDuration),
      overtimeRate: Number(overtime.overtimeRate),
    };

    await booking.save();

    console.log('[bookingController.updateBookingOvertimeSettings] Overtime settings updated:', {
      bookingId,
      overtime: booking.overtime,
    });

    res.json({ success: true, overtime: booking.overtime });
  } catch (error) {
    console.error('[bookingController.updateBookingOvertimeSettings] Error:', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Error updating overtime settings', error: error.message });
  }
};

exports.updateBooking = async (req, res) => {
  const { bookingId } = req.params;
  const updateData = req.body;
  const userId = req.user._id.toString();

 console.log('[bookingController.updateBooking] Request received', {
    bookingId,
    userId,
    updateDataKeys: Object.keys(updateData),
    updateDataStart: updateData.start,
    updateDataEnd: updateData.end,
    hasWebinarSlotsInUpdate: !!updateData.webinarSlots,
    webinarSlotsCountInUpdate: updateData.webinarSlots ? updateData.webinarSlots.length : undefined,
    priceInUpdate: updateData.price,
    earlyBirdPriceInUpdate: updateData.earlyBirdPrice,
    sessionTypeIdFromUpdate: updateData.sessionType,
    hasSessionImagesMetadataInUpdate: updateData.sessionImages !== undefined,
    sessionImagesMetadataInUpdate: updateData.sessionImages,
    courseMaterialsMetadataCountInUpdate: updateData.courseMaterials ? updateData.courseMaterials.length : (updateData.courseMaterials === null ? 'setToNull' : 'notPresent'),
    courseMaterialsMetadataInUpdate: updateData.courseMaterials,
    timestamp: new Date().toISOString(),
  });

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();
  let transactionCommitted = false;

  const ONE_ON_ONE_SESSION_TYPE_ID = '66ec4ea477bec414bf2b8859';

  try {
    const booking = await Booking.findById(bookingId).populate('sessionType').session(mongoSession);

    if (!booking) {
      logger.warn('[bookingController.updateBooking] Booking not found', { bookingId });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.coach.toString() !== userId) {
      logger.warn('[bookingController.updateBooking] Unauthorized update attempt', {
        bookingId,
        userId,
        coachIdInBooking: booking.coach.toString(),
      });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(403).json({ message: 'Not authorized to update this booking' });
    }
    
  logger.info('[bookingController.updateBooking] Original booking data before update:', {
        bookingId: booking._id,
        title: booking.title,
        start: booking.start,
        end: booking.end,
        sessionTypeName: booking.sessionType?.name,
        sessionTypeId: booking.sessionType?._id.toString(),
        webinarSlotsCount: booking.webinarSlots ? booking.webinarSlots.length : 0,
        price: booking.price ? booking.price.final?.amount?.amount : null,
        status: booking.status,
         originalSessionImagesCount: booking.sessionImages?.length,
        firstOriginalSessionImage: booking.sessionImages && booking.sessionImages.length > 0 ? booking.sessionImages[0] : null,
        originalCourseMaterialsCount: booking.courseMaterials?.length,
        firstOriginalMaterial: booking.courseMaterials && booking.courseMaterials.length > 0 ? booking.courseMaterials[0] : null,
    });

const updatableFields = [
      'title', 'description', 'timezone', 'location', 'isOnline', 'virtualMeeting',
      'webinarLanguage', 'webinarPlatform', 'webinarLink', 'presenterBio',
      'qaSession', 'recordingAvailable', 'isPublic', 'showInWebinarBrowser',
      'availableForInstantBooking', 'skillLevel', 'prerequisites', 'learningObjectives',
      'whatToBring', 'materialsProvided', 'sessionTopic', 'tags', 
      'certificationOffered', 'certificationDetails', 'firmBookingThreshold',
      'cancellationPolicy', 'sessionGoal', 'clientNotes', 'preparationRequired', 'followUpTasks',
      'isPartOfPackage', 'packageId', 'priceOverride'
    ];

    updatableFields.forEach(field => {
      if (updateData[field] !== undefined) {
        booking[field] = updateData[field];
      }
    });

    // Ensure start and end are only updated if valid dates are provided
    if (updateData.start && !isNaN(new Date(updateData.start).getTime())) {
        booking.start = new Date(updateData.start);
        logger.info('[bookingController.updateBooking] Booking start time updated from updateData.', { newStart: booking.start });
    } else if (updateData.start) {
        logger.warn('[bookingController.updateBooking] Invalid start date in updateData, original start time retained.', { invalidStart: updateData.start, originalStart: booking.start });
    }

    if (updateData.end && !isNaN(new Date(updateData.end).getTime())) {
        booking.end = new Date(updateData.end);
        logger.info('[bookingController.updateBooking] Booking end time updated from updateData.', { newEnd: booking.end });
    } else if (updateData.end) {
        logger.warn('[bookingController.updateBooking] Invalid end date in updateData, original end time retained.', { invalidEnd: updateData.end, originalEnd: booking.end });
    }


    if (updateData.minAttendees !== undefined) {
      const parsedMin = parseInt(updateData.minAttendees, 10);
      booking.minAttendees = updateData.minAttendees === '' || isNaN(parsedMin) ? null : parsedMin;
  }
  if (updateData.maxAttendees !== undefined) {
      const parsedMax = parseInt(updateData.maxAttendees, 10);
      booking.maxAttendees = updateData.maxAttendees === '' || isNaN(parsedMax) ? null : parsedMax;
  }
  if (updateData.replayAccessDuration !== undefined) {
      const parsedDuration = parseInt(updateData.replayAccessDuration, 10);
      // If it's an empty string or parseInt results in NaN, set to null. Otherwise, use the parsed integer.
      booking.replayAccessDuration = updateData.replayAccessDuration === '' || isNaN(parsedDuration) ? null : parsedDuration;
      logger.info('[bookingController.updateBooking] Processed replayAccessDuration', { 
          inputValue: updateData.replayAccessDuration, 
          parsedValue: parsedDuration, 
          finalValue: booking.replayAccessDuration 
      });
  }

  if (updateData.sessionImages !== undefined) {
        booking.sessionImages = Array.isArray(updateData.sessionImages) ? updateData.sessionImages : []; 
        booking.markModified('sessionImages');
        console.log('[bookingController.updateBooking] Session images metadata updated/set.', { bookingId, newImagesCount: booking.sessionImages?.length });
    }
    if (updateData.courseMaterials !== undefined) {
        booking.courseMaterials = Array.isArray(updateData.courseMaterials) ? updateData.courseMaterials : []; 
        booking.markModified('courseMaterials');
        console.log('[bookingController.updateBooking] Course materials metadata updated/set.', { bookingId, newMaterialsCount: booking.courseMaterials?.length, firstNewMaterial: booking.courseMaterials && booking.courseMaterials.length > 0 ? booking.courseMaterials[0] : null });
    }
  
  if (updateData.earlyBirdDeadline !== undefined) {
    booking.earlyBirdDeadline = updateData.earlyBirdDeadline ? new Date(updateData.earlyBirdDeadline) : null;
  }
    if (updateData.earlyBirdPrice !== undefined) {
      booking.earlyBirdPrice = (updateData.earlyBirdPrice === '' || updateData.earlyBirdPrice === null) ? null : parseFloat(updateData.earlyBirdPrice);
    }

    if (updateData.webinarSlots && Array.isArray(updateData.webinarSlots)) {
        booking.webinarSlots = updateData.webinarSlots.map(slot => {
            if (!slot.startTime || !slot.endTime) {
                logger.warn('[bookingController.updateBooking] Webinar slot missing startTime or endTime, skipping:', { slot });
                return null; 
            }
            return {
                date: slot.date ? new Date(slot.date).toISOString().split('T')[0] : new Date(slot.startTime).toISOString().split('T')[0],
                startTime: new Date(slot.startTime),
                endTime: new Date(slot.endTime),
            };
        }).filter(Boolean);
        booking.markModified('webinarSlots');
        logger.info('[bookingController.updateBooking] Processed webinarSlots for update:', {
            count: booking.webinarSlots.length,
            firstSlot: booking.webinarSlots[0]
        });
    }
    
    const currentBookingSessionTypeId = booking.sessionType?._id.toString();
    const isOneOnOneSession = currentBookingSessionTypeId === ONE_ON_ONE_SESSION_TYPE_ID;

    if (updateData.price !== undefined || updateData.currency !== undefined) {
      if (isOneOnOneSession) {
        logger.info('[bookingController.updateBooking] 1-on-1 session price update. Using price from request.', { priceData: updateData.price, currency: updateData.currency });
        let priceToNormalize = updateData.price;
        if (typeof updateData.price === 'number' && updateData.currency) {
          priceToNormalize = {
            base: { amount: { amount: updateData.price, currency: updateData.currency }, currency: updateData.currency },
            final: { amount: { amount: updateData.price, currency: updateData.currency }, currency: updateData.currency },
            currency: updateData.currency,
          };
        } else if (typeof updateData.price === 'object' && updateData.currency && !updateData.price.currency) {
            priceToNormalize = { ...updateData.price, currency: updateData.currency };
        }

        booking.price = normalizePriceStructure(priceToNormalize);
        booking.markModified('price');
        logger.info('[bookingController.updateBooking] Price for 1-on-1 session updated and normalized from request:', { newPrice: booking.price });
      } else {
        logger.info('[bookingController.updateBooking] Non 1-on-1 session price update. Using fixed price from request.', { priceData: updateData.price, currency: updateData.currency, sessionType: currentBookingSessionTypeId });
        
        let priceValue = null;
        if (updateData.price !== undefined && updateData.price !== null && updateData.price !== '') {
            priceValue = parseFloat(updateData.price);
        }

        if (priceValue !== null && !isNaN(priceValue)) {
            const currencyValue = updateData.currency || booking.price?.currency || 'CHF';
            const simplePriceObject = {
                base: { amount: { amount: priceValue, currency: currencyValue }, currency: currencyValue },
                final: { amount: { amount: priceValue, currency: currencyValue }, currency: currencyValue },
                currency: currencyValue,
                vat: booking.price?.vat || { rate: 8.1, amount: 0, included: true },
                platformFee: booking.price?.platformFee || { percentage: 15, amount: 0 },
                discounts: booking.price?.discounts || [],
            };
            booking.price = normalizePriceStructure(simplePriceObject);
        } else if (updateData.price === null || updateData.price === '') {
            booking.price = null;
        }
        booking.markModified('price');
        logger.info('[bookingController.updateBooking] Price for non 1-on-1 session updated from request:', { newPrice: booking.price });
      }
    } else if (updateData.price === null) {
        booking.price = null;
        booking.markModified('price');
        logger.info('[bookingController.updateBooking] Price explicitly set to null.');
    }

    if (!isOneOnOneSession) {
        if (updateData.earlyBirdDeadline !== undefined) {
            booking.earlyBirdDeadline = updateData.earlyBirdDeadline ? new Date(updateData.earlyBirdDeadline) : null;
        }
        if (updateData.earlyBirdPrice !== undefined) {
            booking.earlyBirdPrice = (updateData.earlyBirdPrice === '' || updateData.earlyBirdPrice === null) 
                                     ? null 
                                     : parseFloat(updateData.earlyBirdPrice);
        }
    }

    if (!booking.user &&
        (currentBookingSessionTypeId === WEBINAR_TYPE_ID_STRING ||
         currentBookingSessionTypeId === GROUP_TYPE_ID_STRING ||
         currentBookingSessionTypeId === WORKSHOP_TYPE_ID_STRING)) {
        
        const minAttendeesParsed = booking.minAttendees ? parseInt(booking.minAttendees, 10) : 0;
        const currentAttendeesCount = booking.attendees ? booking.attendees.length : 0;

        if (booking.status === 'pending_minimum_attendees' && currentAttendeesCount >= minAttendeesParsed) {
            booking.status = 'scheduled';
            logger.info('[bookingController.updateBooking] Min attendees met. Status changed to scheduled.', { bookingId: booking._id, currentAttendees: currentAttendeesCount, minAttendees: minAttendeesParsed });
        } else if (booking.status === 'scheduled' && minAttendeesParsed > 0 && currentAttendeesCount < minAttendeesParsed) {
            booking.status = 'pending_minimum_attendees';
            logger.info('[bookingController.updateBooking] Min attendees no longer met. Status changed to pending_minimum_attendees.', { bookingId: booking._id, currentAttendees: currentAttendeesCount, minAttendees: minAttendeesParsed });
        } else if (minAttendeesParsed === 0 && booking.status === 'pending_minimum_attendees') {
            booking.status = 'scheduled';
             logger.info('[bookingController.updateBooking] Min attendees set to 0. Status changed to scheduled.', { bookingId: booking._id });
        }
    }

    booking.updatedAt = new Date();
    const updatedBookingDoc = await booking.save({ session: mongoSession });

    // Ensure updatedBookingDoc.start and .end are valid Date objects before proceeding
    if (!updatedBookingDoc.start || isNaN(new Date(updatedBookingDoc.start).getTime())) {
        logger.error('[bookingController.updateBooking] Invalid or missing start date on updatedBookingDoc before Session update.', { bookingStart: updatedBookingDoc.start });
        throw new Error('Booking has invalid start date after save.');
    }
    if (!updatedBookingDoc.end || isNaN(new Date(updatedBookingDoc.end).getTime())) {
        logger.error('[bookingController.updateBooking] Invalid or missing end date on updatedBookingDoc before Session update.', { bookingEnd: updatedBookingDoc.end });
        throw new Error('Booking has invalid end date after save.');
    }


    const sessionDoc = await Session.findOne({ bookingId: updatedBookingDoc._id }).session(mongoSession);
    if (sessionDoc) {
      let sessionModified = false;
      
      // Check if sessionDoc.start and updatedBookingDoc.start are valid dates before comparing
      if (sessionDoc.start && updatedBookingDoc.start && 
          new Date(updatedBookingDoc.start).getTime() !== new Date(sessionDoc.start).getTime()) {
        sessionDoc.start = new Date(updatedBookingDoc.start);
        sessionModified = true;
        logger.info('[bookingController.updateBooking] Session document start time updated.', { newStart: sessionDoc.start });
      } else if (!sessionDoc.start && updatedBookingDoc.start) {
        sessionDoc.start = new Date(updatedBookingDoc.start);
        sessionModified = true;
        logger.info('[bookingController.updateBooking] Session document start time initialized.', { newStart: sessionDoc.start });
      }

      // Check if sessionDoc.end and updatedBookingDoc.end are valid dates before comparing
      if (sessionDoc.end && updatedBookingDoc.end &&
          new Date(updatedBookingDoc.end).getTime() !== new Date(sessionDoc.end).getTime()) {
        sessionDoc.end = new Date(updatedBookingDoc.end);
        sessionDoc.actualEndTime = new Date(new Date(updatedBookingDoc.end).getTime() + (5 * 60 * 1000));
        sessionModified = true;
        logger.info('[bookingController.updateBooking] Session document end time updated.', { newEnd: sessionDoc.end, newActualEnd: sessionDoc.actualEndTime });
      } else if (!sessionDoc.end && updatedBookingDoc.end) {
        sessionDoc.end = new Date(updatedBookingDoc.end);
        sessionDoc.actualEndTime = new Date(new Date(updatedBookingDoc.end).getTime() + (5 * 60 * 1000));
        sessionModified = true;
        logger.info('[bookingController.updateBooking] Session document end time initialized.', { newEnd: sessionDoc.end, newActualEnd: sessionDoc.actualEndTime });
      }


      if (sessionModified) {
        sessionDoc.lastUpdated = new Date();
        await sessionDoc.save({ session: mongoSession });
        logger.info('[bookingController.updateBooking] Session document changes saved.', { sessionId: sessionDoc._id });
      } else {
        logger.info('[bookingController.updateBooking] No effective time changes for Session document.', { sessionId: sessionDoc._id });
      }
    } else {
        logger.warn('[bookingController.updateBooking] No matching Session document found to update for booking.', { bookingId: updatedBookingDoc._id });
    }

    await mongoSession.commitTransaction();
    transactionCommitted = true;
    mongoSession.endSession();

    const populatedUpdatedBooking = await Booking.findById(updatedBookingDoc._id)
      .populate('coach', 'firstName lastName email profilePicture')
      .populate({ 
          path: 'user', 
          select: 'firstName lastName email profilePicture settings.profileVisibility stripe.customerId' 
      })
      .populate('sessionType')
      .populate('payment.paymentRecord')
      .lean();

    logger.info('[bookingController.updateBooking] Booking updated successfully in DB', { bookingId: populatedUpdatedBooking._id, newTitle: populatedUpdatedBooking.title });

console.log('[bookingController.updateBooking] Booking document state before final population:', {
          bookingId: updatedBookingDoc._id,
          sessionImagesCount: updatedBookingDoc.sessionImages?.length,
          firstSessionImage: updatedBookingDoc.sessionImages && updatedBookingDoc.sessionImages.length > 0 ? updatedBookingDoc.sessionImages[0] : null,
          courseMaterialsCount: updatedBookingDoc.courseMaterials?.length,
          firstMaterial: updatedBookingDoc.courseMaterials && updatedBookingDoc.courseMaterials.length > 0 ? updatedBookingDoc.courseMaterials[0] : null,
      });

    const socketService = getSocketService();
    if (socketService) {
      const recipients = [populatedUpdatedBooking.coach._id.toString()];
      if (populatedUpdatedBooking.user && populatedUpdatedBooking.user._id) {
        recipients.push(populatedUpdatedBooking.user._id.toString());
      }
      if (populatedUpdatedBooking.attendees && populatedUpdatedBooking.attendees.length > 0) {
        populatedUpdatedBooking.attendees.forEach(att => {
          if (att.user && !recipients.includes(att.user.toString())) {
            recipients.push(att.user.toString());
          }
        });
      }
      
      socketService.emitBookingUpdate(
        populatedUpdatedBooking._id,
        populatedUpdatedBooking,
        recipients
      );
       logger.info('[bookingController.updateBooking] Emitted socket event for booking update', { bookingId: populatedUpdatedBooking._id, recipients });
    }

    res.json(populatedUpdatedBooking);
  } catch (error) {
    if (!transactionCommitted && mongoSession.inTransaction()) {
      try {
        await mongoSession.abortTransaction();
      } catch (abortError) {
        logger.error('[bookingController.updateBooking] Error aborting transaction', {
          error: abortError.message,
          originalError: error.message,
        });
      }
    }
    if(mongoSession){
        mongoSession.endSession();
    }
    logger.error('[bookingController.updateBooking] Error updating booking', {
      bookingId,
      error: error.message,
      stack: error.stack,
    });

    // Ensure PriceCalculationError is defined or imported if you use it, otherwise remove this specific check
    // For now, I'll assume it might be defined elsewhere.
    // if (error instanceof PriceCalculationError) { 
    //   return res.status(400).json({ message: `Error during price calculation: ${error.message}`, details: error.details });
    // }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    res.status(500).json({ message: 'Error updating booking', error: error.message });
  }
};

exports.registerForWebinar = async (req, res) => {
  const webinarBookingId = req.params.bookingId;
  const currentUserId = req.user._id;
  const { discountCode } = req.body;
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[bookingController.registerForWebinar] Attempting to register user for webinar', { webinarBookingId, userId: currentUserId, timestamp: new Date().toISOString() });

    const webinarBooking = await Booking.findById(webinarBookingId)
      .populate('sessionType')
      .populate('coach', '_id')
      .populate('attendees.user', '_id')
      .session(mongoSession);

    if (!webinarBooking) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      logger.warn('[bookingController.registerForWebinar] Webinar not found', { webinarBookingId });
      return res.status(404).json({ message: "Webinar not found." });
    }

    const sessionTypeIdString = webinarBooking.sessionType?._id?.toString() || webinarBooking.sessionType?.toString();
    if (sessionTypeIdString !== WEBINAR_TYPE_ID_STRING) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      logger.warn('[bookingController.registerForWebinar] Booking is not a webinar session', { webinarBookingId, sessionTypeId: sessionTypeIdString });
      return res.status(400).json({ message: "This booking is not a webinar session." });
    }

    const firstWebinarSlot = webinarBooking.webinarSlots && webinarBooking.webinarSlots.length > 0 ? webinarBooking.webinarSlots[0] : null;
    const webinarEffectiveStartTime = firstWebinarSlot ? new Date(firstWebinarSlot.startTime) : new Date(webinarBooking.start);

    if (webinarEffectiveStartTime < new Date()) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      logger.warn('[bookingController.registerForWebinar] Webinar booking closed (start time in past)', { webinarBookingId, webinarEffectiveStartTime: webinarEffectiveStartTime.toISOString() });
      return res.status(400).json({ message: "Webinar booking has closed as the start time is in the past." });
    }

    const existingAttendeeIndex = webinarBooking.attendees.findIndex(att => att.user && att.user._id.toString() === currentUserId.toString());
    if (existingAttendeeIndex > -1 && ['confirmed', 'attended', 'pending_reschedule_confirmation', 'confirmed_rescheduled'].includes(webinarBooking.attendees[existingAttendeeIndex].status)) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      logger.info('[bookingController.registerForWebinar] User already actively registered', { webinarBookingId, userId: currentUserId, status: webinarBooking.attendees[existingAttendeeIndex].status });
      return res.status(409).json({ message: "You are already actively registered for this webinar." });
    }

    const currentActiveAttendees = webinarBooking.attendees.filter(a => ['confirmed', 'attended'].includes(a.status)).length;
    if (webinarBooking.maxAttendees && currentActiveAttendees >= webinarBooking.maxAttendees) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        logger.warn('[bookingController.registerForWebinar] Webinar is full', { webinarBookingId, attendees: currentActiveAttendees, maxAttendees: webinarBooking.maxAttendees });
        return res.status(403).json({ message: "This webinar is currently full." });
    }

    const priceDetails = await PricingService.calculateWebinarRegistrationPrice({
        webinarBookingId,
        userId: currentUserId,
        discountCode: discountCode
    });

    if (!priceDetails || typeof priceDetails.final?.amount?.amount !== 'number') {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        logger.error('[bookingController.registerForWebinar] Could not calculate a valid price for the webinar.', { webinarBookingId });
        return res.status(500).json({ message: "Could not calculate a valid price for this webinar." });
    }

    const finalAmount = priceDetails.final.amount.amount;

    if (finalAmount <= 0) {
        if (existingAttendeeIndex === -1) {
            webinarBooking.attendees.push({ user: currentUserId, joinedAt: new Date(), status: 'confirmed', rescheduleStatus: 'confirmed_original' });
        } else {
            webinarBooking.attendees[existingAttendeeIndex].status = 'confirmed';
            webinarBooking.attendees[existingAttendeeIndex].joinedAt = new Date();
            webinarBooking.attendees[existingAttendeeIndex].rescheduleStatus = 'confirmed_original';
        }

        const confirmedCount = webinarBooking.attendees.filter(a => a.status === 'confirmed').length;
        if (webinarBooking.status === 'pending_minimum_attendees' && webinarBooking.minAttendees > 0 && confirmedCount >= webinarBooking.minAttendees) {
            webinarBooking.status = 'scheduled';
        }

        await webinarBooking.save({ session: mongoSession });
        await mongoSession.commitTransaction();
        mongoSession.endSession();

        await UnifiedNotificationService.sendNotification({
            type: NotificationTypes.WEBINAR_REGISTRATION_CONFIRMED_CLIENT,
            recipient: currentUserId,
            metadata: { bookingId: webinarBookingId, webinarTitle: webinarBooking.title }
        }, webinarBooking);
        await UnifiedNotificationService.sendNotification({
            type: NotificationTypes.WEBINAR_NEW_ATTENDEE_COACH,
            recipient: webinarBooking.coach._id,
            metadata: { bookingId: webinarBookingId, webinarTitle: webinarBooking.title, attendeeId: currentUserId }
        }, webinarBooking);

        return res.status(200).json({ success: true, freeBooking: true, message: "Successfully registered for this webinar." });
    }

    const payingUser = await User.findById(currentUserId).session(mongoSession);
    if (!payingUser?.stripe?.customerId) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(400).json({ message: "Payment details not set up for your account. Please add a payment method first." });
    }
    
    const paymentIntent = await paymentService.createPaymentIntent({
        bookingId: webinarBookingId,
        priceDetails: priceDetails,
        stripeCustomerId: payingUser.stripe.customerId,
        metadata: {
            userId: currentUserId.toString(),
            type: 'webinar_registration',
            webinarTitle: webinarBooking.title,
        }
    });

    if (!paymentIntent || !paymentIntent.client_secret) {
        throw new Error("Failed to initialize payment for the webinar.");
    }
    
    const paymentRecord = new Payment({
        booking: webinarBookingId,
        payer: currentUserId,
        recipient: webinarBooking.coach._id,
        type: 'charge',
        status: 'pending',
        priceSnapshot: priceDetails,
        amount: {
            base: priceDetails.base.amount.amount,
            platformFee: priceDetails.platformFee.amount,
            vat: priceDetails.vat,
            total: priceDetails.final.amount.amount,
            currency: priceDetails.currency
        },
        stripe: {
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            customerId: payingUser.stripe.customerId
        }
    });
    await paymentRecord.save({ session: mongoSession });
    logger.info(`[registerForWebinar] Created Payment record ${paymentRecord._id} for webinar registration.`, { webinarBookingId });

    webinarBooking.payment.paymentRecord = paymentRecord._id;

    if (existingAttendeeIndex === -1) {
        webinarBooking.attendees.push({ user: currentUserId, status: 'pending_payment', paymentIntentId: paymentIntent.id });
    } else {
        webinarBooking.attendees[existingAttendeeIndex].status = 'pending_payment';
        webinarBooking.attendees[existingAttendeeIndex].paymentIntentId = paymentIntent.id;
    }
    
    await webinarBooking.save({ session: mongoSession });

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    logger.info('[registerForWebinar] Successfully initiated paid webinar registration, created Payment doc.', { webinarBookingId, paymentId: paymentRecord._id });
    
    res.status(200).json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        bookingId: webinarBookingId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[bookingController.registerForWebinar] Error:', { error: error.message, stack: error.stack, webinarBookingId, currentUserId });
    res.status(500).json({ message: error.message || "Failed to initiate webinar registration." });
  }
};

exports.calculateCancellationDetails = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id.toString(); // Requesting user, potentially the attendee

  try {
    console.log('[calculateCancellationDetails] Request received', { bookingId, userId, timestamp: new Date().toISOString() });
    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email settings.timeZone') 
      .populate('user', '_id firstName lastName email') 
      .populate('sessionType')
      // Do not populate payment.paymentRecord here as it might not be relevant for webinar attendee
      .populate('attendees.user', '_id'); // Ensure attendees.user is populated for authorization check

    if (!booking) {
      logger.warn('[calculateCancellationDetails] Booking not found', { bookingId, timestamp: new Date().toISOString() });
      return res.status(404).json({ message: 'Booking not found.' });
    }

    let isAuthorized = false;
    let paymentContextForPolicyEngine = null;
    let isWebinarBooking = false;
    let validAttendeeRecord = null;

    if (booking.sessionType) {
        const sessionTypeIdString = typeof booking.sessionType === 'object' && booking.sessionType._id 
                                    ? booking.sessionType._id.toString() 
                                    : booking.sessionType.toString(); // Assuming it's an ObjectId string if not populated fully
        isWebinarBooking = sessionTypeIdString === WEBINAR_TYPE_ID_STRING;
    }

    // Check 1: Is the requester the primary user of the booking (for 1-on-1)?
    if (booking.user && booking.user._id.toString() === userId) {
      isAuthorized = true;
      // For 1-on-1, if there's a general payment record on the booking, we could use it.
      // However, PolicyEngine will default to booking.price if paymentContext is null.
      // If booking.payment.paymentRecord was relevant, we'd populate it and build context.
      // For now, consistent with not populating it initially for this function.
    }
    // Check 2: If not the primary user, is it a webinar and is the requester an active attendee?
    if (!isAuthorized && isWebinarBooking && booking.attendees && Array.isArray(booking.attendees)) {
        const validAttendeeStates = ['confirmed', 'attended', 'pending_reschedule_confirmation', 'confirmed_rescheduled', 'pending_minimum_attendees'];
        validAttendeeRecord = booking.attendees.find(
          att => att.user && att.user._id.toString() === userId && validAttendeeStates.includes(att.status)
        );
        if (validAttendeeRecord) {
          isAuthorized = true;
          // For webinars, try to find the specific payment made by this attendee
          const attendeePaymentRecord = await Payment.findOne({
            booking: booking._id,
            payer: userId, // The ID of the user making the request (the attendee)
            status: { $in: ['completed', 'authorized'] } 
          });
          if (attendeePaymentRecord && attendeePaymentRecord.amount && typeof attendeePaymentRecord.amount.total === 'number') {
            paymentContextForPolicyEngine = {
              amount: attendeePaymentRecord.amount.total,
              currency: attendeePaymentRecord.amount.currency || (booking.price ? booking.price.currency : 'CHF')
            };
            logger.info('[calculateCancellationDetails] Found specific payment for webinar attendee for policy calculation.', { bookingId, userId, paymentId: attendeePaymentRecord._id, amount: paymentContextForPolicyEngine.amount, currency: paymentContextForPolicyEngine.currency });
          } else {
             logger.info('[calculateCancellationDetails] No specific payment record found for webinar attendee, or amount was zero. Policy will use default booking price or zero.', { bookingId, userId });
             // If no specific payment, PolicyEngine's default behavior of using booking.price (or 0 if booking.price is missing) will apply.
          }
        }
    }


    if (!isAuthorized) {
      const WEBINAR_TYPE_ID_STRING_CONST = '66ec54f94a8965b22af33fd9'; // For logging context
      let determinedAsWebinarLogging = false;
      if (booking.sessionType) {
        if (typeof booking.sessionType === 'object' && booking.sessionType._id) {
            determinedAsWebinarLogging = booking.sessionType._id.toString() === WEBINAR_TYPE_ID_STRING_CONST;
        } else if (mongoose.Types.ObjectId.isValid(booking.sessionType.toString()) && typeof booking.sessionType.toString === 'function') {
            determinedAsWebinarLogging = booking.sessionType.toString() === WEBINAR_TYPE_ID_STRING_CONST;
        }
      }
      const isRequesterAnAttendeeLogging = (determinedAsWebinarLogging && booking.attendees && Array.isArray(booking.attendees)) ? 
                                  booking.attendees.some(att => att.user && att.user.toString() === userId) : false;
      const requesterAttendeeStatusLogging = (determinedAsWebinarLogging && booking.attendees && Array.isArray(booking.attendees)) ? 
                                   (booking.attendees.find(att => att.user && att.user.toString() === userId)?.status) : null;

      logger.warn('[calculateCancellationDetails] Unauthorized attempt to calculate cancellation details.', {
        bookingId,
        requestingUserId: userId,
        bookingDirectUserId: booking.user?._id?.toString(),
        isIdentifiedAsWebinar: determinedAsWebinarLogging,
        isRequesterAnAttendeeInArray: isRequesterAnAttendeeLogging,
        requesterAttendeeStatusInBooking: requesterAttendeeStatusLogging,
        timestamp: new Date().toISOString()
      });
      return res.status(403).json({ message: 'You are not authorized to perform this action on this booking.' });
    }

    if (!booking.coach || !booking.coach._id) {
        logger.error('[calculateCancellationDetails] Coach information is missing or not populated correctly on the booking.', { bookingId, bookingCoachField: booking.coach, timestamp: new Date().toISOString() });
        return res.status(500).json({ message: 'Coach information is missing for this booking. Cannot calculate cancellation details.' });
    }
    
    const coachProfile = await Coach.findOne({ user: booking.coach._id }).select('settings.cancellationPolicy settings.timeZone');
    console.debug('[calculateCancellationDetails] Fetched coachProfile for policy', { 
        bookingId, 
        coachUserId: booking.coach._id, 
        coachProfileExists: !!coachProfile, 
        hasCancellationPolicyField: coachProfile ? 'cancellationPolicy' in coachProfile.settings : 'N/A',
        cancellationPolicyIsObject: coachProfile?.settings?.cancellationPolicy ? typeof coachProfile.settings.cancellationPolicy === 'object' : 'N/A',
        timestamp: new Date().toISOString() 
    });

    if (!coachProfile || !coachProfile.settings || typeof coachProfile.settings.cancellationPolicy !== 'object' || coachProfile.settings.cancellationPolicy === null) {
        logger.error('[calculateCancellationDetails] Coach specific profile/settings or cancellation policy object not found/invalid for booking.', { 
            bookingId, 
            coachUserId: booking.coach._id, 
            coachProfileSettings: coachProfile ? JSON.stringify(coachProfile.settings) : 'Coach profile not found',
            timestamp: new Date().toISOString() 
        });
        return res.status(500).json({ message: 'Coach policy not configured or invalid. Cannot calculate cancellation details.' });
    }
    
    const coachCancellationPolicyObject = coachProfile.settings.cancellationPolicy;
    
    const coachSettingsForPolicyEngine = {
        cancellationPolicy: coachCancellationPolicyObject,
        timeZone: coachProfile.settings.timeZone || booking.coach.settings?.timeZone || 'UTC'
    };

    const applicablePolicy = PolicyEngine.getApplicableCancellationPolicy(booking, coachSettingsForPolicyEngine);
    
    if (!applicablePolicy || (Array.isArray(applicablePolicy.tiers) && applicablePolicy.minimumNoticeHoursClientCancellation === undefined && applicablePolicy.tiers.length === 0) || (applicablePolicy.minimumNoticeHoursClientCancellation === undefined && !Array.isArray(applicablePolicy.tiers))) {
       logger.warn('[calculateCancellationDetails] Applicable policy is null, malformed, has no tiers array, or is missing minimumNoticeHoursClientCancellation.', { 
            bookingId, 
            retrievedPolicy: applicablePolicy ? JSON.stringify(applicablePolicy) : 'null or undefined',
            timestamp: new Date().toISOString() 
        });
    }
    
    // Pass paymentContextForPolicyEngine (which might be null)
    const refundDetails = PolicyEngine.calculateRefundDetails(booking, applicablePolicy, DateTime.utc().toISO(), paymentContextForPolicyEngine);
    console.debug('[calculateCancellationDetails] PolicyEngine.calculateRefundDetails returned:', { 
        bookingId, 
        paymentContextUsed: paymentContextForPolicyEngine,
        refundDetails: JSON.stringify(refundDetails),
        timestamp: new Date().toISOString() 
    });

   console.log('[calculateCancellationDetails] Successfully calculated cancellation details', { bookingId, canCancel: refundDetails.canCancel, refundAmount: refundDetails.grossRefundToClient, reasonCode: refundDetails.reasonCode, timestamp: new Date().toISOString() });

    res.status(200).json({
      success: true,
      bookingId: booking._id.toString(),
      canCancel: refundDetails.canCancel,
      reasonCode: refundDetails.reasonCode,
      refundPercentage: refundDetails.refundPercentage,
      grossRefundToClient: refundDetails.grossRefundToClient,
      currency: refundDetails.currency,
      applicableTierDescriptionKey: refundDetails.applicableTierDescriptionKey,
      timeRemainingHours: refundDetails.timeRemainingHours, // This might be useful from previous context
      minimumNoticeHours: refundDetails.minimumNoticeHours,
      matchedTierHoursBefore: refundDetails.matchedTierHoursBefore
    });

  } catch (error) {
    logger.error('[calculateCancellationDetails] Error calculating cancellation details', { bookingId, userId, errorMessage: error.message, errorStack: error.stack, timestamp: new Date().toISOString() });
    if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to calculate cancellation details.', error: error.message });
    } else {
        logger.error('[calculateCancellationDetails] Headers already sent, could not send error response to client.', { bookingId });
    }
  }
};

exports.cancelBookingByClient = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id.toString();
  const { cancellationReason } = req.body;

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[cancelBookingByClient] Initiating client cancellation', { bookingId, userId, cancellationReason });

    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email') // Populates the User document assigned as coach
      .populate('user', '_id firstName lastName email')   // Populates the User document of the client
      .populate('sessionType')
      .populate('payment.paymentRecord')
      .session(mongoSession);

    if (!booking) {
      logger.warn('[cancelBookingByClient] Booking not found', { bookingId });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found.' });
    }

    if (booking.user?._id.toString() !== userId) {
      logger.warn('[cancelBookingByClient] Unauthorized cancellation attempt', { bookingId, userId, bookingUserId: booking.user?._id });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(403).json({ message: 'You are not authorized to cancel this booking.' });
    }

    if (['cancelled_by_client', 'cancelled_by_coach', 'cancelled_by_admin'].includes(booking.status)) {
        logger.warn('[cancelBookingByClient] Booking already cancelled', { bookingId, currentStatus: booking.status });
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(400).json({ message: 'This booking has already been cancelled.' });
    }

    // booking.coach is the User document of the coach. Fetch the Coach document for settings.
    if (!booking.coach || !booking.coach._id) {
        logger.error('[cancelBookingByClient] Coach (User document) not populated or missing ID on booking.', { bookingId });
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(500).json({ message: 'Coach details not found for booking. Cannot process cancellation.' });
    }

   if (!booking.cancellationPolicy) {
        logger.error('[cancelBookingByClient] Cancellation policy missing on booking document.', { bookingId });
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(500).json({ message: 'Booking is missing cancellation policy data. Cannot process cancellation.' });
    }
    const coachSystemSettings = { cancellationPolicy: booking.cancellationPolicy }; 
    const applicablePolicy = PolicyEngine.getApplicableCancellationPolicy(booking, coachSystemSettings);
    const refundCalcDetails = PolicyEngine.calculateRefundDetails(booking, applicablePolicy, DateTime.utc().toISO());

    const oldStatus = booking.status;
    booking.status = 'cancelled_by_client';
    if (cancellationReason) {
      booking.cancellationReason = cancellationReason;
    }
    booking.updatedAt = new Date();

    let newAvailabilitySlot = null;
    const sessionTypeIdString = typeof booking.sessionType === 'string' ? booking.sessionType : (booking.sessionType?._id?.toString() || '');
    
    if (sessionTypeIdString !== WEBINAR_TYPE_ID_STRING && sessionTypeIdString !== GROUP_TYPE_ID_STRING && sessionTypeIdString !== WORKSHOP_TYPE_ID_STRING) {
        if (booking.metadata?.originalAvailability || !booking.isAvailability) {
            newAvailabilitySlot = await coalesceAndRestoreAvailability(booking, mongoSession);
            logger.info('[cancelBookingByClient] New availability slot created from cancelled 1-on-1 booking', { newSlotId: newAvailabilitySlot._id, originalBookingId: booking._id });
        }
    } else {
        const attendeeIndex = booking.attendees.findIndex(att => att.user && att.user.toString() === userId);
        if (attendeeIndex > -1) {
            booking.attendees[attendeeIndex].status = 'cancelled';
            booking.markModified('attendees');
            logger.info('[cancelBookingByClient] Attendee status marked as cancelled for webinar/group booking', { bookingId, userId });
        } else {
            logger.warn('[cancelBookingByClient] Cancelling user not found in attendees list for webinar/group booking', { bookingId, userId });
        }
    }
    
    await booking.save({ session: mongoSession });

    const sessionDoc = await Session.findOneAndUpdate(
        { bookingId: booking._id },
        { $set: { state: 'cancelled', lastUpdated: new Date() } },
        { new: true, session: mongoSession }
    );
    if (sessionDoc) {
        logger.info('[cancelBookingByClient] Session document updated to cancelled', { sessionId: sessionDoc._id });
    }

   let refundResult = null;
const paymentRecord = booking.payment?.paymentRecord;

if (paymentRecord) {
    if (paymentRecord.status === 'completed' && paymentRecord.stripe?.paymentIntentId && refundCalcDetails.grossRefundToClient > 0) {
        logger.info('[cancelBookingByClient] Payment was completed. Processing refund.', {
            paymentIntentId: paymentRecord.stripe.paymentIntentId,
            amount: refundCalcDetails.grossRefundToClient,
            currency: refundCalcDetails.currency
        });
        try {
            refundResult = await paymentService.processRefund({
                paymentIntentId: paymentRecord.stripe.paymentIntentId,
                amount: refundCalcDetails.grossRefundToClient,
                currency: refundCalcDetails.currency,
                reason: `Client cancellation: ${bookingId}`
            });
            logger.info('[cancelBookingByClient] Refund processed via paymentService', { refundId: refundResult?.id, status: refundResult?.status });
            
            if (refundResult && refundResult.status === 'succeeded') {
                paymentRecord.status = (paymentRecord.amount.total === refundCalcDetails.grossRefundToClient) ? 'refunded' : 'partially_refunded';
                paymentRecord.refunds = paymentRecord.refunds || [];
                paymentRecord.refunds.push({
                    amount: refundResult.amount / 100, 
                    currency: refundResult.currency.toUpperCase(),
                    reason: `Client cancellation: ${bookingId}`,
                    status: 'succeeded', 
                    stripeRefundId: refundResult.id,
                    processedAt: new Date(),
                    processedBy: userId 
                });
                await paymentRecord.save({ session: mongoSession });
                logger.info('[cancelBookingByClient] Payment record updated after successful refund', { paymentId: paymentRecord._id, newStatus: paymentRecord.status });
            } else if (refundResult) {
                logger.warn('[cancelBookingByClient] Refund processed by Stripe but not succeeded', { refundId: refundResult.id, status: refundResult.status, paymentIntentId: paymentRecord.stripe.paymentIntentId });
                paymentRecord.status = 'refund_failed'; 
                await paymentRecord.save({ session: mongoSession });
            }
        } catch (refundError) {
            logger.error('[cancelBookingByClient] Error processing refund via paymentService', { bookingId, error: refundError.message });
            if(paymentRecord){
                paymentRecord.status = 'refund_failed'; 
                paymentRecord.error = { message: `Refund failed: ${refundError.message}`, code: 'REFUND_PROCESSING_ERROR' };
                await paymentRecord.save({session: mongoSession});
            }
        }
    } else if (paymentRecord.status !== 'completed' && paymentRecord.status !== 'refunded' && paymentRecord.status !== 'partially_refunded') {
        // If payment was not completed (e.g., 'pending', 'draft', 'failed', 'authorized'), just mark as 'cancelled'
        logger.info('[cancelBookingByClient] Payment was not completed. Marking payment record as cancelled.', { paymentId: paymentRecord._id, currentPaymentStatus: paymentRecord.status });
        paymentRecord.status = 'cancelled'; 
        await paymentRecord.save({ session: mongoSession });
        // Ensure refundCalcDetails reflect no actual refund occurred for the notification
        refundCalcDetails.grossRefundToClient = 0; 
        refundResult = { status: 'no_payment_to_refund' };
    } else if (refundCalcDetails.grossRefundToClient === 0) {
        // Payment was completed, but policy dictates no refund
        logger.info('[cancelBookingByClient] Payment was completed, but no refund due by policy. Payment record status unchanged or set to cancelled if appropriate.', { paymentId: paymentRecord._id, currentPaymentStatus: paymentRecord.status });
        // Depending on your desired logic, you might keep status as 'completed' or change to 'cancelled'
        // For consistency, if booking is cancelled & no refund, 'cancelled' for payment seems logical.
        if (paymentRecord.status === 'completed') { // Only change if it was completed and now has no refund
            paymentRecord.status = 'cancelled'; 
            await paymentRecord.save({ session: mongoSession });
        }
         refundResult = { status: 'no_refund_due_by_policy' };
    } else {
         logger.info('[cancelBookingByClient] Payment record exists but conditions for refund or simple cancellation not met. Current status:', { paymentId: paymentRecord._id, status: paymentRecord.status, grossRefund: refundCalcDetails.grossRefundToClient});
    }
} else {
    logger.info('[cancelBookingByClient] No payment record found. No refund action needed.', { bookingId });
    refundCalcDetails.grossRefundToClient = 0; // Ensure notification shows no refund
    refundResult = { status: 'no_payment_record' };
}

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    // booking.coach is the populated User document of the coach
    const coachUserForNotification = booking.coach; 
    const clientUserForNotification = booking.user;

   try {
  
    if (clientUserForNotification && coachUserForNotification && coachUserForNotification._id && clientUserForNotification._id) {
        await UnifiedNotificationService.sendNotification({
            type: NotificationTypes.BOOKING_CANCELLED_BY_YOU, // Using Enum
            recipient: clientUserForNotification._id.toString(),
            recipientType: 'client',
            category: NotificationCategories.BOOKING,
            priority: NotificationPriorities.HIGH,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            metadata: {
                bookingId: booking._id.toString(),
                sessionTitle: booking.title,
                coachName: `${coachUserForNotification.firstName} ${coachUserForNotification.lastName}`,
                sessionDate: booking.start,
                refundAmount: refundCalcDetails.grossRefundToClient,
                refundCurrency: refundCalcDetails.currency,
                isRefundDue: refundCalcDetails.grossRefundToClient > 0,
                cancellationReason: cancellationReason || "-"
            }
        }, booking);

        await UnifiedNotificationService.sendNotification({
            type: NotificationTypes.CLIENT_CANCELLED_BOOKING, // Using Enum
            recipient: coachUserForNotification._id.toString(),
            recipientType: 'coach',
            category: NotificationCategories.BOOKING,
            priority: NotificationPriorities.MEDIUM,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            metadata: {
                bookingId: booking._id.toString(),
                clientName: `${clientUserForNotification.firstName} ${clientUserForNotification.lastName}`,
                sessionTitle: booking.title,
                sessionDate: booking.start,
                cancellationReason: cancellationReason || "-",
                availabilityRestored: !!newAvailabilitySlot,
                isWebinar: sessionTypeIdString === WEBINAR_TYPE_ID_STRING,
            }
        }, booking);
    } else {
        logger.error('[cancelBookingByClient] Cannot send notifications, client or coach user details (or their _id) missing after populate for notifications.', { 
            bookingId: booking._id.toString(), 
            clientPopulated: !!clientUserForNotification?._id, 
            coachPopulated: !!coachUserForNotification?._id 
        });
    }
} catch (notificationError) {
    logger.error('[cancelBookingByClient] Error sending notifications post-transaction', { bookingId: booking._id.toString(), error: notificationError.message, stack: notificationError.stack });
}
    
 const socketService = getSocketService();
    if (socketService && booking.coach?._id) { // booking.coach is the User doc, so booking.coach._id is the User ID.
        socketService.emitBookingStatusUpdate(booking._id.toString(), 'cancelled_by_client', [userId, booking.coach._id.toString()]);
        if (newAvailabilitySlot) {
            socketService.emitAvailabilityUpdate(newAvailabilitySlot._id.toString(), 'created', [booking.coach._id.toString()], { restoredFromCancellation: booking._id.toString() });
        }
    } else if (!booking.coach?._id) {
        logger.warn('[cancelBookingByClient] Cannot emit socket event for coach, coach User ID missing.', {bookingId: booking._id.toString()});
    }

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully.',
      bookingId: booking._id.toString(),
      status: booking.status,
      refundDetails: {
        amount: refundCalcDetails.grossRefundToClient,
        currency: refundCalcDetails.currency,
        status: refundResult?.status || (refundCalcDetails.grossRefundToClient > 0 ? 'pending_stripe_confirmation' : 'no_refund_due')
      },
      newAvailabilitySlotId: newAvailabilitySlot?._id.toString()
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[cancelBookingByClient] Critical error during client cancellation', { bookingId, userId, error: error.message, stack: error.stack });
    if (!res.headersSent) { 
        res.status(500).json({ message: 'Failed to cancel booking.', error: error.message });
    }
  }
};

exports.cancelBookingByCoach = async (req, res) => {
  const { bookingId } = req.params;
  const coachUserId = req.user._id.toString();
  const { cancellationReason } = req.body;

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[cancelBookingByCoach] Initiating coach cancellation', { bookingId, coachUserId, cancellationReason });

    // 1. Fetch Booking and essential related data
    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email') // User doc of coach
      .populate('user', '_id firstName lastName email')   // User doc of primary client (for 1-on-1)
      .populate('sessionType', '_id name') // For type checking
      .populate('attendees.user', '_id firstName lastName email') // For webinar attendee notifications & refunds
      .session(mongoSession);

    if (!booking) {
      logger.warn('[cancelBookingByCoach] Booking not found', { bookingId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found.' });
    }

    // 2. Authorization: Ensure the requester is the coach of this booking
    if (booking.coach?._id.toString() !== coachUserId) {
      logger.warn('[cancelBookingByCoach] Unauthorized cancellation attempt by non-coach', { bookingId, coachUserId, bookingCoachId: booking.coach._id });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(403).json({ message: 'You are not authorized to cancel this booking.' });
    }

    // 3. Check if already cancelled
    if (['cancelled_by_client', 'cancelled_by_coach', 'cancelled_by_admin', 'completed', 'no_show'].includes(booking.status)) {
        logger.warn('[cancelBookingByCoach] Booking already cancelled or in a terminal state', { bookingId, currentStatus: booking.status });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'This booking has already been cancelled or completed.' });
    }

    // 5. Update Booking main status and reason
    booking.status = 'cancelled_by_coach';
    if (cancellationReason) {
      booking.cancellationReason = cancellationReason;
    }
    booking.updatedAt = new Date();

    // 6. Determine Booking Type
    const sessionTypeIdString = booking.sessionType?._id?.toString() || '';
    const IS_MULTI_ATTENDEE_EVENT = NON_INDIVIDUAL_SESSION_TYPES.includes(sessionTypeIdString);

    let newAvailabilitySlot = null;
    const refundProcessingResults = [];
    const notifiedClientIds = [];

    // 7. Handle Availability & Refunds based on booking type
    if (IS_MULTI_ATTENDEE_EVENT) {
        logger.info(`[cancelBookingByCoach] Processing multi-attendee event cancellation: ${bookingId}`);
        const activeAttendeeUserIdsToRefund = [];
        booking.attendees.forEach(attendee => {
            if (['confirmed', 'pending_reschedule_confirmation', 'confirmed_rescheduled', 'attended'].includes(attendee.status)) {
                attendee.status = 'cancelled'; // Mark attendee as cancelled
                if (attendee.user?._id) {
                    activeAttendeeUserIdsToRefund.push(attendee.user._id.toString());
                }
            }
        });
        if (activeAttendeeUserIdsToRefund.length > 0) {
            booking.markModified('attendees');
        }

        for (const attendeeUserId of activeAttendeeUserIdsToRefund) {
            const attendeeUserDoc = booking.attendees.find(a => a.user?._id.toString() === attendeeUserId)?.user;
            const attendeeNameForLog = attendeeUserDoc ? `${attendeeUserDoc.firstName} ${attendeeUserDoc.lastName}` : attendeeUserId;

            const attendeePaymentRecord = await Payment.findOne({
                booking: booking._id,
                payer: attendeeUserId,
                status: 'completed'
            }).session(mongoSession);

            if (attendeePaymentRecord && attendeePaymentRecord.stripe?.paymentIntentId && attendeePaymentRecord.amount?.total > 0) {
                const amountToRefundDecimal = attendeePaymentRecord.amount.total;
                const currency = attendeePaymentRecord.amount.currency;
                logger.info(`[cancelBookingByCoach] Processing 100% refund for attendee ${attendeeNameForLog} of event ${bookingId}.`, {
                    paymentIntentId: attendeePaymentRecord.stripe.paymentIntentId, amount: amountToRefundDecimal, currency
                });
                try {
                    const refund = await paymentService.processRefund({
                        paymentIntentId: attendeePaymentRecord.stripe.paymentIntentId,
                        amount: amountToRefundDecimal,
                        currency: currency,
                        reason: `Coach cancelled event: ${bookingId}, attendee: ${attendeeUserId}`
                    });
                    refundProcessingResults.push({
                    attendeeId: attendeeUserId,
                    success: true,
                    refundId: refund?.id,
                    status: refund?.status,
                    amountProcessedCents: refund?.amount,
                    currency: refund?.currency
                });

                attendeePaymentRecord.status = 'refunded';
                    attendeePaymentRecord.refunds = attendeePaymentRecord.refunds || [];
                    attendeePaymentRecord.refunds.push({
                        amount: refund.amount / (currency.toLowerCase() === 'jpy' || currency.toLowerCase() === 'vnd' || currency.toLowerCase() === 'krw' ? 1 : 100),
                        currency: refund.currency.toUpperCase(),
                        reason: `Coach cancelled event: ${bookingId}, attendee: ${attendeeUserId}`,
                        status: 'succeeded',
                        stripeRefundId: refund.id,
                        processedAt: new Date(),
                        processedBy: coachUserId
                    });
                    await attendeePaymentRecord.save({ session: mongoSession });
                    logger.info(`[cancelBookingByCoach] Payment record for attendee ${attendeeNameForLog} updated after refund.`, { paymentId: attendeePaymentRecord._id });
                    if (!notifiedClientIds.includes(attendeeUserId)) notifiedClientIds.push(attendeeUserId);

                } catch (refundError) {
                    logger.error(`[cancelBookingByCoach] Error refunding attendee ${attendeeNameForLog} for event ${bookingId}`, { error: refundError.message });
                    refundProcessingResults.push({ attendeeId: attendeeUserId, success: false, error: refundError.message });
                    if (attendeePaymentRecord) {
                        attendeePaymentRecord.status = 'refund_failed';
                        attendeePaymentRecord.error = { message: `Refund failed (coach cancel event): ${refundError.message}`, code: 'REFUND_PROCESSING_ERROR_COACH_CANCEL_MULTI_ATTENDEE' };
                        await attendeePaymentRecord.save({session: mongoSession});
                    }
                     if (!notifiedClientIds.includes(attendeeUserId)) notifiedClientIds.push(attendeeUserId); // Notify even if refund fails
                }
            } else {
                logger.info(`[cancelBookingByCoach] No completed/refundable payment record found for attendee ${attendeeNameForLog} in event ${bookingId}.`);
                if (!notifiedClientIds.includes(attendeeUserId)) notifiedClientIds.push(attendeeUserId);
            }
        }
    } else { // 1-on-1 Booking
        logger.info(`[cancelBookingByCoach] Processing 1-on-1 booking cancellation: ${bookingId}`);
        if (booking.metadata?.originalAvailability || !booking.isAvailability) {
             newAvailabilitySlot = await coalesceAndRestoreAvailability(booking, mongoSession);
            logger.info('[cancelBookingByCoach] New availability slot created from coach-cancelled 1-on-1 booking', { newSlotId: newAvailabilitySlot._id });
        }

        const mainBookingPaymentRecord = booking.payment?.paymentRecord 
            ? await Payment.findById(booking.payment.paymentRecord).session(mongoSession) 
            : null;

        if (mainBookingPaymentRecord && mainBookingPaymentRecord.status === 'completed' && mainBookingPaymentRecord.stripe?.paymentIntentId && mainBookingPaymentRecord.amount?.total > 0) {
            const amountToRefundDecimal = mainBookingPaymentRecord.amount.total;
            const currency = mainBookingPaymentRecord.amount.currency;
            logger.info(`[cancelBookingByCoach] Processing 100% refund for 1-on-1 booking ${bookingId}.`, {
                paymentIntentId: mainBookingPaymentRecord.stripe.paymentIntentId, amount: amountToRefundDecimal, currency
            });
            try {
                const refund = await paymentService.processRefund({
                    paymentIntentId: mainBookingPaymentRecord.stripe.paymentIntentId,
                    amount: amountToRefundDecimal,
                    currency: currency,
                    reason: `Coach initiated cancellation: ${bookingId}`
                });
               refundProcessingResults.push({
                userId: booking.user?._id,
                success: true,
                refundId: refund?.id,
                status: refund?.status,
                amountProcessedCents: refund?.amount,
                currency: refund?.currency
            });

            mainBookingPaymentRecord.status = 'refunded';
                mainBookingPaymentRecord.refunds = mainBookingPaymentRecord.refunds || [];
                mainBookingPaymentRecord.refunds.push({
                    amount: refund.amount / (currency.toLowerCase() === 'jpy' || currency.toLowerCase() === 'vnd' || currency.toLowerCase() === 'krw' ? 1 : 100),
                    currency: refund.currency.toUpperCase(),
                    reason: `Coach initiated cancellation: ${bookingId}`,
                    status: 'succeeded',
                    stripeRefundId: refund.id,
                    processedAt: new Date(),
                    processedBy: coachUserId
                });
                await mainBookingPaymentRecord.save({ session: mongoSession });
                logger.info(`[cancelBookingByCoach] Payment record for 1-on-1 booking ${bookingId} updated after refund.`, { paymentId: mainBookingPaymentRecord._id });
                if (booking.user?._id && !notifiedClientIds.includes(booking.user._id.toString())) notifiedClientIds.push(booking.user._id.toString());

            } catch (refundError) {
                logger.error(`[cancelBookingByCoach] Error refunding 1-on-1 booking ${bookingId}`, { error: refundError.message });
                refundProcessingResults.push({ userId: booking.user?._id, success: false, error: refundError.message });
                if (mainBookingPaymentRecord) {
                    mainBookingPaymentRecord.status = 'refund_failed';
                    mainBookingPaymentRecord.error = { message: `Refund failed (coach cancel 1-on-1): ${refundError.message}`, code: 'REFUND_PROCESSING_ERROR_COACH_CANCEL_ONEONONE' };
                    await mainBookingPaymentRecord.save({session: mongoSession});
                }
                if (booking.user?._id && !notifiedClientIds.includes(booking.user._id.toString())) notifiedClientIds.push(booking.user._id.toString());
            }
        } else {
            logger.info(`[cancelBookingByCoach] No completed/refundable payment record found for 1-on-1 booking ${bookingId}.`);
            if (booking.user?._id && !notifiedClientIds.includes(booking.user._id.toString())) {
                notifiedClientIds.push(booking.user._id.toString());
            }
        }
    }

    // 8. Save Booking document
    await booking.save({ session: mongoSession });

    // 9. Update Session document state
    const sessionDoc = await Session.findOneAndUpdate(
        { bookingId: booking._id },
        { $set: { state: 'cancelled', lastUpdated: new Date() } },
        { new: true, upsert: false, session: mongoSession }
    );
     if (sessionDoc) {
        logger.info('[cancelBookingByCoach] Session document updated to cancelled', { sessionId: sessionDoc._id });
    } else {
        logger.warn('[cancelBookingByCoach] No matching Session document found to update state for booking.', { bookingId: booking._id});
    }

    // 10. Commit Transaction
    await mongoSession.commitTransaction();
    mongoSession.endSession();

    // 11. Send Notifications (Post-Transaction)
for (const clientId of notifiedClientIds) {
    const clientUser = IS_MULTI_ATTENDEE_EVENT
        ? booking.attendees.find(att => att.user?._id.toString() === clientId)?.user
        : booking.user;

    if (clientUser) {
        let actualRefundAmountDisplay = "0.00";
        let actualRefundCurrencyDisplay = "";
        let actualIsFullRefund = false;

        const refundOutcome = refundProcessingResults.find(r =>
            (IS_MULTI_ATTENDEE_EVENT ? r.attendeeId === clientId : r.userId?.toString() === clientId) && r.success
        );

        if (refundOutcome && typeof refundOutcome.amountProcessedCents === 'number' && refundOutcome.amountProcessedCents > 0 && refundOutcome.currency) {
            actualRefundAmountDisplay = (refundOutcome.amountProcessedCents / 100).toFixed(2);
            actualRefundCurrencyDisplay = refundOutcome.currency.toUpperCase();
            actualIsFullRefund = true; // For coach cancellations, a successful refund is considered "full".
        } else if (refundOutcome && refundOutcome.success && refundOutcome.amountProcessedCents === 0) {
             // Successfully processed a zero amount refund (e.g. free booking or no payment to refund)
            actualRefundAmountDisplay = "0.00";
            actualRefundCurrencyDisplay = refundOutcome.currency ? refundOutcome.currency.toUpperCase() : (booking.price?.currency || 'CHF'); // Fallback currency
            actualIsFullRefund = true; // Still considered "full" in the sense that what was due (zero) was processed.
        }


        try {
            await UnifiedNotificationService.sendNotification({
                type: NotificationTypes.BOOKING_CANCELLED_BY_COACH,
                recipient: clientId,
                recipientType: 'client',
                category: NotificationCategories.BOOKING,
                priority: NotificationPriorities.HIGH,
                channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
                metadata: {
                    bookingId: booking._id.toString(),
                    sessionTitle: booking.title,
                    coachName: `${booking.coach.firstName} ${booking.coach.lastName}`,
                    sessionDate: booking.start,
                    cancellationReason: cancellationReason || "-",
                    isFullRefund: actualIsFullRefund,
                    refundAmount: actualRefundAmountDisplay,
                    refundCurrency: actualRefundCurrencyDisplay,
                    isWebinar: IS_MULTI_ATTENDEE_EVENT
                }
            }, booking);
        } catch (notificationError) {
            logger.error('[cancelBookingByCoach] Error sending client notification post-transaction', { bookingId, clientId, error: notificationError.message });
        }
    }
}

    try {
        await UnifiedNotificationService.sendNotification({
            type: NotificationTypes.YOUR_BOOKING_CANCELLATION_CONFIRMED,
            recipient: coachUserId,
            recipientType: 'coach',
            category: NotificationCategories.BOOKING,
            priority: NotificationPriorities.MEDIUM,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            metadata: {
                bookingId: booking._id.toString(),
                sessionTitle: booking.title,
                clientName: IS_MULTI_ATTENDEE_EVENT ? `${notifiedClientIds.length} attendees` : (booking.user ? `${booking.user.firstName} ${booking.user.lastName}` : 'N/A'),
                sessionDate: booking.start,
                cancellationReason: cancellationReason || "-",
                availabilityRestored: !!newAvailabilitySlot
            }
        }, booking);
    } catch (notificationError) {
        logger.error('[cancelBookingByCoach] Error sending coach confirmation notification post-transaction', { bookingId, error: notificationError.message });
    }

    // 12. Emit Socket Events
    const socketService = getSocketService();
    if (socketService) {
        const allAffectedUserIdsForSocket = [...new Set([...notifiedClientIds, coachUserId])]; // Ensure unique IDs
        socketService.emitBookingStatusUpdate(booking._id.toString(), 'cancelled_by_coach', allAffectedUserIdsForSocket);
        if (newAvailabilitySlot) {
             socketService.emitAvailabilityUpdate(newAvailabilitySlot._id.toString(), 'created', [coachUserId], { restoredFromCoachCancellation: booking._id.toString() });
        }
    }

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully by coach. Affected attendees will be fully refunded.',
      bookingId: booking._id.toString(),
      status: booking.status,
      refundResults: refundProcessingResults,
      newAvailabilitySlotId: newAvailabilitySlot?._id?.toString()
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[cancelBookingByCoach] Critical error during coach cancellation', { bookingId, coachUserId, errorName: error.name, errorMessage: error.message, stack: error.stack });
    res.status(500).json({ message: 'Failed to cancel booking by coach.', error: error.message });
  }
};

exports.checkRescheduleEligibility = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id.toString();

  try {
    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id settings.cancellationPolicy settings.timeZone') // Populate settings directly
      .populate('user', '_id');

    if (!booking) {
      logger.warn('[checkRescheduleEligibility] Booking not found', { bookingId });
      return res.status(404).json({ message: 'Booking not found.' });
    }

    const isClientAction = booking.user?._id.toString() === userId;
    // const isCoachAction = booking.coach?._id.toString() === userId; // Coach initiated reschedule has a different flow/endpoint

    if (!isClientAction) { // Only clients use this specific eligibility check endpoint
      logger.warn('[checkRescheduleEligibility] Unauthorized attempt or wrong actor type', { bookingId, userId });
      return res.status(403).json({ message: 'You are not authorized to perform this action on this booking.' });
    }
    
    const sessionTypeIdString = typeof booking.sessionType === 'string' ? booking.sessionType : (booking.sessionType?._id?.toString() || '');
    if (sessionTypeIdString === WEBINAR_TYPE_ID_STRING || sessionTypeIdString === GROUP_TYPE_ID_STRING || sessionTypeIdString === WORKSHOP_TYPE_ID_STRING) {
         logger.warn('[checkRescheduleEligibility] Reschedule not applicable for webinar/group booking type by client', { bookingId, sessionTypeIdString });
         return res.status(400).json({ message: 'Rescheduling is not available for this type of booking.', canReschedule: false, reasonCode: 'NOT_ONE_ON_ONE' });
    }
    
if (!booking.coach || !booking.coach._id) {
        logger.error('[checkRescheduleEligibility] Coach user details not populated or missing ID.', { bookingId });
        return res.status(500).json({ message: 'Coach details missing. Cannot check eligibility.' });
    }

    const coachProfile = await Coach.findOne({ user: booking.coach._id })
        .select('settings.cancellationPolicy settings.timeZone');

    if (!coachProfile || !coachProfile.settings || !coachProfile.settings.cancellationPolicy || !coachProfile.settings.cancellationPolicy.oneOnOne) {
        logger.error('[checkRescheduleEligibility] Coach profile, settings, or 1-on-1 policy not found.', { bookingId, coachUserId: booking.coach._id });
        return res.status(500).json({ message: 'Coach policy not configured. Cannot check reschedule eligibility.', canReschedule: false, reasonCode: 'POLICY_DATA_MISSING' });
    }
    const coachSystemSettings = coachProfile.settings;
    
    const eligibility = PolicyEngine.checkRescheduleEligibility(booking, coachSystemSettings, DateTime.utc().toISO());

    const needsApprovalOverride = true;
    const isAutomaticOverride = false;
    
    let finalReasonCode = eligibility.reasonCode;
    if (eligibility.canReschedule && needsApprovalOverride && eligibility.isAutomatic) {
        // If engine said automatic, but we override to manual, adjust reason code
        finalReasonCode = 'COACH_APPROVAL_REQUIRED_OVERRIDE';
    }


    res.status(200).json({
      success: true,
      bookingId: booking._id,
      canReschedule: eligibility.canReschedule,
      needsApproval: needsApprovalOverride, 
      isAutomatic: isAutomaticOverride,  
      reasonCode: finalReasonCode,
    });

  } catch (error) {
    logger.error('[checkRescheduleEligibility] Error checking reschedule eligibility', { bookingId, userId, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Failed to check reschedule eligibility.', error: error.message });
  }
};

exports.requestRescheduleByClient = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id.toString();
  const { proposedSlots, requestMessage: clientReason } = req.body; 

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[requestRescheduleByClient] Initiating client reschedule request', { bookingId, userId, proposedSlotsCount: proposedSlots?.length, clientReason });

    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email settings.cancellationPolicy settings.timeZone') // Populate coach settings directly
      .populate('user', '_id firstName lastName email')
      .populate('sessionType')
      .session(mongoSession);

    if (!booking) {
      logger.warn('[requestRescheduleByClient] Booking not found', { bookingId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found.' });
    }

    if (booking.user?._id.toString() !== userId) {
      logger.warn('[requestRescheduleByClient] Unauthorized reschedule attempt', { bookingId, userId, bookingUserId: booking.user?._id });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(403).json({ message: 'You are not authorized to reschedule this booking.' });
    }

    const sessionTypeIdString = typeof booking.sessionType === 'string' ? booking.sessionType : (booking.sessionType?._id?.toString() || '');
    if (sessionTypeIdString === WEBINAR_TYPE_ID_STRING || sessionTypeIdString === GROUP_TYPE_ID_STRING || sessionTypeIdString === WORKSHOP_TYPE_ID_STRING) {
         logger.warn('[requestRescheduleByClient] Reschedule not applicable for webinar/group booking type by client', { bookingId, sessionTypeIdString });
         await mongoSession.abortTransaction(); mongoSession.endSession();
         return res.status(400).json({ message: 'Rescheduling is not available for this type of booking.'});
    }

    if (!Array.isArray(proposedSlots) || proposedSlots.length === 0) {
        logger.warn('[requestRescheduleByClient] No proposed slots provided', { bookingId });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'At least one new time slot must be proposed.' });
    }
    
    for (const slot of proposedSlots) {
        if (!slot.start || !slot.end || new Date(slot.start) >= new Date(slot.end) || new Date(slot.start) <= new Date()) {
            logger.warn('[requestRescheduleByClient] Invalid proposed slot', { bookingId, slot });
            await mongoSession.abortTransaction(); mongoSession.endSession();
            return res.status(400).json({ message: 'Invalid proposed time slot(s). Ensure start is before end and in the future.' });
        }
           }
    
 if (!booking.coach || !booking.coach._id) {
        logger.error('[requestRescheduleByClient] Coach user details not populated or missing ID.', { bookingId });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(500).json({ message: 'Coach details missing. Cannot process request.' });
    }

    if (!coachProfile || !coachProfile.settings || !coachProfile.settings.cancellationPolicy || !coachProfile.settings.cancellationPolicy.oneOnOne) {
        logger.error('[requestRescheduleByClient] Coach profile, settings, or 1-on-1 policy not found.', { bookingId, coachUserId: booking.coach._id });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(500).json({ message: 'Coach policy not configured. Cannot process reschedule request.' });
    }
    const coachSystemSettings = coachProfile.settings;

    const eligibility = PolicyEngine.checkRescheduleEligibility(booking, coachSystemSettings, DateTime.utc().toISO());

    if (!eligibility.canReschedule) {
      logger.warn('[requestRescheduleByClient] Reschedule not allowed by policy at time of submission', { bookingId, reasonCode: eligibility.reasonCode });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      // Determine user-friendly message based on reasonCode
      let userMessage = 'This session cannot be rescheduled at this time according to the policy.';
      if (eligibility.reasonCode === 'TOO_LATE_PAST_CANCELLATION_NOTICE' && coachSystemSettings.cancellationPolicy.oneOnOne) {
          userMessage = `This session is too close to its start time to be rescheduled (within ${coachSystemSettings.cancellationPolicy.oneOnOne.minimumNoticeHoursClientCancellation} hours).`;
      } else if (eligibility.reasonCode === 'POLICY_DATA_MISSING') {
          userMessage = 'Coach policy data is missing. Cannot process reschedule.';
      }
      return res.status(400).json({ message: userMessage, reasonCode: eligibility.reasonCode });
    }
    
    booking.status = 'pending_reschedule_client_request';
    booking.rescheduleRequests = booking.rescheduleRequests || [];

    const latestRequest = {
        proposedBy: new mongoose.Types.ObjectId(userId), // Ensure it's an ObjectId
        proposedAt: new Date(),
        proposedSlots: proposedSlots.map(s => ({ start: new Date(s.start), end: new Date(s.end) })),
        requestMessage: clientReason,
        status: 'pending_coach_action' 
    };
    booking.rescheduleRequests.push(latestRequest);
    
    logger.info('[requestRescheduleByClient] Reschedule request marked for coach approval', { bookingId, newStatus: booking.status });
    
    booking.markModified('rescheduleRequests'); // Important for array modifications
    await booking.save({ session: mongoSession });

    const sessionDoc = await Session.findOne({ bookingId: booking._id }).session(mongoSession);
    if (sessionDoc) {
        sessionDoc.state = 'pending_reschedule'; 
        sessionDoc.lastUpdated = new Date();
        await sessionDoc.save({ session: mongoSession });
        logger.info('[requestRescheduleByClient] Session document updated to pending_reschedule', { sessionId: sessionDoc._id, newState: sessionDoc.state });
    } else {
        logger.warn('[requestRescheduleByClient] No associated Session document found to update state', { bookingId: booking._id });
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    const populatedBookingForNotif = await Booking.findById(booking._id)
        .populate('coach', '_id firstName lastName email')
        .populate('user', '_id firstName lastName email')
        .populate('sessionType', 'name') // Ensure sessionType.name is available
        .lean(); 

    if (!populatedBookingForNotif) {
        logger.error('[requestRescheduleByClient] Failed to re-populate booking for notifications', { bookingId: booking._id });
        // Transaction is committed, but notifications might fail. Log and continue.
    } else {
        // Notification to Client (Initiator)
        await UnifiedNotificationService.sendNotification({
            type: NotificationTypes.RESCHEDULE_REQUEST_SENT_TO_COACH, 
            recipient: userId, 
            recipientType: 'client', 
            category: NotificationCategories.BOOKING, 
            priority: NotificationPriorities.MEDIUM,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            requiresAction: false, // Client's notification is informational
            metadata: { 
                bookingId: populatedBookingForNotif._id.toString(), 
                sessionTitle: populatedBookingForNotif.title, 
                sessionType: populatedBookingForNotif.sessionType?.name || 'Session',
                coachName: `${populatedBookingForNotif.coach.firstName} ${populatedBookingForNotif.coach.lastName}`,
                originalDate: new Date(populatedBookingForNotif.start).toLocaleDateString(),
                originalTime: new Date(populatedBookingForNotif.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
            }
        }, populatedBookingForNotif);

        // Notification to Coach (Recipient of the request)
        const coachNotificationType = NotificationTypes.CLIENT_REQUESTED_RESCHEDULE;
        const coachNotificationMeta = NotificationMetadata[coachNotificationType] || {};

        await UnifiedNotificationService.sendNotification({
            type: coachNotificationType, 
            recipient: populatedBookingForNotif.coach._id.toString(), 
            recipientType: 'coach', 
            category: NotificationCategories.BOOKING, 
            priority: NotificationPriorities.HIGH,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            requiresAction: coachNotificationMeta.requiresAction !== undefined ? coachNotificationMeta.requiresAction : true, // Explicitly true if not defined in meta
            metadata: { 
                bookingId: populatedBookingForNotif._id.toString(), 
                sessionTitle: populatedBookingForNotif.title, 
                sessionType: populatedBookingForNotif.sessionType?.name || 'Session',
                clientName: `${populatedBookingForNotif.user.firstName} ${populatedBookingForNotif.user.lastName}`, 
                originalStartTime: populatedBookingForNotif.start,
                originalDate: new Date(populatedBookingForNotif.start).toLocaleDateString(),
                originalTime: new Date(populatedBookingForNotif.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
                proposedSlots: latestRequest.proposedSlots, 
                clientMessage: clientReason,
                // validActions will be derived by generateNotificationContent based on type
            }
        }, populatedBookingForNotif);
        
        const socketService = getSocketService();
        if (socketService) {
            const updatedBookingForSocket = await Booking.findById(booking._id).lean();
            if (updatedBookingForSocket) {
                socketService.emitBookingUpdate(updatedBookingForSocket._id.toString(), updatedBookingForSocket, [userId, populatedBookingForNotif.coach._id.toString()]);
            }
        }
    }

    res.status(200).json({
      success: true,
      message: 'Reschedule request sent to coach for approval.',
      booking: await Booking.findById(booking._id).lean(), 
      isAutomatic: false, 
      needsApproval: true 
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[requestRescheduleByClient] Critical error during client reschedule request', { bookingId, userId, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Failed to request reschedule.', error: error.message });
  }
};

exports.respondToRescheduleRequestByCoach = async (req, res) => {
  const { bookingId } = req.params;
  const coachUserId = req.user._id.toString();
  const { action, selectedTime, coachMessage, coachProposedTimes, requestId } = req.body;

  if (!requestId) {
    return res.status(400).json({ message: 'Reschedule request ID is required.' });
  }

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[respondToRescheduleRequestByCoach] Coach responding to reschedule request', { bookingId, coachUserId, action, requestId });

    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email')
      .populate('user', 'firstName lastName email')
      .populate('sessionType')
      .session(mongoSession);

    if (!booking) {
      logger.warn('[respondToRescheduleRequestByCoach] Booking not found', { bookingId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found.' });
    }

    if (booking.coach?._id.toString() !== coachUserId) {
      logger.warn('[respondToRescheduleRequestByCoach] Unauthorized attempt', { bookingId, coachUserId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(403).json({ message: 'You are not authorized to manage this reschedule request.' });
    }

    const coachProfile = await Coach.findOne({ user: booking.coach._id })
        .select('settings.availabilityManagement')
        .session(mongoSession);

    if (!coachProfile || !coachProfile.settings) {
        logger.error('[respondToRescheduleRequestByCoach] Coach profile or settings not found.', { bookingId, coachUserId: booking.coach._id });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(500).json({ message: 'Coach settings not found. Cannot process request.' });
    }
    const coachSystemSettings = coachProfile.settings;


    const requestIndex = booking.rescheduleRequests.findIndex(r => r._id.toString() === requestId && r.status === 'pending_coach_action');
    if (requestIndex === -1) {
      logger.warn('[respondToRescheduleRequestByCoach] Valid pending reschedule request not found or already actioned', { bookingId, requestId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Pending reschedule request not found or already actioned.' });
    }
    const clientRequest = booking.rescheduleRequests[requestIndex];

    const originalStart = booking.start;
    const originalEnd = booking.end;
    const oldBookingStatus = booking.status; 
    let restoredOldAvailability = null;

    let notificationTypeToClient, notificationMetadataClient = {}, notificationTypeToCoach, notificationMetadataCoach = {};

   if (action === 'approve') {
      if (!selectedTime || !selectedTime.start || !selectedTime.end) {
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'A selected time slot is required for approval.' });
      }
      const newStartTime = new Date(selectedTime.start);
      const newEndTime = new Date(selectedTime.end);

      // Validate newStartTime is in the future
      if (newStartTime <= new Date()) {
          logger.warn('[respondToRescheduleRequestByCoach] Approved new slot is in the past.', { bookingId, newStartTime });
          await mongoSession.abortTransaction(); mongoSession.endSession();
          return res.status(400).json({ message: 'The selected new time is in the past. Please choose a future time.'});
      }

      const conflictingBooking = await Booking.findOne({
        _id: { $ne: booking._id },
        coach: booking.coach._id,
        start: { $lt: newEndTime },
        end: { $gt: newStartTime },
        isAvailability: false,
        status: { $nin: ['cancelled_by_client', 'cancelled_by_coach', 'cancelled_by_admin', 'declined', 'completed', 'no_show'] }
      }).session(mongoSession);

      if (conflictingBooking) {
        logger.warn('[respondToRescheduleRequestByCoach] Approved new slot conflicts with an existing booking.', { bookingId, newStartTime, newEndTime, conflictingBookingId: conflictingBooking._id });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(409).json({ message: 'The selected new time conflicts with another booking for you. Please decline or propose a different time.' });
      }
      
      const encompassingAvailabilityForNewSlot = await Booking.findOne({
        coach: booking.coach._id,
        start: { $lte: newStartTime },
        end: { $gte: newEndTime },
        isAvailability: true
      }).session(mongoSession);

      if (!encompassingAvailabilityForNewSlot) {
        logger.warn('[respondToRescheduleRequestByCoach] Approved new slot is not within coach general availability.', { bookingId, newStartTime, newEndTime });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(409).json({ message: 'The selected new time is not available in your calendar. Please decline or propose a different time.' });
      }

      // Restore old slot as availability
    const originalBookingSlot = { _id: booking._id, coach: booking.coach._id, sessionType: booking.sessionType._id, start: originalStart, end: originalEnd, timezone: booking.timezone, metadata: booking.metadata };
      restoredOldAvailability = await coalesceAndRestoreAvailability(originalBookingSlot, mongoSession);
      logger.info('[respondToRescheduleRequestByCoach] Old booking slot restored as availability due to coach approval.', { bookingId, newAvailabilityId: restoredOldAvailability._id });
      
      // Carve out new slot
      const newPiecesArray = await splitAvailabilitySlot(encompassingAvailabilityForNewSlot, newStartTime, newEndTime);
      await Booking.findByIdAndDelete(encompassingAvailabilityForNewSlot._id, { session: mongoSession });
      if (newPiecesArray.length > 0) {
        await Booking.insertMany(newPiecesArray, { session: mongoSession, setDefaultsOnInsert: false });
      }
      logger.info('[respondToRescheduleRequestByCoach] New booking slot carved out from availability.', { bookingId, originalAvailabilityDeleted: encompassingAvailabilityForNewSlot._id, newPiecesCreated: newPiecesArray.length });


      booking.start = newStartTime;
      booking.end = newEndTime;
      booking.status = 'confirmed'; // Booking is now confirmed at the new time
      clientRequest.status = 'approved'; // The client's request is marked as approved
      clientRequest.decidedAt = new Date();
      if(coachMessage) clientRequest.decisionMessage = coachMessage;

      booking.rescheduleHistory = booking.rescheduleHistory || [];
      booking.rescheduleHistory.push({
        originalStart, originalEnd,
        newStart: booking.start, newEnd: booking.end,
        requestedBy: clientRequest.proposedBy, // This was the client
        requestedAt: clientRequest.proposedAt,
        status: 'approved_by_coach', // Coach approved the client's request
        actionTimestamp: new Date(),
        actorMessage: coachMessage // Coach's message when approving
      });

      notificationTypeToClient = NotificationTypes.RESCHEDULE_APPROVED_BY_COACH;
      notificationMetadataClient = { bookingId: booking._id.toString(), sessionTitle: booking.title, coachName: `${booking.coach.firstName} ${booking.coach.lastName}`, newStartTime: booking.start, newEndTime: booking.end, coachMessage: coachMessage };
      notificationTypeToCoach = NotificationTypes.RESCHEDULE_CONFIRMED_NOTIFICATION; 
      notificationMetadataCoach = { bookingId: booking._id.toString(), sessionTitle: booking.title, clientName: `${booking.user.firstName} ${booking.user.lastName}`, newStartTime: booking.start, newEndTime: booking.end, oldStartTime: originalStart };

    } else if (action === 'decline') {
      booking.status = 'confirmed'; 
      clientRequest.status = 'declined';
      clientRequest.decidedAt = new Date();
      if(coachMessage) clientRequest.decisionMessage = coachMessage;
      
      notificationTypeToClient = NotificationTypes.RESCHEDULE_DECLINED_BY_COACH;
      notificationMetadataClient = { bookingId: booking._id.toString(), sessionTitle: booking.title, coachName: `${booking.coach.firstName} ${booking.coach.lastName}`, originalStartTime: originalStart, coachMessage: coachMessage };
      notificationTypeToCoach = NotificationTypes.RESCHEDULE_REQUEST_DECLINED_CONFIRMATION;
      notificationMetadataCoach = { bookingId: booking._id.toString(), sessionTitle: booking.title, clientName: `${booking.user.firstName} ${booking.user.lastName}` };

    } else if (action === 'counter_propose') {
      if (!Array.isArray(coachProposedTimes) || coachProposedTimes.length === 0) {
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'At least one new time slot must be proposed for a counter-offer.' });
      }
      for (const slot of coachProposedTimes) {
        if (!slot.start || !slot.end || new Date(slot.start) >= new Date(slot.end) || new Date(slot.start) <= new Date()) {
            await mongoSession.abortTransaction(); mongoSession.endSession();
            return res.status(400).json({ message: 'Invalid proposed time slot(s) in counter-offer. Ensure start is before end and in the future.' });
        }
      }

      booking.status = 'pending_reschedule_coach_request'; 
      clientRequest.status = 'counter_proposed_by_coach'; 
      clientRequest.decidedAt = new Date();
      
      booking.rescheduleRequests.push({
        proposedBy: coachUserId,
        proposedAt: new Date(),
        proposedSlots: coachProposedTimes.map(s => ({ start: new Date(s.start), end: new Date(s.end) })),
        requestMessage: coachMessage, 
        status: 'pending_client_action'
      });
      
      notificationTypeToClient = NotificationTypes.COACH_PROPOSED_NEW_RESCHEDULE_TIME;
      notificationMetadataClient = { bookingId: booking._id.toString(), sessionTitle: booking.title, coachName: `${booking.coach.firstName} ${booking.coach.lastName}`, originalStartTime: originalStart, proposedSlots: coachProposedTimes, coachReason: coachMessage };
      
    } else {
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(400).json({ message: 'Invalid action.' });
    }

    booking.markModified('rescheduleRequests');
    await booking.save({ session: mongoSession });

    const sessionDoc = await Session.findOne({ bookingId: booking._id }).session(mongoSession);
    if (sessionDoc) {
      if (action === 'approve') {
        sessionDoc.start = booking.start;
        sessionDoc.end = booking.end;
        sessionDoc.state = booking.status; 
      } else if (action === 'decline') {
        sessionDoc.state = booking.status; 
      } else if (action === 'counter_propose') {
        sessionDoc.state = 'pending_reschedule'; 
      }
      sessionDoc.lastUpdated = new Date();
      await sessionDoc.save({ session: mongoSession });
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    
    if (notificationTypeToClient && booking.user?._id) {
       await UnifiedNotificationService.sendNotification({
            type: notificationTypeToClient, recipient: booking.user._id.toString(), recipientType: 'client', 
            category: NotificationCategories.BOOKING, priority: NotificationPriorities.HIGH,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            metadata: notificationMetadataClient
        }, booking);
    }
    if (notificationTypeToCoach) {
         await UnifiedNotificationService.sendNotification({
            type: notificationTypeToCoach, recipient: coachUserId, recipientType: 'coach', 
            category: NotificationCategories.BOOKING, priority: NotificationPriorities.MEDIUM,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            metadata: notificationMetadataCoach
        }, booking);
    }

    const socketService = getSocketService();
    if (socketService) {
        socketService.emitBookingUpdate(booking._id.toString(), booking.toObject(), [coachUserId, booking.user?._id.toString()].filter(Boolean));
        if (action === 'approve' && restoredOldAvailability) {
           socketService.emitAvailabilityUpdate(restoredOldAvailability._id.toString(), 'created', [coachUserId], { restoredFromRescheduleApproval: booking._id.toString() });
        }
    }

    res.status(200).json({
      success: true,
      message: `Reschedule request ${action}d successfully.`,
      booking: booking.toObject()
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[respondToRescheduleRequestByCoach] Critical error', { bookingId, coachUserId, action, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Failed to process reschedule request response.', error: error.message });
  }
};

exports.respondToCoachRescheduleProposalByClient = async (req, res) => {
  const { bookingId } = req.params;
  const clientUserId = req.user._id.toString();
 const { requestId, action, selectedTime, clientMessage, proposedSlots } = req.body; 

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: 'Invalid reschedule request ID format.' });
  }

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[respondToCoachRescheduleProposalByClient] Client responding to coach reschedule proposal', { bookingId, clientUserId, requestId, action, selectedTime: selectedTime ? {start: selectedTime.start, end: selectedTime.end} : null });

    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email settings') // Ensure coach settings are populated
      .populate('user', '_id firstName lastName email')
      .populate('sessionType')
      .session(mongoSession);

    if (!booking) {
      logger.warn('[respondToCoachRescheduleProposalByClient] Booking not found', { bookingId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found.' });
    }

    if (booking.user?._id.toString() !== clientUserId) {
      logger.warn('[respondToCoachRescheduleProposalByClient] Unauthorized attempt', { bookingId, clientUserId, actualUserId: booking.user?._id.toString() });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(403).json({ message: 'You are not authorized to respond to this reschedule proposal.' });
    }

    // Directly use populated coach settings if available, otherwise fetch Coach profile
    let coachSystemSettings = booking.coach?.settings;
    if (!coachSystemSettings) {
        const coachProfile = await Coach.findOne({ user: booking.coach._id })
            .select('settings.availabilityManagement settings.cancellationPolicy settings.timeZone')
            .session(mongoSession);
        if (!coachProfile || !coachProfile.settings) {
            logger.error('[respondToCoachRescheduleProposalByClient] Coach profile or settings not found (secondary fetch).', { bookingId, coachUserId: booking.coach._id });
            await mongoSession.abortTransaction(); mongoSession.endSession();
            return res.status(500).json({ message: 'Coach settings not found. Cannot process request.' });
        }
        coachSystemSettings = coachProfile.settings;
    }
    
    const requestIndex = booking.rescheduleRequests.findIndex(r => r._id.toString() === requestId && r.status === 'pending_client_action' && r.proposedBy.toString() === booking.coach._id.toString());
    if (requestIndex === -1) {
      logger.warn('[respondToCoachRescheduleProposalByClient] Valid pending coach proposal not found or already actioned', { bookingId, requestId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Pending reschedule proposal from coach not found or already actioned.' });
    }
    const coachRequest = booking.rescheduleRequests[requestIndex];

    const originalStart = booking.start;
    const originalEnd = booking.end;
    let notificationTypeToClient, notificationMetadataClient = {}, notificationTypeToCoach, notificationMetadataCoach = {};
    let restoredOldAvailabilityResult = null; // To capture result for logging/socket

    if (action === 'approve') {
      if (!selectedTime || !selectedTime.start || !selectedTime.end) {
        logger.warn('[respondToCoachRescheduleProposalByClient] Missing selectedTime for approval', { bookingId, requestId });
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'A selected time slot from coach proposal is required for approval.' });
      }
      const newStartTime = new Date(selectedTime.start);
      const newEndTime = new Date(selectedTime.end);

      if (newStartTime <= new Date()) {
          logger.warn('[respondToCoachRescheduleProposalByClient] Selected new time is in the past', { bookingId, newStartTime });
          await mongoSession.abortTransaction(); mongoSession.endSession();
          return res.status(400).json({ message: 'The selected new time is in the past.'});
      }
      
      const isSlotProposedByCoach = coachRequest.proposedSlots.some(
          slot => new Date(slot.start).toISOString() === newStartTime.toISOString() && new Date(slot.end).toISOString() === newEndTime.toISOString()
      );
      if (!isSlotProposedByCoach) {
          logger.warn('[respondToCoachRescheduleProposalByClient] Selected time was not proposed by coach', { bookingId, selectedTime });
          await mongoSession.abortTransaction(); mongoSession.endSession();
          return res.status(400).json({ message: 'The selected time was not one of the coach\'s proposals.' });
      }

const conflictingBooking = await Booking.findOne({
          _id: { $ne: booking._id },
          coach: booking.coach._id,
          start: { $lt: newEndTime },
          end: { $gt: newStartTime },
          isAvailability: false,
          status: { $nin: ['cancelled_by_client', 'cancelled_by_coach', 'cancelled_by_admin', 'declined', 'completed', 'no_show'] }
      }).session(mongoSession);

      if (conflictingBooking) {
          logger.warn('[respondToCoachRescheduleProposalByClient] Approved new slot conflicts with an existing booking.', { bookingId, newStartTime, newEndTime, conflictingBookingId: conflictingBooking._id });
          await mongoSession.abortTransaction(); mongoSession.endSession();
          return res.status(409).json({ success: false, message: 'The selected time slot is no longer available as it conflicts with another appointment.', reasonCode: 'SLOT_CONFLICT' });
      }
      logger.info('[respondToCoachRescheduleProposalByClient] New slot does not conflict with other bookings. Proceeding.', { bookingId });
      
     const originalBookingSlot = { _id: booking._id, coach: booking.coach._id, sessionType: booking.sessionType._id, start: originalStart, end: originalEnd, timezone: booking.timezone, metadata: booking.metadata };
      restoredOldAvailabilityResult = await coalesceAndRestoreAvailability(originalBookingSlot, mongoSession);
      logger.info('[respondToCoachRescheduleProposalByClient] restoreAvailabilityForBooking result (client accept)', { bookingId, restoredSlotId: restoredOldAvailabilityResult?._id });
      
      const encompassingAvailabilityForNewSlot = await Booking.findOne({
        coach: booking.coach._id,
        start: { $lte: newStartTime },
        end: { $gte: newEndTime },
        isAvailability: true
      }).session(mongoSession);

      if (encompassingAvailabilityForNewSlot) {
        await occupyAvailabilityForNewBookingTime(booking.coach._id, newStartTime, newEndTime, booking, mongoSession);
        logger.info('[respondToCoachRescheduleProposalByClient] Occupied existing availability slot for new booking time.', { bookingId, availabilitySlotId: encompassingAvailabilityForNewSlot._id });
      } else {
        logger.info('[respondToCoachRescheduleProposalByClient] No encompassing availability slot found to occupy. This is acceptable for a coach-proposed reschedule.', { bookingId });
      }
      logger.info('[respondToCoachRescheduleProposalByClient] occupyAvailabilityForNewBookingTime completed (client accept)', { bookingId });
      
      booking.start = newStartTime;
      booking.end = newEndTime;
      booking.status = 'confirmed';
      coachRequest.status = 'approved';
      coachRequest.decidedAt = new Date();
      if(clientMessage) coachRequest.decisionMessage = clientMessage;

      booking.rescheduleHistory = booking.rescheduleHistory || [];
      booking.rescheduleHistory.push({
        originalStart, originalEnd,
        newStart: booking.start, newEnd: booking.end,
        requestedBy: coachRequest.proposedBy, 
        requestedAt: coachRequest.proposedAt,
        status: 'approved_by_client', 
        actionTimestamp: new Date(),
        actorMessage: clientMessage 
      });
      
     notificationTypeToClient = NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_CLIENT_CONFIRM;
      notificationMetadataClient = { 
        bookingId: booking._id.toString(), 
        sessionTitle: booking.title, 
        coachName: `${booking.coach.firstName} ${booking.coach.lastName}`, 
        originalStartTime: originalStart,
        originalEndTime: originalEnd,
        newStartTime: booking.start, 
        newEndTime: booking.end,
        clientMessage: clientMessage || null 
      };
      
      notificationTypeToCoach = NotificationTypes.RESCHEDULE_APPROVED_BY_CLIENT_COACH_NOTIF;
      notificationMetadataCoach = { 
        bookingId: booking._id.toString(), 
        sessionTitle: booking.title, 
        clientName: `${booking.user.firstName} ${booking.user.lastName}`, 
        originalStartTime: originalStart,
        originalEndTime: originalEnd,
        newStartTime: booking.start, 
        newEndTime: booking.end,
        clientMessage: clientMessage || null
      };

    } else if (action === 'decline') {
      booking.status = 'confirmed'; // Original booking stands
      coachRequest.status = 'declined';
      coachRequest.decidedAt = new Date();
      if(clientMessage) coachRequest.decisionMessage = clientMessage;

       booking.rescheduleHistory = booking.rescheduleHistory || [];
       booking.rescheduleHistory.push({
        originalStart, originalEnd,
        newStart: originalStart, newEnd: originalEnd, // No change in time
        requestedBy: coachRequest.proposedBy,
        requestedAt: coachRequest.proposedAt,
        status: 'declined_by_client',
        actionTimestamp: new Date(),
        actorMessage: clientMessage
      });

     notificationTypeToClient = NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_CLIENT_CONFIRM;
      notificationMetadataClient = { 
        bookingId: booking._id.toString(), 
        sessionTitle: booking.title, 
        coachName: `${booking.coach.firstName} ${booking.coach.lastName}`, 
        originalStartTime: originalStart, 
        originalEndTime: originalEnd,
        clientMessage: clientMessage || null
      };
      
      notificationTypeToCoach = NotificationTypes.RESCHEDULE_DECLINED_BY_CLIENT_COACH_NOTIF;
      notificationMetadataCoach = { 
        bookingId: booking._id.toString(), 
        sessionTitle: booking.title, 
        clientName: `${booking.user.firstName} ${booking.user.lastName}`, 
        originalStartTime: originalStart, 
        originalEndTime: originalEnd,
        clientMessage: clientMessage || null
      };
      
    } else if (action === 'counter_propose') { // <<< THIS IS THE BLOCK TO ADD/MOVE HERE
      // const { proposedSlots } = req.body; // Already destructured at the top
      if (!Array.isArray(proposedSlots) || proposedSlots.length === 0) {
        await mongoSession.abortTransaction(); mongoSession.endSession();
        return res.status(400).json({ message: 'At least one new time slot must be proposed for a counter-offer.' });
      }
      for (const slot of proposedSlots) {
        if (!slot.start || !slot.end || new Date(slot.start) >= new Date(slot.end) || new Date(slot.start) <= new Date()) {
            await mongoSession.abortTransaction(); mongoSession.endSession();
            return res.status(400).json({ message: 'Invalid proposed time slot(s) in counter-offer. Ensure start is before end and in the future.' });
        }
      }

      booking.status = 'pending_reschedule_client_request'; 
      coachRequest.status = 'counter_proposed_by_client'; 
      coachRequest.decidedAt = new Date();
      if(clientMessage) coachRequest.decisionMessage = clientMessage; 

      booking.rescheduleRequests.push({
        _id: new mongoose.Types.ObjectId(),
        proposedBy: clientUserId, 
        proposedAt: new Date(),
        proposedSlots: proposedSlots.map(s => ({ start: new Date(s.start), end: new Date(s.end) })),
        requestMessage: clientMessage, 
        status: 'pending_coach_action' 
      });
      
      notificationTypeToCoach = NotificationTypes.CLIENT_REQUESTED_RESCHEDULE; 
      notificationMetadataCoach = { 
        bookingId: booking._id.toString(), 
        sessionTitle: booking.title, 
        clientName: `${booking.user.firstName} ${booking.user.lastName}`, 
        originalStartTime: originalStart, 
        originalEndTime: originalEnd,
        proposedSlots: proposedSlots, 
        clientMessage: clientMessage,
        isCounterProposal: true 
      };
      
      notificationTypeToClient = NotificationTypes.RESCHEDULE_REQUEST_SENT_TO_COACH; 
      notificationMetadataClient = { 
        bookingId: booking._id.toString(), 
        sessionTitle: booking.title, 
        coachName: `${booking.coach.firstName} ${booking.coach.lastName}`, 
        originalStartTime: originalStart,
        originalEndTime: originalEnd,
        isCounterProposal: true
      };
      
    } else { 
      logger.warn('[respondToCoachRescheduleProposalByClient] Invalid action received', { bookingId, action, timestamp: new Date().toISOString() });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(400).json({ message: 'Invalid action.' });
    }

    booking.markModified('rescheduleRequests');
    booking.markModified('rescheduleHistory');
    if (action === 'approve') booking.markModified('metadata'); // If occupyAvailabilityForNewBookingTime modifies metadata

    await booking.save({ session: mongoSession });
    logger.info('[respondToCoachRescheduleProposalByClient] Booking saved.', { bookingId, newStatus: booking.status });

    const sessionDoc = await Session.findOne({ bookingId: booking._id }).session(mongoSession);
    if (sessionDoc) {
      sessionDoc.start = booking.start;
      sessionDoc.end = booking.end;
      sessionDoc.state = booking.status; // Reflect booking's confirmed status
      sessionDoc.lastUpdated = new Date();
      await sessionDoc.save({ session: mongoSession });
      logger.info('[respondToCoachRescheduleProposalByClient] Session document updated.', { sessionId: sessionDoc._id, newState: sessionDoc.state });
    } else {
      logger.warn('[respondToCoachRescheduleProposalByClient] No session document found to update for booking.', { bookingId });
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();
    logger.info('[respondToCoachRescheduleProposalByClient] Transaction committed.', { bookingId });

    const populatedBookingForNotif = await Booking.findById(booking._id)
        .populate('coach user sessionType')
        .lean();

    if (notificationTypeToClient && populatedBookingForNotif && populatedBookingForNotif.user) {
       await UnifiedNotificationService.sendNotification({
            type: notificationTypeToClient, recipient: clientUserId, recipientType: 'client', 
            category: NotificationCategories.BOOKING, priority: NotificationPriorities.HIGH,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            metadata: notificationMetadataClient
        }, populatedBookingForNotif);
    }
    if (notificationTypeToCoach && populatedBookingForNotif && populatedBookingForNotif.coach) {
         await UnifiedNotificationService.sendNotification({
            type: notificationTypeToCoach, recipient: populatedBookingForNotif.coach._id.toString(), recipientType: 'coach', 
            category: NotificationCategories.BOOKING, priority: NotificationPriorities.MEDIUM,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            metadata: notificationMetadataCoach
        }, populatedBookingForNotif);
    }
    
    const socketService = getSocketService();
    if (socketService && populatedBookingForNotif) {
        const recipients = [clientUserId];
        if (populatedBookingForNotif.coach?._id) recipients.push(populatedBookingForNotif.coach._id.toString());
        
        socketService.emitBookingUpdate(populatedBookingForNotif._id.toString(), populatedBookingForNotif, recipients);
        
        if (action === 'approve' && restoredOldAvailabilityResult && restoredOldAvailabilityResult._id) {
           socketService.emitAvailabilityUpdate(restoredOldAvailabilityResult._id.toString(), 'created', [populatedBookingForNotif.coach._id.toString()], { restoredFromRescheduleApprovalClient: populatedBookingForNotif._id.toString() });
        }
    }

    res.status(200).json({
      success: true,
      message: `Coach's reschedule proposal ${action}d successfully.`,
      booking: populatedBookingForNotif
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[respondToCoachRescheduleProposalByClient] Critical error', { bookingId, clientUserId, action, errorName: error.name, errorMessage: error.message, errorStack: error.stack });
    res.status(500).json({ message: 'Failed to process response to coach reschedule proposal.', error: error.message });
  }
};

exports.proposeRescheduleByCoach = async (req, res) => {
  const { bookingId } = req.params;
  const coachUserId = req.user._id.toString();
  const { proposedSlots, reason: coachReason } = req.body;

  if (!Array.isArray(proposedSlots) || proposedSlots.length === 0) {
    return res.status(400).json({ message: 'At least one new time slot must be proposed.' });
  }
  for (const slot of proposedSlots) {
    if (!slot.start || !slot.end || new Date(slot.start) >= new Date(slot.end) || new Date(slot.start) <= new Date()) {
        return res.status(400).json({ message: 'Invalid proposed time slot(s). Ensure start is before end and in the future.' });
    }
  }

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[proposeRescheduleByCoach] Coach initiating reschedule proposal', { bookingId, coachUserId, proposedSlotsCount: proposedSlots.length });

    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email')
      .populate('user', 'firstName lastName email')
      .populate('sessionType')
      .session(mongoSession);

    if (!booking) {
      logger.warn('[proposeRescheduleByCoach] Booking not found', { bookingId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found.' });
    }

    if (booking.coach?._id.toString() !== coachUserId) {
      logger.warn('[proposeRescheduleByCoach] Unauthorized attempt', { bookingId, coachUserId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(403).json({ message: 'You are not authorized to propose a reschedule for this booking.' });
    }
    
    const sessionTypeIdString = typeof booking.sessionType === 'string' ? booking.sessionType : (booking.sessionType?._id?.toString() || '');
    if (sessionTypeIdString === WEBINAR_TYPE_ID_STRING || sessionTypeIdString === GROUP_TYPE_ID_STRING || sessionTypeIdString === WORKSHOP_TYPE_ID_STRING) {
         logger.warn('[proposeRescheduleByCoach] Reschedule proposal not applicable for webinar/group booking type by coach to individual client', { bookingId, sessionTypeIdString });
         await mongoSession.abortTransaction(); mongoSession.endSession();
         return res.status(400).json({ message: 'This function is for 1-on-1 session reschedule proposals. For webinars, use the "Reschedule Webinar" function.'});
    }

    const oldStatus = booking.status;
    booking.status = 'pending_reschedule_coach_request';
    booking.rescheduleRequests = booking.rescheduleRequests || [];
    booking.rescheduleRequests.push({
        proposedBy: coachUserId,
        proposedAt: new Date(),
        proposedSlots: proposedSlots.map(s => ({ start: new Date(s.start), end: new Date(s.end) })),
        requestMessage: coachReason,
        status: 'pending_client_action'
    });
    
    booking.markModified('rescheduleRequests');
    await booking.save({ session: mongoSession });

    const sessionDoc = await Session.findOne({ bookingId: booking._id }).session(mongoSession);
    if (sessionDoc) {
        sessionDoc.state = 'pending_reschedule'; 
        sessionDoc.lastUpdated = new Date();
        await sessionDoc.save({ session: mongoSession });
        logger.info('[proposeRescheduleByCoach] Session document updated for coach proposal', { sessionId: sessionDoc._id, newState: sessionDoc.state });
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    if (booking.user?._id) {
      await UnifiedNotificationService.sendNotification({
          type: NotificationTypes.COACH_PROPOSED_NEW_RESCHEDULE_TIME, 
          recipient: booking.user._id.toString(), recipientType: 'client', 
          category: NotificationCategories.BOOKING, priority: NotificationPriorities.HIGH,
          channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
          metadata: { 
              bookingId: booking._id.toString(), 
              sessionTitle: booking.title, 
              coachName: `${booking.coach.firstName} ${booking.coach.lastName}`, 
              originalStartTime: booking.start, 
              proposedSlots: booking.rescheduleRequests.slice(-1)[0].proposedSlots, 
              coachReason: coachReason 
          }
      }, booking);
    }
    
    const socketService = getSocketService();
    if (socketService) {
        socketService.emitBookingUpdate(booking._id.toString(), booking.toObject(), [coachUserId, booking.user?._id.toString()].filter(Boolean));
    }

    res.status(200).json({
      success: true,
      message: 'Reschedule proposal sent to client.',
      booking: booking.toObject()
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[proposeRescheduleByCoach] Critical error', { bookingId, coachUserId, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Failed to propose reschedule.', error: error.message });
  }
};

exports.rescheduleWebinarByCoach = async (req, res) => {
  const { bookingId } = req.params;
  const coachUserId = req.user._id.toString();
  const { newPrimaryStartTime, newPrimaryEndTime, newWebinarSlots, reason: coachReason } = req.body;

  if (!newPrimaryStartTime || !newPrimaryEndTime) {
      return res.status(400).json({ message: 'New primary start and end times for the webinar are required.' });
  }
  if (newWebinarSlots && (!Array.isArray(newWebinarSlots) || newWebinarSlots.some(slot => !slot.startTime || !slot.endTime))) {
    return res.status(400).json({ message: 'Invalid format for new webinar slots.' });
  }

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[rescheduleWebinarByCoach] Coach rescheduling entire webinar', { bookingId, coachUserId, newPrimaryStartTime });

    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email') 
      .populate('sessionType')
      .populate('attendees.user', 'firstName lastName email') 
      .session(mongoSession);

    if (!booking) {
      logger.warn('[rescheduleWebinarByCoach] Webinar booking not found', { bookingId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Webinar booking not found.' });
    }

    if (booking.coach?._id.toString() !== coachUserId) {
      logger.warn('[rescheduleWebinarByCoach] Unauthorized attempt', { bookingId, coachUserId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(403).json({ message: 'You are not authorized to reschedule this webinar.' });
    }
    
    const sessionTypeIdString = typeof booking.sessionType === 'string' ? booking.sessionType : (booking.sessionType?._id?.toString() || '');
    if (sessionTypeIdString !== WEBINAR_TYPE_ID_STRING && sessionTypeIdString !== GROUP_TYPE_ID_STRING && sessionTypeIdString !== WORKSHOP_TYPE_ID_STRING) { 
         logger.warn('[rescheduleWebinarByCoach] Not a webinar/group booking type', { bookingId, sessionTypeIdString });
         await mongoSession.abortTransaction(); mongoSession.endSession();
         return res.status(400).json({ message: 'This function is for rescheduling entire webinar or group events.'});
    }

    const originalStart = booking.start;
    const oldStatus = booking.status;

    booking.start = new Date(newPrimaryStartTime);
    booking.end = new Date(newPrimaryEndTime);
    if (newWebinarSlots && newWebinarSlots.length > 0) {
        booking.webinarSlots = newWebinarSlots.map(s => ({ 
            date: new Date(s.startTime).toISOString().split('T')[0], 
            startTime: new Date(s.startTime), 
            endTime: new Date(s.endTime) 
        }));
        booking.markModified('webinarSlots');
    }
    
    booking.status = 'rescheduled_pending_attendee_actions';
    if(coachReason) booking.cancellationReason = `Rescheduled: ${coachReason}`; 

    booking.rescheduleHistory = booking.rescheduleHistory || [];
    booking.rescheduleHistory.push({
        originalStart, originalEnd: booking.end, 
        newStart: booking.start, newEnd: booking.end,
        requestedBy: coachUserId,
        requestedAt: new Date(),
        status: 'executed_coach_initiative',
        actionTimestamp: new Date(),
        actorMessage: coachReason
    });

    const confirmedAttendees = [];
    booking.attendees.forEach(attendee => {
      if (attendee.status === 'confirmed') { 
        attendee.rescheduleStatus = 'pending_reschedule_confirmation';
        confirmedAttendees.push(attendee);
      }
    });
    booking.markModified('attendees');
    
    await booking.save({ session: mongoSession });

    const sessionDoc = await Session.findOne({ bookingId: booking._id }).session(mongoSession);
    if (sessionDoc) {
        sessionDoc.start = booking.start;
        sessionDoc.end = booking.end;
        sessionDoc.state = 'rescheduled'; 
        sessionDoc.lastUpdated = new Date();
        await sessionDoc.save({ session: mongoSession });
        logger.info('[rescheduleWebinarByCoach] Session document updated for webinar reschedule', { sessionId: sessionDoc._id });
    }

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    
    for (const attendee of confirmedAttendees) {
        if (attendee.user?._id) {
            await UnifiedNotificationService.sendNotification({
                type: NotificationTypes.WEBINAR_RESCHEDULED_ACTION_REQUIRED,
                recipient: attendee.user._id.toString(),
                recipientType: 'client',
                category: NotificationCategories.BOOKING,
                priority: NotificationPriorities.HIGH,
                channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
                metadata: {
                    bookingId: booking._id.toString(),
                    webinarTitle: booking.title,
                    coachName: `${booking.coach.firstName} ${booking.coach.lastName}`,
                    originalStartTime: originalStart, 
                    newStartTime: booking.start, 
                    newEndTime: booking.end,
                    reasonForChange: coachReason,
                }
            }, booking);
        }
    }
     await UnifiedNotificationService.sendNotification({ 
        type: NotificationTypes.YOUR_WEBINAR_RESCHEDULE_CONFIRMED, 
        recipient: coachUserId, recipientType: 'coach', 
        category: NotificationCategories.BOOKING, priority: NotificationPriorities.MEDIUM,
        channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
        metadata: { bookingId: booking._id.toString(), webinarTitle: booking.title, newStartTime: booking.start, newEndTime: booking.end, attendeesNotified: confirmedAttendees.length }
    }, booking);


    const socketService = getSocketService();
    if (socketService) {
        const allAffectedUserIds = confirmedAttendees.map(att => att.user._id.toString());
        allAffectedUserIds.push(coachUserId);
        socketService.emitBookingUpdate(booking._id.toString(), booking.toObject(), allAffectedUserIds);
    }

    res.status(200).json({
      success: true,
      message: 'Webinar rescheduled successfully. Attendees are being notified.',
      booking: booking.toObject()
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[rescheduleWebinarByCoach] Critical error', { bookingId, coachUserId, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Failed to reschedule webinar.', error: error.message });
  }
};

exports.respondToWebinarRescheduleByAttendee = async (req, res) => {
  const { bookingId } = req.params; 
  const attendeeUserId = req.user._id.toString();
  const { response } = req.body; 

  if (!['confirm', 'decline'].includes(response)) {
      return res.status(400).json({ message: "Invalid response. Must be 'confirm' or 'decline'."});
  }

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[respondToWebinarRescheduleByAttendee] Attendee responding to webinar reschedule', { bookingId, attendeeUserId, response });

    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email')
      .populate('sessionType')
      .populate('payment.paymentRecord') 
      .populate('attendees.user', 'firstName lastName email')
      .session(mongoSession);

    if (!booking) {
      logger.warn('[respondToWebinarRescheduleByAttendee] Webinar booking not found', { bookingId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Webinar booking not found.' });
    }

    const attendeeIndex = booking.attendees.findIndex(att => att.user && att.user._id.toString() === attendeeUserId && att.rescheduleStatus === 'pending_reschedule_confirmation');
    if (attendeeIndex === -1) {
      logger.warn('[respondToWebinarRescheduleByAttendee] Attendee not found or not pending reconfirmation', { bookingId, attendeeUserId });
      await mongoSession.abortTransaction(); mongoSession.endSession();
      return res.status(404).json({ message: 'Your registration for this rescheduled webinar is not awaiting confirmation or you are not registered.' });
    }
    
    const attendee = booking.attendees[attendeeIndex];
    let notificationTypeToAttendee, notificationMetadataAttendee = {};
    let refundResult = null;

    if (response === 'confirm') {
      attendee.rescheduleStatus = 'confirmed_rescheduled';
      attendee.status = 'confirmed'; 
      logger.info('[respondToWebinarRescheduleByAttendee] Attendee confirmed attendance for rescheduled webinar', { bookingId, attendeeUserId });
      
      notificationTypeToAttendee = NotificationTypes.WEBINAR_ATTENDANCE_RECONFIRMED;
      notificationMetadataAttendee = { bookingId: booking._id.toString(), webinarTitle: booking.title, newStartTime: booking.start };

    } else { 
      attendee.rescheduleStatus = 'cancelled_due_to_reschedule';
      attendee.status = 'cancelled'; 
      logger.info('[respondToWebinarRescheduleByAttendee] Attendee declined attendance for rescheduled webinar, processing refund.', { bookingId, attendeeUserId });
      
      let amountToRefundDecimal = 0;
      let currencyCode = 'CHF';
      
      // Placeholder logic for refund amount based on main booking price.
      // This needs to be adapted if individual attendee payments are tracked differently.
      if (booking.price && booking.price.final && booking.price.final.amount.amount > 0) {
          amountToRefundDecimal = booking.price.final.amount.amount;
          currencyCode = booking.price.currency;
      }

      if (amountToRefundDecimal > 0) {
           logger.info('[respondToWebinarRescheduleByAttendee] Triggering 100% refund for declined attendee (simulation - needs per-attendee payment details for actual refund)', { 
                bookingId, attendeeUserId, amount: amountToRefundDecimal, currency: currencyCode 
            });
            // In a real scenario:
            // const attendeePayment = await Payment.findOne({ booking: booking._id, payer: attendeeUserId, status: 'completed' }); // Or however attendee payments are linked
            // if (attendeePayment && attendeePayment.stripe.paymentIntentId) {
            //   refundResult = await paymentService.processRefund({ 
            //     paymentIntentId: attendeePayment.stripe.paymentIntentId, 
            //     amount: amountToRefundDecimal, 
            //     currency: currencyCode, 
            //     reason: 'Declined rescheduled webinar by attendee' 
            //   });
            //   // Update attendeePayment status based on refundResult
            // } else {
            //    logger.error("Failed to find specific payment record for declining attendee", { attendeeUserId, bookingId });
            // }
           refundResult = { status: 'simulated_refund_due', amount: amountToRefundDecimal * 100, currency: currencyCode.toLowerCase() };
      }
      
      notificationTypeToAttendee = NotificationTypes.WEBINAR_CANCELLATION_DUE_TO_RESCHEDULE_CONFIRMED;
      notificationMetadataAttendee = { bookingId: booking._id.toString(), webinarTitle: booking.title, refundAmount: amountToRefundDecimal, refundCurrency: currencyCode };
    }
    
    booking.markModified('attendees');
    await booking.save({ session: mongoSession });

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    if (notificationTypeToAttendee) {
        await UnifiedNotificationService.sendNotification({
            type: notificationTypeToAttendee,
            recipient: attendeeUserId, recipientType: 'client',
            category: NotificationCategories.BOOKING, priority: NotificationPriorities.HIGH,
            channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
            metadata: notificationMetadataAttendee
        }, booking);
    }
    
    const socketService = getSocketService();
    if (socketService) {
        
        socketService.emitBookingUpdate(booking._id.toString(), booking.toObject(), [attendeeUserId, booking.coach._id.toString()]);
    }

    res.status(200).json({
      success: true,
      message: `Your response ('${response}') has been recorded.`,
      attendeeStatus: attendee.rescheduleStatus,
      refundStatus: refundResult?.status 
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[respondToWebinarRescheduleByAttendee] Critical error', { bookingId, attendeeUserId, response, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Failed to process your response to the webinar reschedule.', error: error.message });
  }
};

exports.cancelWebinarRegistrationByClient = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id.toString(); // ID of the client cancelling their own registration
  const { cancellationReason } = req.body;

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[cancelWebinarRegistrationByClient] Initiating client webinar registration cancellation', { bookingId, userId, cancellationReason });

    const booking = await Booking.findById(bookingId)
      .populate('coach', '_id firstName lastName email')
      .populate('sessionType') // Ensure sessionType is populated to check its type
      // No longer populating booking.payment.paymentRecord by default here, will fetch attendee-specific one
      .populate('attendees.user', '_id firstName lastName email') 
      .session(mongoSession);

    if (!booking) {
      logger.warn('[cancelWebinarRegistrationByClient] Booking not found', { bookingId });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(404).json({ message: 'Webinar booking not found.' });
    }

    const sessionTypeIdFromBooking = booking.sessionType?._id?.toString() || booking.sessionType?.toString();
    if (sessionTypeIdFromBooking !== WEBINAR_TYPE_ID_STRING) { 
      logger.warn('[cancelWebinarRegistrationByClient] Booking is not a webinar type.', { bookingId, sessionTypeId: sessionTypeIdFromBooking });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(400).json({ message: 'This action is only applicable to webinar registrations.' });
    }

    const attendeeIndex = booking.attendees.findIndex(att => att.user && att.user._id.toString() === userId);

    if (attendeeIndex === -1) {
      logger.warn('[cancelWebinarRegistrationByClient] Unauthorized: User is not an attendee of this webinar.', { bookingId, userId });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(403).json({ message: 'You are not registered for this webinar or not authorized to cancel this registration.' });
    }

    if (booking.attendees[attendeeIndex].status === 'cancelled') {
      logger.warn('[cancelWebinarRegistrationByClient] Attendee has already cancelled their registration.', { bookingId, userId });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(400).json({ message: 'You have already cancelled your registration for this webinar.' });
    }
    
    if (['cancelled_by_coach', 'cancelled_by_admin'].includes(booking.status)) {
        logger.warn('[cancelWebinarRegistrationByClient] Webinar already cancelled by coach or admin', { bookingId, currentStatus: booking.status });
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(400).json({ message: 'This webinar has already been cancelled.' });
    }

    if (!booking.coach || !booking.coach._id) {
        logger.error('[cancelWebinarRegistrationByClient] Coach (User document) not populated or missing ID on booking.', { bookingId });
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(500).json({ message: 'Coach details not found for booking. Cannot process cancellation.' });
    }

    const coachProfile = await Coach.findOne({ user: booking.coach._id })
        .select('settings.cancellationPolicy settings.timeZone')
        .session(mongoSession);

 if (!booking.cancellationPolicy) {
        logger.error('[cancelWebinarRegistrationByClient] Cancellation policy missing on booking document.', { bookingId });
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        return res.status(500).json({ message: 'Booking is missing cancellation policy data. Cannot process cancellation.' });
    }

    const applicablePolicy = booking.cancellationPolicy.webinar;

    // Fetch the specific payment record for this attendee for this webinar
    const attendeePaymentRecord = await Payment.findOne({
      booking: booking._id,
      payer: userId, // The cancelling attendee
      status: { $in: ['completed', 'authorized'] } // Consider only payments that went through or are authorized
    }).session(mongoSession);

    let amountActuallyPaidByAttendee = 0;
    let currencyActuallyPaid = booking.price?.currency || 'CHF';

    if (attendeePaymentRecord && attendeePaymentRecord.amount && typeof attendeePaymentRecord.amount.total === 'number') {
        amountActuallyPaidByAttendee = attendeePaymentRecord.amount.total;
        currencyActuallyPaid = attendeePaymentRecord.amount.currency || currencyActuallyPaid;
        logger.info('[cancelWebinarRegistrationByClient] Found specific payment record for attendee.', { 
            bookingId, userId, paymentId: attendeePaymentRecord._id, amount: amountActuallyPaidByAttendee, currency: currencyActuallyPaid 
        });
    } else {
         logger.info('[cancelWebinarRegistrationByClient] No specific payment record with amount found for attendee. Assuming 0 paid for policy calc.', { bookingId, userId });
    }
    
    const paymentContextForPolicyEngine = {
        amount: amountActuallyPaidByAttendee,
        currency: currencyActuallyPaid
    };
    
    const refundCalcDetails = PolicyEngine.calculateRefundDetails(booking, applicablePolicy, DateTime.utc().toISO(), paymentContextForPolicyEngine);

    if (!refundCalcDetails.canCancel) {
      logger.warn('[cancelWebinarRegistrationByClient] Cancellation not allowed by policy for this attendee', { bookingId, userId, reasonCode: refundCalcDetails.reasonCode, calculatedRefund: refundCalcDetails.grossRefundToClient });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      const userMessage = refundCalcDetails.reasonCode === 'MINIMUM_NOTICE_VIOLATED'
        ? `Your registration cannot be cancelled as it is less than ${applicablePolicy.minimumNoticeHoursClientCancellation} hours before the start time.`
        : 'Your registration cannot be cancelled at this time according to the policy.';
      return res.status(400).json({ message: userMessage, reasonCode: refundCalcDetails.reasonCode });
    }

    booking.attendees[attendeeIndex].status = 'cancelled';
    booking.markModified('attendees');
    booking.updatedAt = new Date();
    await booking.save({ session: mongoSession });

    logger.info('[cancelWebinarRegistrationByClient] Attendee status marked as cancelled', { bookingId, userId, attendeeObjectId: booking.attendees[attendeeIndex]._id });

    let refundResult = { status: 'no_action_needed' }; // Default if no refund processing occurs

    if (attendeePaymentRecord && refundCalcDetails.grossRefundToClient > 0) {
        if (attendeePaymentRecord.stripe?.paymentIntentId) {
            logger.info('[cancelWebinarRegistrationByClient] Attendee payment was made. Processing refund.', {
                paymentIntentId: attendeePaymentRecord.stripe.paymentIntentId,
                amountToRefund: refundCalcDetails.grossRefundToClient,
                currency: refundCalcDetails.currency
            });
            try {
                const stripeRefundResponse = await paymentService.processRefund({
                    paymentIntentId: attendeePaymentRecord.stripe.paymentIntentId,
                    amount: refundCalcDetails.grossRefundToClient, 
                    currency: refundCalcDetails.currency,
                    reason: `Webinar registration cancellation by attendee ${userId} for booking ${bookingId}`
                });
                refundResult = { 
                    id: stripeRefundResponse?.id,
                    status: stripeRefundResponse?.status, 
                    amount: stripeRefundResponse?.amount, 
                    currency: stripeRefundResponse?.currency
                };
                logger.info('[cancelWebinarRegistrationByClient] Refund processed via paymentService for attendee', { refundId: refundResult.id, status: refundResult.status });

                if (refundResult.status === 'succeeded') {
                    // Check if the refund amount matches the total payment amount
                    attendeePaymentRecord.status = (attendeePaymentRecord.amount.total * 100 === refundResult.amount) ? 'refunded' : 'partially_refunded';
                    attendeePaymentRecord.refunds = attendeePaymentRecord.refunds || [];
                    attendeePaymentRecord.refunds.push({
                        amount: refundResult.amount / 100, 
                        currency: refundResult.currency.toUpperCase(),
                        reason: `Webinar registration cancellation by attendee ${userId}`,
                        status: 'succeeded',
                        stripeRefundId: refundResult.id,
                        processedAt: new Date(),
                        processedBy: userId
                    });
                    await attendeePaymentRecord.save({ session: mongoSession });
                    logger.info('[cancelWebinarRegistrationByClient] Attendee payment record updated after successful refund', { paymentId: attendeePaymentRecord._id, newStatus: attendeePaymentRecord.status });
                } else if (refundResult.status) { 
                     logger.warn('[cancelWebinarRegistrationByClient] Attendee refund processed by Stripe but not succeeded', { refundId: refundResult.id, status: refundResult.status });
                     attendeePaymentRecord.status = 'refund_failed';
                     attendeePaymentRecord.error = { message: `Refund attempt status: ${refundResult.status}`, code: `STRIPE_REFUND_${refundResult.status.toUpperCase()}` };
                     await attendeePaymentRecord.save({ session: mongoSession });
                } else { 
                    logger.error('[cancelWebinarRegistrationByClient] Unexpected response from paymentService.processRefund', { response: stripeRefundResponse });
                    attendeePaymentRecord.status = 'refund_failed';
                    attendeePaymentRecord.error = { message: 'Unexpected error during refund processing.', code: 'REFUND_SERVICE_ERROR' };
                    await attendeePaymentRecord.save({ session: mongoSession });
                    refundResult.status = 'error'; 
                }
            } catch (refundError) {
                logger.error('[cancelWebinarRegistrationByClient] Error processing attendee refund via paymentService', { bookingId, userId, error: refundError.message, stack: refundError.stack });
                refundResult = { status: 'error', message: refundError.message };
                if (attendeePaymentRecord) { 
                    attendeePaymentRecord.status = 'refund_failed';
                    attendeePaymentRecord.error = { message: `Attendee refund failed: ${refundError.message}`, code: 'ATTENDEE_REFUND_ERROR' };
                    await attendeePaymentRecord.save({session: mongoSession});
                }
            }
        } else {
            logger.warn('[cancelWebinarRegistrationByClient] Attendee payment record found, but missing Stripe PaymentIntent ID. Cannot process refund.', { paymentId: attendeePaymentRecord._id });
            refundResult = { status: 'missing_payment_intent_id' };
        }
    } else if (refundCalcDetails.grossRefundToClient > 0 && !attendeePaymentRecord) {
        logger.warn('[cancelWebinarRegistrationByClient] Refund calculated, but no specific payment record found for attendee. Cannot process refund.', { bookingId, userId, calculatedRefund: refundCalcDetails.grossRefundToClient });
        refundResult = { status: 'no_payment_record_attendee_for_refund' }; // This matches the log
    } else if (refundCalcDetails.grossRefundToClient === 0) {
        logger.info('[cancelWebinarRegistrationByClient] No refund due for attendee by policy or amount paid was zero.', { bookingId, userId });
        // If amountActuallyPaidByAttendee was > 0, it means they paid but policy says no refund.
        // If amountActuallyPaidByAttendee was 0, it means they registered for free.
        refundResult = { status: amountActuallyPaidByAttendee > 0 ? 'no_refund_due_by_policy_attendee' : 'no_payment_to_refund_attendee' };
    }
    
    await mongoSession.commitTransaction();
    mongoSession.endSession();

    const coachUserForNotification = booking.coach;
    const clientUserPerformingAction = await User.findById(userId).select('firstName lastName email').lean();

    try {
        if (clientUserPerformingAction && clientUserPerformingAction._id) {
            await UnifiedNotificationService.sendNotification({
                type: NotificationTypes.WEBINAR_REGISTRATION_CANCELLED_BY_YOU,
                recipient: clientUserPerformingAction._id.toString(),
                recipientType: 'client',
                category: NotificationCategories.BOOKING,
                priority: NotificationPriorities.HIGH,
                channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
                metadata: {
                    bookingId: booking._id.toString(),
                    webinarTitle: booking.title, 
                    coachName: coachUserForNotification ? `${coachUserForNotification.firstName} ${coachUserForNotification.lastName}` : 'N/A',
                    webinarDate: booking.start, 
                    refundAmount: refundCalcDetails.grossRefundToClient,
                    refundCurrency: refundCalcDetails.currency,
                    isRefundDue: refundCalcDetails.grossRefundToClient > 0,
                    cancellationReason: cancellationReason || "-"
                }
            }, booking);
        }

        if (coachUserForNotification && coachUserForNotification._id && clientUserPerformingAction) {
            await UnifiedNotificationService.sendNotification({
                type: NotificationTypes.WEBINAR_ATTENDEE_CANCELLED,
                recipient: coachUserForNotification._id.toString(),
                recipientType: 'coach',
                category: NotificationCategories.BOOKING,
                priority: NotificationPriorities.MEDIUM,
                channels: [NotificationChannels.IN_APP, NotificationChannels.EMAIL],
                metadata: {
                    bookingId: booking._id.toString(),
                    attendeeName: `${clientUserPerformingAction.firstName} ${clientUserPerformingAction.lastName}`,
                    attendeeId: clientUserPerformingAction._id.toString(),
                    webinarTitle: booking.title,
                    webinarDate: booking.start,
                    cancellationReason: cancellationReason || "-",
                    remainingSpots: booking.maxAttendees ? booking.maxAttendees - (booking.attendees.filter(a => a.status === 'confirmed').length) : undefined
                }
            }, booking);
        }
    } catch (notificationError) {
        logger.error('[cancelWebinarRegistrationByClient] Error sending notifications post-transaction for attendee cancellation', { bookingId, userId, error: notificationError.message });
    }

    const socketService = getSocketService();
    if (socketService) {
        const bookingObjectForSocket = booking.toObject ? booking.toObject({ virtuals: true }) : { ...booking };
        const interestedParties = [userId]; 
        if (booking.coach?._id) interestedParties.push(booking.coach._id.toString());
        
        socketService.emitBookingUpdate(booking._id.toString(), bookingObjectForSocket, interestedParties);
        logger.info('[cancelWebinarRegistrationByClient] Emitted BookingUpdate socket event for attendee registration cancellation.', { bookingId: booking._id.toString() });
    }

    res.status(200).json({
      success: true,
      message: 'Your webinar registration has been successfully cancelled.',
      bookingId: booking._id.toString(),
      attendeeStatus: 'cancelled',
      refundDetails: {
        amount: refundCalcDetails.grossRefundToClient, // Eligible amount
        currency: refundCalcDetails.currency,
        status: refundResult.status // Actual outcome of refund attempt
      }
    });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[cancelWebinarRegistrationByClient] Critical error during webinar registration cancellation', { bookingId, userId, error: error.message, stack: error.stack });
    if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to cancel webinar registration.', error: error.message });
    }
  }
};

exports.cancelBookingByUserDuringPayment = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.user._id.toString();

  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();

  try {
    logger.info('[cancelBookingByUserDuringPayment] Initiating cancellation for pending booking.', { bookingId, userId });

    const booking = await Booking.findById(bookingId).populate('coach user sessionType').session(mongoSession);

    if (!booking) {
      logger.warn('[cancelBookingByUserDuringPayment] Booking not found.', { bookingId });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(404).json({ message: 'Booking not found.' });
    }

    if (booking.user._id.toString() !== userId) {
      logger.warn('[cancelBookingByUserDuringPayment] Unauthorized attempt.', { bookingId, userId, bookingUserId: booking.user._id });
      await mongoSession.abortTransaction();
      mongoSession.endSession();
      return res.status(403).json({ message: 'You are not authorized to cancel this booking.' });
    }

    if (booking.status.startsWith('cancelled')) {
      logger.info('[cancelBookingByUserDuringPayment] Booking already cancelled. Idempotent success.', { bookingId, status: booking.status });
      await mongoSession.commitTransaction();
      mongoSession.endSession();
      return res.status(200).json({ success: true, message: 'Booking was already cancelled.' });
    }

    const paymentIntentId = booking.payment?.stripe?.paymentIntentId;

    if (paymentIntentId) {
        try {
            const paymentIntent = await paymentService.retrievePaymentIntent(paymentIntentId);
            if (paymentIntent.status === 'succeeded') {
                logger.warn(`[cancelBookingByUserDuringPayment] RACE CONDITION DETECTED: Payment for booking ${bookingId} succeeded before cancellation was processed. Initiating full refund.`, { paymentIntentId });
                await paymentService.processRefund({
                    paymentIntentId,
                    reason: 'User cancelled during payment process, but payment succeeded first.'
                });
            } else {
                await paymentService.cancelPaymentIntent(paymentIntentId);
                logger.info('[cancelBookingByUserDuringPayment] Successfully cancelled Stripe Payment Intent.', { paymentIntentId });
            }
        } catch (stripeError) {
            logger.warn('[cancelBookingByUserDuringPayment] Could not cancel/refund Stripe PI (may already be cancelled/processed/refunded). This is acceptable.', { 
                paymentIntentId,
                error: stripeError.message 
            });
        }
    } else {
        logger.warn('[cancelBookingByUserDuringPayment] No PaymentIntentId found on booking to cancel/refund.', { bookingId });
    }

    booking.status = 'cancelled_by_client';
    booking.cancellationReason = 'Cancelled by user during payment process.';
    await booking.save({ session: mongoSession });

    const newAvailabilitySlot = await coalesceAndRestoreAvailability(booking, mongoSession);
    logger.info('[cancelBookingByUserDuringPayment] Availability restored for cancelled booking.', { bookingId, newAvailabilityId: newAvailabilitySlot._id });

    await mongoSession.commitTransaction();
    mongoSession.endSession();

    const socketService = getSocketService();
    if (socketService) {
        socketService.emitAvailabilityUpdate(newAvailabilitySlot._id.toString(), 'created', [booking.coach._id.toString()], { restoredFromCancellation: booking._id.toString() });
    }

    res.status(200).json({ success: true, message: 'Booking cancelled successfully.' });

  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }
    mongoSession.endSession();
    logger.error('[cancelBookingByUserDuringPayment] Error during cancellation process.', { bookingId, userId, error: error.message, stack: error.stack });
    res.status(500).json({ message: 'Failed to cancel booking.', error: error.message });
  }
};

exports.getBookingPublicSummary = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId)
      .select('title description start end webinarSlots price earlyBirdPrice earlyBirdDeadline minAttendees maxAttendees attendees sessionType coach status isPublic showInWebinarBrowser')
      .populate('sessionType', 'name')
      .populate('coach', 'firstName lastName')
      .lean();

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const sessionTypeIdString = booking.sessionType?._id?.toString() || '';
    const isWebinarType = sessionTypeIdString === '66ec54f94a8965b22af33fd9';
    
    if (isWebinarType && (booking.isPublic || booking.showInWebinarBrowser)) {
      res.json({
        _id: booking._id,
        title: booking.title,
        description: booking.description,
        start: booking.start,
        end: booking.end,
        webinarSlots: booking.webinarSlots,
        price: booking.price,
        earlyBirdPrice: booking.earlyBirdPrice,
        earlyBirdDeadline: booking.earlyBirdDeadline,
        minAttendees: booking.minAttendees,
        maxAttendees: booking.maxAttendees,
        attendeesCount: Array.isArray(booking.attendees) ? booking.attendees.length : 0,
        sessionType: booking.sessionType,
        coach: booking.coach,
        status: booking.status,
      });
    } else {
      return res.status(403).json({ message: 'This booking is not public.' });
    }
  } catch (error) {
    logger.error('[getBookingPublicSummary] Error fetching booking summary', { error: error.message, bookingId: req.params.bookingId });
    res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = exports;