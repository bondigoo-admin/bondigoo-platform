
import React, { useRef, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import MessageItem from './MessageItem';
import { logger } from '../../utils/logger';
import { format, isToday, isYesterday } from 'date-fns';
import { debounce } from 'lodash';
import { useTranslation } from 'react-i18next';

const MessageList = ({ messages, isLoading, fetchNextPage, hasNextPage, isFetchingMore, activeConversationId, currentUserId, onDeleteMessage, activeConversation }) => {
  const { user } = useAuth();
  const { t } = useTranslation(['messaging', 'common']);
  const listRef = useRef(null);
  const observerRef = useRef(null);
  const topSentinelRef = useRef(null);
  const lastScrollHeightRef = useRef(0); // Track scrollHeight to maintain position

  const formatDateHeader = (date) => {
    const parsedDate = new Date(date);
    if (isToday(parsedDate)) return t('common:today');
    if (isYesterday(parsedDate)) return t('common:yesterday');
    return format(parsedDate, 'd MMM, yyyy');
  };

  const groupedMessages = messages.reduce((acc, msg, index) => {
    if (!msg || !msg.createdAt || !msg._id) {
      logger.warn('[MessageList] Skipping invalid message', { index, msg, conversationId: activeConversationId });
      return acc;
    }
    const date = new Date(msg.createdAt).toDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push({ msg, index });
    return acc;
  }, {});

  logger.info('[MessageList] Rendering message list', {
    conversationId: activeConversationId,
    messageCount: messages.length,
    isLoading,
    isFetchingMore,
    hasNextPage,
    timestamp: new Date().toISOString(),
  });

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      const listEl = listRef.current;
      const prevScrollHeight = lastScrollHeightRef.current;
      lastScrollHeightRef.current = listEl.scrollHeight;

      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        listEl.scrollTop = listEl.scrollHeight;
        logger.debug('[MessageList] Scrolled to bottom', {
          conversationId: activeConversationId,
          prevScrollTop: listEl.scrollTop,
          newScrollTop: listEl.scrollHeight,
          scrollHeight: listEl.scrollHeight,
          prevScrollHeight,
          timestamp: new Date().toISOString(),
        });
      });
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (!listRef.current || messages.length === 0) return;
  
    const listEl = listRef.current;
    const isInitialLoad = !lastScrollHeightRef.current;
    const isNearBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 100;
  
    logger.debug('[MessageList] Scroll effect triggered', {
      conversationId: activeConversationId,
      messageCount: messages.length,
      isInitialLoad,
      isNearBottom,
      scrollTop: listEl.scrollTop,
      scrollHeight: listEl.scrollHeight,
      clientHeight: listEl.clientHeight,
      isLoading,
      timestamp: new Date().toISOString(),
    });
  
    if (!isLoading && (isInitialLoad || isNearBottom)) {
      scrollToBottom();
    }
  }, [messages, isLoading, scrollToBottom, activeConversationId]);

  const observeCallback = useCallback(
    debounce((entries) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingMore) {
        logger.debug('[MessageList] Fetching older messages', { conversationId: activeConversationId });
        fetchNextPage();
      }
    }, 500, { leading: true, trailing: false }),
    [fetchNextPage, hasNextPage, isFetchingMore, activeConversationId]
  );

  useEffect(() => {
    const options = {
      root: listRef.current,
      rootMargin: '100px',
      threshold: 0,
    };
    observerRef.current = new IntersectionObserver(observeCallback, options);
    if (topSentinelRef.current) {
      observerRef.current.observe(topSentinelRef.current);
    }
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [observeCallback]);

  return (
    <div ref={listRef} className="chat-panel__message-list-container relative">
      {isLoading && messages.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {isFetchingMore && (
        <div className="absolute left-0 right-0 top-0 z-10 flex h-[50px] items-center justify-center bg-background/70">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-col gap-3 pb-2">
        <div ref={topSentinelRef} style={{ height: '1px' }} aria-hidden="true"></div>
        {Object.keys(groupedMessages)
          .sort((a, b) => new Date(a) - new Date(b))
          .map((date) => (
            <React.Fragment key={date}>
              <div className="mx-auto my-2 w-fit rounded-md bg-muted px-3 py-1 text-center text-xs leading-normal text-muted-foreground">
                {formatDateHeader(date)}
              </div>
              {groupedMessages[date].map(({ msg, index }) => {
                const prevMsg = messages[index - 1];
                const isSent = msg.senderId?._id?.toString() === user?._id || msg.senderId === user?._id;
                const showAvatar =
                  index === 0 ||
                  msg.senderId?._id?.toString() !== prevMsg?.senderId?._id?.toString() ||
                  msg.senderId !== prevMsg?.senderId ||
                  (prevMsg && new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() > 5 * 60 * 1000);
                
                  const conversationType = activeConversation?.type || (activeConversation?.participants?.length > 2 ? 'group' : 'one-on-one');
                  const participantCount = activeConversation?.participants?.length || 2;

                return (
                 <MessageItem
                  key={msg._id}
                  message={msg}
                  isSent={isSent}
                  showAvatar={showAvatar}
                  conversationParticipantCount={participantCount}
                  conversationType={conversationType}
                  currentUserId={currentUserId}
                  onDeleteMessage={onDeleteMessage}
              />
                );
              })}
            </React.Fragment>
          ))}
      </div>
    </div>
  );
};

MessageList.propTypes = {
  messages: PropTypes.array.isRequired,
  isLoading: PropTypes.bool.isRequired,
  fetchNextPage: PropTypes.func.isRequired,
  hasNextPage: PropTypes.bool,
  isFetchingMore: PropTypes.bool.isRequired,
  activeConversationId: PropTypes.string,
  activeConversation: PropTypes.object,
  currentUserId: PropTypes.string.isRequired,
  onDeleteMessage: PropTypes.func.isRequired,
};

export default MessageList;