import React, { useEffect, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.tsx";
import { MoreVertical, Trash2, BookOpen, Users, Settings, UserPlus, Edit3, LogOut, Info  } from 'lucide-react';
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
import GroupInfoModal from './GroupInfoModal';
import EditGroupInfoModal from './EditGroupInfoModal';
import AddMembersModal from './AddMembersModal';
import ManageMembersModal from './ManageMembersModal';
import GroupSettingsModal from './GroupSettingsModal';

const ChatHeader = ({ activeConversation, onDeleteConversation, isDeleting, onOpenGroupInfo }) => {
  logger.info('[DIAGNOSTIC LOG] ChatHeader received activeConversation prop:', activeConversation);
  const { user } = useAuth();
  const { t } = useTranslation(['messaging', 'common']);
  const [presenceStatus, setPresenceStatus] = useState('offline');
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const { socket, isConnected } = useNotificationSocket();
  const deleteButtonRef = React.useRef(null);


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
  const currentUserIsAdmin = activeConversation?.currentUserRole === 'admin';
  
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

  const handleLeaveGroup = () => {
    logger.warn('[ChatHeader] Leave group action triggered, but no API call is implemented.', { conversationId: activeConversation._id });
    setIsLeaveConfirmOpen(false);
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

  const handleOpenModal = (modalName) => {
    setTimeout(() => {
        setActiveModal(modalName);
    }, 150);
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
        <div 
          className={`relative ${isGroup ? 'cursor-pointer' : ''}`}
          onClick={isGroup ? () => handleOpenModal('edit') : undefined}
        >
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
          <div 
            className={`font-semibold text-slate-900 dark:text-slate-50 truncate ${isGroup ? 'cursor-pointer' : ''}`}
            onClick={isGroup ? () => handleOpenModal('edit') : undefined}
          >
            {displayName}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isGroup ? (
              <div className="cursor-pointer" onClick={() => handleOpenModal('manageMembers')}>
                <ParticipantAvatarStack participants={activeConversation.participants} />
              </div>
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
              {isGroup && (
                <>
                  <DropdownMenuItem className="cursor-pointer" onSelect={() => handleOpenModal('info')}>
                    <Info size={16} className="mr-2" /> {t('messaging:groupInfo', 'Group Info')}
                  </DropdownMenuItem>
                  {(currentUserIsAdmin || activeConversation.settings?.allowMemberInfoEdit) && (
                    <DropdownMenuItem className="cursor-pointer" onSelect={() => handleOpenModal('edit')}>
                      <Edit3 size={16} className="mr-2" /> {t('messaging:editGroup', 'Edit Group')}
                    </DropdownMenuItem>
                  )}
                  {(currentUserIsAdmin || activeConversation.settings?.allowMemberInvites) && (
                    <DropdownMenuItem className="cursor-pointer" onSelect={() => handleOpenModal('addMembers')}>
                      <UserPlus size={16} className="mr-2" /> {t('messaging:addMembers', 'Add Members')}
                    </DropdownMenuItem>
                  )}
                  {currentUserIsAdmin && (
                    <>
                      <DropdownMenuItem className="cursor-pointer" onSelect={() => handleOpenModal('manageMembers')}>
                        <Users size={16} className="mr-2" /> {t('messaging:manageMembers', 'Manage Members')}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer" onSelect={() => handleOpenModal('settings')}>
                        <Settings size={16} className="mr-2" /> {t('messaging:groupSettings', 'Group Settings')}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem className="cursor-pointer" onSelect={() => setIsLeaveConfirmOpen(true)}>
                    <LogOut size={16} className="mr-2" /> {t('messaging:leaveGroup', 'Leave Group')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                className="text-red-600 cursor-pointer dark:text-red-500 focus:bg-red-100 dark:focus:bg-red-900/20 focus:text-red-600 dark:focus:text-red-500"
                onSelect={handleDeleteClick}
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
          onOpenChange={setIsConfirmDeleteDialogOpen}
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
    <GroupInfoModal
      isOpen={activeModal === 'info'}
      onClose={() => setActiveModal(null)}
      conversation={activeConversation}
      currentUserId={user?._id}
      onOpenEdit={() => { setActiveModal(null); handleOpenModal('edit'); }}
      onOpenAddMembers={() => { setActiveModal(null); handleOpenModal('addMembers'); }}
      onOpenManageMembers={() => { setActiveModal(null); handleOpenModal('manageMembers'); }}
      onOpenSettings={() => { setActiveModal(null); handleOpenModal('settings'); }}
      onLeaveGroup={() => {
        setActiveModal(null);
        setIsLeaveConfirmOpen(true);
      }}
    />
  <EditGroupInfoModal
    isOpen={activeModal === 'edit'}
    onClose={() => setActiveModal(null)}
    conversation={activeConversation}
  />
  <AddMembersModal
    isOpen={activeModal === 'addMembers'}
    onClose={() => setActiveModal(null)}
    conversation={activeConversation}
  />
  <ManageMembersModal
    isOpen={activeModal === 'manageMembers'}
    onClose={() => setActiveModal(null)}
    conversation={activeConversation}
    currentUserId={user?._id}
  />
  <GroupSettingsModal
    isOpen={activeModal === 'settings'}
    onClose={() => setActiveModal(null)}
    conversation={activeConversation}
  />

  <AlertDialog open={isLeaveConfirmOpen} onOpenChange={setIsLeaveConfirmOpen}>
    <AlertDialogContent className="bg-white dark:bg-slate-950">
      <AlertDialogHeader>
        <AlertDialogTitle>{t('messaging:leaveGroupConfirmTitle', 'Leave this group?')}</AlertDialogTitle>
        <AlertDialogDescription>
          {t('messaging:leaveGroupConfirmDesc', 'You will no longer receive messages from this group. You can only rejoin if an admin adds you back.')}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
        <AlertDialogAction
          className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 dark:text-slate-50"
          onClick={handleLeaveGroup}
        >
          {t('messaging:leaveGroup', 'Leave Group')}
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
    description: PropTypes.string,
    groupAvatar: PropTypes.shape({ url: PropTypes.string }),
    context: PropTypes.shape({
      type: PropTypes.string,
      programId: PropTypes.string,
      lessonId: PropTypes.string,
      programAuthorId: PropTypes.string,
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
    currentUserRole: PropTypes.string,
    settings: PropTypes.shape({
      allowMemberInvites: PropTypes.bool,
      allowMemberInfoEdit: PropTypes.bool,
    }),
  }),
  onDeleteConversation: PropTypes.func,
  isDeleting: PropTypes.bool,
};

export default ChatHeader;