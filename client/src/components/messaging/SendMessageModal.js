import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog.tsx';
import ContextualMessageInput from './ContextualMessageInput';

const SendMessageModal = ({ isOpen, onClose, recipientId, recipientName }) => {
  const { t } = useTranslation('messaging');

  const handleMessageSent = () => {
    // The ContextualMessageInput already shows a success toast.
    // We just need to close the modal.
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-background dark:bg-zinc-900">
        <DialogHeader>
          <DialogTitle>{t('sendMessageTo', { name: recipientName, defaultValue: `Send message to ${recipientName}` })}</DialogTitle>
          <DialogDescription>
            {t('yourMessageWillBeSentDirectly', { name: recipientName, defaultValue: `Your message will be sent directly to ${recipientName}.` })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <ContextualMessageInput
            recipientId={recipientId}
            contextType="profile-message"
            contextId={recipientId} // Context is the coach's profile itself
            placeholderText={t('writeTo', { name: recipientName, defaultValue: `Write a message to ${recipientName}...` })}
            onMessageSent={handleMessageSent}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SendMessageModal;