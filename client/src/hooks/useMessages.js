// src/hooks/useMessages.js
import { useInfiniteQuery, useQueryClient } from 'react-query';
import { useCallback, useMemo, useEffect, useRef } from 'react';
import { getMessages } from '../services/messageAPI';
import { logger } from '../utils/logger';
import { useAuth } from '../contexts/AuthContext';
import { debounce } from 'lodash';

export const messageKeys = {
  all: ['messages'],
  list: (conversationId) => [...messageKeys.all, 'list', conversationId],
  infiniteList: (conversationId) => [...messageKeys.all, 'infiniteList', conversationId],
};

export const useMessages = (conversationId) => {
  const { user } = useAuth();
  const userId = user?._id;
  const queryClient = useQueryClient();
  const queryKey = messageKeys.infiniteList(conversationId);
  const messageListRef = useRef(null);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
    isFetched,
    dataUpdatedAt,
  } = useInfiniteQuery(
    queryKey,
    async ({ pageParam = 1 }) => {
      if (!conversationId) {
        logger.error('[useMessages] Cannot fetch messages: missing conversationId', {
          userId,
          conversationId,
          timestamp: new Date().toISOString(),
        });
        throw new Error('Conversation ID required');
      }
      logger.info('[useMessages] Fetching messages for user', {
        userId,
        conversationId,
        pageParam,
        timestamp: new Date().toISOString(),
      });
      const result = await getMessages(conversationId, pageParam, 30);
      result.messages = result.messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      logger.info('[useMessages] Fetched messages', {
        userId,
        conversationId,
        page: pageParam,
        messageCount: result?.messages?.length || 0,
        totalMessages: result?.totalMessages || 0,
        timestamp: new Date().toISOString(),
      });
      return result;
    },
    {
      enabled: !!conversationId,
      getNextPageParam: (lastPage, allPages) => {
        const currentPage = lastPage?.currentPage || 1;
        const totalPages = lastPage?.totalPages || 1;
        return currentPage < totalPages ? currentPage + 1 : undefined;
      },
      onError: (err) => {
        logger.error('[useMessages] Failed to fetch messages for user', {
          userId,
          conversationId,
          error: err.message,
          timestamp: new Date().toISOString(),
        });
      },
      keepPreviousData: true,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      staleTime: 15 * 60 * 1000,
      cacheTime: 30 * 60 * 1000,
    }
  );

  useEffect(() => {
    if (conversationId && isFetched) {
      logger.debug('[useMessages] Message query data updated for user', {
        userId,
        conversationId,
        pageCount: data?.pages?.length,
        lastPageMsgCount: data?.pages?.[data.pages.length - 1]?.messages?.length,
        dataUpdatedAt: new Date(dataUpdatedAt).toISOString(),
        timestamp: new Date().toISOString(),
      });
    }
  }, [data, dataUpdatedAt, isFetched, conversationId, userId]);

  const messages = useMemo(() => {
    const startTime = performance.now();
    const flatMessages = data?.pages?.flatMap(page => page.messages) ?? [];
    const sortedMessages = flatMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const endTime = performance.now();
    logger.debug('[useMessages] Computed messages for user', {
      userId,
      conversationId,
      messageCount: sortedMessages.length,
      firstMessageId: sortedMessages.length > 0 ? sortedMessages[0]?._id : 'none',
      lastMessageId: sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1]?._id : 'none',
      duration: `${(endTime - startTime).toFixed(2)}ms`,
      timestamp: new Date().toISOString(),
    });
    return sortedMessages;
  }, [data, dataUpdatedAt, conversationId, userId]);

  const scrollToBottom = useCallback(() => {
    const messageList = document.querySelector('.message-list');
    if (messageList) {
      messageList.scrollTo({
        top: messageList.scrollHeight,
        behavior: 'smooth',
      });
      logger.debug('[useMessages] Scrolled to bottom', {
        conversationId,
        userId,
        scrollHeight: messageList.scrollHeight,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.warn('[useMessages] Message list not found for scrollToBottom', {
        conversationId,
        userId,
        timestamp: new Date().toISOString(),
      });
    }
  }, [conversationId, userId]);

  useEffect(() => {
    if (messages.length > 0 && !isFetchingNextPage) {
      const messageList = document.querySelector('.message-list');
      const isNearBottom = messageList && (messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 100);
  
      if (isNearBottom || messages.length === data?.pages?.[0]?.messages?.length) {
        scrollToBottom();
      }
    }
  }, [messages, isFetchingNextPage, scrollToBottom, data]);

  logger.debug('[useMessages] Hook rendered for user', {
    userId,
    conversationId,
    status,
    messageCount: messages.length,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    error: error?.message,
    timestamp: new Date().toISOString(),
  });

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    const handleScroll = debounce(() => {
      const messageList = document.querySelector('.message-list');
      if (!messageList) {
        logger.warn('[useMessages] Message list not found for scroll handling', {
          conversationId,
          userId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const scrollTop = messageList.scrollTop;
      if (scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
        logger.debug('[useMessages] Triggering fetchNextPage on scroll', {
          conversationId,
          userId,
          scrollTop,
          timestamp: new Date().toISOString(),
        });
        fetchNextPage();
      }
    }, 500, { leading: true, trailing: false });

    const messageList = document.querySelector('.message-list');
    if (messageList) {
      messageList.addEventListener('scroll', handleScroll);
      logger.debug('[useMessages] Attached scroll listener for pagination', {
        conversationId,
        userId,
        timestamp: new Date().toISOString(),
      });
    }

    return () => {
      if (messageList) {
        messageList.removeEventListener('scroll', handleScroll);
        logger.debug('[useMessages] Removed scroll listener for pagination', {
          conversationId,
          userId,
          timestamp: new Date().toISOString(),
        });
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, conversationId, userId]);

  return {
    messages,
    error,
    fetchNextPage,
    hasNextPage,
    isLoading: status === 'loading',
    isFetchingMore: isFetchingNextPage,
    scrollToBottom,
  };
};