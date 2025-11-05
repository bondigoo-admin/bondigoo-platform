import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationActions } from '../hooks/useNotificationActions';
import NotificationItemContent from './NotificationItemContent';
import { useProfilePicture } from '../hooks/useProfilePicture';
import { logger } from '../utils/logger';
import { motion } from 'framer-motion';
import { Checkbox } from './ui/checkbox.tsx';
import { cn } from '../lib/utils';

export const NotificationItem = ({ notification, onAction, onToggleSelect, selected }) => {
  const { t } = useTranslation(['notifications', 'common']);
  const { markAsRead, deleteNotification } = useNotificationActions();
  const bookingData = React.useMemo(() => {
    const booking = notification?.metadata?.bookingId;
    return (typeof booking === 'object' && booking !== null) ? booking : null;
  }, [notification]);
  const { isUploading } = useProfilePicture(notification.senderId);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAction = (action, result) => {
    logger.info('[NotificationItem] Action handled:', { action, notificationId: notification._id });
    if (onAction) {
      onAction(action, result);
    }
  };

  const toggleExpand = (e) => {
    e?.stopPropagation();
    setIsExpanded((prev) => !prev);
  };
  
  const handleContainerClick = () => {
    if (!notification.isRead) {
      markAsRead(notification._id);
    }
    // The main click action (like navigating or opening a modal) is now handled inside NotificationItemContent
  };


  return (
    <motion.div
      className={cn(
        "relative flex items-center transition-colors",
        !notification.isRead && "bg-blue-50 dark:bg-blue-900/20",
        selected && "bg-indigo-50 dark:bg-indigo-900/20"
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center pl-4 py-4">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={t('notifications:selectNotification')}
        />
      </div>
      <NotificationItemContent
        notification={notification}
        bookingData={bookingData}
        isLoadingBooking={false}
        onAction={handleAction}
        isExpanded={isExpanded}
        onToggleExpand={toggleExpand}
        onContainerClick={handleContainerClick}
      />
    </motion.div>
  );
};

NotificationItem.displayName = 'NotificationItem';