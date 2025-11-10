import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { format, isToday, isYesterday } from 'date-fns';
import { de } from 'date-fns/locale/de';
import { enUS } from 'date-fns/locale/en-US';
import { logger } from '../../utils/logger';
import { Paperclip } from 'lucide-react';

import { useNotificationSocket } from '../../contexts/SocketContext';
import { useTranslation } from 'react-i18next';

const ConversationItem = ({ conversation, isSelected, onClick }) => {
  logger.info(`[DIAGNOSTIC LOG] ConversationItem rendering with conversation prop (ID: ${conversation._id}):`, conversation);
  const { t, i18n } = useTranslation(['messaging', 'common']);
  const [presenceStatus, setPresenceStatus] = useState(conversation.otherParticipant?.status || 'offline');
  const { socket, isConnected } = useNotificationSocket();
  const isGroup = conversation.type === 'group' || conversation.type === 'broadcast';
  
  const dateLocales = {
    de,
    en: enUS,
  };
  const currentLocale = dateLocales[i18n.language] || enUS;

  useEffect(() => {
    if (isGroup || !conversation.otherParticipant?._id || !socket || !isConnected) {
      if (!isGroup) {
        logger.warn('[ConversationItem] otherParticipant or socket is undefined, skipping presence subscription', {
          hasParticipant: !!conversation.otherParticipant,
          hasSocket: !!socket,
          isConnected,
          conversationId: conversation._id,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    setPresenceStatus(conversation.otherParticipant.status || 'offline');

    logger.info('[ConversationItem] Subscribing to presence updates', {
      participantId: conversation.otherParticipant._id,
      timestamp: new Date().toISOString(),
    });

    const presenceUpdateHandler = ({ userId, status }) => {
      if (userId === conversation.otherParticipant._id) {
        logger.debug('[ConversationItem] Presence update received', {
          participantId: userId,
          status,
          timestamp: new Date().toISOString(),
        });
        setPresenceStatus(status);
      }
    };

    socket.on('presence_update', presenceUpdateHandler);

    return () => {
      logger.info('[ConversationItem] Unsubscribing from presence updates', {
        participantId: conversation.otherParticipant._id,
        timestamp: new Date().toISOString(),
      });
      socket.off('presence_update', presenceUpdateHandler);
    };
  }, [conversation.otherParticipant, socket, isConnected, isGroup, conversation._id]);

  if (!conversation || (!isGroup && !conversation.otherParticipant)) {
    logger.warn('[ConversationItem] Rendering placeholder due to missing data', {
      conversation,
      timestamp: new Date().toISOString(),
    });
    return null;
  }

const { lastMessage, updatedAt, _id, unreadCount } = conversation;

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      if (isToday(date)) {
        return format(date, 'p', { locale: currentLocale });
      } else if (isYesterday(date)) {
        return t('common:yesterday');
      } else {
        return format(date, 'P', { locale: currentLocale });
      }
    } catch (error) {
      logger.error('[ConversationItem] Error formatting timestamp:', {
        timestamp,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return 'Invalid Date';
    }
  };

  const getInitials = (firstName = '', lastName = '') => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getPresenceClass = (status) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'away':
        return 'bg-yellow-500';
      case 'busy':
        return 'bg-red-500';
      default:
        return 'bg-gray-400 dark:bg-gray-600';
    }
  };

  const getLastMessageSnippet = () => {
    if (!lastMessage) return isGroup ? t('messaging:groupCreated') : t('messaging:noMessagesYet');

    if (lastMessage.contentType === 'text') {
      return lastMessage.content;
    }

    const attachmentTypes = ['file', 'image', 'video', 'audio'];
    if (attachmentTypes.includes(lastMessage.contentType)) {
      // Defensively check if there is meaningful text content to display.
      // This explicitly checks against the literal string "undefined" to fix the bug.
      const hasMeaningfulContent = lastMessage.content && lastMessage.content !== 'undefined';

      return (
        <span className="inline-flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
          {hasMeaningfulContent && <span>{lastMessage.content}</span>}
        </span>
      );
    }

    return `[${lastMessage.contentType.charAt(0).toUpperCase() + lastMessage.contentType.slice(1)}]`;
  };

 const displayName = conversation.name || (isGroup ? t('messaging:unnamedGroup') : `${conversation.otherParticipant.firstName} ${conversation.otherParticipant.lastName}`);

  const avatarUrl = isGroup
    ? conversation.groupAvatar?.url || ''
    : (conversation.otherParticipant.role === 'coach' && conversation.otherParticipant.coachProfilePicture?.url
      ? conversation.otherParticipant.coachProfilePicture.url
      : conversation.otherParticipant.profilePicture?.url || '');

  const avatarFallback = isGroup
    ? conversation.name?.charAt(0).toUpperCase() || 'G'
    : getInitials(conversation.otherParticipant.firstName, conversation.otherParticipant.lastName);

  logger.debug('[ConversationItem] Rendering item', {
    conversationId: _id,
    type: conversation.type,
    displayName,
    isSelected,
    unreadCount,
    timestamp: new Date().toISOString(),
  });

return (
    <div
      className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors hover:bg-muted ${isSelected ? 'bg-accent text-accent-foreground' : ''}`}
      onClick={() => onClick(_id)}
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={t(isGroup ? 'messaging:groupConversation' : 'messaging:conversationWith', {
        name: displayName,
        timestamp: formatTimestamp(updatedAt),
      })}
    >
      <div className="relative flex-shrink-0 mr-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback>{avatarFallback}</AvatarFallback>
        </Avatar>
        {!isGroup && <div className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${getPresenceClass(presenceStatus)}`}></div>}
      </div>

      <div className="flex flex-1 items-start min-w-0">
        <div className="flex-1 min-w-0 pr-2">
          <p className="font-semibold text-sm truncate">
            {displayName}
          </p>
          {conversation.subtext && <p className="text-xs text-muted-foreground truncate mt-0.5">{conversation.subtext}</p>}
          <p className={`text-sm truncate mt-1 ${ unreadCount > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground' }`}>
            {getLastMessageSnippet()}
          </p>
        </div>

        <div className="flex flex-col items-end space-y-1.5 flex-shrink-0">
          <p className={`text-xs ${ unreadCount > 0 ? 'text-primary font-medium' : 'text-muted-foreground' }`}>
            {formatTimestamp(updatedAt)}
          </p>
          {unreadCount > 0 ? (
            <span className="bg-muted text-muted-foreground text-xs font-medium rounded-full h-5 min-w-[1.25rem] px-1 flex items-center justify-center">
              {unreadCount > 4 ? '4+' : unreadCount}
            </span>
          ) : (
            <div className="h-5" />
          )}
        </div>
      </div>
    </div>
  );
};

ConversationItem.propTypes = {
  conversation: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    type: PropTypes.string,
    name: PropTypes.string,
    groupAvatar: PropTypes.shape({ url: PropTypes.string }),
    otherParticipant: PropTypes.shape({
      _id: PropTypes.string.isRequired,
      firstName: PropTypes.string,
      lastName: PropTypes.string,
      role: PropTypes.string,
      profilePicture: PropTypes.shape({ url: PropTypes.string }),
      coachProfilePicture: PropTypes.shape({ url: PropTypes.string }),
      status: PropTypes.string,
    }),
    lastMessage: PropTypes.shape({
      _id: PropTypes.string,
      content: PropTypes.string,
      senderId: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
      contentType: PropTypes.string,
      createdAt: PropTypes.string,
      attachment: PropTypes.shape({ originalFilename: PropTypes.string }),
    }),
    updatedAt: PropTypes.string.isRequired,
    unreadCount: PropTypes.number,
    subtext: PropTypes.string, // Added for completeness as it's used in rendering
  }).isRequired,
  isSelected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
};

export default ConversationItem;