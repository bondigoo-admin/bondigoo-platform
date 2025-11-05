import api from './api';
import { logger } from '../utils/logger';

export const getSessionTypes = async (userId) => {
  try {
    console.log('[getSessionTypes] Fetching session types for user ID:', userId);
    const response = await api.get(`/api/coaches/${userId}/session-types`);
    console.log('[getSessionTypes] Raw response data:', response.data);
    
    const formattedSessionTypes = response.data.map(type => ({
      _id: type._id || type.id,
      name: type.name,
      duration: type.duration,
      price: type.price
    }));
    
    console.log('[getSessionTypes] Formatted session types:', formattedSessionTypes);
    return formattedSessionTypes;
  } catch (error) {
    console.error('[getSessionTypes] Error fetching session types:', error.response?.data || error.message);
    throw error;
  }
};

export const createSession = async (sessionData) => {
  try {
    console.log('[createSession] Creating new session:', sessionData);
    const response = await api.post('/api/bookings/sessions', sessionData);
    console.log('[createSession] Session created:', response.data);
    return response.data;
  } catch (error) {
    console.error('[createSession] Error creating session:', error);
    throw error;
  }
};

export const updateSession = async (sessionId, sessionData) => {
  try {
    console.log(`[updateSession] Updating session ${sessionId}:`, sessionData);
    const response = await api.put(`/api/bookings/sessions/${sessionId}`, sessionData);
    console.log('[updateSession] Session updated:', response.data);
    return response.data;
  } catch (error) {
    console.error('[updateSession] Error updating session:', error);
    throw error;
  }
};

export const deleteSession = async (sessionId) => {
  try {
    console.log(`[deleteSession] Deleting session ${sessionId}`);
    const response = await api.delete(`/api/bookings/${sessionId}`);
    console.log('[deleteSession] Session deleted:', response.data);
    return response.data;
  } catch (error) {
    console.error('[deleteSession] Error deleting session:', error);
    if (error.response) {
      console.error('[deleteSession] Error response:', error.response.data);
    }
    throw error;
  }
};

export const getCoachSessions = async (userId, start, end) => {
  try {
    console.log(`[getCoachSessions] Fetching bookings for user ID: ${userId}, start: ${start}, end: ${end}`);
    const response = await api.get(`/api/bookings/${userId}/bookings`, {
      params: { start, end }
    });
    console.log('[getCoachSessions] Bookings received:', response.data);
    
    const formatSessions = (sessions) => sessions.map(session => ({
      ...session,
      title: session.title || (session.sessionType && session.sessionType.name) || 'Untitled Session',
      start: new Date(session.start),
      end: new Date(session.end),
      color: getSessionColor(session)
    }));

    return {
      availability: Array.isArray(response.data.availability) ? formatSessions(response.data.availability) : [],
      regularBookings: Array.isArray(response.data.regularBookings) ? formatSessions(response.data.regularBookings) : [],
      sessionTypes: Array.isArray(response.data.sessionTypes) ? response.data.sessionTypes : [],
      settings: response.data.settings || {}
    };
  } catch (error) {
    console.error('[getCoachSessions] Error fetching coach bookings:', error);
    return { availability: [], regularBookings: [], sessionTypes: [], settings: {} };
  }
};

const getSessionColor = (session) => {
  if (session.isAvailability) return '#4CAF50'; // Green for availability
  switch (session.status) {
    case 'confirmed': return '#2196F3'; // Blue for confirmed bookings
    case 'pending': return '#FFC107'; // Amber for pending bookings
    default: return '#9E9E9E'; // Grey for other cases
  }
};

