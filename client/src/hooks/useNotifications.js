// src/hooks/useNotifications.js

import { useState, useEffect, useCallback, useContext } from 'react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../contexts/AuthContext';
import { getNotifications, markNotificationAsRead, handleNotificationAction, batchMarkAsRead, batchMoveToTrash } from '../services/notificationAPI';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { logger } from '../utils/logger';
import { useEntityData } from './useEntityData';
import moment from 'moment';
import { useMemo } from 'react';

const createEmptyGroups = () => ({
  today: [],
  yesterday: [],
  thisWeek: [],
  earlier: []
});

export const useNotifications = () => {
  const { t } = useTranslation(['notifications']);
  const { user } = useContext(AuthContext);
  const queryClient = useQueryClient();

  const [selectedNotifications, setSelectedNotifications] = useState(new Set());
  const [groupingType, setGroupingType] = useState('date');
  const [sortBy, setSortBy] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterType, setFilterType] = useState('all');

const {
    data: notificationsData,
    isLoading,
    error,
    refetch
  } = useQuery(
    ['notifications', filterType],
    async () => {
      if (!user) return [];
      try {
        const params = { excludeTrash: true };
        if (filterType === 'unread') {
          params.isRead = 'false';
        } else if (filterType === 'read') {
          params.isRead = 'true';
        } else {
          params.status = 'all';
        }
        
        logger.info('[useNotifications] Fetching with params:', params);
        const response = await getNotifications(params);
        return response?.notifications?.filter(n => n.status !== 'trash') || [];
      } catch (error) {
        logger.error('[useNotifications] Error fetching notifications:', error);
        throw error;
      }
    },
    {
      enabled: !!user,
      staleTime: 60000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      onError: (error) => {
        logger.error('[useNotifications] Error in notifications query:', error);
        toast.error(t('notifications:fetchError'));
      }
    }
  );

  const fetchNotifications = useCallback(() => {
    refetch();
  }, [refetch]);

  // CHANGE: Memoize all mutations and callbacks to ensure they are stable.
  const trashMutation = useMutation(
    (notificationIds) => batchMoveToTrash(notificationIds),
    {
      onMutate: async (notificationIds) => {
        await queryClient.cancelQueries(['notifications']);
        const previousData = queryClient.getQueryData(['notifications']);
        queryClient.setQueryData(['notifications'], old => (old || []).filter(n => !notificationIds.includes(n._id)));
        setSelectedNotifications(new Set());
        return { previousData };
      },
      onSuccess: () => {
        toast.success(t('notifications:trashSuccess'));
        queryClient.invalidateQueries(['notifications']);
      },
      onError: (err, variables, context) => {
        logger.error('[useNotifications] Trash mutation error:', { error: err, notificationIds: variables });
        if (context?.previousData) {
          queryClient.setQueryData(['notifications'], context.previousData);
        }
        toast.error(t('notifications:trashError'));
      },
    }
  );

