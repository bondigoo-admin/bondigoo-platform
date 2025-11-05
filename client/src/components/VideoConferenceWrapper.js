// START OF FILE VideoConferenceWrapper.js
import React, { useEffect, useState, useContext } from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import io from 'socket.io-client';
import { getSessionDetails } from '../services/sessionAPI';
import VideoConference from './VideoConference';
import { logger } from '../utils/logger';
import { AuthContext } from '../contexts/AuthContext';
import { SocketProvider } from '../contexts/SocketContext';

const VideoConferenceWrapper = ({ onJoin: parentOnJoin }) => {
  const { roomId } = useParams();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  // Explicitly get token from URL for validation API
  const tokenFromUrl = searchParams.get('token');
  const [sessionDetails, setSessionDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [isWaiting, setIsWaiting] = useState(true);

  // Get userId and auth loading state from AuthContext
  const { userId, loading: authLoading } = useContext(AuthContext);
  // Get auth token from storage for other potential uses (like socket)
  const tokenFromStorage = localStorage.getItem('token');

  useEffect(() => {
    logger.info('[VideoConferenceWrapper] Initializing', {
      roomId,
      urlToken: tokenFromUrl,
      storageTokenPresent: !!tokenFromStorage,
      userIdFromAuth: userId,
      isAuthLoading: authLoading
    });
  
    if (!roomId || !tokenFromUrl) {
      logger.error('[VideoConferenceWrapper] Missing roomId or tokenFromUrl. Cannot fetch details.', { roomId, hasUrlToken: !!tokenFromUrl });
      setError({ message: "Invalid session link: Missing ID or token." });
      setIsLoading(false);
      return;
    }
    if (authLoading) {
      logger.info('[VideoConferenceWrapper] Waiting for authentication to finish...');
      return;
    }
    if (!userId && !authLoading) {
      logger.warn('[VideoConferenceWrapper] Auth finished but userId is missing. Proceeding with fetch.', { roomId });
    }
  
    const fetchSessionDetails = async () => {
      setIsLoading(true);
      logger.info('[VideoConferenceWrapper] Fetching session details using URL token', { roomId, tokenFromUrl, userId });
      try {
        const details = await getSessionDetails(roomId, tokenFromUrl);
        logger.info('[VideoConferenceWrapper] Session details fetched successfully', { bookingId: details?.bookingId, userRole: details?.userRole });
        setSessionDetails(details);
        const isLive = details.isLiveSession || (details.start && new Date() >= new Date(details.start));
        setIsWaiting(!isLive && details.userRole !== 'coach');
        setStartTime(details.start ? new Date(details.start) : null);
        setError(null);
      } catch (err) {
        setError(err.response?.data || { message: err.message });
        if (err.response?.data?.message === 'Session has not yet started') {
          setStartTime(err.response.data.sessionStart ? new Date(err.response.data.sessionStart) : null);
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchSessionDetails();
  }, [roomId, tokenFromUrl, userId, authLoading, tokenFromStorage]);


  const handleJoin = (config) => {
    logger.info('[VideoConferenceWrapper] handleJoin called', { roomId });
    if (typeof parentOnJoin === 'function') {
      parentOnJoin(config);
    }
    setIsWaiting(false);
  };


  // --- Render Logic ---

  if (!roomId || !tokenFromUrl) {
    logger.warn('[VideoConferenceWrapper] Render: Missing roomId or tokenFromUrl, showing error.', { roomId, hasUrlToken: !!tokenFromUrl });
    return <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>Error: Invalid session link. Missing ID or token.</div>;
  }

  if (authLoading || isLoading) {
      logger.info('[VideoConferenceWrapper] Render: Loading...', { authLoading, isLoading });
      return <div style={{ padding: '20px', textAlign: 'center' }}>Loading session...</div>;
  }

  if (error) {
    logger.error('[VideoConferenceWrapper] Render: Error state', { error });
    if (error.message === 'Session has not yet started' && startTime) {
      logger.info('[VideoConferenceWrapper] Render: Session not started, rendering VideoConference in waiting state with SocketProvider', {
        startTime,
        userId,
        sessionId: roomId,
      });
      const waiting = true;
      return (
        <SocketProvider
          userId={userId || 'anonymous'}
          sessionId={roomId}
          token={tokenFromUrl}
          namespace="/video"
        >
          <VideoConference
            userId={userId}
            bookingId={sessionDetails?.bookingId || ''}
            sessionId={roomId}
            token={tokenFromUrl}
            isWaiting={waiting}
            isCoach={sessionDetails?.userRole === 'coach'}
            onJoin={handleJoin}
            startTime={startTime}
            initialConfig={null}
          />
        </SocketProvider>
      );
    }
    return (
      <div style={{ padding: '20px', color: 'red', textAlign: 'center' }}>
        Error loading session: {error.message || 'Unknown error'}
      </div>
    );
  }

   if (!sessionDetails) {
        // This case should ideally be covered by loading/error states, but as a fallback:
        logger.error('[VideoConferenceWrapper] Render: No session details and no error/loading state.');
        return <div style={{ padding: '20px', color: 'orange', textAlign: 'center' }}>Could not load session details. Please try again.</div>;
   }

  // Render VideoConference normally
  logger.info('[VideoConferenceWrapper] Render: Rendering VideoConference', { userId, isCoach: sessionDetails?.userRole === 'coach', isWaiting });
  return (
    <SocketProvider userId={userId || 'anonymous'} sessionId={roomId} token={tokenFromUrl} namespace="/video">
      <VideoConference
        userId={userId}
        bookingId={sessionDetails?.bookingId || ''}
        sessionId={roomId}
        token={tokenFromUrl}
        isWaiting={isWaiting}
        isCoach={sessionDetails?.userRole === 'coach'}
        onJoin={handleJoin}
        startTime={startTime || sessionDetails.start}
        initialConfig={sessionDetails}
        sessionDuration={sessionDetails.duration}
        isLiveSession={sessionDetails.isLiveSession}
        onSessionStarted={() => {
          logger.info('[VideoConferenceWrapper] Session started, updating isWaiting', { roomId });
          setIsWaiting(false);
        }}
      />
    </SocketProvider>
  );
};

export default VideoConferenceWrapper;