export const createBooking = async (bookingDetails) => {
  try {
    logger.info('[bookingAPI.createBooking] Received booking payload from modal. Checking booking `type`.', { type: bookingDetails.type, status: bookingDetails.status });
    logger.info('[bookingAPI.createBooking] Received bookingDetails with discountCode:', bookingDetails.discountCode);
    const isValidObjectId = (id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);

    logger.info('[bookingAPI.createBooking] Received bookingDetails (YOUR_WORKING_BASE_MINIMAL_WEBINAR_ADD):', { 
      keys: Object.keys(bookingDetails), 
      sessionTypeIdFromPayload: bookingDetails.sessionTypeId,
      sessionTypeObject: bookingDetails.sessionType,
      typeField: bookingDetails.type,
      title: bookingDetails.title,
      isAvailability: bookingDetails.isAvailability,
      priceInput: JSON.stringify(bookingDetails.price)
    });

    const isAvailabilityBooking = bookingDetails.isAvailability === true;
    
    let resolvedSessionTypeId = bookingDetails.sessionTypeId; 
    if (!resolvedSessionTypeId || !isValidObjectId(resolvedSessionTypeId)) { 
        if (bookingDetails.sessionType && isValidObjectId(bookingDetails.sessionType._id)) {
            resolvedSessionTypeId = bookingDetails.sessionType._id;
        } else if (bookingDetails.sessionType && isValidObjectId(bookingDetails.sessionType.id)) {
            resolvedSessionTypeId = bookingDetails.sessionType.id;
        } else if (isValidObjectId(bookingDetails.sessionType)) {
            resolvedSessionTypeId = bookingDetails.sessionType;
        }
    }
    if (!resolvedSessionTypeId && isValidObjectId(bookingDetails.type) && bookingDetails.type !== 'FIRM' && bookingDetails.type !== 'REQUEST') {
        resolvedSessionTypeId = bookingDetails.type;
    }
    
    if (!resolvedSessionTypeId || !isValidObjectId(resolvedSessionTypeId)) {
        logger.error('[bookingAPI.createBooking] Critical: Invalid or missing resolvedSessionTypeId for booking.', {
            inputSessionTypeId: bookingDetails.sessionTypeId, inputSessionTypeObj: bookingDetails.sessionType, inputTypeField: bookingDetails.type, derivedSessionTypeId: resolvedSessionTypeId
        });
        throw new Error('Invalid or missing sessionTypeId for booking.');
    }
    
    const WEBINAR_TYPE_ID_CONST = '66ec54f94a8965b22af33fd9';
    const GROUP_TYPE_ID_CONST = '66ec54f44a8965b22af33fd5';
    const WORKSHOP_TYPE_ID_CONST = '66ec54fe4a8965b22af33fdd';

    const isWebinarBooking = resolvedSessionTypeId === WEBINAR_TYPE_ID_CONST;
    const isGroupBooking = resolvedSessionTypeId === GROUP_TYPE_ID_CONST;
    const isWorkshopBooking = resolvedSessionTypeId === WORKSHOP_TYPE_ID_CONST;

    const baseRequiredFields = ['start', 'end', 'timezone'];
    let tempRequiredFields = isAvailabilityBooking
      ? [...baseRequiredFields, 'coach', 'sessionType']
      : [...baseRequiredFields, 'coach', 'user', 'sessionType'];

    const missingFields = tempRequiredFields.filter(field => {
      let value;
      if (field === 'coach') value = bookingDetails.coachId || bookingDetails.coach;
      else if (field === 'user') value = bookingDetails.userId || bookingDetails.user;
      else if (field === 'sessionType') value = resolvedSessionTypeId;
      else value = bookingDetails[field];
      
      if (isWebinarBooking && field === 'user' && !value) {
          return false; 
      }
      return !value;
    });

    if (missingFields.length > 0) {
      logger.error('[bookingAPI.createBooking] Validation Error - Missing required fields:', { missingFields });
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const normalizeOvertime = (overtime) => {
      if (!overtime) return null;
      return {
        allowOvertime: Boolean(overtime.allowOvertime),
        freeOvertimeDuration: Number.isFinite(overtime.freeOvertimeDuration) && overtime.freeOvertimeDuration >= 0 ? Number(overtime.freeOvertimeDuration) : 0,
        paidOvertimeDuration: Number.isFinite(overtime.paidOvertimeDuration) && overtime.paidOvertimeDuration >= 0 ? Number(overtime.paidOvertimeDuration) : 0,
        overtimeRate: Number.isFinite(overtime.overtimeRate) && overtime.overtimeRate >= 0 ? Number(overtime.overtimeRate) : 0
      };
    };
    const overtimeSettings = normalizeOvertime(bookingDetails.overtime);

    let finalStatus;
    let finalBookingType;

    const isCoachCreatingSession = !bookingDetails.user && 
                                  (resolvedSessionTypeId === WEBINAR_TYPE_ID_CONST ||
                                   resolvedSessionTypeId === GROUP_TYPE_ID_CONST ||
                                   resolvedSessionTypeId === WORKSHOP_TYPE_ID_CONST);

    if (isAvailabilityBooking) {
      finalStatus = 'confirmed';
      finalBookingType = 'request';
      logger.info('[bookingAPI.createBooking] Availability slot: status=confirmed, bookingType=request');
    } else if (isCoachCreatingSession) {
      finalBookingType = 'firm';
      const minAttendeesParsed = bookingDetails.minAttendees ? parseInt(bookingDetails.minAttendees, 10) : 0;

      if (minAttendeesParsed > 1) {
        finalStatus = 'pending_minimum_attendees';
        logger.info('[bookingAPI.createBooking] Coach-created session: status=pending_minimum_attendees, bookingType=firm', { minAttendees: minAttendeesParsed, sessionType: resolvedSessionTypeId });
      } else if (bookingDetails.status && ['scheduled', 'confirmed', 'pending_minimum_attendees'].includes(bookingDetails.status)) {
        finalStatus = bookingDetails.status;
        logger.info('[bookingAPI.createBooking] Coach-created session: status from bookingDetails, bookingType=firm', { status: finalStatus, sessionType: resolvedSessionTypeId });
      } else {
        finalStatus = 'scheduled';
        logger.warn('[bookingAPI.createBooking] Coach-created session: status defaulted to scheduled, bookingType=firm', { originalStatus: bookingDetails.status, sessionType: resolvedSessionTypeId });
      }
    } else {
      finalStatus = (bookingDetails.type === 'FIRM' ? 'confirmed' : 'requested');
      finalBookingType = (bookingDetails.type === 'FIRM' ? 'firm' : 'request');
      logger.info('[bookingAPI.createBooking] User-initiated booking: status set', { status: finalStatus, bookingType: finalBookingType, bookingDetailsType: bookingDetails.type, sessionType: resolvedSessionTypeId });
    }

    const payload = {
      start: new Date(bookingDetails.start).toISOString(),
      end: new Date(bookingDetails.end).toISOString(),
      timezone: bookingDetails.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      coach: bookingDetails.coachId || bookingDetails.coach,
      user: bookingDetails.userId || bookingDetails.user || null,
      sessionType: resolvedSessionTypeId,
      title: bookingDetails.title || (bookingDetails.sessionTypeName || 'Coaching Session'),
      description: bookingDetails.description || '',
      location: bookingDetails.location || '',
      isOnline: bookingDetails.isOnline !== undefined ? bookingDetails.isOnline : false,
      userIds: bookingDetails.userIds || [],
      availableForInstantBooking: bookingDetails.availableForInstantBooking !== undefined ? bookingDetails.availableForInstantBooking : false,
      firmBookingThreshold: bookingDetails.firmBookingThreshold || 24,
      isAvailability: isAvailabilityBooking,
      status: finalStatus,
      bookingType: finalBookingType,
      overtime: overtimeSettings,
      earlyBirdDeadline: bookingDetails.earlyBirdDeadline ? new Date(bookingDetails.earlyBirdDeadline).toISOString() : null,
      earlyBirdPrice: bookingDetails.earlyBirdPrice && bookingDetails.earlyBirdPrice !== '' ? parseFloat(bookingDetails.earlyBirdPrice) : null,
      isRecurring: bookingDetails.isRecurring || false,
      recurringPattern: bookingDetails.isRecurring ? (bookingDetails.recurringPattern || 'none') : 'none',
      recurringEndDate: bookingDetails.isRecurring && bookingDetails.recurringEndDate ? new Date(bookingDetails.recurringEndDate).toISOString() : null,
      language: bookingDetails.language || null,
      tags: bookingDetails.tags || [],
      cancellationPolicy: bookingDetails.cancellationPolicy || null,
      isPartOfPackage: bookingDetails.isPartOfPackage || false,
      packageId: bookingDetails.packageId || null,
      certificationOffered: bookingDetails.certificationOffered || false,
      certificationDetails: bookingDetails.certificationDetails || null,
      sessionGoal: bookingDetails.sessionGoal || null,
      clientNotes: bookingDetails.clientNotes || null,
      preparationRequired: bookingDetails.preparationRequired || null,
      followUpTasks: bookingDetails.followUpTasks || null,
      minAttendees: bookingDetails.minAttendees ? parseInt(bookingDetails.minAttendees, 10) : null,
      maxAttendees: bookingDetails.maxAttendees ? parseInt(bookingDetails.maxAttendees, 10) : null,
      sessionTopic: bookingDetails.sessionTopic || null,
      prerequisites: bookingDetails.prerequisites || null,
      learningObjectives: bookingDetails.learningObjectives || null,
      materialsProvided: bookingDetails.materialsProvided || null,
      whatToBring: bookingDetails.whatToBring || null,
      skillLevel: bookingDetails.skillLevel || null,
      discountCode: bookingDetails.discountCode || undefined,
      priceOverride: bookingDetails.priceOverride || undefined
    };

    if (bookingDetails._id) {
        payload.sessionImages = bookingDetails.sessionImages || [];
        payload.courseMaterials = bookingDetails.courseMaterials || [];
    } else {
        payload.sessionImages = (bookingDetails.sessionImages || []).filter(img => img.url);
        payload.courseMaterials = (bookingDetails.courseMaterials || []).filter(mat => mat.url);
    }

    if (isWebinarBooking) {
        payload.webinarSlots = bookingDetails.webinarSlots || [];
        payload.webinarPlatform = bookingDetails.webinarPlatform || bookingDetails.platform || 'coachconnect';
        payload.webinarLink = bookingDetails.webinarLink || null;
        delete payload.slots; 
    } else if (isGroupBooking || isWorkshopBooking) {
        payload.slots = bookingDetails.slots || [];
        delete payload.webinarSlots; 
    } else { 
        delete payload.slots;
        delete payload.webinarSlots;
    }
    
    Object.keys(bookingDetails).forEach(key => {
        if (payload[key] === undefined && bookingDetails[key] !== undefined) {
            if (key !== 'sessionImages' && key !== 'courseMaterials' || bookingDetails._id) {
                 payload[key] = bookingDetails[key];
            }
        }
    });

    if (!bookingDetails._id) {
        payload.sessionImages = (bookingDetails.sessionImages || []).filter(img => img.url);
        payload.courseMaterials = (bookingDetails.courseMaterials || []).filter(mat => mat.url);
    }

    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    
    delete payload.price;
    delete payload.discountApplied;

    if (bookingDetails.translations) {
        payload.translations = bookingDetails.translations;
    }

    logger.info('[bookingAPI.createBooking] Sending final payload to backend:', { payload });
    
    const response = await api.post('/api/bookings', payload);
    
    logger.info('[bookingAPI.createBooking] Booking created successfully by backend:', {
      bookingId: response.data.booking._id,
      type: response.data.booking.isAvailability ? 'availability' : 'session',
      status: response.data.booking.status,
      hasPaymentIntent: !!response.data.paymentIntentClientSecret
    });
    
    return {
      booking: response.data.booking,
      paymentIntentClientSecret: response.data.paymentIntentClientSecret
    };
  } catch (error) {
    logger.error('[bookingAPI.createBooking] Error creating booking in frontend API:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      dataSentPreview: { 
          coach: bookingDetails.coachId || bookingDetails.coach,
          user: bookingDetails.userId || bookingDetails.user,
          sessionTypeAttempted: bookingDetails.sessionTypeId || bookingDetails.sessionType?._id || bookingDetails.sessionType?.id || bookingDetails.type,
          title: bookingDetails.title,
          isAvailability: bookingDetails.isAvailability
      }
    });
    throw error;
  }
};

