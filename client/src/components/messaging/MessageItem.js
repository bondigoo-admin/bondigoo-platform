import React, { useEffect, useCallback, useState } from 'react';
import { FileText, Film, Mic, Check, CheckCheck, Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.tsx";
import { format } from 'date-fns';
import { logger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { getSecureAttachmentUrl } from '../../services/messageAPI';
import { Skeleton } from "../ui/skeleton.jsx";

const MessageItem = ({ message, isSent, showAvatar, conversationParticipantCount, onDeleteMessage, currentUserId, conversationType }) => {
  const { t } = useTranslation(['messaging', 'common']);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [secureUrl, setSecureUrl] = useState(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  const handleDeleteClick = useCallback(() => {
    logger.debug('[MessageItem] Delete message clicked', { messageId: message._id, userId: currentUserId });
    onDeleteMessage(message._id);
    setIsMenuOpen(false);
  }, [message._id, onDeleteMessage, currentUserId]);

  useEffect(() => {
    if (message.attachment?.publicId) {
      let isMounted = true;
      const fetchUrl = async () => {
        setIsLoadingUrl(true);
        setSecureUrl(null); 
        try {
          const response = await getSecureAttachmentUrl(message.attachment.publicId);
          if (isMounted) {
            setSecureUrl(response.secureUrl);
          }
        } catch (error) {
          logger.error('Failed to fetch secure URL for attachment', { messageId: message._id, publicId: message.attachment.publicId });
        } finally {
          if (isMounted) {
            setIsLoadingUrl(false);
          }
        }
      };
      fetchUrl();
      return () => { isMounted = false; };
    }
  }, [message.attachment?.publicId, message._id]);

  const formatTimestamp = (timestamp) => {
    try {
      return format(new Date(timestamp), 'HH:mm');
    } catch (error) {
      logger.error('[MessageItem] Error formatting timestamp:', { timestamp, error });
      return t('common:invalidTime');
    }
  };

  const getInitials = (firstName = '', lastName = '') => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

   const isGroup = conversationType ? (conversationType === 'group' || conversationType === 'broadcast') : (conversationParticipantCount > 2);
  const showSenderName = !isSent && showAvatar && isGroup;

  if (message.contentType === 'system') {
    return (
      <div className="py-2 text-center text-xs text-muted-foreground italic">
        {message.content}
      </div>
    );
  }

  if (!message || !message.senderId) {
    logger.warn('[MessageItem] Invalid message prop received:', message);
    return <div className="p-2 text-sm text-red-600 dark:text-red-500">{t('messaging:invalidMessageData')}</div>;
  }

  const { senderId: sender, content, contentType, createdAt, attachment, deliveryStatus } = message;

  logger.debug('[MessageItem] Rendering message', {
    messageId: message._id,
    senderId: sender._id,
    senderRole: sender.role,
    hasUserProfilePicture: !!sender.profilePicture?.url,
    hasCoachProfilePicture: !!sender.coachProfilePicture?.url,
    contentType,
    resourceType: attachment?.resourceType,
    hasContent: !!content,
    contentLength: content?.length || 0,
    timestamp: new Date().toISOString(),
  });

  const getReadStatus = () => {
    if (!isSent || !deliveryStatus) return null;
    const readCount = message.readBy?.length || 0;
    const requiredReads = conversationParticipantCount - 1;

    if (readCount >= requiredReads && requiredReads > 0) {
      return 'read';
    } else if (deliveryStatus === 'delivered') {
      return 'delivered';
    }
    return 'sent';
  };

  const readStatus = getReadStatus();
  const readStatusClasses = {
    sent: 'text-white/50',
    delivered: 'text-white/70',
    read: 'text-green-300',
  };

  const renderContent = () => {
    logger.debug('[MessageItem] Rendering content', {
      messageId: message._id,
      contentType,
      resourceType: attachment?.resourceType,
      hasAttachment: !!attachment,
      hasContent: !!content,
      contentLength: content?.length || 0,
      timestamp: new Date().toISOString(),
    });

    const caption = content && content.trim() && (
      <p className={`mt-1 text-left text-sm leading-normal opacity-90 ${isSent ? 'text-white' : 'text-gray-800 dark:text-gray-200'}`}>
        {content}
      </p>
    );

    if (Array.isArray(attachment) && attachment.length > 0) {
        return (
            <div className="flex flex-col">
                <div className="space-y-1.5 mt-1">
                    {attachment.map(file => (
                        <a key={file.publicId} href={file.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2.5 rounded-md border p-2 px-3 transition-colors ${isSent ? 'border-white/20 bg-white/10 hover:bg-white/15' : 'border-gray-200 bg-black/5 hover:bg-black/10 dark:border-gray-700 dark:bg-white/5 dark:hover:bg-white/10'}`}>
                            <FileText size={20} className={`flex-shrink-0 opacity-70 ${isSent ? 'text-white/70' : ''}`} />
                            <div className="flex min-w-0 flex-col">
                                <span className={`max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium ${isSent ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}>
                                    {file.originalFilename}
                                </span>
                                {file.bytes && (
                                    <span className={`text-xs opacity-70 ${isSent ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                                        {(file.bytes / 1024).toFixed(2)} KB
                                    </span>
                                )}
                            </div>
                        </a>
                    ))}
                </div>
                {caption}
            </div>
        );
    }

    if (attachment && attachment.resourceType) {
      const thumbnailClasses = `h-full w-full rounded-sm border object-cover ${isSent ? 'border-white/20' : 'border-gray-200 dark:border-gray-700'}`;
      const fileAttachmentClasses = `mt-1 flex items-center gap-2.5 rounded-md border p-2 px-3 transition-colors ${isSent ? 'border-white/20 bg-white/10 hover:bg-white/15' : 'border-gray-200 bg-black/5 hover:bg-black/10 dark:border-gray-700 dark:bg-white/5 dark:hover:bg-white/10'}`;

      switch (attachment.resourceType) {
        case 'image':
          if (isLoadingUrl) return <Skeleton className="mt-1 h-[150px] w-[200px] rounded-sm" />;
          return (
            <div className="flex flex-col">
              {secureUrl && (
                <a href={secureUrl} target="_blank" rel="noopener noreferrer" className="relative mt-1 block max-w-[200px] max-h-[200px] hover:opacity-90" aria-label={t('messaging:viewImage', { filename: attachment.originalFilename })}>
                  <img src={secureUrl} alt={attachment.originalFilename || t('messaging:sentImage')} className={thumbnailClasses} loading="lazy" />
                </a>
              )}
              {caption}
            </div>
          );
        case 'video':
          if (isLoadingUrl) return <Skeleton className="mt-1 h-[150px] w-[200px] rounded-sm" />;
          return (
            <div className="flex flex-col">
               {secureUrl && (
                <a href={secureUrl} target="_blank" rel="noopener noreferrer" className="group relative mt-1 block max-w-[200px] max-h-[200px] hover:opacity-90" aria-label={t('messaging:viewVideo', { filename: attachment.originalFilename })}>
                  <img src={`${attachment.url.replace(/\.mp4$/, '.jpg')}`} alt={attachment.originalFilename || t('messaging:sentVideo')} className={thumbnailClasses} loading="lazy" />
                  <Film size={32} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-80 transition group-hover:bg-black/70 group-hover:opacity-100" />
                </a>
               )}
              {caption}
            </div>
          );
        case 'file':
        case 'audio':
        case 'raw':
        default:
          logger.warn('[MessageItem] Unsupported or legacy resource type', {
            messageId: message._id,
            resourceType: attachment.resourceType,
            contentType,
            timestamp: new Date().toISOString(),
          });
          const isAudio = attachment.resourceType === 'audio';
          const IconComponent = isAudio ? Mic : FileText;
          if (isLoadingUrl) return <Skeleton className="mt-1 h-[52px] w-[220px] rounded-md" />;
          return (
            <div className="flex flex-col">
              {secureUrl && (
                <a href={secureUrl} target="_blank" rel="noopener noreferrer" download={attachment.originalFilename} className={fileAttachmentClasses} aria-label={t('messaging:downloadFile', { filename: attachment.originalFilename })}>
                  <IconComponent size={20} className={`flex-shrink-0 opacity-70 ${isSent ? 'text-white/70' : ''}`} />
                  <div className="flex min-w-0 flex-col">
                    <span className={`max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium ${isSent ? 'text-white' : 'text-gray-800 dark:text-gray-100'}`}>
                      {attachment.originalFilename || t('messaging:file')}
                    </span>
                    <span className={`text-xs opacity-70 ${isSent ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                      {attachment.bytes ? `${(attachment.bytes / 1024 / 1024).toFixed(2)} MB` : ''}
                    </span>
                  </div>
                </a>
              )}
              {caption}
            </div>
          );
      }
    }

    if (contentType === 'text' && content) {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    logger.warn('[MessageItem] No valid content or attachment', {
      messageId: message._id,
      contentType,
      hasAttachment: !!attachment,
      timestamp: new Date().toISOString(),
    });
    return (
      <p className="italic text-red-500">
        {t('messaging:unsupportedMessageType', { type: contentType })}
      </p>
    );
  };

  const baseItemClasses = `flex max-w-[75%] gap-2`;
  const alignmentClasses = isSent ? 'ml-auto flex-row-reverse' : 'mr-auto';
  const bubbleClasses = `relative break-words rounded-lg px-2.5 py-1.5 text-sm leading-normal ${isSent ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-md'}`;

  const DeletedMessage = ({ text }) => (
    <div className={`${baseItemClasses} ${alignmentClasses}`}>
      {!isSent && showAvatar && (
        <Avatar className="h-7 w-7 flex-shrink-0 mt-auto">
          <AvatarImage src={sender.coachProfilePicture?.url || sender.profilePicture?.url || ''} alt={sender.firstName} />
          <AvatarFallback>{getInitials(sender.firstName, sender.lastName)}</AvatarFallback>
        </Avatar>
      )}
      {!showAvatar && !isSent && <div className="w-7 flex-shrink-0"></div>}
      <div className="rounded-lg px-2.5 py-1.5">
        <p className="italic text-gray-500 dark:text-gray-400">
          <Trash2 size={14} className="mr-1.5 inline-block" /> {text}
        </p>
        <span className="mt-1 flex justify-end text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(createdAt)}</span>
      </div>
    </div>
  );

  if (message.deletedUniversally) {
    return <DeletedMessage text={t('messaging:deletedMessage')} />;
  }

  if (message.deletedFor?.some(id => id.toString() === currentUserId)) {
    return <DeletedMessage text={t('messaging:youDeletedMessage')} />;
  }

  return (
    <div className={`${baseItemClasses} ${alignmentClasses}`}>
      {!isSent && showAvatar && (
        <Avatar className="h-7 w-7 flex-shrink-0 mt-auto">
          <AvatarImage src={sender.coachProfilePicture?.url || sender.profilePicture?.url || ''} alt={sender.firstName} />
          <AvatarFallback>{getInitials(sender.firstName, sender.lastName)}</AvatarFallback>
        </Avatar>
      )}
      {!showAvatar && !isSent && <div className="w-7 flex-shrink-0"></div>}
     <div className="flex flex-col">
      {showSenderName && (
        <span className="text-xs text-muted-foreground ml-2.5 mb-0.5">
          {sender.firstName} {sender.lastName}
        </span>
      )}
      <div className={bubbleClasses}>
        {renderContent()}
        <span className={`mt-1 flex items-center justify-end gap-1 text-right text-xs ${isSent ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
          {formatTimestamp(createdAt)}
          {isSent && (
            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button className={`ml-1 flex-shrink-0 cursor-pointer transition-opacity hover:opacity-70 ${readStatusClasses[readStatus]}`} aria-label={t('messaging:openMessageOptions')}>
                  {readStatus === 'sent' && <Check size={14} />}
                  {readStatus === 'delivered' && <CheckCheck size={14} />}
                  {readStatus === 'read' && <CheckCheck size={14} />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-950">
                <DropdownMenuItem className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm text-red-600 outline-none transition-colors hover:bg-red-50 focus:bg-red-50 dark:text-red-500 dark:hover:bg-red-900/50 dark:hover:text-red-400 dark:focus:bg-red-900/50 dark:focus:text-red-400" onClick={handleDeleteClick}>
                  <Trash2 size={16} className="mr-2" />
                  {readStatus === 'sent' ? t('messaging:deleteForEveryone') : t('messaging:deleteForMe')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </div>
      </div>
    </div>
  );
};

MessageItem.propTypes = {
  message: PropTypes.shape({
    _id: PropTypes.string,
    senderId: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        _id: PropTypes.string,
        firstName: PropTypes.string,
        lastName: PropTypes.string,
        role: PropTypes.string,
        profilePicture: PropTypes.shape({ url: PropTypes.string }),
        coachProfilePicture: PropTypes.shape({ url: PropTypes.string }),
      }),
    ]),
    content: PropTypes.string,
    contentType: PropTypes.string,
    createdAt: PropTypes.string.isRequired,
    attachment: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    readBy: PropTypes.array,
    deliveryStatus: PropTypes.string,
    deletedFor: PropTypes.array,
    deletedUniversally: PropTypes.bool,
 }).isRequired,
  isSent: PropTypes.bool.isRequired,
  showAvatar: PropTypes.bool.isRequired,
  conversationParticipantCount: PropTypes.number,
  conversationType: PropTypes.string,
  onDeleteMessage: PropTypes.func.isRequired,
  currentUserId: PropTypes.string.isRequired,
};

export default MessageItem;