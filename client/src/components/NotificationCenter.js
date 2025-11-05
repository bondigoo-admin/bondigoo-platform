import React from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';
import { useNotifications } from '../hooks/useNotifications';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, Trash2, Loader2, AlertCircle, X } from 'lucide-react';
import { useQueryClient } from 'react-query';
import io from 'socket.io-client';
import { SocketProvider } from '../contexts/SocketContext';
import { NotificationItem } from './NotificationItem';
import ErrorBoundary from './ErrorBoundary';
import { toast } from 'react-hot-toast';
import { Button } from './ui/button.tsx';
import { Card, CardContent } from './ui/card.tsx';
import { Checkbox } from './ui/checkbox.tsx';
import { Label } from './ui/label.tsx';
import { cn } from '../lib/utils';

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const NotificationCenterInner = ({ userId, token }) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('notifications');
  const {
    notifications,
    isLoading,
    error,
    selectedNotifications,
    filterType,
    setFilterType,
    handleBatchAction,
    toggleSelection,
    selectAll,
    clearSelection,
  } = useNotifications();

  const socket = React.useMemo(() => {
    if (!userId || !token) return null;
    return io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
      auth: { token, userId },
    });
  }, [userId, token]);

  React.useEffect(() => {
    if (!socket) return;
    socket.on('connect', () => socket.emit('login', { userId }));
    const handleUpdate = (data) => {
        logger.info('[Socket] Received update, invalidating notifications query', data);
        queryClient.invalidateQueries(['notifications']);
    };
    socket.on('notification_actioned', handleUpdate);
    socket.on('notification_read', handleUpdate);
    socket.on('notification_read_batch', handleUpdate);
    socket.on('connect_error', (err) => logger.error('[Socket] Connection Error', { error: err.message }));
    return () => {
      socket.off('notification_actioned', handleUpdate);
      socket.off('notification_read', handleUpdate);
      socket.off('notification_read_batch', handleUpdate);
      socket.disconnect();
    };
  }, [socket, queryClient, userId]);

  const allNotificationIds = React.useMemo(() => notifications.map(n => n._id), [notifications]);
  const isAllSelected = selectedNotifications.size > 0 && selectedNotifications.size === allNotificationIds.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      clearSelection();
    } else {
      selectAll(allNotificationIds);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h3 className="text-lg font-semibold">{t('error')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error.message}</p>
          <Button onClick={() => queryClient.invalidateQueries(['notifications', filterType])}>
            {t('retry')}
          </Button>
        </div>
      );
    }
    if (notifications.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-8 text-center h-64">
          <Bell className="h-12 w-12 text-slate-300 dark:text-slate-700" />
          <h3 className="text-lg font-semibold">{t('allCaughtUp')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('noNewNotifications')}</p>
        </div>
      );
    }

    return (
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {notifications.map(notification => (
            <ErrorBoundary key={notification._id}>
              <NotificationItem
                notification={notification}
                selected={selectedNotifications.has(notification._id)}
                onToggleSelect={() => toggleSelection(notification._id)}
              />
            </ErrorBoundary>
          ))}
      </div>
    );
  };

  const FilterButton = ({ value, label }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        logger.info(`[FRONTEND-CLICK] FilterButton clicked. Setting filterType to: '${value}'`);
        setFilterType(value);
      }}
      className={cn(
        "px-4 py-2 text-sm font-medium rounded-full transition-colors",
        filterType === value
          ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      )}
    >
      {label}
    </Button>
  );

  return (
    <Card className="max-w-4xl mx-auto my-4 md:my-8 overflow-hidden bg-white dark:bg-slate-900 shadow-sm rounded-lg">
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{t('title')}</h1>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-full">
            <FilterButton value="all" label={t('filters.all')} />
            <FilterButton value="unread" label={t('filters.unread')} />
            <FilterButton value="read" label={t('filters.read')} />
          </div>
        </div>
      </div>
      
      <AnimatePresence>
        {selectedNotifications.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-50 dark:bg-slate-900/50 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Checkbox id="selectAll" checked={isAllSelected} onCheckedChange={handleToggleSelectAll} />
                <Label htmlFor="selectAll" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t('selectedCount', { count: selectedNotifications.size })}
                </Label>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => handleBatchAction('markRead')}>
                  <Check className="mr-2 h-4 w-4" /> {t('actions.markAllRead')}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleBatchAction('delete')}>
                  <Trash2 className="mr-2 h-4 w-4" /> {t('actions.deleteSelected')}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearSelection}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CardContent className="p-0">
        {renderContent()}
      </CardContent>
    </Card>
  );
};

const NotificationCenter = ({ userId, token }) => (
  <SocketProvider userId={userId} token={token} namespace="/">
    <NotificationCenterInner userId={userId} token={token} />
  </SocketProvider>
);

export default NotificationCenter;