export const getBookingSummary = async (bookingId) => {
  if (!bookingId || !/^[0-9a-fA-F]{24}$/.test(bookingId)) {
    return null;
  }
  try {
    const response = await api.get(`/api/bookings/${bookingId}/summary`);
    return response.data;
  } catch (error) {
    if (error.response && (error.response.status === 403 || error.response.status === 404)) {
      return null;
    }
    logger.error('[bookingAPI] Failed to fetch booking summary:', {
      bookingId,
      error: { message: error.message, status: error.response?.status },
    });
    throw error;
  }
};

export const updateBooking = async (bookingId, bookingData) => {
  try {
    console.log(`[updateBooking] Updating booking ${bookingId}:`, bookingData);
    const response = await api.put(`/api/bookings/${bookingId}`, bookingData);
    console.log('[updateBooking] Booking updated:', response.data);
    return response.data;
  } catch (error) {
    console.error('[updateBooking] Error updating booking:', error);
    throw error;
  }
};

export const getBookingRequests = async (coachId) => {
  try {
    console.log(`[getBookingRequests] Fetching booking requests for coach ${coachId}`);
    const response = await api.get(`/api/bookings/requests/${coachId}`);
    console.log('[getBookingRequests] Booking requests received:', response.data);
    return response.data;
  } catch (error) {
    console.error('[getBookingRequests] Error fetching booking requests:', error);
    throw error;
  }
};

