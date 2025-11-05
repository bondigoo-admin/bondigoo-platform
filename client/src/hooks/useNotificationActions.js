import { useMutation, useQueryClient } from 'react-query';
import { markNotificationAsRead, deleteNotification } from '../services/notificationAPI';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';

export const useNotificationActions = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['notifications', 'common']);

  const markAsReadMutation = useMutation(
    async (notificationIds) => {
      const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];
      logger.info('[useNotificationActions] Marking notifications as read', { notificationIds: ids });
      const response = await markNotificationAsRead(ids);
      return { notificationIds: ids, response };
    },
    {
      onMutate: async (notificationIds) => {
        const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];
        const queryKeyPrefix = ['notifications'];
        await queryClient.cancelQueries(queryKeyPrefix);

        const previousDataMap = new Map();
        queryClient.getQueryCache().findAll(queryKeyPrefix).forEach(query => {
          previousDataMap.set(query.queryKey, query.state.data);
        });

        queryClient.setQueriesData(queryKeyPrefix, (oldData) => {
          if (!Array.isArray(oldData)) return oldData;
          return oldData.map(notification =>
            ids.includes(notification._id)
              ? { ...notification, isRead: true, readAt: new Date().toISOString() }
              : notification
          );
        });
        
        logger.debug('[useNotificationActions] Optimistically updated caches', { notificationIds: ids });
        return { previousDataMap };
      },
      onSuccess: (data) => {
        logger.info('[useNotificationActions] Mark as read successful', { notificationIds: data.notificationIds });
      },
      onError: (error, notificationIds, context) => {
        logger.error('[useNotificationActions] Mark as read failed', {
          error: error.message,
          notificationIds
        });
        if (context?.previousDataMap) {
          context.previousDataMap.forEach((data, queryKey) => {
            queryClient.setQueryData(queryKey, data);
          });
        }
        toast.error(t('notifications:errorMarkingRead'));
        throw error;
      },
    }
  );

  const deleteMutation = useMutation(deleteNotification, {
    onMutate: async (notificationId) => {
      const queryKeyPrefix = ['notifications'];
      await queryClient.cancelQueries(queryKeyPrefix);

      const previousDataMap = new Map();
      queryClient.getQueryCache().findAll(queryKeyPrefix).forEach(query => {
        previousDataMap.set(query.queryKey, query.state.data);
      });

      queryClient.setQueriesData(queryKeyPrefix, (oldData) =>
        Array.isArray(oldData) ? oldData.filter(n => n._id !== notificationId) : oldData
      );
      return { previousDataMap };
    },
    onSuccess: (data) => {
      logger.info('[useNotificationActions] Delete successful', { notificationId: data._id });
      toast.success(t('notifications:deleteSuccess'));
    },
    onError: (error, notificationId, context) => {
      logger.error('[useNotificationActions] Delete failed', { error: error.message });
      if (context?.previousDataMap) {
        context.previousDataMap.forEach((data, queryKey) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error(t('common:errorOccurred'));
      throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries(['notifications']);
    }
  });

  return {
    markAsRead: markAsReadMutation.mutateAsync,
    deleteNotification: deleteMutation.mutate,
    isLoading: markAsReadMutation.isLoading || deleteMutation.isLoading,
  };
};