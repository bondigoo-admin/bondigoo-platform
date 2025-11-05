import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { cancelConnectionRequest, getUserConnections } from '../services/connectionAPI';
import { useAuth } from '../contexts/AuthContext';

export function useConnectionManagement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?._id;

  const { data, isLoading, error } = useQuery(
    ['connections', userId],
    getUserConnections,
    {
      enabled: !!userId,
      onError: () => {
        toast.error('Failed to load connections');
      },
    }
  );

  const connections = useMemo(() => (data?.connections || (Array.isArray(data) ? data : [])), [data]);
  const blockedUserIds = useMemo(() => (data?.blockedUserIds || []), [data]);

  const cancelMutation = useMutation(cancelConnectionRequest, {
    onSuccess: () => {
      queryClient.invalidateQueries(['connections', userId]);
      toast.success('Connection request cancelled successfully');
    },
    onError: () => {
      toast.error('Failed to cancel connection request');
    },
  });

  const handleCancel = useCallback((connectionId) => {
    cancelMutation.mutate(connectionId);
  }, [cancelMutation]);

  const getConnectionForCoach = useCallback((targetUserId) => {
    if (!connections) {
      return null;
    }
    return connections.find(conn => 
      conn.otherUser?._id === targetUserId && conn.status === 'accepted'
    );
  }, [connections]);

  const invalidateConnectionStatus = useCallback((targetUserId) => {
    queryClient.invalidateQueries(['connections', userId]);
    if (targetUserId) {
        queryClient.invalidateQueries(['connectionStatus', userId, targetUserId]);
    }
  }, [queryClient, userId]);

  return {
    connections,
    blockedUserIds,
    isLoading,
    error,
    handleCancel,
    getConnectionForCoach,
    invalidateConnectionStatus,
  };
}