export const respondToBookingRequest = async (requestId, responseData) => {
  try {
    console.log(`[respondToBookingRequest] Responding to request ${requestId}:`, responseData);
    const response = await api.post(`/api/bookings/respond/${requestId}`, { response: responseData });
    console.log('[respondToBookingRequest] Response sent:', response.data);
    return response.data;
  } catch (error) {
    console.error('[respondToBookingRequest] Error responding to booking request:', error);
    throw error;
  }
};

export const getUpcomingBookings = async () => {
  try {
    console.log('[getUpcomingBookings] Fetching upcoming bookings');
    const response = await api.get('/api/bookings/upcoming');
    console.log('[getUpcomingBookings] Upcoming bookings received:', response.data);
    return response.data;
  } catch (error) {
    console.error('[getUpcomingBookings] Error fetching upcoming bookings:', error);
    throw error;
  }
};

export const getBooking = async (bookingId) => {
  if (!bookingId || !/^[0-9a-fA-F]{24}$/.test(bookingId)) {
    // This function is being spammed, so we will not log an error here to keep the console clean.
    // We will just prevent the invalid request from being made.
    return null;
  }

  try {
    const response = await api.get(`/api/bookings/${bookingId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      }
    });
    return response.data;
  } catch (error) {
    // If the error is 403 (Forbidden), it's an expected outcome of the notification spam.
    // We will catch it, log it once as a debug message, and return null.
    // This stops react-query from retrying and flooding the console.
    if (error.response && error.response.status === 403) {
      logger.debug(`[bookingAPI.getBooking] Suppressed 403 error for bookingId: ${bookingId}. This is expected for notification pre-fetching.`);
      return null;
    }
    // For any other errors (like 500, 404), we still want to see them.
    logger.error('[bookingAPI] Failed to fetch booking with non-403 error:', {
      bookingId,
      error: {
        message: error.message,
        status: error.response?.status,
      },
    });
    throw error;
  }
};

export const cancelBooking = async (bookingId) => {
  try {
    const response = await api.delete(`/api/bookings/${bookingId}`);
    return response.data;
  } catch (error) {
    console.error('Error canceling booking:', error);
    throw error;
  }
};

export const getPastBookings = async (userId) => {
  try {
    const response = await api.get(`/api/bookings/past/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching past bookings:', error);
    throw error;
  }
};

export const getCoachAvailability = async (coachId, date) => {
  try {
    const response = await api.get(`/api/bookings/availability/${coachId}?date=${date}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching coach availability:', error);
    throw error;
  }
};

export const confirmBooking = async (bookingId) => {
  try {
    const response = await api.post(`/api/bookings/${bookingId}/confirm`);
    return response.data;
  } catch (error) {
    console.error('Error confirming booking:', error);
    throw error;
  }
};

export const rescheduleBooking = async (bookingId, newDateTime) => {
  try {
    const response = await api.put(`/api/bookings/${bookingId}/reschedule`, { newDateTime });
    return response.data;
  } catch (error) {
    console.error('Error rescheduling booking:', error);
    throw error;
  }
};

export const getBookingDetails = async (bookingId) => {
  try {
    logger.info('[bookingAPI] Fetching booking details:', { bookingId });

     if (!bookingId || !/^[0-9a-fA-F]{24}$/.test(bookingId)) {
      logger.error('!!! CRITICAL: getBookingDetails CALLED WITH INVALID ID !!!', { bookingId });
      const err = new Error('Invalid Booking ID provided to getBookingDetails');
      console.trace(err); // This will print the component stack trace to the browser console
      throw err;
    }

    
    if (!bookingId) {
      logger.error('[bookingAPI] getBookingDetails called without bookingId');
      throw new Error('Booking ID is required');
    }

    const response = await api.get(`/api/bookings/${bookingId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      }
    });
    
    logger.info('[bookingAPI] Booking details fetched successfully:', {
      bookingId,
      responseStatus: response.status,
      hasData: !!response.data,
    });
    
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to fetch booking details:', {
      bookingId,
      error: {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      },
      stack: error.stack,
    });
    throw error;
  }
};

export const getUserSessions = async (userId, dateRange = {}) => {
  try {
    console.log('[bookingAPI.getUserSessions] Fetching sessions:', { 
      userId,
      dateRange
    });

    const params = new URLSearchParams();
    if (dateRange.start) params.append('start', dateRange.start);
    if (dateRange.end) params.append('end', dateRange.end);

    // Add /api prefix to match Express route configuration
    const response = await api.get(
      `/api/bookings/user/${userId}/sessions${params.toString() ? `?${params.toString()}` : ''}`
    );

    console.log('[bookingAPI.getUserSessions] Sessions received:', {
      count: response.data.sessions?.length || 0,
      metadata: response.data.metadata
    });

    return response.data;
  } catch (error) {
    console.error('[bookingAPI.getUserSessions] Error:', error);
    console.error('[bookingAPI.getUserSessions] Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      url: error.config?.url
    });
    throw error;
  }
};

export const submitBookingFeedback = async (bookingId, feedbackData) => {
  try {
    const response = await api.post(`/api/bookings/${bookingId}/feedback`, feedbackData);
    return response.data;
  } catch (error) {
    console.error('Error submitting booking feedback:', error);
    throw error;
  }
};

export const createAvailability = async (availabilityData) => {
  try {
    console.log('[createAvailability] Creating availability:', availabilityData);
    
    if (!availabilityData.sessionTypeId) {
      console.error('[createAvailability] sessionTypeId is missing');
      throw new Error('sessionTypeId is required');
    }

    const response = await api.post('/api/bookings/availability', availabilityData);
    console.log('[createAvailability] Availability created:', response.data);
    return response.data;
  } catch (error) {
    console.error('[createAvailability] Error creating availability:', error);
    throw error;
  }
};

