import React, { useEffect, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.tsx";
import { MoreVertical, Trash2, BookOpen  } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from "../ui/button.tsx";
import { useTranslation } from 'react-i18next';
import { useNotificationSocket } from '../../contexts/SocketContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
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
import { logger } from '../../utils/logger';
import ParticipantAvatarStack from './ParticipantAvatarStack';

const ChatHeader = ({ activeConversation, onDeleteConversation, isDeleting }) => { 
  logger.info('[DIAGNOSTIC LOG] ChatHeader received activeConversation prop:', activeConversation);
  const { user } = useAuth();
  const { t } = useTranslation(['messaging', 'common']);
  const [presenceStatus, setPresenceStatus] = useState('offline');
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const { socket, isConnected } = useNotificationSocket();
  const deleteButtonRef = React.useRef(null);

useEffect(() => {
    return () => {
      logger.debug('[ChatHeader] Cleaning up pointer events on unmount');
      document.body.style.pointerEvents = 'auto';
      const headerElement = document.querySelector('.chat-panel__header');
      const messagingCenterElement = document.querySelector('.messaging-center');
      if (headerElement) {
        logger.debug('[ChatHeader] Restoring pointer events for header');
        headerElement.style.pointerEvents = 'auto';
      } else {
        logger.warn('[ChatHeader] Header element not found during cleanup');
      }
      if (messagingCenterElement) {
        logger.debug('[ChatHeader] Restoring pointer events for messaging center');
        messagingCenterElement.style.pointerEvents = 'auto';
      } else {
        logger.warn('[ChatHeader] Messaging center element not found during cleanup');
      }
    };
  }, []);

  useEffect(() => {
    if (!activeConversation) return;

    const isGroup = activeConversation.type === 'group' || activeConversation.type === 'broadcast';
    const participant = isGroup ? null : activeConversation.otherParticipant;

    if (isGroup || !participant?._id || !socket || !isConnected) {
      return;
    }

    setPresenceStatus(participant.status || 'offline');
    logger.debug('[ChatHeader] Participant updated', { participantId: participant._id, status: participant.status });

    const presenceUpdateHandler = ({ userId, status }) => {
      if (userId === participant._id) {
        logger.debug('[ChatHeader] Received presence update', { userId, status });
        setPresenceStatus(status);
      }
    };
    
    socket.on('presence_update', presenceUpdateHandler);

    return () => {
      if (participant?._id) {
        logger.debug('[ChatHeader] Unsubscribing from presence updates', { participantId: participant._id });
        socket.off('presence_update', presenceUpdateHandler);
      }
    };
  }, [activeConversation, socket, isConnected]);

   if (!activeConversation) {
    logger.warn('[ChatHeader] activeConversation is undefined, skipping render', { isDeleting });
    return null;
  }

  const isGroup = activeConversation.type === 'group' || activeConversation.type === 'broadcast';
  const participant = isGroup ? null : activeConversation.otherParticipant;
const displayName = isGroup ? activeConversation.name : `${participant?.firstName} ${participant?.lastName}`;
  const { context } = activeConversation;
  
  if (!isGroup && !participant) {
    logger.warn('[ChatHeader] Participant is undefined for one-on-one chat, skipping render', { activeConversationId: activeConversation._id, isDeleting });
    return null;
  }

  const getInitials = (firstName = '', lastName = '') => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getPresenceText = (status) => {
    switch (status) {
      case 'online': return t('messaging:statusOnline');
      case 'away': return t('messaging:statusAway');
      case 'busy': return t('messaging:statusBusy');
      default: return t('messaging:statusOffline');
    }
  };

  const getPresenceClass = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-400';
      case 'busy': return 'bg-red-500';
      default: return 'bg-slate-400';
    }
  };

  const handleDeleteClick = () => {
    logger.info('[ChatHeader] Delete conversation action triggered', { conversationId: activeConversation._id });
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    logger.info('[ChatHeader] Confirmed delete conversation', { conversationId: activeConversation._id });
    setIsConfirmDeleteDialogOpen(false);
    if (onDeleteConversation) {
      onDeleteConversation();
    } else {
      logger.warn('[ChatHeader] onDeleteConversation prop is missing!');
    }
  };
  
  if (!isGroup) {
    const profilePictureUrl = participant.role === 'coach' && participant.coachProfilePicture?.url
      ? participant.coachProfilePicture.url
      : participant.profilePicture?.url || '';

    logger.debug('[ChatHeader] Rendering header for one-on-one', {
       participantId: participant._id,
       participantRole: participant.role,
       hasCoachPic: !!participant.coachProfilePicture?.url,
       hasUserPic: !!participant.profilePicture?.url,
       usedPicUrl: profilePictureUrl,
       timestamp: new Date().toISOString(),
    });
  } else {
     logger.debug('[ChatHeader] Rendering header for group', {
       conversationId: activeConversation._id,
       name: displayName,
       timestamp: new Date().toISOString(),
    });
  }


  return (
    <>
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar className="w-10 h-10">
            <AvatarImage 
              src={
                isGroup 
                  ? activeConversation.groupAvatar?.url || '' 
                  : (participant.role === 'coach' && participant.coachProfilePicture?.url
                      ? participant.coachProfilePicture.url
                      : participant.profilePicture?.url || '')
              } 
              alt={displayName} 
            />
            <AvatarFallback>
              {isGroup ? (displayName?.charAt(0).toUpperCase() || 'G') : getInitials(participant.firstName, participant.lastName)}
            </AvatarFallback>
          </Avatar>
          {!isGroup && <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-50 dark:border-slate-900 ${getPresenceClass(presenceStatus)}`}></div>}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 dark:text-slate-50 truncate">
            {displayName}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isGroup ? (
              <ParticipantAvatarStack participants={activeConversation.participants} />
            ) : (
              getPresenceText(presenceStatus)
            )}
          </div>
          {context?.type === 'program_assignment_submission' && context.lessonId && (
            user?._id === context.programAuthorId ? (
              <Link
                to={`/programs/${context.programId}/submissions?lesson=${context.lessonId}`}
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <BookOpen className="h-3 w-3" />
                <span className="truncate">{activeConversation.subtext || t('programs:assignment_submissions', 'Assignment Submissions')}</span>
              </Link>
            ) : (
              <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <BookOpen className="h-3 w-3" />
                <span className="truncate">{activeConversation.subtext || t('programs:assignment_submissions', 'Assignment Submissions')}</span>
              </div>
            )
          )}
        </div>
      </div>

        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('common:moreOptions')}>
                <MoreVertical size={20} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white dark:bg-slate-950">
              <DropdownMenuItem
                className="text-red-600 cursor-pointer dark:text-red-500 focus:bg-red-100 dark:focus:bg-red-900/20 focus:text-red-600 dark:focus:text-red-500"
                onClick={handleDeleteClick}
                ref={deleteButtonRef}
              >
                <Trash2 size={16} className="mr-2" /> {t('messaging:deleteChatAction', 'Delete Chat')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog
        open={isConfirmDeleteDialogOpen}
        onOpenChange={(open) => {
          setIsConfirmDeleteDialogOpen(open);
          if (!open) {
            deleteButtonRef.current?.focus();
            document.body.style.pointerEvents = 'auto';
            const rootElement = document.querySelector('#root');
            if (rootElement) {
              logger.debug('[ChatHeader] Restoring pointer events for root element');
              rootElement.style.pointerEvents = 'auto';
            }
            const headerElement = document.querySelector('.chat-panel__header');
            if (headerElement) {
              logger.debug('[ChatHeader] Restoring pointer events for header in onOpenChange');
              headerElement.style.pointerEvents = 'auto';
            } else {
              logger.warn('[ChatHeader] Header element not found in onOpenChange');
            }
            const messagingCenterElement = document.querySelector('.messaging-center');
            if (messagingCenterElement) {
              logger.debug('[ChatHeader] Restoring pointer events for messaging center in onOpenChange');
              messagingCenterElement.style.pointerEvents = 'auto';
            } else {
              logger.warn('[ChatHeader] Messaging center element not found in onOpenChange');
            }
          }
        }}
      >
        <AlertDialogContent className="bg-white dark:bg-slate-950">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('messaging:deleteConfirmTitle', 'Delete this chat?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('messaging:deleteConfirmDescription', 'This chat will be deleted from your device only. Other participants will still see the chat.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 dark:text-slate-50"
              onClick={handleConfirmDelete}
            >
              {t('common:delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

ChatHeader.propTypes = {
  activeConversation: PropTypes.shape({
    _id: PropTypes.string,
    type: PropTypes.string,
    name: PropTypes.string,
    subtext: PropTypes.string,
    groupAvatar: PropTypes.shape({ url: PropTypes.string }),
    context: PropTypes.shape({
      type: PropTypes.string,
      programId: PropTypes.string,
      lessonId: PropTypes.string,
    }),
    participants: PropTypes.arrayOf(PropTypes.shape({
        _id: PropTypes.string.isRequired,
        firstName: PropTypes.string,
        lastName: PropTypes.string,
        role: PropTypes.string,
        profilePicture: PropTypes.shape({ url: PropTypes.string }),
        coachProfilePicture: PropTypes.shape({ url: PropTypes.string }),
    })),
    otherParticipant: PropTypes.shape({
      _id: PropTypes.string,
      firstName: PropTypes.string,
      lastName: PropTypes.string,
      role: PropTypes.string,
      profilePicture: PropTypes.shape({ url: PropTypes.string }),
      coachProfilePicture: PropTypes.shape({ url: PropTypes.string }),
      status: PropTypes.string,
    }),
  }),
  onDeleteConversation: PropTypes.func,
  isDeleting: PropTypes.bool,
  conversationList: PropTypes.array,
};

export default ChatHeader;