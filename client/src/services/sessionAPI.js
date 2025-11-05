import axios from 'axios';
import { logger } from '../utils/logger';

export const getSessionDetails = async (sessionId, token) => {
  //logger.info('[sessionAPI] Fetching session details', { sessionId, token, url: `/api/sessions/validate/${sessionId}/${token}` });
  try {
    const response = await axios.get(`/api/sessions/validate/${sessionId}/${token}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    /*logger.info('[sessionAPI] Session details response', { 
      success: response.data.success, 
      isValid: response.data.isValid, 
      sessionDetails: response.data.sessionDetails,
      canJoinImmediately: response.data.canJoinImmediately,
    });*/
    
    if (!response.data.success || !response.data.isValid) {
      throw new Error('Invalid or expired session link');
    }

    const sessionDetails = response.data.sessionDetails;
    logger.debug('[sessionAPI] Parsed session details', { sessionDetails });

    const now = new Date();
    const sessionStart = new Date(sessionDetails.start);
    const isLive = now >= sessionStart && now <= new Date(sessionDetails.end);
    logger.info('[sessionAPI] Session live status', { sessionId, isLive, start: sessionDetails.start, now: now.toISOString() });

    return {
      ...sessionDetails,
      isLiveSession: isLive,
      canJoinImmediately: response.data.canJoinImmediately,
    };
  } catch (error) {
    logger.error('[sessionAPI] Failed to fetch session details', { 
      error: error.message, 
      sessionId, 
      token,
      response: error.response?.data, 
      status: error.response?.status,
      config: error.config?.url, // Log the exact URL being called
    });
    throw error;
  }
};

export const getSessionRecordings = async (bookingId) => {
  logger.info('[sessionAPI] Fetching session recordings', { bookingId });
  try {
    const response = await axios.get(`/api/sessions/${bookingId}/recordings`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    logger.info('[sessionAPI] Session recordings fetched successfully', {
      bookingId,
      recordingCount: response.data.recordings.length,
    });
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI] Failed to fetch session recordings', {
      bookingId,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    throw error;
  }
};

export const getBookingOvertimeSettings = async (bookingId) => {
  logger.info('[sessionAPI] Fetching overtime settings', { bookingId });
  try {
    const response = await axios.get(`/api/bookings/${bookingId}/overtime`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    logger.info('[sessionAPI] Overtime settings fetched successfully', { bookingId });
    return response.data.overtime;
  } catch (error) {
    logger.error('[sessionAPI] Failed to fetch overtime settings', {
      bookingId,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });
    throw error;
  }
};

/**
 * Sends the user/coach choice regarding overtime extension.
 * Handles V3 flow with prepare_authorize and confirm_authorize.
 * @param {string} sessionId - The sessionLink sessionId.
 * @param {string} choice - The choice ('end', 'free', 'request_paid', 'prepare_authorize', 'confirm_authorize', 'decline', 'authorization_failed').
 * @param {number | null} duration - Custom duration (minutes) for request_paid/prepare_authorize.
 * @param {object | null} priceOrIntent - For request_paid/prepare_authorize: { amount: number, currency: string }. For confirm_authorize/authorization_failed: { paymentIntentId: string }.
 * @returns {Promise<object>} - The backend response.
 */
export const handleOvertimeChoice = async (sessionId, choice, duration = null, priceOrIntent = null) => {
  const token = localStorage.getItem('token');
  const logPayload = {
      sessionId,
      choice,
      duration,
      priceOrIntent: priceOrIntent ? (priceOrIntent.paymentIntentId ? { paymentIntentId: priceOrIntent.paymentIntentId } : (priceOrIntent.amount !== undefined ? { amount: priceOrIntent.amount, currency: priceOrIntent.currency } : null)) : null
  };
  logger.info('[sessionAPI] Handling overtime choice via API (V3 Flow)', logPayload);

  // --- FIX: Ensure sessionId is included in the URL path ---
  if (!sessionId) {
    logger.error('[sessionAPI] Missing sessionId for handleOvertimeChoice API call!', logPayload);
    throw new Error('Session ID is required for this operation.');
  }
  const endpoint = `/api/sessions/${sessionId}/overtime`; // Construct URL with sessionId
  // --- END FIX ---

  try {
    const payload = { choice };

    if (duration !== null && duration > 0 && ['request_paid', 'prepare_authorize'].includes(choice)) {
      payload.customDuration = duration;
      logger.debug('[sessionAPI] Added customDuration to payload', { duration });
    }

    if (priceOrIntent && priceOrIntent.amount !== undefined && priceOrIntent.currency && ['request_paid', 'prepare_authorize'].includes(choice)) {
        if (typeof priceOrIntent.amount !== 'number' || typeof priceOrIntent.currency !== 'string') {
            logger.error('[sessionAPI] Invalid price object format for API call', { choice, price: priceOrIntent });
            throw new Error('Invalid price format for overtime API call.');
        }
        payload.calculatedOvertimePrice = {
            amount: priceOrIntent.amount,
            currency: priceOrIntent.currency
        };
        logger.debug('[sessionAPI] Added calculatedOvertimePrice to payload', { choice, price: payload.calculatedOvertimePrice });
    }
    else if (priceOrIntent && priceOrIntent.paymentIntentId && ['confirm_authorize', 'authorization_failed'].includes(choice)) {
        payload.paymentIntentId = priceOrIntent.paymentIntentId;
        logger.debug(`[sessionAPI] Added paymentIntentId for ${choice}`, { paymentIntentId: payload.paymentIntentId });
    }

    logger.debug('[sessionAPI] Sending overtime payload (V3 Flow):', { sessionId, payload: JSON.stringify(payload) });
    // --- FIX: Use the constructed endpoint ---
    const response = await axios.post(endpoint, payload, { headers: { Authorization: `Bearer ${token}` } });
    // --- END FIX ---

    logger.info('[sessionAPI] Overtime choice API call successful (V3 Flow)', { sessionId, choice, responseStatus: response.status, responseData: response.data });
    return response.data;

  } catch (error) {
    const errorData = error.response?.data || { message: error.message };
    const status = error.response?.status;
    logger.error('[sessionAPI] Failed to handle overtime choice via API (V3 Flow)', {
      sessionId,
      choice,
      error: errorData,
      status,
    });
    const enhancedError = new Error(errorData.message || `Failed to process overtime choice: ${choice}`);
    enhancedError.status = status;
    enhancedError.data = errorData;
    throw enhancedError;
  }
};

/**
 * Terminates the session due to payment failure (coach action).
 * @param {string} sessionId - The sessionLink sessionId.
 * @returns {Promise<object>} - The backend response.
 */
export const terminateSessionForPayment = async (sessionId) => {
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI] Terminating session for payment failure', { sessionId });
  try {
    const response = await axios.post(`/api/sessions/${sessionId}/terminate`,
      {}, // No body needed
      { headers: { Authorization: `Bearer ${token}` } }
    );
    logger.info('[sessionAPI] Session terminated successfully via API', { sessionId, responseData: response.data });
    // Expected response: { success: true, message }
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI] Failed to terminate session via API', {
      sessionId,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to terminate session');
  }
};

/**
 * Continues the session despite payment failure (coach action).
 * @param {string} sessionId - The sessionLink sessionId.
 * @returns {Promise<object>} - The backend response.
 */
export const continueSessionAfterFailure = async (sessionId) => {
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI] Continuing session after payment failure', { sessionId });
  try {
    const response = await axios.post(`/api/sessions/${sessionId}/continue`,
      {}, // No body needed
      { headers: { Authorization: `Bearer ${token}` } }
    );
    logger.info('[sessionAPI] Session continued successfully via API', { sessionId, responseData: response.data });
    // Expected response: { success: true, message, newEndTime }
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI] Failed to continue session via API', {
      sessionId,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to continue session');
  }
};

/**
 * Monitors session duration and triggers overtime prompts if applicable.
 * @param {string} sessionId - The sessionLink sessionId.
 * @param {string} token - The authentication token.
 * @param {object} socket - The Socket.IO instance for emitting events.
 * @param {Function} [getCurrentTime] - Optional function to get current time (for simulation).
 * @returns {Function} - Cleanup function to stop monitoring.
 */
export const monitorSession = async (sessionId, token, socket, getCurrentTime = Date.now) => {
  logger.info('[sessionAPI] Starting session monitoring', { sessionId });
  try {
    if (!socket) {
      logger.error('[sessionAPI] Socket instance missing for session monitoring', { sessionId });
      throw new Error('Socket instance required');
    }

    const monitoredSessions = new Map();
    if (monitoredSessions.has(sessionId)) {
      logger.warn('[sessionAPI] Session already being monitored', { sessionId });
      return;
    }

    const sessionDetails = await getSessionDetails(sessionId, token);
    const { start, end, bookingId } = sessionDetails;
    if (!start || !end || !bookingId) {
      logger.error('[sessionAPI] Invalid session details', { sessionId, start, end, bookingId });
      throw new Error('Invalid session details');
    }

    const overtimeSettings = await getBookingOvertimeSettings(bookingId);
    if (!overtimeSettings.allowOvertime) {
      logger.info('[sessionAPI] Overtime not allowed for session', { sessionId, bookingId });
      return;
    }

    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const warningThreshold = 5 * 60 * 1000; // 5 minutes before end
    let isSimulating = false;

    const checkSession = async () => {
      const now = getCurrentTime();
      const timeLeft = endTime - now;
      logger.debug('[sessionAPI] Monitoring session', {
        sessionId,
        timeLeftMs: timeLeft,
        now: new Date(now).toISOString(),
        isSimulating,
      });

      if (timeLeft <= warningThreshold && timeLeft > 0) {
        if (socket.connected) {
          logger.info('[sessionAPI] Triggering overtime prompt', { sessionId, bookingId });
          socket.emit('overtime-prompt', {
            metadata: {
              sessionId,
              bookingId,
              overtimeOptions: [
                { type: 'end', duration: 0, cost: 0 },
                ...(overtimeSettings.freeOvertimeDuration > 0
                  ? [{ type: 'free', duration: overtimeSettings.freeOvertimeDuration, cost: 0 }]
                  : []),
                ...(overtimeSettings.paidOvertimeDuration > 0
                  ? [{
                      type: 'paid',
                      duration: overtimeSettings.paidOvertimeDuration,
                      cost: overtimeSettings.overtimeRate * (overtimeSettings.paidOvertimeDuration / 60),
                    }]
                  : []),
              ],
            },
          });
        } else {
          logger.warn('[sessionAPI] Socket disconnected, cannot emit overtime-prompt', { sessionId });
        }
        clearInterval(interval);
        monitoredSessions.delete(sessionId);
      } else if (timeLeft <= 0) {
        logger.info('[sessionAPI] Session ended naturally', { sessionId });
        if (socket.connected) {
          socket.emit('session-ended', { reason: 'Scheduled end', sessionId });
        } else {
          logger.warn('[sessionAPI] Socket disconnected, cannot emit session-ended', { sessionId });
        }
        clearInterval(interval);
        monitoredSessions.delete(sessionId);
      }
    };

    // Immediate check for simulation
    socket.on('simulate-time-update', (data) => {
      if (data.sessionId === sessionId) {
        logger.info('[sessionAPI] Received simulate-time-update', {
          sessionId,
          simulatedTime: new Date(data.simulatedTime).toISOString(),
        });
        isSimulating = true;
        checkSession();
      }
    });

    const interval = setInterval(checkSession, isSimulating ? 1000 : 60000); // 1s during simulation, 60s otherwise

    monitoredSessions.set(sessionId, interval);
    logger.info('[sessionAPI] Session monitoring started', { sessionId, bookingId });

    return () => {
      clearInterval(interval);
      socket.off('simulate-time-update');
      monitoredSessions.delete(sessionId);
      logger.info('[sessionAPI] Session monitoring stopped', { sessionId });
    };
  } catch (error) {
    logger.error('[sessionAPI] Failed to monitor session', {
      sessionId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

/**
 * Handles overtime choice and updates session state.
 * @param {string} sessionId - The sessionLink sessionId.
 * @param {string} choice - The overtime choice ('end', 'free', 'paid', 'confirm', 'decline').
 * @param {string} token - The authentication token.
 * @param {object} socket - The Socket.IO instance for emitting events.
 * @returns {Promise<object>} - The backend response.
 */
export const handleOvertime = async (sessionId, choice, token, socket) => {
  logger.info('[sessionAPI] Handling overtime', { sessionId, choice });
  try {
    if (!socket) {
      logger.error('[sessionAPI] Socket instance missing for overtime handling', { sessionId });
      throw new Error('Socket instance required');
    }

    const response = await handleOvertimeChoice(sessionId, choice);
    let sessionDetails, bookingId, overtimeSettings, newEndTime, actualEndTime;

    // Only fetch session details if the choice isn't 'end' or 'decline'
    if (choice !== 'end' && choice !== 'decline') {
      sessionDetails = await getSessionDetails(sessionId, token);
      if (!sessionDetails) {
        logger.warn('[sessionAPI] Session details not found, possibly ended', { sessionId });
        throw new Error('Session not found');
      }
      bookingId = sessionDetails.bookingId;
      overtimeSettings = await getBookingOvertimeSettings(bookingId);
      newEndTime = new Date(sessionDetails.end).getTime();
      actualEndTime = newEndTime;
    }

    if (['free', 'paid', 'confirm'].includes(choice)) {
      const durationMinutes = choice === 'free'
        ? overtimeSettings.freeOvertimeDuration
        : overtimeSettings.paidOvertimeDuration;
      newEndTime += durationMinutes * 60 * 1000;
      actualEndTime = newEndTime;
      logger.info('[sessionAPI] Session extended', {
        sessionId,
        choice,
        newEndTime: new Date(newEndTime).toISOString(),
      });
      if (socket.connected) {
        socket.emit('session-continued', {
          sessionId,
          newEndTime: new Date(newEndTime).toISOString(),
        });
      }
    } else if (choice === 'end' || choice === 'decline') {
      logger.info('[sessionAPI] Session ending due to overtime choice', { sessionId, choice });
      if (socket.connected) {
        socket.emit('session-ended', { reason: 'Overtime declined', sessionId });
      }
    }

    if (socket.connected) {
      socket.emit('overtime-response', {
        sessionId,
        choice,
        actualEndTime: actualEndTime ? new Date(actualEndTime).toISOString() : null,
      });
    }

    return response;
  } catch (error) {
    logger.error('[sessionAPI] Failed to handle overtime', {
      sessionId,
      choice,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

/**
 * Handles payment failure actions and updates session state.
 * @param {string} sessionId - The sessionLink sessionId.
 * @param {string} action - The action ('terminate', 'continue').
 * @param {string} token - The authentication token.
 * @param {object} socket - The Socket.IO instance for emitting events.
 * @returns {Promise<object>} - The backend response.
 */
export const handlePaymentFailure = async (sessionId, action, token, socket) => {
  logger.info('[sessionAPI] Handling payment failure', { sessionId, action });
  try {
    if (!socket) {
      logger.error('[sessionAPI] Socket instance missing for payment failure handling', { sessionId });
      throw new Error('Socket instance required');
    }

    let response;
    if (action === 'terminate') {
      response = await terminateSessionForPayment(sessionId);
      logger.info('[sessionAPI] Session terminated due to payment failure', { sessionId });
      if (socket.connected) {
        socket.emit('session-ended', {
          reason: 'Payment failure',
          sessionId,
        });
      } else {
        logger.warn('[sessionAPI] Socket disconnected, cannot emit session-ended', { sessionId });
      }
    } else if (action === 'continue') {
      response = await continueSessionAfterFailure(sessionId);
      logger.info('[sessionAPI] Session continued despite payment failure', { sessionId });
      if (socket.connected) {
        socket.emit('session-continued', {
          sessionId,
          newEndTime: response.newEndTime || new Date().toISOString(),
        });
      } else {
        logger.warn('[sessionAPI] Socket disconnected, cannot emit session-continued', { sessionId });
      }
    } else {
      logger.error('[sessionAPI] Invalid payment failure action', { sessionId, action });
      throw new Error('Invalid payment failure action');
    }
    return response;
  } catch (error) {
    logger.error('[sessionAPI] Failed to handle payment failure', {
      sessionId,
      action,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

/**
 * DEVELOPMENT ONLY: Sets the coach's overtime choice state directly on the session.
 * @param {string} sessionId - The sessionLink sessionId.
 * @param {'paid' | 'free' | 'reset'} coachChoice - The state to set.
 * @param {number | null} requestedDuration - Required duration if choice is 'paid'.
 * @param {{amount: number, currency: string} | null} price - Required price if choice is 'paid'. // MODIFIED: Add price param
 * @returns {Promise<object>} - The backend response.
 */
export const setOvertimeChoiceDev = async (sessionId, coachChoice, requestedDuration = null, price = null) => { // MODIFIED: Add price param
  if (process.env.NODE_ENV !== 'development') {
    logger.error('[sessionAPI.setOvertimeChoiceDev] Attempted to call dev endpoint in non-dev environment.');
    throw new Error('This function is only available in development.');
  }

  const token = localStorage.getItem('token');
  // MODIFIED: Include price in log payload
  const logContext = { sessionId, coachChoice, requestedDuration, price };
  logger.info('[sessionAPI.setOvertimeChoiceDev] Calling dev endpoint', logContext);

  try {
    const payload = { coachChoice };
    if (coachChoice === 'paid') {
      if (requestedDuration) {
          payload.requestedDuration = requestedDuration;
      }
      // MODIFIED: Add price to payload if choice is 'paid'
      if (price && typeof price.amount === 'number' && typeof price.currency === 'string') {
           payload.calculatedOvertimePrice = price;
           logger.debug('[sessionAPI.setOvertimeChoiceDev] Added price to DEV payload', { price });
      } else {
           logger.error('[sessionAPI.setOvertimeChoiceDev] Missing or invalid price object for paid choice', { price });
           throw new Error("Valid price object {amount, currency} required for 'paid' choice in DEV endpoint.");
      }
    }

    logger.debug('[sessionAPI.setOvertimeChoiceDev] Sending DEV payload:', { payload: JSON.stringify(payload) });

    const response = await axios.post(`/api/sessions/${sessionId}/dev/set-overtime-choice`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    logger.info('[sessionAPI.setOvertimeChoiceDev] Dev endpoint call successful', { sessionId, responseStatus: response.status });
    return response.data;

  } catch (error) {
    logger.error('[sessionAPI.setOvertimeChoiceDev] Failed to call dev endpoint', {
      ...logContext, // Use context for better error logging
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to set dev overtime state');
  }
};

/**
 * Fetches the details of the latest active overtime request for a session.
 * @param {string} sessionId - The sessionLink sessionId.
 * @returns {Promise<object>} - The latest segment details { requestedDuration, calculatedMaxPrice, status, segmentId } or throws error.
 */
export const getLatestOvertimeRequest = async (sessionId) => {
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI] Fetching latest overtime request details', { sessionId });
  try {
    const response = await axios.get(`/api/sessions/${sessionId}/latest-overtime-request`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    logger.info('[sessionAPI] Latest overtime request fetched successfully', { sessionId, data: response.data });
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to fetch latest overtime request');
    }
    return response.data; // { success: true, requestedDuration, calculatedMaxPrice, status, segmentId }
  } catch (error) {
    logger.error('[sessionAPI] Failed to fetch latest overtime request', {
      sessionId,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to fetch latest overtime request');
  }
};

export const startSession = async (sessionId, jwtAuthToken, sessionLinkToken, bodyPayload = {}) => {
  logger.info('[sessionAPI] Calling startSession API', { sessionId, hasJwtAuthToken: !!jwtAuthToken, hasSessionLinkToken: !!sessionLinkToken, bodyPayload });
  try {
    const requestBody = {
      ...bodyPayload,
      token: sessionLinkToken, // Add sessionLinkToken to the request body
    };
    logger.debug('[sessionAPI] startSession request body:', { requestBody });

    const response = await axios.post(`/api/sessions/start/${sessionId}`,
      requestBody,
      {
        headers: { Authorization: `Bearer ${jwtAuthToken}` },
      }
    );
    logger.info('[sessionAPI] startSession API response', {
      sessionId,
      success: response.data.success,
      stateChanged: response.data.stateChanged,
      actualStartTime: response.data.actualStartTime,
    });
    if (!response.data.success) {
      throw new Error(response.data.message || 'Failed to start session via API');
    }
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI] Failed to call startSession API', {
      error: error.message,
      sessionId,
      response: error.response?.data,
      status: error.response?.status,
    });
    throw error.response?.data || error;
  }
};

export const simulateUserOvertimeAuthorizationDev = async (sessionId) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.error('[sessionAPI.simulateUserAuthDev] Attempted to call dev endpoint in non-dev environment.');
    throw new Error('This function is only available in development.');
  }
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI.simulateUserAuthDev] Calling dev endpoint to simulate user authorization', { sessionId });

  try {
    const response = await axios.post(`/api/sessions/${sessionId}/dev/simulate-user-overtime-authorization`,
      {}, // No body needed, sessionId is in URL
      { headers: { Authorization: `Bearer ${token}` } }
    );
    logger.info('[sessionAPI.simulateUserAuthDev] Dev endpoint call successful', { sessionId, responseStatus: response.status, responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI.simulateUserAuthDev] Failed to call dev endpoint', {
      sessionId,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to simulate user overtime authorization');
  }
};

export const terminateSessionByCoach = async (sessionId) => {
  const token = localStorage.getItem('token'); // JWT auth token
  logger.info('[sessionAPI] Coach attempting to terminate session via API', { sessionId }); // Log attempt
  if (!sessionId) {
    logger.error('[sessionAPI] Missing sessionId for terminateSessionByCoach API call!');
    throw new Error('Session ID is required for terminating the session.');
  }
  const endpoint = `/api/sessions/${sessionId}/terminate`; 
  logger.debug(`[sessionAPI] Calling terminate endpoint: ${endpoint}`, { sessionId }); // Log endpoint
  try {
    const response = await axios.post(endpoint, 
      {}, 
      { headers: { Authorization: `Bearer ${token}` } }
    );
    logger.info('[sessionAPI] Coach terminate session API call successful', { sessionId, responseStatus: response.status, responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI] Failed to call coach terminate session API', {
      sessionId,
      error: error.response?.data || error.message,
      status: error.response?.status,
    });
    throw error.response?.data || new Error('Failed to terminate session');
  }
};

export const simulateOvertimeUsageDev = async (sessionLinkSessionId, minutesUsed) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.error('[sessionAPI.simulateOvertimeUsageDev] Attempted call outside development.');
    throw new Error("DEV endpoint: simulateOvertimeUsageDev can only be called in development.");
  }
  // --- MODIFICATION START for API URL construction ---
  const baseApiUrl = (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/api$/, ''); 
  const API_URL_WITH_PREFIX = `${baseApiUrl}/api`; 
  // --- MODIFICATION END ---
  try {
    const token = localStorage.getItem('token');
    const response = await axios.post(
      // --- MODIFICATION START: Use corrected URL ---
      `${API_URL_WITH_PREFIX}/sessions/${sessionLinkSessionId}/dev/simulate-overtime-usage`,
      // --- MODIFICATION END ---
      { minutesUsed },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    logger.info('[sessionAPI.simulateOvertimeUsageDev] API call successful', { sessionLinkSessionId, minutesUsed, responseData: response.data });
    return response.data;
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message || 'Failed to simulate overtime usage (DEV)';
    logger.error('[sessionAPI.simulateOvertimeUsageDev] API call failed', { sessionLinkSessionId, minutesUsed, error: errorMsg });
    throw new Error(errorMsg);
  }
};

export const uploadSessionImage = async (sessionLinkSessionId, imageFile) => {
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI.uploadSessionImage] Uploading session image.', { sessionLinkSessionId, fileName: imageFile.name });
  
  const formData = new FormData();
  formData.append('sessionImageFile', imageFile);

  try {
    const response = await axios.post(`/api/sessions/${sessionLinkSessionId}/image`, formData, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });
    logger.info('[sessionAPI.uploadSessionImage] Upload successful.', { responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI.uploadSessionImage] Upload failed.', { 
        sessionLinkSessionId, 
        error: error.response?.data || error.message 
    });
    throw error.response?.data || error;
  }
};

export const deleteSessionImage = async (sessionLinkSessionId, imageId) => {
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI.deleteSessionImage] Deleting session image.', { sessionLinkSessionId, imageId });
  try {
    const response = await axios.delete(`/api/sessions/${sessionLinkSessionId}/image/${imageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    logger.info('[sessionAPI.deleteSessionImage] Deletion successful.', { responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI.deleteSessionImage] Deletion failed.', { 
        sessionLinkSessionId, 
        imageId, 
        error: error.response?.data || error.message 
    });
    throw error.response?.data || error;
  }
};

export const setMainSessionImage = async (sessionLinkSessionId, imageId) => {
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI.setMainSessionImage] Setting main image.', { sessionLinkSessionId, imageId });
  try {
    const response = await axios.put(`/api/sessions/${sessionLinkSessionId}/image/${imageId}/set-main`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    logger.info('[sessionAPI.setMainSessionImage] Set main successful.', { responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI.setMainSessionImage] Set main failed.', { 
        sessionLinkSessionId, 
        imageId, 
        error: error.response?.data || error.message 
    });
    throw error.response?.data || error;
  }
};

