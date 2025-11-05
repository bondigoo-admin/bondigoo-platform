import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../../utils/logger.js';
import NotificationItemContent from '../../NotificationItemContent';

const ActionCenter = ({ notifications, isLoading, dragHandleProps }) => {
  const { t } = useTranslation('coach_dashboard');
  const [expandedId, setExpandedId] = useState(null);
  
  logger.info('[ActionCenter] Component rendered with props:', { notifications, isLoading });

  const hasNotifications = Array.isArray(notifications) && notifications.length > 0;

  const handleToggleExpand = (notificationId) => {
    setExpandedId(prevId => (prevId === notificationId ? null : notificationId));
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader {...(dragHandleProps || {})} className="cursor-move">
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          {t('actions.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-y-auto">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        
        {!isLoading && !hasNotifications && (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              <p>{t('actions.noPendingActions')}</p>
          </div>
        )}

        {!isLoading && hasNotifications && notifications.map(notification => {
          logger.debug('[ActionCenter] Rendering NotificationItemContent for notification:', { notificationId: notification._id });
          return (
            <div key={notification._id} className="border rounded-lg overflow-hidden bg-background">
              <NotificationItemContent
                notification={notification}
                bookingData={notification.metadata.bookingId}
                isLoadingBooking={false}
                onAction={() => {/*test*/}}
                isExpanded={expandedId === notification._id}
                onToggleExpand={() => handleToggleExpand(notification._id)}
              />
            </div>
          )
        })}
      </CardContent>
    </Card>
  );
};

export default ActionCenter;