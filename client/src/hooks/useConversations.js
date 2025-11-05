
import { useQuery, useQueryClient } from 'react-query';
import { getConversations } from '../services/messageAPI';
import { logger } from '../utils/logger';
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationSocket } from '../contexts/SocketContext';

const conversationKeys = {
  all: (userId) => ['conversations', userId],
  list: (userId, params) => [...conversationKeys.all(userId), 'list', params],
};

export const useConversations = (page = 1, limit = 20, activeConversationId) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?._id;
  const { socket, isConnected } = useNotificationSocket();
  const queryKey = conversationKeys.list(userId, { page, limit });

  const queryResult = useQuery(
    queryKey,
    () => {
    
      return getConversations(page, limit);
    },
    {
      enabled: !!userId,
      keepPreviousData: true,
      staleTime: 5 * 60 * 1000,
      cacheTime: 15 * 60 * 1000,
      onError: (error) => {
        logger.error('[useConversations] Query failed', { queryKey, error: error.message });
      },
      onSuccess: (data) => {
        logger.info('[useConversations] Query succeeded', { queryKey, count: data?.conversations?.length });
      },
    }
  );

  useEffect(() => {
    if (!socket || !isConnected || !userId) {
      logger.warn('[useConversations] Skipping socket listeners - Prerequisites missing', {
        hasSocket: !!socket,
        isConnected,
        userId,
        timestamp: new Date().toISOString(),
      });
    }
  }, [socket, isConnected, userId]);

  const refetchConversations = () => {
    queryClient.invalidateQueries(conversationKeys.all(userId));
  };
  
  return {
    ...queryResult,
    conversations: queryResult.data?.conversations || [],
    totalPages: queryResult.data?.totalPages || 0,
    currentPage: queryResult.data?.currentPage || 1,
    totalConversations: queryResult.data?.totalConversations || 0,
    refetchConversations,
  };
};