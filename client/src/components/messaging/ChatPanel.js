import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { MessageCircle, Loader2, AlertTriangle, X, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ChatHeader from './ChatHeader';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useMessages } from '../../hooks/useMessages';
import { useConversations } from '../../hooks/useConversations';
import { logger } from '../../utils/logger';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { sendMessage, markConversationAsRead, deleteConversation, deleteMessage, leaveGroup } from '../../services/messageAPI';
import { useMutation, useQueryClient } from 'react-query';
import { useNotificationSocket } from '../../contexts/SocketContext';
import { SOCKET_EVENTS } from '../../constants/socketEvents';
import CustomVideoPlayer from '../player/CustomVideoPlayer.js';
import GroupInfoModal from './GroupInfoModal';
import EditGroupInfoModal from './EditGroupInfoModal';
import AddMembersModal from './AddMembersModal';
import ManageMembersModal from './ManageMembersModal';
import GroupSettingsModal from './GroupSettingsModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog.tsx";


const conversationKeys = {
  all: (userId) => ['conversations', userId],
};
const messageKeys = {
  all: ['messages'],
  list: (conversationId) => [...messageKeys.all, 'list', conversationId],
  infiniteList: (conversationId) => [...messageKeys.all, 'infiniteList', conversationId],
};

