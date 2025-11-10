import React, { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Send, Paperclip, X, Film, FileText, Mic, AlertTriangle } from 'lucide-react';
import { logger } from '../../utils/logger';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { debounce } from 'lodash';
import { useTranslation } from 'react-i18next';
import { useNotificationSocket } from '../../contexts/SocketContext';
import { SOCKET_EVENTS } from '../../constants/socketEvents';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Progress } from '../ui/progress.jsx';

const MessageInput = ({ onSendMessage, conversationId, isSending, recipientUserId, activeConversation }) => {
  const { t } = useTranslation(['messaging', 'common']);
  const { user } = useAuth();
  const userId = user?._id;
  const { socket, isConnected } = useNotificationSocket();
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [caption, setCaption] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isCompletionVisible, setIsCompletionVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef(null);
  const captionInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const isBroadcast = activeConversation?.type === 'broadcast';
  const currentUserIsAdmin = activeConversation?.currentUserRole === 'admin';

  const isAttachmentDisabled = isUploading || isPreviewOpen || (isBroadcast && !currentUserIsAdmin);
  const isInputDisabled = isSending || (isBroadcast && !currentUserIsAdmin);
  const canSendMessage = !isUploading && !isSending && (message.trim().length > 0 || (attachment && attachment.status === 'complete'));
  const placeholderText = isBroadcast && !currentUserIsAdmin
    ? t('messaging:broadcastOnlyAdminsCanPost', 'Only admins can post in this channel')
    : t('messaging:inputPlaceholder');

  const emitTypingStart = useCallback(
    debounce(() => {
      if (!socket || !isConnected || !recipientUserId || !userId) {
        logger.warn('[MessageInput] Cannot emit START_TYPING: missing prerequisites', {
          hasSocket: !!socket,
          isConnected,
          recipientUserId,
          userId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      const payload = { senderUserId: userId, recipientUserId };
      try {
        JSON.stringify(payload);
        socket.emit(SOCKET_EVENTS.MESSAGING.START_TYPING, payload);
        logger.debug('[MessageInput] Emitted START_TYPING to user room', {
          senderUserId: userId,
          recipientUserId,
          conversationId: conversationId || 'none',
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('[MessageInput] Failed to emit START_TYPING: invalid payload', {
          error: error.message,
          payload,
          userId,
          recipientUserId,
          timestamp: new Date().toISOString(),
        });
      }
    }, 500),
    [socket, isConnected, recipientUserId, userId, conversationId]
  );

  const emitTypingStop = useCallback(
    debounce(() => {
      if (!socket || !isConnected || !recipientUserId || !userId) {
        logger.warn('[MessageInput] Cannot emit STOP_TYPING: missing prerequisites', {
          hasSocket: !!socket,
          isConnected,
          recipientUserId,
          userId,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      socket.emit(SOCKET_EVENTS.MESSAGING.STOP_TYPING, {
        senderUserId: userId,
        recipientUserId,
      });
      logger.debug('[MessageInput] Emitted STOP_TYPING to user room', {
        senderUserId: userId,
        recipientUserId,
        conversationId: conversationId || 'none',
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    }, 1000),
    [socket, isConnected, recipientUserId, userId, conversationId]
  );

  useEffect(() => {
    return () => {
      emitTypingStart.cancel();
      emitTypingStop.cancel();
      if (isTyping) {
        emitTypingStop.flush();
        logger.info('[MessageInput] Flushed STOP_TYPING on cleanup', {
          userId,
          recipientUserId,
          conversationId: conversationId || 'none',
          timestamp: new Date().toISOString(),
        });
      }
    };
  }, [emitTypingStart, emitTypingStop, isTyping, userId, recipientUserId, conversationId]);

  useEffect(() => {
    let timer;
    if (attachment?.status === 'complete') {
        setIsCompletionVisible(true);
        timer = setTimeout(() => {
            setIsCompletionVisible(false);
        }, 500);
    } else if (attachment?.status !== 'complete') {
        setIsCompletionVisible(false);
    }
    return () => clearTimeout(timer);
  }, [attachment]);

  const handleInputChange = (e) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }

    if (newMessage.trim() && !isTyping) {
      setIsTyping(true);
      emitTypingStart();
    } else if (!newMessage.trim() && isTyping) {
      setIsTyping(false);
      emitTypingStart.cancel();
      emitTypingStop();
    } else if (isTyping) {
      emitTypingStart();
      emitTypingStop.cancel();
    }
  };

  const handleCaptionChange = (e) => {
    setCaption(e.target.value);
  };

  const handleSend = useCallback(() => {
    if (!canSendMessage) {
      logger.debug('[MessageInput] Send aborted: invalid state', {
        isSending,
        isUploading,
        hasMessage: !!message.trim(),
        hasAttachment: !!attachment,
        attachmentStatus: attachment?.status,
        userId,
        recipientUserId,
        conversationId: conversationId || 'none',
        timestamp: new Date().toISOString(),
      });
      return;
    }
  
    if (!recipientUserId) {
      logger.error('[MessageInput] Cannot send message: missing recipientUserId', {
        userId,
        conversationId: conversationId || 'none',
        timestamp: new Date().toISOString(),
      });
      toast.error(t('messaging:recipientNotFound'));
      return;
    }
  
    // eslint-disable-next-line no-unused-vars
    const { status, progress, ...finalAttachment } = attachment || {};
    const hasFinalAttachment = attachment && status === 'complete';

    const contentType = hasFinalAttachment ? (finalAttachment.resourceType === 'image' ? 'image' : 'file') : 'text';
    const contentValue = hasFinalAttachment && finalAttachment.resourceType === 'image' ? (caption.trim() || null) : (message.trim() || null);
  
    const messageData = {
      recipientUserId,
      content: contentValue,
      contentType,
      attachment: hasFinalAttachment ? [finalAttachment] : null,
    };
  
    logger.info('[MessageInput] Sending message to user', {
      userId,
      recipientUserId,
      contentType,
      hasAttachment: hasFinalAttachment,
      hasContent: !!contentValue,
      contentLength: contentValue?.length || 0,
      resourceType: hasFinalAttachment ? finalAttachment.resourceType : 'none',
      conversationId: conversationId || 'none',
      timestamp: new Date().toISOString(),
    });
  
    try {
      onSendMessage(messageData);
      setMessage('');
      setAttachment(null);
      setCaption('');
      setIsPreviewOpen(false);
      if (isTyping) {
        setIsTyping(false);
        emitTypingStart.cancel();
        emitTypingStop.flush();
      }
    } catch (error) {
      logger.error('[MessageInput] Failed to send message', {
        userId,
        recipientUserId,
        conversationId: conversationId || 'none',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      toast.error(t('messaging:errorSendMessage'));
    }
  }, [
    message,
    attachment,
    caption,
    isSending,
    isUploading,
    onSendMessage,
    isTyping,
    canSendMessage,
    emitTypingStop,
    emitTypingStart,
    userId,
    recipientUserId,
    conversationId,
    t,
  ]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

const handleAttachmentChange = async (e) => {
    const file = e.target.files[0];
    const fileInput = e.target;
  
    if (!file) {
      logger.debug('[MessageInput] No file selected for attachment', { userId, conversationId: conversationId || 'none', timestamp: new Date().toISOString() });
      return;
    }
  
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      logger.warn('[MessageInput] Attachment size exceeds limit', { userId, fileName: file.name, fileSize: file.size, timestamp: new Date().toISOString() });
      toast.error(t('messaging:fileSizeExceedsLimit', { maxSize: maxSize / 1024 / 1024 }));
      fileInput.value = null;
      return;
    }
  
    setIsUploading(true);
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const localUrl = isImage ? URL.createObjectURL(file) : null;
    
    let resourceType = 'raw';
    if (isImage) resourceType = 'image';
    if (isVideo) resourceType = 'video';
    
    setAttachment({
      url: localUrl,
      publicId: `temp_${Date.now()}`,
      resourceType: resourceType,
      format: file.name.split('.').pop().toLowerCase(),
      originalFilename: file.name,
      bytes: file.size,
      status: 'uploading',
      progress: 0,
    });
    if (isImage) setIsPreviewOpen(true);
  
    try {
      const response = await fetch('/api/messages/upload-signature', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Failed to get upload signature: ${response.status} ${errorData.message || ''}`);
      }
      const { signature, timestamp, apiKey, cloudName, uploadPreset, folder } = await response.json();
  
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('upload_preset', uploadPreset);
      formData.append('folder', folder);
  
     const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setAttachment(prev => {
              if (!prev || prev.status !== 'uploading') return prev;
              return { ...prev, progress: percent };
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const uploadData = JSON.parse(xhr.responseText);
          if (uploadData.secure_url) {
            const newAttachment = {
              url: uploadData.secure_url,
              publicId: uploadData.public_id,
              resourceType: uploadData.resource_type,
              format: uploadData.format || file.name.split('.').pop().toLowerCase(),
              originalFilename: file.name,
              bytes: uploadData.bytes,
              status: 'complete',
              progress: 100,
            };
            if (localUrl) URL.revokeObjectURL(localUrl);
            setAttachment(newAttachment);
            setIsUploading(false);
            logger.info('[MessageInput] Attachment uploaded successfully', { userId, publicId: uploadData.public_id, timestamp: new Date().toISOString() });
          } else {
            throw new Error('Upload succeeded but no secure_url received');
          }
        } else {
          const errorText = xhr.responseText || `{"error":{"message":"${xhr.statusText}"}}`;
          const errorData = JSON.parse(errorText);
          throw new Error(`Cloudinary upload failed: ${xhr.status} ${errorData.error?.message || ''}`);
        }
      };

      xhr.onerror = () => {
        throw new Error(t('messaging:uploadNetworkError', 'Upload failed due to a network error.'));
      };
      
      xhr.send(formData);
    } catch (error) {
      logger.error('[MessageInput] Attachment upload failed', { userId, error: error.message, fileName: file?.name, timestamp: new Date().toISOString() });
      toast.error(`${t('common:uploadFailed')}: ${error.message}`);
      setAttachment(prev => (prev ? { ...prev, status: 'error', progress: 0 } : null));
      setIsUploading(false);
      if (localUrl) URL.revokeObjectURL(localUrl);
    }
  };

  const removeAttachment = () => {
    if (attachment && attachment.url && attachment.url.startsWith('blob:')) {
      URL.revokeObjectURL(attachment.url);
    }
    setAttachment(null);
    setCaption('');
    setIsPreviewOpen(false);
    if (fileInputRef.current) {
        fileInputRef.current.value = null;
    }
    logger.debug('[MessageInput] Attachment removed', {
      userId,
      recipientUserId,
      conversationId: conversationId || 'none',
      timestamp: new Date().toISOString(),
    });
  };

return (
    <div className="flex flex-col gap-2 p-2 md:p-4 bg-background border-t border-border">
      {attachment && !isPreviewOpen && (
        <div className="relative flex items-center justify-between gap-2 p-2 bg-muted rounded-lg border border-border">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {attachment.resourceType === 'file' && <FileText size={24} className="text-muted-foreground flex-shrink-0" />}
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-medium text-foreground truncate">{attachment.originalFilename}</span>
              <span className="text-xs text-muted-foreground">{(attachment.bytes / 1024 / 1024).toFixed(2)} MB</span>
                {(attachment.status === 'uploading' || isCompletionVisible) && (
                  <Progress value={isCompletionVisible ? 100 : attachment.progress} className="h-1 w-full mt-1.5 bg-muted" />
                )}
                {attachment.status === 'error' && (
                    <div className="flex items-center text-xs text-destructive mt-1">
                        <AlertTriangle className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
                        <span>{t('common:uploadFailed')}</span>
                    </div>
                )}
            </div>
          </div>
          <Button
            onClick={removeAttachment}
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0 rounded-full hover:bg-destructive hover:text-destructive-foreground"
            aria-label={t('messaging:removeAttachment')}
          >
            <X size={16} />
          </Button>
        </div>
      )}
      {isPreviewOpen && attachment && attachment.resourceType === 'image' && (
        <div className="relative flex flex-col gap-2 p-3 bg-muted rounded-lg border border-border">
          <Button
            onClick={removeAttachment}
            variant="ghost"
            size="icon"
            className="absolute top-1 right-1 h-7 w-7 rounded-full bg-background/50 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground z-10"
            aria-label={t('messaging:closePreview')}
          >
            <X size={20} />
          </Button>
          <div className="relative self-center max-w-xs md:max-w-lg">
            <img
              src={attachment.url}
              alt={attachment.originalFilename}
              className="max-h-96 w-full h-auto object-contain rounded-md"
              loading="lazy"
            />
            {attachment.status === 'uploading' && (
                <div className="absolute bottom-2 left-2 right-2">
                    <Progress value={attachment.progress} className="h-1.5 bg-black/30 backdrop-blur-sm" />
                </div>
            )}
            {isCompletionVisible && (
                <div className="absolute bottom-2 left-2 right-2">
                    <Progress value={100} className="h-1.5 bg-black/30 backdrop-blur-sm" />
                </div>
            )}
            {attachment.status === 'error' && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center rounded-md bg-black/70 p-4 text-white">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                    <p className="mt-2 text-sm font-semibold">{t('common:uploadFailed')}</p>
                </div>
            )}
          </div>
          <Input
            ref={captionInputRef}
            value={caption}
            onChange={handleCaptionChange}
            onKeyPress={handleKeyPress}
            placeholder={t('messaging:addCaptionPlaceholder')}
            className="self-center w-full max-w-xs md:max-w-lg"
            aria-label={t('messaging:captionInput')}
            disabled={isSending}
          />
        </div>
      )}
     <div className="flex items-end gap-2 p-1.5 border border-input rounded-2xl bg-background transition-all has-[textarea:focus]:border-indigo-600 dark:has-[textarea:focus]:border-indigo-500">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-full flex-shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={isAttachmentDisabled}
          aria-label={t('messaging:attachFile')}
        >
          <Paperclip size={20} />
        </Button>
        <input
          ref={fileInputRef}
          id="file-upload"
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
          onChange={handleAttachmentChange}
          hidden
          key={attachment ? 'attached' : 'detached'}
        />
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholderText}
          className="flex-1 resize-none border-0 bg-transparent p-2 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[24px] max-h-32 text-base"
          disabled={isInputDisabled}
          rows={1}
          aria-label={t('messaging:messageTextInput')}
        />
        <Button
            onClick={handleSend}
            disabled={!canSendMessage || (isBroadcast && !currentUserIsAdmin)}
            size="icon"
            className="w-10 h-10 rounded-full flex-shrink-0"
            aria-label={t('messaging:sendMessage')}
          >
          <Send size={20} />
        </Button>
      </div>
    </div>
  );
};

MessageInput.propTypes = {
  onSendMessage: PropTypes.func.isRequired,
  conversationId: PropTypes.string,
  isSending: PropTypes.bool,
  recipientUserId: PropTypes.string,
  activeConversation: PropTypes.shape({
    type: PropTypes.string,
    currentUserRole: PropTypes.string,
  }),
};

export default MessageInput;