export const updateAvailability = async (availabilityId, availabilityData) => {
  try {
    console.log(`[updateAvailability] Updating availability ${availabilityId}:`, availabilityData);
    
    if (!availabilityData.sessionTypeId) {
      console.error('[updateAvailability] sessionTypeId is missing');
      throw new Error('sessionTypeId is required');
    }

    const response = await api.put(`/api/bookings/availability/${availabilityId}`, availabilityData);
    console.log('[updateAvailability] Availability updated:', response.data);
    return response.data;
  } catch (error) {
    console.error('[updateAvailability] Error updating availability:', error);
    throw error;
  }
};

export const deleteAvailability = async (availabilityId) => {
  try {
    console.log(`[deleteAvailability] Deleting availability ${availabilityId}`);
    const response = await api.delete(`/api/bookings/availability/${availabilityId}`);
    console.log('[deleteAvailability] Availability deleted:', response.data);
    return response.data;
  } catch (error) {
    console.error('[deleteAvailability] Error deleting availability:', error);
    throw error;
  }
};

export const acceptBooking = async (bookingId, message) => {
  if (!bookingId) {
    console.error('[bookingAPI] acceptBooking called without bookingId');
    throw new Error('Booking ID is required');
  }
  logger.info('[bookingAPI] Accepting booking:', { bookingId, hasMessage: !!message });
  try {
    const response = await api.post(`/api/bookings/${bookingId}/accept`, { message });
    logger.info('[bookingAPI] Booking accepted:', response.data);
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error accepting booking:', error);
    throw error;
  }
};

export const declineBooking = async (bookingId, message) => {
  if (!bookingId) {
    console.error('[bookingAPI] declineBooking called without bookingId');
    throw new Error('Booking ID is required');
  }
  logger.info('[bookingAPI] Declining booking:', { bookingId, hasMessage: !!message });
  try {
    const response = await api.post(`/api/bookings/${bookingId}/decline`, { message });
    logger.info('[bookingAPI] Booking declined:', response.data);
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error declining booking:', error);
    throw error;
  }
};