const markReadBatchMutation = useMutation(
    (notificationIds) => batchMarkAsRead(notificationIds),
    {
      onMutate: async (notificationIds) => {
        const queryKeyPrefix = ['notifications'];
        await queryClient.cancelQueries(queryKeyPrefix);
        
        const previousDataMap = new Map();
        queryClient.getQueryCache().findAll(queryKeyPrefix).forEach(query => {
          previousDataMap.set(query.queryKey, query.state.data);
        });

        queryClient.setQueriesData(queryKeyPrefix, (oldData) =>
          (oldData || []).map(n =>
            notificationIds.includes(n._id) ? { ...n, isRead: true } : n
          )
        );
        setSelectedNotifications(new Set());
        return { previousDataMap };
      },
      onError: (error, notificationIds, context) => {
        logger.error('[useNotifications] Batch mark as read failed', { error, notificationIds });
        if (context?.previousDataMap) {
          context.previousDataMap.forEach((data, queryKey) => {
            queryClient.setQueryData(queryKey, data);
          });
        }
        toast.error(t('notifications:markReadError'));
      },
    }
  );

  const handleBatchAction = useCallback(async (action) => {
    if (selectedNotifications.size === 0) {
      toast.error(t('notifications:noNotificationsSelected'));
      return;
    }
    const notificationIds = Array.from(selectedNotifications);
    if (action === 'markRead') {
      markReadBatchMutation.mutate(notificationIds);
    } else if (action === 'delete') {
      trashMutation.mutate(notificationIds);
    }
  }, [selectedNotifications, markReadBatchMutation, trashMutation, t]);


 const filteredNotifications = useMemo(() => {
    if (!notificationsData) return [];
    const programPaymentIntentIds = new Set();
    notificationsData.forEach(n => {
      if ((n.type === 'program_purchase_confirmed' || n.type === 'program_sale_coach') && n.metadata?.additionalData?.paymentIntentId) {
        programPaymentIntentIds.add(n.metadata.additionalData.paymentIntentId);
      }
    });
    if (programPaymentIntentIds.size === 0) return notificationsData;
    return notificationsData.filter(n => {
      if (n.type === 'payment_received' || n.type === 'payment_made_by_user') {
        const pi = n.metadata?.additionalData?.paymentIntentId;
        return !(pi && programPaymentIntentIds.has(pi));
      }
      return true;
    });
  }, [notificationsData]);

  // CHANGE: Pre-calculate unreadCount here so consuming components don't have to.
  const unreadCount = useMemo(() => {
    return filteredNotifications.filter(n => !n.isRead).length;
  }, [filteredNotifications]);

  const sortNotifications = useCallback((notifs) => {
    return [...notifs].sort((a, b) => {
      const dir = sortDirection === 'desc' ? -1 : 1;
      switch (sortBy) {
        case 'date': return (moment(b.createdAt).valueOf() - moment(a.createdAt).valueOf()) * dir;
        case 'priority': {
          const priorityValues = { high: 3, medium: 2, low: 1 };
          return (priorityValues[b.priority] - priorityValues[a.priority]) * dir;
        }
        case 'type': return a.type.localeCompare(b.type) * dir * -1; // Invert for desc
        default: return 0;
      }
    });
  }, [sortBy, sortDirection]);

const groupedNotifications = useMemo(() => {
    if (!filteredNotifications.length) return {};
    
    let groups = {};
    if (groupingType === 'date') {
      groups = createEmptyGroups();
      const now = moment();
      filteredNotifications.forEach(n => {
        const notifDate = moment(n.createdAt);
        const key = notifDate.isSame(now, 'day') ? 'today'
          : notifDate.isSame(now.clone().subtract(1, 'day'), 'day') ? 'yesterday'
          : notifDate.isSame(now, 'week') ? 'thisWeek'
          : 'earlier';
        groups[key].push(n);
      });
      return groups;
    }

    // For type or priority grouping
    const tempGroups = filteredNotifications.reduce((acc, n) => {
        const key = n[groupingType] || (groupingType === 'priority' ? 'low' : 'other');
        if (!acc[key]) acc[key] = [];
        acc[key].push(n);
        return acc;
    }, {});

    if (groupingType === 'priority') {
      const priorityOrder = ['high', 'medium', 'low'];
      const orderedGroups = {};
      priorityOrder.forEach(priority => {
        if (tempGroups[priority]) {
          orderedGroups[priority] = tempGroups[priority];
        }
      });
      // Add any other unexpected priority keys at the end
      Object.keys(tempGroups).forEach(key => {
          if (!orderedGroups[key]) {
              orderedGroups[key] = tempGroups[key];
          }
      });
      return orderedGroups;
    }

    return tempGroups;

  }, [filteredNotifications, groupingType]);
  
  // Selection handlers, wrapped in useCallback for stability
  const toggleSelection = useCallback((notificationId) => {
    setSelectedNotifications(prev => {
      const newSelection = new Set(prev);
      newSelection.has(notificationId) ? newSelection.delete(notificationId) : newSelection.add(notificationId);
      return newSelection;
    });
  }, []);

  const selectAll = useCallback((groupIds) => {
    setSelectedNotifications(new Set(groupIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNotifications(new Set());
  }, []);

return {
    notifications: filteredNotifications,
    unreadCount,
    loading: isLoading,
    error,
    fetchNotifications,
    groupedNotifications,
    selectedNotifications,
    groupingType,
    filterType,
    sortBy,
    sortDirection,
    setGroupingType,
    setFilterType,
    setSortBy,
    setSortDirection,
    handleBatchAction,
    toggleSelection,
    selectAll,
    clearSelection,
    isBatchLoading: markReadBatchMutation.isLoading || trashMutation.isLoading,
  };
};