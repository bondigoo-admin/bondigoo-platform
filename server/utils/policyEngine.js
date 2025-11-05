const { DateTime } = require('luxon'); // Assuming Luxon is available

function getApplicableCancellationPolicy(booking, coachSettings) {
  if (!coachSettings || !coachSettings.cancellationPolicy) {
    return null;
  }
  // Simple check, assumes booking has a field like 'bookingType' or can infer from sessionType
  // For now, let's assume a way to distinguish: if booking.webinarSlots exists and has items, it's a webinar.
  // This needs to be robust based on your actual Booking model structure.
  // A more direct way would be to have a booking.type ('oneOnOne' or 'webinar')
  const isWebinar = booking.webinarSlots && booking.webinarSlots.length > 0; // Example heuristic
  
  if (isWebinar) {
    return coachSettings.cancellationPolicy.webinar;
  }
  return coachSettings.cancellationPolicy.oneOnOne;
}

function calculateRefundDetails(booking, policy, currentTimeISO, paymentContext = null) {
  const basePriceDetails = booking.price && booking.price.final && booking.price.final.amount 
                           ? booking.price.final.amount 
                           : { amount: 0, currency: 'CHF' }; // Default to 0 if booking.price is missing

  const originalPricePaid = paymentContext && typeof paymentContext.amount === 'number' 
                            ? paymentContext.amount 
                            : basePriceDetails.amount;
  const currency = paymentContext && paymentContext.currency 
                   ? paymentContext.currency 
                   : basePriceDetails.currency;

  if (!policy || !Array.isArray(policy.tiers) || !booking.start) {
    // If booking.price is totally absent, originalPricePaid would be 0 from above.
    // The function should still return a structure indicating why it cannot proceed or that no refund is due.
    return {
      canCancel: false,
      reasonCode: 'POLICY_OR_BOOKING_DATA_MISSING',
      refundPercentage: 0,
      grossRefundToClient: 0,
      amountKeptByCoachAndPlatform: originalPricePaid, // Will be 0 if price was missing
      platformFeeEarnedByPlatform: 0, 
      netCoachEarningFromBooking: 0, 
      applicableTierDescriptionKey: null,
      currency: currency, // Will be 'CHF' by default if price was missing
      minimumNoticeHours: policy?.minimumNoticeHoursClientCancellation,
      matchedTierHoursBefore: null
    };
  }

  const bookingStartTime = DateTime.fromJSDate(new Date(booking.start), { zone: booking.timezone || 'UTC' });
  const now = DateTime.fromISO(currentTimeISO, { zone: 'utc' });
  const timeRemainingHours = bookingStartTime.diff(now, 'hours').toObject().hours || 0;

  // If originalPricePaid is 0 (e.g., free booking or no payment context for a free attendee),
  // calculations will result in 0 refund, which is correct.
  // No need for a special check for originalPricePaid === 0 here, policy application will handle it.

  if (timeRemainingHours < policy.minimumNoticeHoursClientCancellation) {
    return {
      canCancel: false,
      reasonCode: 'MINIMUM_NOTICE_VIOLATED',
      refundPercentage: 0,
      grossRefundToClient: 0,
      amountKeptByCoachAndPlatform: originalPricePaid,
      platformFeeEarnedByPlatform: 0, 
      netCoachEarningFromBooking: 0, 
      applicableTierDescriptionKey: null,
      currency: currency,
      minimumNoticeHours: policy.minimumNoticeHoursClientCancellation,
      matchedTierHoursBefore: null
    };
  }

  let refundPercentage = 0;
  let applicableTierDescriptionKey = "policy.tier.no_refund_default"; 
  let matchedTierHoursBefore = null;

  const sortedTiers = [...policy.tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);

  if (sortedTiers.length > 0) {
    for (const tier of sortedTiers) {
      if (timeRemainingHours >= tier.hoursBefore) {
        refundPercentage = tier.refundPercentage;
        matchedTierHoursBefore = tier.hoursBefore;
        applicableTierDescriptionKey = tier.descriptionKey || "policy.tier.dynamic_description";
        break; 
      }
    }
    if (applicableTierDescriptionKey === "policy.tier.no_refund_default" && refundPercentage === 0) {
        const zeroPercentTier = sortedTiers.find(t => t.refundPercentage === 0);
        if (zeroPercentTier) {
            applicableTierDescriptionKey = zeroPercentTier.descriptionKey || "policy.tier.dynamic_description";
            matchedTierHoursBefore = zeroPercentTier.hoursBefore;
        } else {
             matchedTierHoursBefore = policy.minimumNoticeHoursClientCancellation; 
        }
    }
  } else { 
      if (policy.minimumNoticeHoursClientCancellation !== undefined) { 
          refundPercentage = 100; 
          applicableTierDescriptionKey = "policy.tier.simple_full_refund"; 
          matchedTierHoursBefore = policy.minimumNoticeHoursClientCancellation;
      } else {
          return {
            canCancel: false,
            reasonCode: 'POLICY_DATA_INCOMPLETE',
            refundPercentage: 0,
            grossRefundToClient: 0,
            amountKeptByCoachAndPlatform: originalPricePaid,
            platformFeeEarnedByPlatform: 0,
            netCoachEarningFromBooking: 0,
            applicableTierDescriptionKey: null,
            currency: currency,
            minimumNoticeHours: policy.minimumNoticeHoursClientCancellation,
            matchedTierHoursBefore: null
          };
      }
  }

  const grossRefundToClient = originalPricePaid * (refundPercentage / 100);
  const amountKeptByCoachAndPlatform = originalPricePaid - grossRefundToClient;
  
  return {
    canCancel: true, 
    reasonCode: 'ELIGIBLE_FOR_CANCELLATION',
    refundPercentage,
    grossRefundToClient: parseFloat(grossRefundToClient.toFixed(2)),
    amountKeptByCoachAndPlatform: parseFloat(amountKeptByCoachAndPlatform.toFixed(2)),
    platformFeeEarnedByPlatform: 0, 
    netCoachEarningFromBooking: 0, 
    applicableTierDescriptionKey,
    currency: currency,
    minimumNoticeHours: policy.minimumNoticeHoursClientCancellation,
    matchedTierHoursBefore: matchedTierHoursBefore
  };
}