export const acceptBookingByClient = async ({ bookingId }) => {
  logger.info('[bookingAPI] Client accepting booking', { bookingId });
  try {
    const response = await api.post(`/api/bookings/${bookingId}/accept-by-client`);
    logger.info('[bookingAPI] Booking accepted by client successfully', { responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error accepting booking by client', { bookingId, error: error.response?.data || error.message });
    throw error;
  }
};

export const declineBookingByClient = async ({ bookingId, message }) => {
  logger.info('[bookingAPI] Client declining booking', { bookingId, hasMessage: !!message });
  try {
    const response = await api.post(`/api/bookings/${bookingId}/decline-by-client`, { message });
    logger.info('[bookingAPI] Booking declined by client successfully', { responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error declining booking by client', { bookingId, error: error.response?.data || error.message });
    throw error;
  }
};

export const suggestAlternativeTime = async (bookingId, times, message) => {
  logger.info('[bookingAPI] Suggesting alternative time:', { bookingId, times, hasMessage: !!message });
  const response = await api.post(`/bookings/${bookingId}/suggest`, { times, message });
  logger.info('[bookingAPI] Alternative time suggested:', response.data);
  return response.data;
};

/**
 * Calculate booking price with all applicable rates and discounts
 */
export const calculateBookingPrice = async ({
  coachId,
  sessionTypeId,
  start,
  end,
  timezone,
  participantCount = 1
}) => {
  try {
    logger.info('[bookingAPI.calculateBookingPrice] Calculating price:', {
      coachId,
      sessionTypeId,
      start,
      end,
      participantCount
    });

    const response = await api.post('/api/bookings/calculate-price', {
      coachId,
      sessionTypeId,
      start,
      end,
      timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      participantCount
    });

    logger.info('[bookingAPI.calculateBookingPrice] Price calculated:', {
      basePrice: response.data.base,
      finalPrice: response.data.final,
      discounts: response.data.discounts?.length || 0
    });

    return response.data;
  } catch (error) {
    logger.error('[bookingAPI.calculateBookingPrice] Error calculating price:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
};

/**
 * Recalculate price for an existing booking
 */
export const recalculateBookingPrice = async (bookingId) => {
  try {
    logger.info('[bookingAPI.recalculateBookingPrice] Recalculating price:', { bookingId });

    const response = await api.post(`/api/bookings/${bookingId}/recalculate-price`);

    logger.info('[bookingAPI.recalculateBookingPrice] Price recalculated:', {
      bookingId,
      oldPrice: response.data.booking.price?.final,
      newPrice: response.data.priceDetails.final
    });

    return response.data;
  } catch (error) {
    logger.error('[bookingAPI.recalculateBookingPrice] Error recalculating price:', {
      error: error.message,
      bookingId
    });
    throw error;
  }
};

/**
 * Calculate refund amount for a booking
 */
export const calculateRefund = async (bookingId, refundType = 'full') => {
  try {
    logger.info('[bookingAPI.calculateRefund] Calculating refund:', {
      bookingId,
      refundType
    });

    const response = await api.post(`/api/bookings/${bookingId}/calculate-refund`, {
      refundType
    });

    logger.info('[bookingAPI.calculateRefund] Refund calculated:', {
      bookingId,
      amount: response.data.amount,
      total: response.data.total
    });

    return response.data;
  } catch (error) {
    logger.error('[bookingAPI.calculateRefund] Error calculating refund:', {
      error: error.message,
      bookingId,
      refundType
    });
    throw error;
  }
};

export const updateBookingOvertimeSettings = async (bookingId, overtime) => {
  logger.info('[bookingAPI] Updating overtime settings', { bookingId, overtime });
  try {
    const response = await api.put(`/api/bookings/${bookingId}/overtime`, { overtime }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    logger.info('[bookingAPI] Overtime settings updated successfully', { bookingId });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to update overtime settings', {
      bookingId,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    throw error;
  }
};

export const registerForWebinar = async (webinarBookingId, discountCode) => {
  try {
      const payload = {};
      if (discountCode) {
        payload.discountCode = discountCode;
      }
      const response = await api.post(`/api/bookings/${webinarBookingId}/register`, payload);
      return response.data;
  } catch (error) {
      logger.error(`[bookingAPI.registerForWebinar] Error for webinar ${webinarBookingId}:`, error.response?.data || error.message);
      throw error;
  }
};

export const respondToRescheduleRequestByCoach = async (bookingId, requestId, action, selectedTime, coachMessage, coachProposedTimes) => {
  logger.info('[bookingAPI] Coach responding to client reschedule request (raw input)', { 
    bookingId, 
    requestId, 
    action, 
    selectedTimeIsObject: typeof selectedTime === 'object', 
    coachMessageArgType: typeof coachMessage, 
    coachMessageArgIsArray: Array.isArray(coachMessage),
    coachProposedTimesArgType: typeof coachProposedTimes,
    coachProposedTimesArgIsArray: Array.isArray(coachProposedTimes)
  });

  try {
    const payload = {
      requestId,
      action,
    };

    let finalCoachMessage = coachMessage;
    let finalCoachProposedTimes = coachProposedTimes;

    if (action === 'counter_propose') {
      if (Array.isArray(coachMessage) && (typeof coachProposedTimes === 'string' || coachProposedTimes === null || coachProposedTimes === undefined || coachProposedTimes === "")) {
        finalCoachProposedTimes = coachMessage; 
        finalCoachMessage = (typeof coachProposedTimes === 'string') ? coachProposedTimes : ""; 
        logger.info('[bookingAPI] Parameter swap applied for counter_propose based on input types.', {
          derivedMessage: finalCoachMessage,
          derivedProposedTimesCount: finalCoachProposedTimes?.length
        });
      }
    }
    
    payload.coachMessage = (typeof finalCoachMessage === 'string') ? finalCoachMessage : "";

    if (action === 'approve' && selectedTime && typeof selectedTime.start === 'string' && typeof selectedTime.end === 'string') {
      payload.selectedTime = {
        start: new Date(selectedTime.start).toISOString(),
        end: new Date(selectedTime.end).toISOString(),
      };
    } else if (action === 'approve' && selectedTime && selectedTime.start instanceof Date && selectedTime.end instanceof Date) {
      payload.selectedTime = {
        start: selectedTime.start.toISOString(),
        end: selectedTime.end.toISOString(),
      };
    }


    if (action === 'counter_propose' && finalCoachProposedTimes && Array.isArray(finalCoachProposedTimes) && finalCoachProposedTimes.length > 0) {
      payload.coachProposedTimes = finalCoachProposedTimes.map(slot => ({
        start: new Date(slot.start).toISOString(),
        end: new Date(slot.end).toISOString(),
      }));
    }
    
    logger.info('[bookingAPI] Coach responding to client reschedule request with final payload:', { bookingId, payload: { ...payload, coachProposedTimes: payload.coachProposedTimes ? `${payload.coachProposedTimes.length} slots` : 'N/A' } });
    
    const response = await api.post(`/api/bookings/${bookingId}/reschedule-response-by-coach`, payload);
    logger.info('[bookingAPI] Coach response to client reschedule successful', { responseData: response.data });
    return response.data;
  } catch (error) {
    const errorData = error.response?.data || { message: error.message };
    logger.error('[bookingAPI] Error responding to client reschedule request by coach', { bookingId, requestId, action, error: errorData });
    throw errorData;
  }
};

export const proposeRescheduleByCoach = async (bookingId, data) => {
  logger.info('[bookingAPI] Coach proposing reschedule', { bookingId, data });
  try {
    const response = await api.post(`/api/bookings/${bookingId}/propose-reschedule-by-coach`, data);
    logger.info('[bookingAPI] Coach reschedule proposal successful', response.data);
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error proposing reschedule by coach', { bookingId, data, error: error.response?.data || error.message });
    throw error;
  }
};

export const rescheduleWebinarByCoach = async (bookingId, data) => {
  logger.info('[bookingAPI] Coach rescheduling webinar', { bookingId, data });
  try {
    const response = await api.post(`/api/bookings/${bookingId}/reschedule-webinar-by-coach`, data);
    logger.info('[bookingAPI] Coach webinar reschedule successful', response.data);
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error rescheduling webinar by coach', { bookingId, data, error: error.response?.data || error.message });
    throw error;
  }
};

export const respondToWebinarRescheduleByAttendee = async (bookingId, data) => {
  logger.info('[bookingAPI] Attendee responding to webinar reschedule', { bookingId, data });
  try {
    const response = await api.post(`/api/bookings/${bookingId}/attendee-webinar-reschedule-response`, data);
    logger.info('[bookingAPI] Attendee webinar reschedule response successful', response.data);
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error responding to webinar reschedule by attendee', { bookingId, data, error: error.response?.data || error.message });
    throw error;
  }
};

export const calculateCancellationDetails = async (bookingId) => {
  try {
    logger.info('[bookingAPI] Fetching cancellation details:', { bookingId });
    const response = await api.get(`/api/bookings/${bookingId}/calculate-cancellation-details`);
    logger.info('[bookingAPI] Cancellation details fetched successfully:', { bookingId, details: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to fetch cancellation details:', {
      bookingId,
      error: error.response?.data || error.message,
    });
    throw error;
  }
};

export const cancelBookingByClient = async (bookingId, cancellationReason) => {
  try {
    logger.info('[bookingAPI] Client cancelling booking:', { bookingId, cancellationReason });
    const payload = cancellationReason ? { cancellationReason } : {};
    const response = await api.post(`/api/bookings/${bookingId}/cancel-by-client`, payload);
    logger.info('[bookingAPI] Booking cancelled by client successfully:', { bookingId, responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to cancel booking by client:', {
      bookingId,
      error: error.response?.data || error.message,
    });
    throw error;
  }
};

export const cancelBookingByCoach = async (bookingId, cancellationReason) => {
  try {
    logger.info('[bookingAPI] Coach cancelling booking:', { bookingId, cancellationReason });
    const payload = cancellationReason ? { cancellationReason } : {};
    const response = await api.post(`/api/bookings/${bookingId}/cancel-by-coach`, payload);
    logger.info('[bookingAPI] Booking cancelled by coach successfully:', { bookingId, responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to cancel booking by coach:', {
      bookingId,
      error: error.response?.data || error.message,
    });
    throw error;
  }
};

export const getCoachAvailabilityForReschedule = async (coachId, forDate, excludeBookingId, targetDurationMinutes) => {
  logger.info('[bookingAPI.getCoachAvailabilityForReschedule] Fetching coach availability for reschedule', {
    coachId,
    forDate,
    excludeBookingId,
    targetDurationMinutes
  });
  try {
    const response = await api.get(`/api/coaches/${coachId}/availability`, { 
      params: {
        // These query parameters are expected by coachController.js -> getCoachAvailability
        forDate: forDate, // e.g., "YYYY-MM-DD"
        excludeBookingId: excludeBookingId,
        targetDurationMinutes: targetDurationMinutes,
      }
    });
    logger.info('[bookingAPI.getCoachAvailabilityForReschedule] Successfully fetched availability', { coachId, responseDataKeys: Object.keys(response.data) });
    return response.data; // Expected: { availability: [] } or similar
  } catch (error) {
    logger.error('[bookingAPI.getCoachAvailabilityForReschedule] Error fetching coach availability for reschedule:', {
        coachId,
        forDate,
        errorMessage: error.message,
        responseData: error.response?.data,
        status: error.response?.status
    });
    throw error.response?.data || new Error('Failed to fetch coach availability for reschedule');
  }
};

export const requestReschedule = async (bookingId, payload) => {
  try {
    const response = await api.post(`/api/bookings/${bookingId}/request-reschedule-by-client`, payload); // Ensure path matches your route
    return response.data;
  } catch (error) {
    console.error('Error requesting reschedule:', error.response?.data || error.message);
    throw error.response?.data || new Error('Failed to request reschedule');
  }
};

export const checkRescheduleEligibility = async (bookingId) => {
  try {
    logger.info('[bookingAPI] Checking reschedule eligibility:', { bookingId });
    const response = await api.post(`/api/bookings/${bookingId}/check-reschedule-eligibility`);
    logger.info('[bookingAPI] Reschedule eligibility check successful:', { bookingId, eligibility: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to check reschedule eligibility:', {
      bookingId,
      error: error.response?.data || error.message,
    });
    throw error.response?.data || new Error('Failed to check reschedule eligibility');
  }
};

export const submitCoachTimeProposal = async (bookingId, proposedSlots, message) => {
  try {
    logger.info('[bookingAPI] Submitting coach time proposal:', { bookingId, proposedSlots, message });
    const response = await api.post(`/api/bookings/${bookingId}/propose-alternative-times`, {
      proposedSlots,
      message,
      proposerRole: 'coach',
    });
    logger.info('[bookingAPI] Coach time proposal submitted successfully:', response.data);
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error submitting coach time proposal:', {
      bookingId,
      error: error.response?.data || error.message,
    });
    throw error.response?.data || new Error('Failed to submit time proposal');
  }
};

export const respondToTimeProposal = async (bookingId, action, selectedSlot, message) => {
  try {
    logger.info('[bookingAPI] Responding to time proposal:', { bookingId, action, selectedSlot, message });
    const payload = {
      action, // 'accept' or 'decline'
      message,
    };
    if (action === 'accept' && selectedSlot) {
      payload.selectedSlot = { // Ensure selectedSlot is in {start, end} format if needed by backend
        start: selectedSlot.start,
        end: selectedSlot.end,
      };
    }
    const response = await api.post(`/api/bookings/${bookingId}/respond-to-alternative-times`, payload);
    logger.info('[bookingAPI] Response to time proposal submitted successfully:', response.data);
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Error responding to time proposal:', {
      bookingId,
      action,
      error: error.response?.data || error.message,
    });
    throw error.response?.data || new Error('Failed to respond to time proposal');
  }
};

export const cancelWebinarRegistrationByClient = async (bookingId, cancellationReason) => {
  try {
    logger.info('[bookingAPI] Client unregistering from webinar:', { bookingId, cancellationReason });
    const payload = cancellationReason ? { cancellationReason } : {};
    // Ensure the path matches the new route in bookingRoutes.js
    const response = await api.post(`/api/bookings/${bookingId}/webinar/unregister`, payload);
    logger.info('[bookingAPI] Webinar unregistration successful:', { bookingId, responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to unregister from webinar:', {
      bookingId,
      error: error.response?.data || error.message,
    });
    throw error;
  }
};

export const requestRescheduleByClient = async (bookingId, payload) => {
  try {
    logger.info('[bookingAPI] Client requesting reschedule:', { bookingId, payload });
    const response = await api.post(`/api/bookings/${bookingId}/request-reschedule-by-client`, payload);
    logger.info('[bookingAPI] Client reschedule request successful:', { bookingId, responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to request reschedule by client:', {
      bookingId,
      payload,
      error: error.response?.data || error.message,
    });
    throw error.response?.data || new Error('Failed to request reschedule by client');
  }
};

export const respondToCoachRescheduleProposalByClient = async (bookingId, requestId, action, selectedTime, clientMessage) => {
  try {
    const payload = { requestId, action, clientMessage };
    if (action === 'approve' && selectedTime) { // Only include selectedTime if action is 'approve'
      payload.selectedTime = { 
        start: new Date(selectedTime.start).toISOString(), 
        end: new Date(selectedTime.end).toISOString() 
      };
    }
    logger.info('[bookingAPI] Client responding to coach reschedule proposal:', { bookingId, payload });
    const response = await api.post(`/api/bookings/${bookingId}/client-reschedule-response`, payload);
    logger.info('[bookingAPI] Client response to coach proposal successful:', { bookingId, responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to respond to coach reschedule proposal by client:', {
      bookingId,
      payloadAttempted: { requestId, action, selectedTime, clientMessage },
      error: error.response?.data || error.message,
    });
    throw error.response?.data || new Error('Failed to respond to coach reschedule proposal by client');
  }
};

export const respondToRescheduleRequestByClient = async (bookingId, requestId, action, selectedTime, clientMessage, proposedSlots) => {
  logger.info('[bookingAPI] Client responding to coach reschedule request/proposal (raw input)', { 
    bookingId, 
    requestId, 
    action, 
    selectedTimeIsObject: typeof selectedTime === 'object', 
    clientMessageArgType: typeof clientMessage,
    proposedSlotsArgIsArray: Array.isArray(proposedSlots)
  });

  try {
    const payload = {
      requestId,
      action,
      clientMessage: (typeof clientMessage === 'string') ? clientMessage : "",
    };

    if (action === 'approve' && selectedTime) {
      if (typeof selectedTime.start === 'string' && typeof selectedTime.end === 'string') {
        payload.selectedTime = {
          start: new Date(selectedTime.start).toISOString(),
          end: new Date(selectedTime.end).toISOString(),
        };
      } else if (selectedTime.start instanceof Date && selectedTime.end instanceof Date) {
        payload.selectedTime = {
          start: selectedTime.start.toISOString(),
          end: selectedTime.end.toISOString(),
        };
      }
    }

    if (action === 'counter_propose' && proposedSlots && Array.isArray(proposedSlots) && proposedSlots.length > 0) {
      payload.proposedSlots = proposedSlots.map(slot => ({
        start: new Date(slot.start).toISOString(),
        end: new Date(slot.end).toISOString(),
      }));
    }
    
    logger.info('[bookingAPI] Client responding to coach reschedule request with final payload:', { bookingId, payload: { ...payload, proposedSlots: payload.proposedSlots ? `${payload.proposedSlots.length} slots` : 'N/A' } });
    
    // Path should match your backend route for client responding to coach's proposal
    // This might be the same as respondToCoachRescheduleProposalByClient or a dedicated one like /client-reschedule-response
    const response = await api.post(`/api/bookings/${bookingId}/client-reschedule-response`, payload);
    logger.info('[bookingAPI] Client response to coach reschedule successful', { responseData: response.data });
    return response.data;
  } catch (error) {
    const errorData = error.response?.data || { message: error.message };
    logger.error('[bookingAPI] Error in client responding to coach reschedule request', { bookingId, requestId, action, error: errorData });
    throw errorData;
  }
};

export const getBookingPublicSummary = async (bookingId) => {
  if (!bookingId || !/^[0-9a-fA-F]{24}$/.test(bookingId)) {
    logger.warn('[bookingAPI] getBookingPublicSummary called with invalid ID, skipping fetch.', { bookingId });
    return null;
  }
  try {
    const response = await api.get(`/api/bookings/public-summary/${bookingId}`);
    return response.data;
  } catch (error) {
    // A 404 is expected if the booking was deleted, so we don't spam the console.
    if (error.response && error.response.status !== 404) {
      logger.error('[bookingAPI] Failed to fetch booking public summary:', {
        bookingId,
        error: error.message,
      });
    }
    return null; // Return null on any error to prevent react-query from retrying.
  }
};

export const cancelBookingDuringPayment = async (bookingId) => {
  try {
    const response = await api.post(`/api/bookings/${bookingId}/cancel-during-payment`);
    logger.info('[bookingAPI] Booking cancellation during payment successful:', response.data);
    return response.data;
  } catch (error) {
    logger.error('[bookingAPI] Failed to cancel booking during payment:', {
      bookingId,
      error: error.response?.data || error.message,
    });
    throw error;
  }
};

export default {
  getSessionTypes,
  createSession,
  updateSession,
  deleteSession,
  getCoachSessions,
  createBooking,
  updateBooking,
  getBookingRequests,
  respondToBookingRequest,
  getUpcomingBookings,
  getBooking,
  cancelBooking,
  getPastBookings,
  getCoachAvailability,
  confirmBooking,
  rescheduleBooking,
  getBookingDetails,
  submitBookingFeedback,
  acceptBooking,
  declineBooking,
  suggestAlternativeTime,
  calculateBookingPrice,
  recalculateBookingPrice,
  calculateRefund,
  getBookingSummary,
  updateBookingOvertimeSettings,
  registerForWebinar,
  respondToRescheduleRequestByCoach,
  proposeRescheduleByCoach,
  rescheduleWebinarByCoach,
  respondToWebinarRescheduleByAttendee,
  calculateCancellationDetails,
  cancelBookingByClient,
  cancelBookingByCoach,
  getCoachAvailabilityForReschedule,
  requestReschedule,
  checkRescheduleEligibility,
  submitCoachTimeProposal, 
  respondToTimeProposal,
  cancelWebinarRegistrationByClient,
  requestRescheduleByClient,
  respondToCoachRescheduleProposalByClient,
  respondToRescheduleRequestByClient,
  acceptBookingByClient,
  declineBookingByClient,
  getBookingPublicSummary,
  cancelBookingDuringPayment
};