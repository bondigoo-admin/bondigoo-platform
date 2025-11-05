// client/src/hooks/useSocket.js
import { useEffect, useMemo, useState } from 'react';
import io from 'socket.io-client';
import { logger } from '../utils/logger';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const useSocket = (userId, sessionId, token, isCoach, namespace = '') => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const socket = useMemo(() => {
    if (!sessionId || !token) {
      logger.error('[useSocket] Cannot create socket: Missing required parameters', {
        userId,
        hasSessionId: !!sessionId,
        hasToken: !!token,
      });
      return null;
    }

    const socketInstance = io(`${SOCKET_URL}${namespace}`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      path: '/socket.io',
      autoConnect: false,
      auth: { userId: userId || 'anonymous', token },
      query: { sessionId, token, userId: userId || 'anonymous' },
    });

    if (!userId) {
      logger.warn('[useSocket] userId not provided, using "anonymous"', { sessionId, hasToken: !!token });
    }

    return socketInstance;
  }, [userId, sessionId, token, namespace]);

  useEffect(() => {
    if (!socket) {
      setIsConnected(false);
      setConnectionError('Missing sessionId or token for socket creation.');
      return;
    }

    if (socket.connected || socket.connecting) {
      logger.debug('[useSocket] Socket already connected or connecting.', {
        socketId: socket.id,
        sessionId,
        userId,
      });
      setIsConnected(socket.connected);
      return;
    }

    logger.info('[useSocket] Attempting to connect socket...', { sessionId, userId, namespace });
    socket.connect();

    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError(null);
      logger.info('[useSocket] Socket connected', { socketId: socket.id, sessionId, userId, namespace });
    };

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      setConnectionError(`Disconnected: ${reason}`);
      logger.warn('[useSocket] Socket disconnected', { reason, sessionId, userId, namespace });
      if (reason === 'io server disconnect') {
        setTimeout(() => {
          if (!socket.connected) socket.connect();
        }, 1500);
      }
    };

    const handleConnectError = (error) => {
      setIsConnected(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setConnectionError(`Connection Error: ${errorMessage}`);
      logger.error('[useSocket] Socket connection error', { error: errorMessage, sessionId, userId, namespace });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    return () => {
      logger.info('[useSocket] Cleaning up socket instance.', { socketId: socket?.id, sessionId, userId, namespace });
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      if (socket.connected || socket.connecting) {
        socket.disconnect();
        logger.info('[useSocket] Socket disconnected via cleanup.', { sessionId, userId, namespace });
      }
      setIsConnected(false);
      setConnectionError(null);
    };
  }, [socket, sessionId, userId, namespace]);

  return { socket, isConnected, connectionError };
};

export default useSocket;