function checkRescheduleEligibility(booking, coachSettings, currentTimeISO) {
  if (!coachSettings || !coachSettings.cancellationPolicy || !coachSettings.cancellationPolicy.oneOnOne || !coachSettings.cancellationPolicy.oneOnOne.rescheduling) {
    return { canReschedule: false, needsApproval: true, isAutomatic: false, reasonCode: 'POLICY_DATA_MISSING' };
  }
  // Assuming this is for 1-on-1 only as per concept
  const oneOnOnePolicy = coachSettings.cancellationPolicy.oneOnOne;
  const reschedulingPolicy = oneOnOnePolicy.rescheduling;

  if (!booking.start) {
      return { canReschedule: false, needsApproval: true, isAutomatic: false, reasonCode: 'BOOKING_DATA_MISSING' };
  }

  const bookingStartTime = DateTime.fromJSDate(new Date(booking.start), { zone: booking.timezone || 'UTC' });
  const now = DateTime.fromISO(currentTimeISO, { zone: 'utc' });
  const timeRemainingHours = bookingStartTime.diff(now, 'hours').toObject().hours || 0;

  if (timeRemainingHours < oneOnOnePolicy.minimumNoticeHoursClientCancellation) {
    return { canReschedule: false, needsApproval: true, isAutomatic: false, reasonCode: 'TOO_LATE_PAST_CANCELLATION_NOTICE' };
  }

  const isWithinRescheduleWindow = timeRemainingHours >= reschedulingPolicy.allowClientInitiatedRescheduleHoursBefore;
  let isAutomaticApproval = false;
  let needsApproval = true;

  switch (reschedulingPolicy.clientRescheduleApprovalMode) {
    case 'automatic_if_early':
      isAutomaticApproval = isWithinRescheduleWindow;
      needsApproval = !isAutomaticApproval;
      break;
    case 'coach_approval_if_late':
      isAutomaticApproval = isWithinRescheduleWindow; // Automatic if "early" enough
      // If not auto (i.e., "late" but before min cancellation notice), it needs approval
      needsApproval = !isAutomaticApproval; 
      break;
    case 'always_coach_approval':
      isAutomaticApproval = false;
      needsApproval = true;
      break;
    default: // Should not happen with enum
      isAutomaticApproval = false;
      needsApproval = true;
  }
  
  // If it's automatic, it doesn't strictly "need approval", but the flag means "does it bypass coach approval step"
  // So if isAutomaticApproval is true, needsApproval should be false.

  return {
    canReschedule: true, // If not past min cancellation notice, they can at least request
    needsApproval: needsApproval,
    isAutomatic: isAutomaticApproval,
    reasonCode: isAutomaticApproval ? 'AUTOMATIC_RESCHEDULE_ALLOWED' : (needsApproval ? 'COACH_APPROVAL_REQUIRED' : 'UNKNOWN_STATE')
  };
}

module.exports = {
  getApplicableCancellationPolicy,
  calculateRefundDetails,
  checkRescheduleEligibility,
};