const ChatPanel = ({ activeConversationId, onConversationDeleted, onBack }) => {
  const { t } = useTranslation(['messaging', 'common']);
  const { user } = useAuth();
  const userId = user?._id;
  const { socket, isConnected } = useNotificationSocket();
  const queryClient = useQueryClient();
  const {
    messages,
    error: fetchError,
    isLoading: isFetchLoading,
    isFetching: isFetchFetching,
    fetchNextPage,
    hasNextPage: hasMoreMessages,
    isFetchingMore: isFetchingOlderMessages,
  } = useMessages(activeConversationId, {
    enabled: !!activeConversationId,
  });
  const { conversations: conversationList } = useConversations();
  const [typingUsers, setTypingUsers] = useState({});
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const [typingIndicatorText, setTypingIndicatorText] = useState('');
  const [viewerState, setViewerState] = useState({
    isOpen: false,
    mediaItems: [],
    startIndex: 0
  });

   const [modalState, setModalState] = useState({
    info: false,
    edit: false,
    add: false,
    manage: false,
    settings: false,
  });
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);

  const handleModalOpen = (modal) => setModalState(prev => ({ ...prev, [modal]: true }));
  const handleModalClose = (modal) => setModalState(prev => ({ ...prev, [modal]: false }));

  const leaveGroupMutation = useMutation(() => leaveGroup(activeConversationId), {
    onSuccess: () => {
      toast.success(t('messaging:youLeftTheGroup'));
      queryClient.invalidateQueries(conversationKeys.all(userId));
      onConversationDeleted(activeConversationId);
    },
    onError: (error) => {
      toast.error(error.message || t('common:errorGeneric'));
    },
    onSettled: () => {
      setIsLeaveConfirmOpen(false);
      handleModalClose('info');
    }
  });

  const handleLeaveGroup = () => {
    setIsLeaveConfirmOpen(true);
  };

  const confirmLeaveGroup = () => {
    leaveGroupMutation.mutate();
  };

  const baseActiveConversation = conversationList?.find(c => c._id === activeConversationId);

  const activeConversation = useMemo(() => {
    if (!baseActiveConversation) {
      return null;
    }
    
    // For 1-on-1 chats, the data is already correct. No enrichment needed.
    if (baseActiveConversation.type !== 'group' && baseActiveConversation.type !== 'broadcast') {
      return baseActiveConversation;
    }

    logger.debug('[ChatPanel] Starting enrichment for group chat', { conversationId: baseActiveConversation._id });

    // 1. Create a map to store the most detailed user data we can find.
    const detailedParticipantMap = new Map();

    // 2. Enrich from the conversation list (good for participants who haven't sent a message yet).
    if (conversationList) {
      conversationList.forEach(conv => {
        if (conv.type === 'one-on-one' && conv.otherParticipant) {
          if (!detailedParticipantMap.has(conv.otherParticipant._id)) {
            detailedParticipantMap.set(conv.otherParticipant._id, conv.otherParticipant);
          }
        }
      });
    }

    // 3. Enrich from the messages array (the most reliable source for active participants).
    // This will overwrite data from step 2 if a more complete object is found.
    if (messages) {
      messages.forEach(msg => {
        if (msg.senderId && typeof msg.senderId === 'object') {
          if (!detailedParticipantMap.has(msg.senderId._id) || !detailedParticipantMap.get(msg.senderId._id).coachProfilePicture) {
            detailedParticipantMap.set(msg.senderId._id, msg.senderId);
          }
        }
      });
    }

    // 4. Create the new, enriched conversation object.
    const enrichedParticipants = (baseActiveConversation.participants || []).map(p => {
      const detailedData = detailedParticipantMap.get(p._id);
      if (detailedData) {
        // Merge, ensuring the detailed data (with coachProfilePicture) overwrites the lean data.
        return { ...p, ...detailedData };
      }
      return p; // Fallback to original lean participant if no detailed info was found.
    });

    logger.debug('[ChatPanel] Enrichment complete', {
        enrichedCount: enrichedParticipants.filter(p => p.coachProfilePicture).length,
    });

    return {
      ...baseActiveConversation,
      participants: enrichedParticipants,
    };
  }, [baseActiveConversation, conversationList, messages]);

   const handleOpenMediaViewer = useCallback((clickedMessageId) => {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'];
    const videoExtensions = ['mp4', 'mov', 'webm', 'ogg', 'quicktime'];

    const mediaMessages = messages.filter(msg => {
        if (msg.deletedUniversally || msg.deletedFor?.some(id => id.toString() === userId)) {
            return false;
        }
        if (!Array.isArray(msg.attachment) || msg.attachment.length === 0) {
            return false;
        }
        const attachment = msg.attachment[0];
        const fileExt = (attachment.originalFilename?.split('.').pop() || attachment.format || '').toLowerCase();
        return imageExtensions.includes(fileExt) || videoExtensions.includes(fileExt);
    });

    if (mediaMessages.length === 0) return;

    const mediaItems = mediaMessages.map(msg => {
        const attachment = msg.attachment[0];
        const fileExt = (attachment.originalFilename?.split('.').pop() || attachment.format || '').toLowerCase();
        return {
            ...attachment,
            _id: msg._id,
            type: videoExtensions.includes(fileExt) ? 'video' : 'image',
        };
    });

    const startIndex = mediaItems.findIndex(item => item._id === clickedMessageId);

    if (startIndex === -1) return;

    setViewerState({
        isOpen: true,
        mediaItems,
        startIndex
    });
  }, [messages, userId]);
  
  const recipientUserId = activeConversation?.type === 'one-on-one' 
    ? activeConversation.otherParticipant?._id 
    : activeConversation?.participants?.find(p => p?._id !== userId)?._id;

  useEffect(() => {
    const typers = Object.keys(typingUsers).filter(typerId => typingUsers[typerId] && typerId !== userId);
    const currentlyTyping = typers.length > 0;

    if (currentlyTyping !== isRecipientTyping) {
      setIsRecipientTyping(currentlyTyping);
      logger.debug('[ChatPanel] Typing status changed', { isTyping: currentlyTyping });
    }

    if (!currentlyTyping) {
      setTypingIndicatorText('');
      return;
    }

    const typerNames = typers.map(typerId => {
      const conv = conversationList?.find(c => c.participants.some(p => p._id === typerId));
      const typerParticipant = conv?.participants.find(p => p._id === typerId);
      return typerParticipant?.firstName || 'Someone';
    });

    let newText = '';
    if (typerNames.length === 1) {
      newText = `${typerNames[0]} is typing...`;
    } else {
      newText = `${typerNames.slice(0, 2).join(' and ')}${typerNames.length > 2 ? '...' : ''} are typing...`;
    }

    if (newText !== typingIndicatorText) {
      setTypingIndicatorText(newText);
      logger.debug('[ChatPanel] Typing indicator text updated', { text: newText });
    }
  }, [typingUsers, userId, conversationList, isRecipientTyping, typingIndicatorText]);

  useEffect(() => {
    if (!activeConversationId || !userId) {
      logger.warn('[ChatPanel] Skipping mark as read - prerequisites missing', {
        activeConversationId,
        userId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const markAsRead = async () => {
      try {
        await markConversationAsRead({ conversationId: activeConversationId });
        const payload = {
          conversationId: activeConversationId,
          readerUserId: userId,
        };
        logger.debug('[ChatPanel] Preparing to emit CONVERSATION_READ', {
          payload,
          timestamp: new Date().toISOString(),
        });
        if (socket && isConnected) {
          socket.emit(SOCKET_EVENTS.MESSAGING.CONVERSATION_READ, payload);
          logger.info('[ChatPanel] Emitted CONVERSATION_READ', {
            payload,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
          });
        } else {
          logger.warn('[ChatPanel] Socket not connected for CONVERSATION_READ', {
            isConnected,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger.error('[ChatPanel] Failed to mark conversation as read', {
          conversationId: activeConversationId,
          userId,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    };

    markAsRead();
  }, [activeConversationId, userId, socket, isConnected]);

  useEffect(() => {
    if (!socket || !isConnected || !activeConversationId) {
      logger.warn('[ChatPanel] Delaying socket listeners - prerequisites missing', {
        hasSocket: !!socket,
        isConnected,
        activeConversationId,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  
    const handleNewMessage = (data) => {
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

      queryClient.invalidateQueries(conversationKeys.all(userId));
      queryClient.invalidateQueries(messageKeys.infiniteList(messageObject.conversationId));
    };
  
    const handleMessageConfirmation = (data) => {
      logger.info('[ChatPanel] RAW messageSentConfirmation event received.', { rawData: data, activeConversationId });
      const { messageObject, tempId } = data;
      if (!messageObject?._id || messageObject.conversationId !== activeConversationId) {
        logger.debug('[ChatPanel] Ignoring messageSentConfirmation for different or invalid conversation', {
          tempId,
          messageId: messageObject?._id,
          conversationId: messageObject?.conversationId,
          activeConversationId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
  
      logger.info('[ChatPanel] Received messageSentConfirmation', {
        tempId,
        messageId: messageObject._id,
        conversationId: activeConversationId,
        timestamp: new Date().toISOString(),
      });
  
      queryClient.setQueryData(messageKeys.infiniteList(activeConversationId), (oldData = { pages: [], pageParams: [] }) => {
        const newPages = oldData.pages.map((page) => ({
          ...page,
          messages: page.messages.map((msg) =>
            msg._id === `temp-${tempId}` ? { ...messageObject, sender: msg.sender } : msg
          ),
        }));
        logger.debug('[ChatPanel] Updated messages with confirmed message', {
          tempId,
          messageId: messageObject._id,
          pageCount: newPages.length,
          messageCount: newPages[0].messages.length,
          timestamp: new Date().toISOString(),
        });
        return { ...oldData, pages: newPages };
      });
    };
  
    const handleMessageDeleted = ({ conversationId, messageId }) => {
      if (conversationId !== activeConversationId) {
        logger.debug('[ChatPanel] Ignoring MESSAGE_DELETED for different conversation', {
          messageId,
          conversationId,
          activeConversationId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
  
      logger.info('[ChatPanel] Received MESSAGE_DELETED', {
        messageId,
        conversationId,
        userId,
        timestamp: new Date().toISOString(),
      });
  
      queryClient.setQueryData(messageKeys.infiniteList(activeConversationId), (oldData = { pages: [], pageParams: [] }) => {
        const newPages = oldData.pages.map(page => ({
          ...page,
          messages: page.messages.map(msg =>
            msg._id === messageId
              ? { ...msg, deletedUniversally: true, deletedFor: activeConversation.participants.map(p => p._id) }
              : msg
          ),
        }));
        logger.debug('[ChatPanel] Updated messages with deleted message', {
          messageId,
          pageCount: newPages.length,
          messageCount: newPages[0].messages.length,
          timestamp: new Date().toISOString(),
        });
        return { ...oldData, pages: newPages };
      });
      queryClient.invalidateQueries(conversationKeys.all(userId));
    };
  
    socket.on(SOCKET_EVENTS.MESSAGING.NEW_MESSAGE, handleNewMessage);
    socket.on('messageSentConfirmation', handleMessageConfirmation);
    socket.on(SOCKET_EVENTS.MESSAGING.MESSAGE_DELETED, handleMessageDeleted);
    logger.info('[ChatPanel] Attached socket listeners', {
      conversationId: activeConversationId,
      timestamp: new Date().toISOString(),
    });
  
    return () => {
      socket.off(SOCKET_EVENTS.MESSAGING.NEW_MESSAGE, handleNewMessage);
      socket.off('messageSentConfirmation', handleMessageConfirmation);
      socket.off(SOCKET_EVENTS.MESSAGING.MESSAGE_DELETED, handleMessageDeleted);
      logger.info('[ChatPanel] Removed socket listeners', {
        conversationId: activeConversationId,
        timestamp: new Date().toISOString(),
      });
    };
  }, [socket, isConnected, activeConversationId, queryClient, userId, activeConversation, recipientUserId]);

  const sendMessageMutation = useMutation(
    ({ recipientUserId, messageData, conversationId }) =>
      sendMessage({ ...messageData, recipientUserId, conversationId }),
    {
      onMutate: async ({ recipientUserId, messageData, conversationId }) => {
        if (!messageData || !messageData.contentType) {
          logger.error('[ChatPanel] onMutate received invalid messageData', {
            userId,
            recipientId: recipientUserId,
            conversationId: conversationId || 'none',
            messageData,
            timestamp: new Date().toISOString(),
          });
          throw new Error('Invalid message data');
        }
  
        logger.info('[ChatPanel] Attempting optimistic message send for user', {
          userId,
          recipientId: recipientUserId,
          conversationId: conversationId || 'none',
          contentType: messageData.contentType,
          timestamp: new Date().toISOString(),
        });
  
        await queryClient.cancelQueries(messageKeys.infiniteList(activeConversationId));
  
        const previousMessages = queryClient.getQueryData(messageKeys.infiniteList(activeConversationId)) || { pages: [], pageParams: [] };
  
        const optimisticMessage = {
          _id: `temp-${Date.now()}`,
          conversationId: activeConversationId,
          senderId: userId,
          content: messageData.content,
          contentType: messageData.contentType,
          attachment: messageData.attachment || null,
          createdAt: new Date().toISOString(),
          deliveryStatus: 'pending',
          sender: { _id: userId, firstName: user?.firstName, lastName: user?.lastName },
        };
  
        queryClient.setQueryData(messageKeys.infiniteList(activeConversationId), (oldData = { pages: [], pageParams: [] }) => {
          const newPages = oldData.pages.length
            ? oldData.pages.map((page, index) =>
                index === 0
                  ? { ...page, messages: [...page.messages, optimisticMessage] }
                  : page
              )
            : [{ messages: [optimisticMessage], currentPage: 1, totalPages: 1, totalMessages: 1 }];
  
          logger.debug('[ChatPanel] Applied optimistic message update', {
            userId,
            recipientId: recipientUserId,
            conversationId: activeConversationId || 'none',
            messageId: optimisticMessage._id,
            pageCount: newPages.length,
            timestamp: new Date().toISOString(),
          });
  
          return { ...oldData, pages: newPages };
        });
  
        return { previousMessages, optimisticMessage };
      },
      onError: (error, { recipientUserId }, context) => {
        logger.error('[ChatPanel] Failed optimistic message send', {
          userId,
          recipientId: recipientUserId,
          conversationId: activeConversationId || 'none',
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        queryClient.setQueryData(messageKeys.infiniteList(activeConversationId), context.previousMessages);
        toast.error(t('messaging:errorSendMessage'));
      },
      onSuccess: (data, { recipientUserId }, context) => {
        logger.info('[ChatPanel] Optimistic message send succeeded', {
          userId,
          recipientId: recipientUserId,
          conversationId: activeConversationId || 'none',
          messageId: data._id,
          serverContent: data.content,
          optimisticContent: context.optimisticMessage.content,
          timestamp: new Date().toISOString(),
        });
      
        queryClient.setQueryData(messageKeys.infiniteList(activeConversationId), (oldData = { pages: [], pageParams: [] }) => {
          const newPages = oldData.pages.map((page) => ({
            ...page,
            messages: page.messages.map((msg) =>
              msg._id === context.optimisticMessage._id
                ? {
                    ...data,
                    sender: msg.sender,
                    content: data.content !== undefined && data.content !== null ? data.content : msg.content, 
                  }
                : msg
            ),
          }));
          logger.debug('[ChatPanel] Updated messages with confirmed message', {
            messageId: data._id,
            pageCount: newPages.length,
            messageCount: newPages[0].messages.length,
            finalContent: newPages[0].messages.find(msg => msg._id === data._id)?.content,
            timestamp: new Date().toISOString(),
          });
          return { ...oldData, pages: newPages };
        });
      },
    }
  );

const handleSendMessage = useCallback(
    (messageData) => {
      if (!activeConversationId || !userId) {
        logger.error('[ChatPanel] Cannot send message: missing prerequisites', {
          activeConversationId,
          userId,
          timestamp: new Date().toISOString(),
        });
        toast.error(t('messaging:invalidConversationOrUser'));
        return;
      }
      
      const recipientIdForMessage = activeConversation?.type === 'one-on-one' 
        ? activeConversation.otherParticipant?._id 
        : activeConversation?.participants?.find(p => p?._id !== userId)?._id;

      if (!recipientIdForMessage) {
        logger.error('[ChatPanel] Cannot send message: Could not determine a recipient for the API call.', {
          activeConversationId,
          userId,
          conversationType: activeConversation?.type,
        });
        toast.error(t('messaging:invalidConversationOrUser'));
        return;
      }

      if (!messageData || typeof messageData !== 'object' || !messageData.contentType) {
        logger.error('[ChatPanel] Invalid messageData received', {
          messageData,
          userId,
          conversationId: activeConversationId,
          timestamp: new Date().toISOString(),
        });
        toast.error(t('messaging:invalidMessageData'));
        return;
      }

      sendMessageMutation.mutate({
        recipientUserId: recipientIdForMessage,
        messageData,
        conversationId: activeConversationId,
      });
    },
    [activeConversationId, userId, sendMessageMutation, t, activeConversation]
  );

  const deleteConversationMutation = useMutation(
    () => deleteConversation(activeConversationId),
    {
        onMutate: async () => {
            logger.info('[ChatPanel] Attempting to delete conversation', { userId, conversationId: activeConversationId });
        },
        onSuccess: () => {
            logger.info('[ChatPanel] Conversation deleted successfully', { userId, conversationId: activeConversationId });
            toast.success(t('messaging:chatDeletedSuccess', 'Chat deleted'));
            queryClient.invalidateQueries(conversationKeys.all(userId));
            queryClient.removeQueries(messageKeys.infiniteList(activeConversationId));
            if (onConversationDeleted) {
              onConversationDeleted(activeConversationId);
          } else {
               logger.warn('[ChatPanel] onConversationDeleted prop is missing!');
          }
      },
        onError: (error) => {
            logger.error('[ChatPanel] Failed to delete conversation', { userId, conversationId: activeConversationId, error: error.message });
            toast.error(t('messaging:chatDeletedError', 'Failed to delete chat'));
        },
        onSettled: () => {
            logger.debug('[ChatPanel] Delete mutation settled', { userId, conversationId: activeConversationId });
        },
    }
);

const deleteMessageMutation = useMutation(
  (messageId) => deleteMessage(messageId),
  {
    onMutate: async (messageId) => {
      logger.info('[ChatPanel] Attempting optimistic message deletion', {
        userId,
        messageId,
        conversationId: activeConversationId,
        timestamp: new Date().toISOString(),
      });

      await queryClient.cancelQueries(messageKeys.infiniteList(activeConversationId));
      const previousMessages = queryClient.getQueryData(messageKeys.infiniteList(activeConversationId)) || { pages: [], pageParams: [] };

      queryClient.setQueryData(messageKeys.infiniteList(activeConversationId), (oldData = { pages: [], pageParams: [] }) => {
        const newPages = oldData.pages.map(page => ({
          ...page,
          messages: page.messages.map(msg =>
            msg._id === messageId ? { ...msg, deletedFor: [...(msg.deletedFor || []), userId] } : msg
          ),
        }));
        return { ...oldData, pages: newPages };
      });

      return { previousMessages };
    },
    onSuccess: (result, messageId) => {
      logger.info('[ChatPanel] Message deleted successfully', {
        userId,
        messageId,
        conversationId: activeConversationId,
        status: result.status,
        updatedLastMessage: result.updatedLastMessage,
        timestamp: new Date().toISOString(),
      });
      toast.success(
        result.status === 'deleted_for_everyone' 
          ? t('messaging:deleteForEveryoneSuccess') 
          : t('messaging:deleteForMeSuccess')
      );
      queryClient.invalidateQueries(messageKeys.infiniteList(activeConversationId));
      if (result.updatedLastMessage) {
        queryClient.invalidateQueries(conversationKeys.all(userId));
      }
    },
    onError: (error, messageId, context) => {
      logger.error('[ChatPanel] Failed to delete message', {
        userId,
        messageId,
        conversationId: activeConversationId,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      queryClient.setQueryData(messageKeys.infiniteList(activeConversationId), context.previousMessages);
      toast.error(t('messaging:deleteMessageError'));
    },
  }
);

const handleDeleteMessage = useCallback(
  (messageId) => {
    if (!messageId) {
      logger.error('[ChatPanel] Cannot delete message: missing messageId', { userId, conversationId: activeConversationId });
      toast.error(t('messaging:invalidMessageData'));
      return;
    }
    deleteMessageMutation.mutate(messageId);
  },
  [deleteMessageMutation, userId, activeConversationId]
);

const handleDeleteConversation = useCallback(() => {
  if (!activeConversationId) {
      logger.warn('[ChatPanel] Cannot delete conversation: No active conversation ID');
      return;
  }
  logger.info('[ChatPanel] Initiating delete mutation', { userId, conversationId: activeConversationId });
  deleteConversationMutation.mutate();
}, [activeConversationId, deleteConversationMutation, userId]);


if (!activeConversationId) {
  logger.info('[ChatPanel] Rendering placeholder - No active conversation', {
    timestamp: new Date().toISOString(),
  });
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background text-muted-foreground">
      <MessageCircle className="mb-4 h-16 w-16 text-gray-400 dark:text-gray-600" />
      <p className="text-lg">{t('messaging:selectConversation')}</p>
    </div>
  );
}

if (!activeConversation) {
  logger.warn('[ChatPanel] Rendering placeholder - Active conversation not found', {
    conversationId: activeConversationId,
    timestamp: new Date().toISOString(),
  });
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background text-muted-foreground">
      <AlertTriangle className="mb-4 h-16 w-16 text-red-500" />
      <p className="text-lg">{t('messaging:conversationNotFound')}</p>
    </div>
  );
}

if (isFetchLoading && messages.length === 0) {
  logger.info('[ChatPanel] Rendering loading state', {
    conversationId: activeConversationId,
    timestamp: new Date().toISOString(),
  });
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

if (fetchError && messages.length === 0) {
  logger.error('[ChatPanel] Rendering error state', {
    conversationId: activeConversationId,
    error: fetchError.message,
    timestamp: new Date().toISOString(),
  });
  return (
    <div className="flex h-full flex-col items-center justify-center bg-background text-red-500">
      <AlertTriangle className="mb-2 h-8 w-8" />
      <p className="text-lg">{t('messaging:errorLoadingMessages')}</p>
    </div>
  );
}

  logger.info('[ChatPanel] Rendering chat panel', {
    conversationId: activeConversationId,
    messageCount: messages.length,
    timestamp: new Date().toISOString(),
  });

return (
    <>
      <div className="flex h-full flex-col bg-background">
        <ChatHeader
            activeConversation={activeConversation}
            onDeleteConversation={handleDeleteConversation}
            isDeleting={deleteConversationMutation.isLoading}
            onOpenGroupInfo={() => handleModalOpen('info')}
            onBack={onBack}
        />
        
        <div className="relative flex-1 min-h-0">
            <MessageList
              messages={messages}
              isLoading={isFetchLoading && messages.length === 0}
              fetchNextPage={fetchNextPage}
              hasNextPage={hasMoreMessages}
              isFetchingMore={isFetchingOlderMessages}
              activeConversation={activeConversation}
              currentUserId={userId}
              onDeleteMessage={handleDeleteMessage}
              onOpenMediaViewer={handleOpenMediaViewer}
            />
        </div>

        <div>
           <div className="flex h-6 items-center px-4">
             {typingIndicatorText && <span className="text-sm italic text-muted-foreground">{typingIndicatorText}</span>}
           </div>
           <MessageInput
              onSendMessage={handleSendMessage}
              conversationId={activeConversationId}
              isSending={sendMessageMutation.isLoading || deleteConversationMutation.isLoading}
              recipientUserId={recipientUserId}
              activeConversation={activeConversation}
            />
        </div>
      </div>

      {activeConversation?.type === 'group' && (
        <>
          <GroupInfoModal
            isOpen={modalState.info}
            onClose={() => handleModalClose('info')}
            conversation={activeConversation}
            currentUserId={userId}
            onOpenEdit={() => handleModalOpen('edit')}
            onOpenAddMembers={() => handleModalOpen('add')}
            onOpenManageMembers={() => handleModalOpen('manage')}
            onOpenSettings={() => handleModalOpen('settings')}
            onLeaveGroup={handleLeaveGroup}
          />
          <EditGroupInfoModal
            isOpen={modalState.edit}
            onClose={() => handleModalClose('edit')}
            conversation={activeConversation}
          />
          <AddMembersModal
            isOpen={modalState.add}
            onClose={() => handleModalClose('add')}
            conversation={activeConversation}
          />
          <ManageMembersModal
            isOpen={modalState.manage}
            onClose={() => handleModalClose('manage')}
            conversation={activeConversation}
            currentUserId={userId}
          />
          <GroupSettingsModal
            isOpen={modalState.settings}
            onClose={() => handleModalClose('settings')}
            conversation={activeConversation}
          />
        </>
      )}

      <AlertDialog open={isLeaveConfirmOpen} onOpenChange={setIsLeaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('messaging:leaveGroupConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('messaging:leaveGroupConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={confirmLeaveGroup} disabled={leaveGroupMutation.isLoading}>
              {leaveGroupMutation.isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('messaging:leaveGroup')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewerState.isOpen && viewerState.mediaItems.length > 0 && (
        <div
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
        >
          <div
            className="relative flex h-full w-full max-w-7xl flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex flex-1 items-center justify-center min-h-0">
              {(() => {
                const currentMedia = viewerState.mediaItems[viewerState.startIndex];
                if (!currentMedia) return null;

                if (currentMedia.type === 'video') {
                  return (
                    <div className="flex h-full w-full max-w-full max-h-full items-center justify-center">
                        <CustomVideoPlayer videoFile={currentMedia} />
                    </div>
                  );
                }
                return (
                  <img
                    src={currentMedia.url}
                    alt={`${t('messaging:imagePreview')} ${viewerState.startIndex + 1}`}
                    className="block max-h-full max-w-full rounded-sm object-contain shadow-2xl"
                  />
                );
              })()}
            </div>
            <div className="flex shrink-0 items-center justify-center gap-4 p-4">
              <button
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:not-disabled:scale-105 hover:not-disabled:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerState(prev => ({ ...prev, startIndex: (prev.startIndex - 1 + prev.mediaItems.length) % prev.mediaItems.length }));
                }}
                disabled={viewerState.mediaItems.length <= 1}
                aria-label={t('common:previous')}
              >
                <ChevronLeftIcon size={24} />
              </button>
              <span className="min-w-[3rem] text-center text-base text-white/95">
                {viewerState.startIndex + 1} / {viewerState.mediaItems.length}
              </span>
              <button
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all hover:not-disabled:scale-105 hover:not-disabled:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerState(prev => ({ ...prev, startIndex: (prev.startIndex + 1) % prev.mediaItems.length }));
                }}
                disabled={viewerState.mediaItems.length <= 1}
                aria-label={t('common:next')}
              >
                <ChevronRightIcon size={24} />
              </button>
              <button
                  className="ml-4 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-destructive/70 text-destructive-foreground transition-all hover:not-disabled:scale-105 hover:not-disabled:bg-destructive disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setViewerState(prev => ({ ...prev, isOpen: false }))}
                  aria-label={t('common:close')}
                >
                  <X size={24} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

ChatPanel.propTypes = {
  activeConversationId: PropTypes.string,
  onConversationDeleted: PropTypes.func,
  onBack: PropTypes.func,
};

export default ChatPanel;