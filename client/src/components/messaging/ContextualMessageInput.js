import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { createOrGetConversation, sendMessage } from '../../services/messageAPI';
import { logger } from '../../utils/logger';
import { Input } from '../ui/input.tsx';
import { Button } from '../ui/button.tsx';
import { Loader2 } from 'lucide-react';

const ContextualMessageInput = ({ contextId, contextType, recipientId, placeholderText, onMessageSent, conversationId: initialConversationId }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);

  useEffect(() => {
    setConversationId(initialConversationId);
  }, [initialConversationId]);

  const getOrCreateConversation = async () => {
    if (conversationId) return conversationId;
    
    setIsLoading(true);
    try {
      const conv = await createOrGetConversation({
        recipientId,
        contextType,
        contextId,
      });
      setConversationId(conv._id);
      return conv._id;
    } catch (error) {
      toast.error(t('messaging:errorCreatingConversation', 'Could not start conversation.'));
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const sendMessageMutation = useMutation({
    mutationFn: async (currentConversationId) => {
      logger.info('[ContextualMessageInput] Attempting to send message', {
        conversationId: currentConversationId,
        recipientId,
        contentLength: message.length,
        contextType,
        contextId,
        userId: user?._id,
        timestamp: new Date().toISOString(),
      });
      return await sendMessage({
        recipientUserId: recipientId,
        content: message,
        contentType: 'text',
        conversationId: currentConversationId,
        contextType,
        contextId,
      });
    },
    onSuccess: (sentMessage) => {
      logger.info('[ContextualMessageInput] Message sent successfully', {
        messageId: sentMessage._id,
        conversationId,
        recipientId,
        userId: user?._id,
        timestamp: new Date().toISOString(),
      });
      
      queryClient.invalidateQueries(['messages', 'infiniteList', conversationId]);
      
      setMessage('');
      if (!initialConversationId) {
        toast.success(t('messaging:messageSentSuccess'));
      }
      onMessageSent?.(sentMessage);
    },
    onError: (error) => {
      logger.error('[ContextualMessageInput] Error sending message', {
        error: error.message,
        conversationId,
        recipientId,
        userId: user?._id,
        status: error.status,
        timestamp: new Date().toISOString(),
      });
      toast.error(t('messaging:errorSendMessage'));
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const handleSend = async () => {
    if (isLoading || !message.trim()) {
      logger.debug('[ContextualMessageInput] Send blocked', {
        isLoading,
        hasMessage: !!message.trim(),
        userId: user?._id,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    try {
      setIsLoading(true);
      const currentConvId = await getOrCreateConversation();
      if (currentConvId) {
        sendMessageMutation.mutate(currentConvId);
      }
    } catch (error) {
      // Error is already toasted in getOrCreateConversation
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex w-full items-center space-x-2">
      <Input
        type="text"
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholderText || t('messaging:enterMessage')}
        disabled={isLoading || sendMessageMutation.isLoading}
        aria-label={t('messaging:enterMessage')}
        className="flex-grow"
      />
      <Button
        type="button"
        onClick={handleSend}
        disabled={isLoading || sendMessageMutation.isLoading || !message.trim()}
        aria-label={t('messaging:send')}
      >
        {sendMessageMutation.isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : t('messaging:send')}
      </Button>
    </div>
  );
};

export default ContextualMessageInput;