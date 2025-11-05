import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationSocket } from '../contexts/SocketContext';
import * as liveSessionAPI from '../services/liveSessionAPI';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import { toast } from 'react-hot-toast';

export const useLiveSessionManager = () => {
  const { socket, isConnected } = useNotificationSocket();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequestStatus, setOutgoingRequestStatus] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [clientPaymentFailed, setClientPaymentFailed] = useState(null);
  const [reauthRequired, setReauthRequired] = useState(null);
  const [sessionWarning, setSessionWarning] = useState(null);

  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);


  const requestLiveSession = useCallback(async ({ coachId, appliedDiscount }) => {
    if (!isConnected) {
      logger.error('[useLiveSessionManager] Cannot request live session, socket not connected.');
      setOutgoingRequestStatus('error');
      throw new Error('Socket not connected');
    }
    try {
      setOutgoingRequestStatus('pending');
      const newSession = await liveSessionAPI.requestLiveSession({ coachId, appliedDiscount });

      // FIX: Add a guard clause to validate the API response before using it.
      if (!newSession || !newSession._id) {
        logger.error('[useLiveSessionManager] API call succeeded but returned invalid session data.', { newSession });
        setOutgoingRequestStatus('error');
        setSessionId(null);
        // Throw a specific error to be caught by the component.
        throw new Error('Server returned an invalid session object.');
      }

      setSessionId(newSession._id);
      logger.info(`[useLiveSessionManager] Live session request initiated. SessionID: ${newSession._id}`);
      return newSession;
    } catch (error) {
      setOutgoingRequestStatus('error');
      setSessionId(null);
      logger.error('[useLiveSessionManager] Failed to request live session', {
          // Check if it's an axios error before trying to access response
          errorMessage: error.message,
          responseData: error.response?.data 
      });
      throw error;
    }
  }, [isConnected]);

  const acceptLiveSession = async (sessionIdToAccept) => {
    let originalRequests = [];
    setIncomingRequests(prev => {
        originalRequests = prev;
        const acceptedRequest = prev.find(req => req._id === sessionIdToAccept);
        return acceptedRequest ? [{ ...acceptedRequest, status: 'authorizing' }] : [];
    });

    try {
      logger.info(`[useLiveSessionManager] > SENDING acceptLiveSession for session ID: ${sessionIdToAccept}`);
      await liveSessionAPI.respondToLiveSession(sessionIdToAccept, 'accepted');
    } catch (error)      {
      logger.error('[useLiveSessionManager] Failed to accept live session', error);
      setIncomingRequests(originalRequests);
      toast.error(error.response?.data?.message || 'Failed to accept the session. Please try again.');
    }
  };
  
  const declineLiveSession = async (sessionIdToDecline, message) => {
     logger.debug(`[useLiveSessionManager] COACH: Calling declineLiveSession API for session ${sessionIdToDecline} with message: "${message}"`);
    try {
      await liveSessionAPI.respondToLiveSession(sessionIdToDecline, 'declined', message);
      setIncomingRequests(prev => prev.filter(req => req._id !== sessionIdToDecline));
    } catch (error) {
      logger.error('[useLiveSessionManager] Failed to decline live session', error);
    }
  };

  const cancelLiveSessionRequest = async () => {
    if (sessionIdRef.current) {
      try {
        await liveSessionAPI.cancelRequest(sessionIdRef.current);
        setOutgoingRequestStatus('cancelled');
        setSessionId(null);
      } catch (error) {
        logger.error('[useLiveSessionManager] Failed to cancel live session request', error);
      }
    }
  };

 const submitReauthorizationResult = useCallback(async (reauthPayload) => {
    if (sessionIdRef.current) {
      try {
        const result = await liveSessionAPI.handleReauthorizationResult(sessionIdRef.current, reauthPayload);
        if (reauthPayload.success) {
          setReauthRequired(null);
        }
        return result;
      } catch (error) {
        logger.error('[useLiveSessionManager] Failed to submit re-authorization result', error);
        throw error;
      }
    }
  }, []);

  const clearIncomingRequests = useCallback(() => {
    setIncomingRequests([]);
  }, []);
  
