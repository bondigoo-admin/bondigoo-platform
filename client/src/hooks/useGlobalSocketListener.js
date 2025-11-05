import { useEffect } from 'react';
import { useQueryClient } from 'react-query';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import { useNotificationSocket } from '../contexts/SocketContext';
import { SOCKET_EVENTS } from '../constants/socketEvents';
import { messageKeys } from './useMessages';

const conversationKeys = {
  all: ['conversations'],
  list: (params) => [...conversationKeys.all, 'list', params],
};

export const useGlobalSocketListener = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { socket, isConnected } = useNotificationSocket();
  const userId = user?._id;

  useEffect(() => {
    logger.info('[useGlobalSocketListener] Hook effect executed.', {
      userId,
      hasSocket: !!socket,
      isConnected,
    });
    const token = localStorage.getItem('token');
   
    if (!userId || !token || !socket || !isConnected) {
      logger.warn('[useGlobalSocketListener] Skipping socket listeners - prerequisites missing', {
        userId,
        hasToken: !!token,
        hasSocket: !!socket,
        isConnected,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const handleAnyEvent = (event, ...args) => {
      logger.info(`[SocketIO] <<< INCOMING EVENT: "${event}"`, {
        payload: args,
        userId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    };
    socket.onAny(handleAnyEvent);

    const handleInvalidateNotifications = () => {
      logger.info('[SocketListener] Received invalidate_notifications_client. Invalidating notifications query.');
      queryClient.invalidateQueries(['notifications']);
    };

    const handleBookingUpdate = (data) => {
      const { bookingId, bookingData } = data;
      if (!bookingId || !bookingData) {
        logger.warn('[useGlobalSocketListener] Invalid BOOKING_UPDATE data received', { data });
        return;
      }
    
      logger.info('[useGlobalSocketListener] Received BOOKING_UPDATE, updating cache.', { bookingId, newStatus: bookingData.status });
    
      queryClient.setQueryData(['booking', bookingId], bookingData);
    
      queryClient.invalidateQueries(['userSessions']);
      queryClient.invalidateQueries(['userCalendar']);
    };

    const handleBookingStatusUpdate = (data) => {
      const { bookingId, status } = data;
      if (!bookingId) {
        logger.warn('[useGlobalSocketListener] Invalid BOOKING_STATUS_UPDATE data received', { data });
        return;
      }
    
      logger.info('[useGlobalSocketListener] Received BOOKING_STATUS_UPDATE, invalidating queries.', { bookingId, newStatus: status });
    
      queryClient.invalidateQueries(['booking', bookingId]);
    
      queryClient.invalidateQueries(['userSessions']);
      queryClient.invalidateQueries(['userCalendar']);
      queryClient.invalidateQueries(['coachSessions']);
    };

    const handleAvailabilityUpdate = (data) => {
      logger.info('[useGlobalSocketListener] Received AVAILABILITY_UPDATE, invalidating calendar/session queries.', { data });
      queryClient.invalidateQueries(['userSessions']);
      queryClient.invalidateQueries(['userCalendar']);
      queryClient.invalidateQueries(['coachSessions']);
      queryClient.invalidateQueries(['manageSessionsData']);
    };

     const handleNewConversation = (data) => {
      const { conversation } = data;
      if (!conversation?._id) {
        logger.warn('[useGlobalSocketListener] Invalid NEW_CONVERSATION data received', {
          data,
          userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.info('[useGlobalSocketListener] Received NEW_CONVERSATION, performing optimistic update.', {
        conversationId: conversation._id,
        type: conversation.type,
        userId,
      });

      queryClient.setQueryData(conversationKeys.list({ page: 1, limit: 20 }), (oldData) => {
        if (!oldData || !oldData.conversations) {
          return { conversations: [conversation], totalPages: 1, currentPage: 1 };
        }
        const conversationExists = oldData.conversations.some(c => c._id === conversation._id);
        if (conversationExists) {
          return oldData;
        }
        const updatedConversations = [conversation, ...oldData.conversations]
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return { ...oldData, conversations: updatedConversations };
      });
    };

    const handleNewMessage = (data) => {
      logger.info('[useGlobalSocketListener] RAW NEW_MESSAGE event received.', { rawData: data });

      const { messageObject } = data;
      if (!messageObject?.conversationId || !messageObject._id) {
        logger.warn('[useGlobalSocketListener] Invalid NEW_MESSAGE data', {
          messageId: messageObject?._id,
          conversationId: messageObject?.conversationId,
          senderId: messageObject?.senderId,
          recipientId: userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.info('[useGlobalSocketListener] Received NEW_MESSAGE, invalidating queries.', {
        conversationId: messageObject.conversationId,
        messageId: messageObject._id,
        userId: userId,
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });

      queryClient.invalidateQueries(conversationKeys.all);
      queryClient.invalidateQueries(messageKeys.infiniteList(messageObject.conversationId));
    };

    const handleConversationRead = (data) => {
      const { conversationId, readerUserId } = data;
      if (!conversationId || !readerUserId) {
        logger.warn('[useGlobalSocketListener] Invalid CONVERSATION_READ data', {
          conversationId,
          readerUserId,
          recipientId: userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
        return;
      }

    

      queryClient.setQueryData(conversationKeys.list({ page: 1, limit: 20 }), (oldData) => {
        if (!oldData || !oldData.conversations) {
          logger.debug('[useGlobalSocketListener] No conversation data to update for read event', {
            conversationId,
            readerUserId,
            recipientId: userId,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
          });
          return oldData;
        }

        const updatedConversations = oldData.conversations.map((conv) => {
          if (conv._id === conversationId && readerUserId === userId) {
            logger.debug('[useGlobalSocketListener] Resetting unread count for user', {
              conversationId,
              readerUserId,
              recipientId: userId,
              socketId: socket.id,
              timestamp: new Date().toISOString(),
            });
            return { ...conv, unreadCount: 0 };
          }
          return conv;
        });

        return { ...oldData, conversations: updatedConversations };
      });

     
    };

    socket.on('invalidate_notifications_client', handleInvalidateNotifications);
    socket.on('booking_update', handleBookingUpdate);
    socket.on('booking_status_update', handleBookingStatusUpdate);
    socket.on('availability_update', handleAvailabilityUpdate);
    socket.on(SOCKET_EVENTS.MESSAGING.NEW_CONVERSATION, handleNewConversation);
    socket.on(SOCKET_EVENTS.MESSAGING.NEW_MESSAGE, handleNewMessage);
    socket.on(SOCKET_EVENTS.MESSAGING.CONVERSATION_READ, handleConversationRead);

    const handleConnect = () => {
      logger.info('[useGlobalSocketListener] Socket connected', {
        socketId: socket.id,
        userId,
        timestamp: new Date().toISOString(),
      });
    };

    const handleDisconnect = (reason) => {
      logger.warn('[useGlobalSocketListener] Socket disconnected', {
        reason,
        socketId: socket.id,
        userId,
        timestamp: new Date().toISOString(),
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.offAny(handleAnyEvent);
      socket.off('invalidate_notifications_client', handleInvalidateNotifications);
      socket.off('booking_update', handleBookingUpdate);
      socket.off('booking_status_update', handleBookingStatusUpdate);
      socket.off('availability_update', handleAvailabilityUpdate);
      socket.off(SOCKET_EVENTS.MESSAGING.NEW_CONVERSATION, handleNewConversation);
      socket.off(SOCKET_EVENTS.MESSAGING.NEW_MESSAGE, handleNewMessage);
      socket.off(SOCKET_EVENTS.MESSAGING.CONVERSATION_READ, handleConversationRead);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
  
    };
  }, [userId, queryClient, socket, isConnected]);
};