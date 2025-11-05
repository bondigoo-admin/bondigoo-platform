import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { logger } from '../utils/logger';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// --- Main Application Socket (Notifications, Presence, etc.) ---
const NotificationSocketContext = createContext(null);

export const NotificationSocketProvider = ({ children, userId, token }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    logger.info('[NotificationSocketProvider] Effect triggered.', { userId, hasToken: !!token });
    if (userId && token) {
      logger.info('[NotificationSocketProvider] Creating new socket instance.', { userId });
      const newSocket = io(SOCKET_URL, {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        autoConnect: false,
        auth: { userId, token },
      });
      setSocket(newSocket);

      return () => {
        logger.info('[NotificationSocketProvider] Cleanup: Disconnecting socket.', { userId: newSocket.auth.userId });
        newSocket.disconnect();
        setSocket(null);
        setIsConnected(false);
      };
    } else {
      logger.warn('[NotificationSocketProvider] Did not create socket. Credentials missing.', { userId, hasToken: !!token });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

   useEffect(() => {
    if (!socket) {
      logger.debug('[NotificationSocketProvider] Socket connection effect skipped: socket is null.');
      return;
    }

    const handleConnect = () => {
      logger.info(`[NotificationSocketProvider] Socket connected successfully. ID: ${socket.id}`);
      setIsConnected(true);
    }
    const handleDisconnect = (reason) => {
      logger.warn(`[NotificationSocketProvider] Socket disconnected. Reason: ${reason}`);
      setIsConnected(false);
    }
    
    logger.info('[NotificationSocketProvider] Attaching connect/disconnect listeners and initiating connection.');
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  const contextValue = useMemo(() => ({ socket, isConnected }), [socket, isConnected]);

  return (
    <NotificationSocketContext.Provider value={contextValue}>
      {children}
    </NotificationSocketContext.Provider>
  );
};

export const useNotificationSocket = () => {
  const context = useContext(NotificationSocketContext);
  if (!context) {
    throw new Error('useNotificationSocket must be used within a NotificationSocketProvider');
  }
  return context;
};

// --- Video Conference Socket (Scoped to /video namespace) ---
const VideoSocketContext = createContext(null);

export const SocketProvider = ({ children, userId, sessionId, token }) => {
  const [videoSocket, setVideoSocket] = useState(null);
  const [isVidConnected, setIsVidConnected] = useState(false);

  useEffect(() => {
    if (userId && sessionId && token) {
      const newVideoSocket = io(`${SOCKET_URL}/video`, {
        withCredentials: true,
        transports: ['websocket'],
        autoConnect: false,
        auth: { token },
        query: { sessionId, token, userId },
      });
      setVideoSocket(newVideoSocket);

      return () => {
        newVideoSocket.disconnect();
      };
    }
  }, [userId, sessionId, token]);

  useEffect(() => {
    if (!videoSocket) return;
    const handleConnect = () => {
      logger.info(`[SocketProvider:/video] Connect event fired. Socket ID: ${videoSocket.id}`);
      setIsVidConnected(true);
    }
    const handleDisconnect = () => setIsVidConnected(false);
    videoSocket.on('connect', handleConnect);
    videoSocket.on('disconnect', handleDisconnect);
    if (!videoSocket.connected) {
      videoSocket.connect();
    }
    return () => {
      videoSocket.off('connect', handleConnect);
      videoSocket.off('disconnect', handleDisconnect);
    };
  }, [videoSocket]);

  const contextValue = useMemo(() => ({
    socket: videoSocket,
    isConnected: isVidConnected,
  }), [videoSocket, isVidConnected]);

  return (
    <VideoSocketContext.Provider value={contextValue}>
      {children}
    </VideoSocketContext.Provider>
  );
};

export const useVideoSocket = () => {
  const context = useContext(VideoSocketContext);
  if (context === null) {
    throw new Error('useVideoSocket must be used within a SocketProvider');
  }
  return context;
};