export const uploadSessionCourseMaterials = async (sessionLinkSessionId, courseMaterialFiles) => {
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI.uploadSessionCourseMaterials] Uploading course materials.', { sessionLinkSessionId, count: courseMaterialFiles.length });

  const formData = new FormData();
  courseMaterialFiles.forEach(file => {
    formData.append('courseMaterialFiles', file);
  });

  try {
    const response = await axios.post(`/api/sessions/${sessionLinkSessionId}/course-materials`, formData, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });
    logger.info('[sessionAPI.uploadSessionCourseMaterials] Upload successful.', { responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI.uploadSessionCourseMaterials] Upload failed.', { 
        sessionLinkSessionId, 
        error: error.response?.data || error.message 
    });
    throw error.response?.data || error;
  }
};

export const deleteSessionCourseMaterial = async (sessionLinkSessionId, materialId) => {
  const token = localStorage.getItem('token');
  logger.info('[sessionAPI.deleteSessionCourseMaterial] Deleting course material.', { sessionLinkSessionId, materialId });
  try {
    const response = await axios.delete(`/api/sessions/${sessionLinkSessionId}/course-materials/${materialId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    logger.info('[sessionAPI.deleteSessionCourseMaterial] Deletion successful.', { responseData: response.data });
    return response.data;
  } catch (error) {
    logger.error('[sessionAPI.deleteSessionCourseMaterial] Deletion failed.', { 
        sessionLinkSessionId, 
        materialId, 
        error: error.response?.data || error.message 
    });
    throw error.response?.data || error;
  }
};
