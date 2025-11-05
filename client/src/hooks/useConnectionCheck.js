import { useMemo } from 'react';
import { useConnectionManagement } from './useConnectionManagement';
import { useQuery, useQueryClient } from 'react-query';
import { getConnectionStatus } from '../services/connectionAPI';
import { logger } from '../utils/logger';

export const useConnectionCheck = (userId, targetUserId) => {
  const queryClient = useQueryClient();
  const { connections, isLoading: isLoadingConnections } = useConnectionManagement();

  const { data: remoteConnection, isLoading: isLoadingStatus } = useQuery(
    ['connectionStatus', userId, targetUserId],
    () => getConnectionStatus(targetUserId),
    {
      enabled: !!userId && !!targetUserId && userId !== targetUserId,
      staleTime: 60 * 1000,
    }
  );

 const connectionInfo = useMemo(() => {
    if (!userId || !targetUserId) return { status: 'not_connected' };
    if (userId === targetUserId) return { status: 'accepted' };
    if (!userId || !targetUserId) {
      logger.info('[useConnectionCheck] No user IDs provided, returning not_connected.', { userId, targetUserId });
      return { status: 'not_connected' };
    }
    if (userId === targetUserId) {
      logger.info('[useConnectionCheck] User is viewing their own profile, returning accepted.', { userId, targetUserId });
      return { status: 'accepted' };
    }
 
     const localConnection = connections?.find(conn => 
       conn.otherUser?._id?.toString() === targetUserId?.toString()
     );
 
    logger.info('[useConnectionCheck] Evaluating connection status from sources.', {
      viewerId: userId,
      targetId: targetUserId,
      localConnectionStatus: localConnection?.status || 'not_found',
      remoteConnectionStatus: remoteConnection?.status || 'not_fetched_or_no_connection',
      isLoadingLocalConnections: isLoadingConnections,
      isLoadingRemoteStatus: isLoadingStatus,
    });

     return localConnection || remoteConnection;
   }, [connections, remoteConnection, userId, targetUserId]);
 
   const isConnected = connectionInfo?.status === 'accepted';
   const isLoading = isLoadingConnections || (isLoadingStatus && !connectionInfo);
 
   const prefetchConnectionStatus = (targetId) => {
    if (targetId && userId) {
      queryClient.prefetchQuery(
        ['connectionStatus', userId, targetId],
        () => getConnectionStatus(targetId)
      );
    }
  };

  return { 
    isConnected, 
    isLoading,
    prefetchConnectionStatus 
  };
};