const resetOutgoingRequest = useCallback(() => {
    logger.info('[useLiveSessionManager] Resetting outgoing live session request state.');
    setOutgoingRequestStatus(null);
    setSessionId(null);
    setSessionInfo(null);
  }, []);

  const clearClientPaymentFailed = useCallback(() => setClientPaymentFailed(null), []);
  const clearReauthRequired = useCallback(() => setReauthRequired(null), []);
  const clearSessionWarning = useCallback(() => setSessionWarning(null), []);

 useEffect(() => {
    if (!socket || !isConnected || !user) {
      return;
    }

    logger.debug('[useLiveSessionManager | useEffect] Setting up STABLE socket listeners. This should only run once per connection.');

    const handleLiveSessionRequest = (request) => {
      logger.info('[useLiveSessionManager] << INCOMING request for coach', request);
      if (!request) {
          logger.warn('[useLiveSessionManager] handleLiveSessionRequest received a null or undefined payload. Ignoring.');
          return;
      }
      if (user?.role === 'coach' && request.coach?._id === user._id) {
        setIncomingRequests(prev => {
          if (prev.some(r => r._id === request._id)) {
            return prev;
          }
          return [...prev, request];
        });
      }
    };

   const handleLiveSessionAccepted = (data) => {
      const currentSessionId = sessionIdRef.current;
      logger.info(`[useLiveSessionManager] << Received 'live_session_accepted' event for session ${data?._id}. Hook is currently tracking session ID via ref: ${currentSessionId}`);
      if (currentSessionId && String(currentSessionId) === String(data._id)) {
        logger.info(`[useLiveSessionManager] SUCCESS: IDs match! Setting status to 'accepted'.`);
        setOutgoingRequestStatus('accepted');
        setSessionInfo(null);
      } else {
         logger.warn(`[useLiveSessionManager] MISMATCH: Event for session ${data?._id} was ignored because hook is tracking session ${currentSessionId}. This can happen if the request was cancelled just before acceptance.`);
      }
    };

    const handleLiveSessionDeclined = (data) => {
       const currentSessionId = sessionIdRef.current;
       logger.info(`[useLiveSessionManager] << Received 'live_session_declined' event for session ${data?._id}. Hook is tracking session ID via ref: ${currentSessionId}`);
       if (currentSessionId && String(currentSessionId) === String(data._id)) {
        logger.info(`[useLiveSessionManager] SUCCESS: IDs match! Setting status to 'declined'.`);
        setOutgoingRequestStatus('declined');
        setSessionInfo({ declineMessage: data.cancellationReason }); 
      } else {
         logger.warn(`[useLiveSessionManager] MISMATCH: Event for session ${data?._id} ignored because hook is tracking ${currentSessionId}.`);
      }
    };

     const handleLiveSessionCancelled = (data) => {
      logger.info(`[useLiveSessionManager] << RCVD 'live_session_cancelled' event for session ${data?.sessionId}.`);
      setIncomingRequests(prevRequests => {
        if (prevRequests.some(req => req._id === data.sessionId)) {
          logger.info(`[useLiveSessionManager] SUCCESS: Matching incoming request ${data.sessionId} found. Removing from queue.`);
          return prevRequests.filter(req => req._id !== data.sessionId);
        }
        return prevRequests;
      });
    };

   const handleSessionCancelledPaymentFailed = (data) => {
      logger.warn(`[useLiveSessionManager] << INCOMING 'session_cancelled_payment_failed' for session ${data.sessionId}.`, { data });
      if (user?.role === 'coach') {
        setIncomingRequests([]);
        setClientPaymentFailed({ sessionId: data.sessionId, reason: data.reason });
      }
    };

    const handleReauthRequired = (data) => {
      if (sessionIdRef.current && outgoingRequestStatus === 'in_progress') {
        logger.info(`[useLiveSessionManager] << INCOMING 'require_reauthorization' for active session.`, { data });
        setReauthRequired({
          clientSecret: data.clientSecret,
          paymentIntentId: data.paymentIntentId,
        });
      } else {
        logger.warn(`[useLiveSessionManager] Ignored 'require_reauthorization' because session status is '${outgoingRequestStatus}' not 'in_progress'.`, { trackedSessionId: sessionIdRef.current });
      }
    };

    const handlePaymentFailedWrapUp = (data) => {
      logger.warn(`[useLiveSessionManager] << INCOMING 'payment_failed_wrap_up'.`, { data });
      setSessionWarning({
        message: 'Payment failed. Session will end soon.',
        wrapUpDuration: data.wrapUpDuration,
      });
      setReauthRequired(null);
    };

    const handleSessionAuthorizedAndReady = (data) => {
        const currentTrackedSessionId = sessionIdRef.current;
        const eventSession = data?.session;
        const sessionUrl = data?.sessionUrl;

        logger.info(`[useLiveSessionManager] << INCOMING 'session_authorized_and_ready'.`, {
            currentUser: { id: user?._id, role: user?.role },
            hookState: { trackedSessionId: currentTrackedSessionId },
            eventPayload: {
                sessionUrl,
                sessionId: eventSession?._id,
                clientId: eventSession?.client?._id || eventSession?.client,
                coachId: eventSession?.coach?._id || eventSession?.coach,
            }
        });

        if (!sessionUrl || !eventSession) {
            logger.error('[useLiveSessionManager] Event is missing sessionUrl or session object. Cannot navigate.', { data });
            return;
        }

        const isUserTheClient = user && String(user._id) === String(eventSession.client?._id || eventSession.client);
        const isUserTheCoach = user && String(user._id) === String(eventSession.coach?._id || eventSession.coach);

        if (isUserTheClient) {
            if (currentTrackedSessionId && String(currentTrackedSessionId) === String(eventSession._id)) {
                logger.info(`[useLiveSessionManager] CLIENT: Session ID match successful. Navigating to: ${sessionUrl}`);
                setOutgoingRequestStatus('in_progress'); 
                navigate(sessionUrl);
                
            } else {
                logger.warn(`[useLiveSessionManager] CLIENT: Mismatch. Event for session ${eventSession._id} ignored because hook is tracking ${currentTrackedSessionId}.`);
            }
            return;
        }

        if (isUserTheCoach) {
            logger.info(`[useLiveSessionManager] COACH: User is the designated coach for this session. Navigating to: ${sessionUrl}`);
            setIncomingRequests([]); 
            navigate(sessionUrl);
            return;
        }

        logger.warn(`[useLiveSessionManager] User (${user?._id}) is neither the client nor the coach for this session. Ignoring event.`);
    };

    socket.on('live_session_request', handleLiveSessionRequest);
    socket.on('live_session_accepted', handleLiveSessionAccepted);
    socket.on('live_session_declined', handleLiveSessionDeclined);
    socket.on('live_session_cancelled_by_client', handleLiveSessionCancelled);
    socket.on('session_authorized_and_ready', handleSessionAuthorizedAndReady);
    socket.on('session_cancelled_payment_failed', handleSessionCancelledPaymentFailed);
    socket.on('require_reauthorization', handleReauthRequired);
    socket.on('payment_failed_wrap_up', handlePaymentFailedWrapUp);

     return () => {
      logger.debug(`[useLiveSessionManager | useEffect CLEANUP] Tearing down STABLE socket listeners.`);
      socket.off('live_session_request', handleLiveSessionRequest);
      socket.off('live_session_accepted', handleLiveSessionAccepted);
      socket.off('live_session_declined', handleLiveSessionDeclined);
      socket.off('live_session_cancelled_by_client', handleLiveSessionCancelled);
      socket.off('session_authorized_and_ready', handleSessionAuthorizedAndReady);
      socket.off('session_cancelled_payment_failed', handleSessionCancelledPaymentFailed);
      socket.off('require_reauthorization', handleReauthRequired);
      socket.off('payment_failed_wrap_up', handlePaymentFailedWrapUp);
    };
  }, [socket, isConnected, user, navigate, resetOutgoingRequest]);
  
   return {
    incomingRequests,
    outgoingRequestStatus,
    sessionId,
    sessionInfo,
    clientPaymentFailed,
    reauthRequired,
    sessionWarning,
    requestLiveSession,
    acceptLiveSession,
    declineLiveSession,
    cancelLiveSessionRequest,
    submitReauthorizationResult,
    clearIncomingRequests,
    resetOutgoingRequest,
    clearClientPaymentFailed,
    clearReauthRequired,
    clearSessionWarning,
  };
};