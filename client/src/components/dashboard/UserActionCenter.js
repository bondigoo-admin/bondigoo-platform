import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger.js';
import NotificationItemContent from '../NotificationItemContent';
import { useQueryClient } from 'react-query';

/**
 * Renders a single notification item.
 * It's now a simple component that receives fully populated data from the backend.
 */
const ActionCenterNotificationItem = ({ notification, onAction, isExpanded, onToggleExpand }) => {
  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <NotificationItemContent
        notification={notification}
        // The backend now populates bookingId, so no separate fetch or loading state is needed.
        bookingData={notification.metadata.bookingId} 
        isLoadingBooking={false}
        onAction={onAction}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
      />
    </div>
  );
};

/**
 * A simplified Action Center that relies on the backend to provide pre-filtered, actionable notifications.
 */
const UserActionCenter = ({ notifications, isLoading }) => {
  const { t } = useTranslation('userdashboard');
  const [expandedId, setExpandedId] = useState(null);
  const queryClient = useQueryClient();
  
  const actionableNotifications = useMemo(() => {
    if (!Array.isArray(notifications)) {
        return [];
    }
    // The ONLY frontend filter, as requested.
    // The main filtering (`requiresAction: true`) is now done on the backend.
    return notifications.filter(n => !n.validActions?.includes('end_session'));
  }, [notifications]);

  const hasNotifications = actionableNotifications.length > 0;

  const handleToggleExpand = (notificationId) => {
    setExpandedId(prevId => (prevId === notificationId ? null : notificationId));
  };

  const handleAction = (action, result) => {
    logger.info('[UserActionCenter] Action taken, invalidating user dashboard queries.', { action, result });
    queryClient.invalidateQueries('notifications');
    queryClient.invalidateQueries('userDashboardData');
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('widgets.actionCenter', 'Action Center')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-y-auto">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        
        {!isLoading && !hasNotifications && (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              <p>{t('actions.noPendingActions', 'No pending actions.')}</p>
          </div>
        )}

        {!isLoading && hasNotifications && actionableNotifications.map(notification => {
          return (
            <ActionCenterNotificationItem
              key={notification._id}
              notification={notification}
              onAction={handleAction}
              isExpanded={expandedId === notification._id}
              onToggleExpand={() => handleToggleExpand(notification._id)}
            />
          )
        })}
      </CardContent>
    </Card>
  );
};

export default UserActionCenter;