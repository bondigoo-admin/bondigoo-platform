import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NotificationItem } from './NotificationItem';
import { getGroupStats, shouldCollapseGroup } from '../utils/notificationGrouper';
import { Button } from './ui/button.tsx';
import { cn } from '../lib/utils';

export const NotificationGroup = ({
  groupKey,
  notifications,
  userPreferences,
  selectedNotifications,
  onNotificationClick,
  onToggleSelection,
  onMarkGroupAsRead,
}) => {
  const { t } = useTranslation(['notifications', 'common']);
  const [isCollapsed, setIsCollapsed] = useState(() => 
    shouldCollapseGroup(notifications, userPreferences)
  );

  const stats = getGroupStats(notifications);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);
  
  const handleMarkAllRead = (e) => {
    e.stopPropagation();
    onMarkGroupAsRead(notifications.filter(n => !n.isRead).map(n => n._id));
  };

  const getGroupTitle = () => {
    switch (groupKey) {
      case 'today':
        return t('notifications:groups.today');
      case 'yesterday':
        return t('notifications:groups.yesterday');
      case 'thisWeek':
        return t('notifications:groups.thisWeek');
      case 'earlier':
        return t('notifications:groups.older');
      case 'high':
        return t('notifications:groups.priorities.high');
      case 'medium':
        return t('notifications:groups.priorities.medium');
      case 'low':
        return t('notifications:groups.priorities.low');
      default:
        return t(`notifications:groups.types.${groupKey}`, { defaultValue: groupKey });
    }
  };

 return (
    <div className="border-b border-slate-200 dark:border-slate-800 last:border-b-0">
      <div
        className={cn(
          'sticky top-0 z-10 flex cursor-pointer items-center justify-between bg-slate-50/95 px-4 py-3 transition-colors dark:bg-slate-900/80 backdrop-blur-sm',
          stats.hasUrgent && 'bg-red-50 dark:bg-red-900/20'
        )}
        onClick={toggleCollapse}
      >
        <div className="flex items-center gap-3">
           <ChevronDown className={cn("h-5 w-5 text-slate-500 transition-transform duration-200", !isCollapsed && "rotate-180")} />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {getGroupTitle()}
          </h3>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5">
            {stats.total}
          </span>
        </div>
        
        <div className="flex items-center">
          {stats.unread > 0 && (
             <Button
                variant="link"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs text-primary dark:text-indigo-400 h-auto py-1 px-2"
              >
                {t('notifications:markAllRead')} ({stats.unread})
              </Button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {notifications.map(notification => (
                <NotificationItem
                  key={notification._id}
                  notification={notification}
                  selected={selectedNotifications.has(notification._id)}
                  onClick={() => onNotificationClick(notification)}
                  onToggleSelect={() => onToggleSelection(notification._id)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationGroup;