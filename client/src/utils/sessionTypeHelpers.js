import moment from 'moment';

export const calculateSessionPrice = (sessionType, bookingData, isConnected) => {
  console.log('[calculateSessionPrice] Calculating price:', {
    sessionType,
    bookingData,
    isConnected
  });

  let basePrice = sessionType.price;
  const discounts = [];

  // Early bird discount check
  if (sessionType.earlyBird?.enabled && moment(bookingData.start).isAfter(moment().add(sessionType.earlyBird.deadline, 'hours'))) {
    discounts.push({
      type: 'early_bird',
      amount: sessionType.earlyBird.price,
      description: 'Early bird discount'
    });
  }

  // Connection discount
  if (isConnected && sessionType.connectionDiscount?.enabled) {
    const discountAmount = (basePrice * sessionType.connectionDiscount.percentage) / 100;
    discounts.push({
      type: 'connection',
      amount: discountAmount,
      description: 'Connected client discount'
    });
  }

  // Calculate final price
  const totalDiscount = discounts.reduce((sum, discount) => sum + discount.amount, 0);
  const finalPrice = basePrice - totalDiscount;

  console.log('[calculateSessionPrice] Price calculation result:', {
    basePrice,
    discounts,
    finalPrice
  });

  return {
    base: basePrice,
    currency: sessionType.currency || 'USD',
    discounts,
    final: finalPrice
  };
};

export const validateSessionRequirements = (sessionType, bookingData) => {
  console.log('[validateSessionRequirements] Validating session requirements:', {
    sessionType,
    bookingData
  });

  const errors = [];

  switch (sessionType.format) {
    case 'group':
      if (sessionType.capacity.max && bookingData.attendees?.length >= sessionType.capacity.max) {
        errors.push('Session is at maximum capacity');
      }
      break;

    case 'workshop':
      if (sessionType.registration?.deposit?.required && !bookingData.deposit) {
        errors.push('Deposit payment is required for workshop registration');
      }
      break;
  }

  console.log('[validateSessionRequirements] Validation result:', { errors });
  return errors;
};

export const calculateBufferTimes = (sessionType) => {
  console.log('[calculateBufferTimes] Calculating buffer times for session type:', sessionType);

  return {
    before: sessionType.bookingRules?.bufferTimeBefore || 0,
    after: sessionType.bookingRules?.bufferTimeAfter || 0
  };
};

export const checkSessionLimits = (coachId, sessionType, bookingData, existingSessions) => {
  console.log('[checkSessionLimits] Checking session limits:', {
    coachId,
    sessionType,
    bookingData,
    existingSessions
  });

  if (!Array.isArray(existingSessions)) {
    console.warn('[checkSessionLimits] existingSessions is not an array:', existingSessions);
    return {
      day: { current: 0, max: 0, exceeded: false },
      week: { current: 0, max: 0, exceeded: false }
    };
  }

  const bookingDate = moment(bookingData.start);
  const dayStart = moment(bookingData.start).startOf('day');
  const dayEnd = moment(bookingData.start).endOf('day');
  const weekStart = moment(bookingData.start).startOf('week');
  const weekEnd = moment(bookingData.start).endOf('week');

  // Filter sessions for the same day and week
  const sessionsToday = existingSessions.filter(session => 
    moment(session.start).isBetween(dayStart, dayEnd)
  );

  const sessionsThisWeek = existingSessions.filter(session => 
    moment(session.start).isBetween(weekStart, weekEnd)
  );

  const limits = {
    day: {
      current: sessionsToday.length,
      max: sessionType.bookingRules?.maxSessionsPerDay || 0,
      exceeded: sessionsToday.length >= (sessionType.bookingRules?.maxSessionsPerDay || 0)
    },
    week: {
      current: sessionsThisWeek.length,
      max: sessionType.bookingRules?.maxSessionsPerWeek || 0,
      exceeded: sessionsThisWeek.length >= (sessionType.bookingRules?.maxSessionsPerWeek || 0)
    }
  };

  console.log('[checkSessionLimits] Limits check result:', limits);
  return limits;
};