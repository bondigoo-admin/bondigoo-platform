import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import ConversationList from './ConversationList';
import ChatPanel from './ChatPanel';
import NewMessageModal from './NewMessageModal';
import { useMutation, useQueryClient } from 'react-query';
import { createOrGetConversation, markConversationAsRead } from '../../services/messageAPI';
import { logger } from '../../utils/logger';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificationSocket } from '../../contexts/SocketContext';
import { SOCKET_EVENTS } from '../../constants/socketEvents';
import { Button } from '../ui/button.tsx';
import { MessageSquarePlus } from 'lucide-react';
import ErrorBoundary from '../ErrorBoundary';
import { useConnectionManagement } from '../../hooks/useConnectionManagement';

const conversationKeys = {
  all: (userId) => ['conversations', userId],
  list: (userId, params) => [...conversationKeys.all(userId), 'list', params],
};

const MessagingCenter = () => {
  const { t } = useTranslation(['messaging', 'common']);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?._id;
  const { socket, isConnected } = useNotificationSocket();
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [isNewMessageModalOpen, setIsNewMessageModalOpen] = useState(false);
  const { blockedUserIds } = useConnectionManagement();

  useEffect(() => {
    // This redundant listener has been removed. 
    // The useGlobalSocketListener will handle incoming new conversations.
    logger.info('[MessagingCenter] Initialized. Relies on useGlobalSocketListener for new conversation events.');
  }, []);

  useEffect(() => {
    if (activeConversationId && blockedUserIds.length > 0) {
      const conversation = queryClient
        .getQueryData(conversationKeys.list(userId, { page: 1, limit: 20 }))
        ?.conversations.find((c) => c._id === activeConversationId);

      if (conversation?.otherParticipant?._id && blockedUserIds.includes(conversation.otherParticipant._id)) {
        logger.info('[MessagingCenter] Active conversation participant is blocked. Closing chat panel.', {
          conversationId: activeConversationId,
          blockedUserId: conversation.otherParticipant._id,
          userId,
        });
        setActiveConversationId(null);
        toast.success(t('messaging:chatClosedUserBlocked', 'This chat is no longer available.'));
      }
    }
  }, [activeConversationId, blockedUserIds, queryClient, setActiveConversationId, userId, t]);

  const markAsReadMutation = useMutation(
    ({ recipientUserId, conversationId }) => markConversationAsRead({ recipientUserId, conversationId }),
    {
      onSuccess: (data, { recipientUserId, conversationId }) => {
        logger.info('[MessagingCenter] Conversation marked as read', {
          recipientUserId,
          userId,
          conversationId,
          timestamp: new Date().toISOString(),
        });
        if (socket && isConnected) {
          const conversation = queryClient
            .getQueryData(conversationKeys.list(userId, { page: 1, limit: 20 }))
            ?.conversations.find((c) => c._id === conversationId);
          if (conversation) {
            queryClient.setQueryData(conversationKeys.list(userId, { page: 1, limit: 20 }), (oldData) => {
              if (!oldData || !oldData.conversations) return oldData;
              return {
                ...oldData,
                conversations: oldData.conversations.map((conv) =>
                  conv._id === conversationId ? { ...conv, unreadCount: 0 } : conv
                ),
              };
            });
            const payload = { conversationId, readerUserId: userId };
            logger.debug('[MessagingCenter] Emitting CONVERSATION_READ', {
              payload,
              socketId: socket.id,
              timestamp: new Date().toISOString(),
            });
            socket.emit(SOCKET_EVENTS.MESSAGING.CONVERSATION_READ, payload);
          } else {
            logger.warn('[MessagingCenter] Conversation not found for read event', {
              recipientUserId,
              conversationId,
              userId,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          logger.warn('[MessagingCenter] Socket not connected for CONVERSATION_READ', {
            recipientUserId,
            conversationId,
            userId,
            isConnected: socket?.connected,
            timestamp: new Date().toISOString(),
          });
        }
      },
      onError: (error, { recipientUserId, conversationId }) => {
        logger.error('[MessagingCenter] Failed to mark conversation as read', {
          error: error.message,
          recipientUserId,
          conversationId,
          userId,
          timestamp: new Date().toISOString(),
        });
        toast.error(t('messaging:errorMarkAsRead'));
      },
    }
  );

const createConversationMutation = useMutation(
    createOrGetConversation,
    {
      onSuccess: (conversation) => {
        logger.info('[MessagingCenter] Conversation created/retrieved', {
          conversationId: conversation._id,
          userId,
          timestamp: new Date().toISOString(),
        });
        queryClient.setQueryData(conversationKeys.list(userId, { page: 1, limit: 20 }), (oldData) => {
          if (!oldData) return { conversations: [conversation], totalPages: 1, currentPage: 1 };
          const exists = oldData.conversations.some((c) => c._id === conversation._id);
          return exists
            ? oldData
            : {
                ...oldData,
                conversations: [conversation, ...oldData.conversations].sort(
                  (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
                ),
              };
        });
        queryClient.invalidateQueries(conversationKeys.all(userId));
      },
      onError: (error) => {
        logger.error('[MessagingCenter] Failed to create conversation', {
          error: error.message,
          userId,
          timestamp: new Date().toISOString(),
        });
        toast.error(t('messaging:errorStartConversation'));
      },
    }
  );

const handleInitiateConversationChange = useCallback(
    (conversationId) => {
      if (!conversationId || conversationId === activeConversationId) {
        return;
      }

      logger.info('[MessagingCenter] Changing active conversation', { conversationId, userId });
      setActiveConversationId(conversationId);

      const allConversations = queryClient.getQueryData(conversationKeys.list(userId, { page: 1, limit: 20 }))?.conversations || [];
      const conversation = allConversations.find((c) => c._id === conversationId);

      if (!conversation) {
        logger.error('[MessagingCenter] CRITICAL: Conversation not found in cache after click.', { conversationId, userId });
        toast.error(t('messaging:errorSelectConversation'));
        return;
      }

      let recipientUserIdForApi;
      if (conversation.type === 'group' || conversation.type === 'broadcast') {
        const otherMember = conversation.participants.find(p => p._id !== userId);
        recipientUserIdForApi = otherMember?._id;
        logger.debug('[MessagingCenter] Group conversation selected.', { conversationId, type: conversation.type, recipientForApi: recipientUserIdForApi });
      } else {
        recipientUserIdForApi = conversation.otherParticipant?._id;
        logger.debug('[MessagingCenter] One-on-one conversation selected.', { conversationId, type: 'one-on-one', recipient: recipientUserIdForApi });
      }

      if (!recipientUserIdForApi) {
        logger.error('[MessagingCenter] Could not determine a recipient user ID to mark conversation as read.', { conversationId, userId });
        return;
      }

      if (conversation.unreadCount > 0) {
        logger.debug('[MessagingCenter] Initiating mark as read.', { conversationId, userId });
        markAsReadMutation.mutate({ recipientUserId: recipientUserIdForApi, conversationId });
      }
    },
    [activeConversationId, userId, queryClient, markAsReadMutation, t]
);

const handleRecipientSelect = useCallback(
    (recipientOrConversation) => {
      setIsNewMessageModalOpen(false);
      if (recipientOrConversation.type === 'group' || recipientOrConversation.type === 'broadcast') {
        logger.info('[MessagingCenter] New group created, setting as active', {
          conversationId: recipientOrConversation._id,
          userId,
        });
        setActiveConversationId(recipientOrConversation._id);
      } else {
        logger.info('[MessagingCenter] Creating one-on-one conversation with recipient', {
          recipientId: recipientOrConversation._id,
          userId,
        });
        createConversationMutation.mutate(
          { recipientId: recipientOrConversation._id, contextType: null, contextId: null },
          {
            onSuccess: (data) => {
              const newConversation = data.conversation || data;
              handleInitiateConversationChange(newConversation._id);
            },
          }
        );
      }
    },
    [createConversationMutation, handleInitiateConversationChange, userId]
);

  return (
    <ErrorBoundary>
      <div className="flex h-full w-full overflow-hidden rounded-lg border bg-card text-card-foreground">
        <div
          className={`${
            activeConversationId ? 'hidden' : 'flex'
          } w-full flex-col border-r bg-background md:flex md:w-[300px] md:flex-shrink-0 lg:w-[350px]`}
        >
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-xl font-semibold tracking-tight">{t('messaging:title')}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsNewMessageModalOpen(true)}
              aria-label={t('messaging:newMessageTitle')}
            >
              <MessageSquarePlus size={20} />
            </Button>
          </div>
          <ConversationList
            onInitiateConversationChange={handleInitiateConversationChange}
            activeConversationId={activeConversationId}
          />
        </div>
        <div className={`${activeConversationId ? 'flex' : 'hidden'} flex-1 flex-col md:flex`}>
          <ChatPanel 
            activeConversationId={activeConversationId} 
            onConversationDeleted={() => setActiveConversationId(null)} 
          />
        </div>
      </div>
      <NewMessageModal
        isOpen={isNewMessageModalOpen}
        onClose={() => setIsNewMessageModalOpen(false)}
        onRecipientSelect={handleRecipientSelect}
      />
    </ErrorBoundary>
  );
};

MessagingCenter.propTypes = {};

export default MessagingCenter;