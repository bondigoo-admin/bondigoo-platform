import React, { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { useTranslation } from 'react-i18next';
import { useAdminSystemHealth } from '../../../hooks/useAdmin'; // Import the hook
import { useNotificationSocket } from '../../../contexts/SocketContext'; // Import socket context
import { useQueryClient } from 'react-query'; // Import useQueryClient

const StatusIndicator = ({ status, latency }) => {
  const { t } = useTranslation(['admin']);
  const isOnline = status === 'online' || status === 'connected' || status === 'healthy';
  const statusClass = isOnline ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${statusClass}`} />
      <span className="capitalize">{t(`system.health.${status}`, status)}</span>
      {latency !== undefined && <span className="text-xs text-muted-foreground">({latency}ms)</span>}
    </div>
  );
};

const SystemHealthPanel = () => {
  const { t } = useTranslation(['admin']);
  const { data: health, isLoading, isError, error } = useAdminSystemHealth();
  const { socket, isConnected } = useNotificationSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleHealthUpdate = (healthUpdate) => {
      queryClient.setQueryData('adminSystemHealth', (oldData) => {
        if (!oldData) return healthUpdate;
        return { ...oldData, ...healthUpdate };
      });
    };
    
    socket.on('system_health_update', handleHealthUpdate);

    return () => {
      socket.off('system_health_update', handleHealthUpdate);
    };
  }, [socket, queryClient]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('systemHealth.title', 'System Health')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('systemHealth.title', 'System Health')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500 p-4">{t('system.health.error', 'Error loading system health:')} {error.message}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('systemHealth.title', 'System Health')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          <li className="flex items-center justify-between text-sm">
            <span>{t('system.health.database', 'Database')}</span>
            <StatusIndicator status={health?.database?.status || 'unknown'} latency={health?.database?.latencyMs} />
          </li>
          <li className="flex items-center justify-between text-sm">
            <span>{t('system.health.redis', 'Redis Cache')}</span>
            <StatusIndicator status={health?.redis?.status || 'unknown'} latency={health?.redis?.latencyMs} />
          </li>
          <li className="flex items-center justify-between text-sm">
            <span>{t('system.health.jobQueues', 'Job Queues')}</span>
            <StatusIndicator status={health?.jobQueues?.status || 'unknown'} />
          </li>
          <li className="flex items-center justify-between text-sm">
            <span>{t('system.health.realtimeUpdates', 'Real-time Updates')}</span>
            <StatusIndicator status={isConnected ? 'connected' : 'disconnected'} />
          </li>
        </ul>
      </CardContent>
    </Card>
  );
};

export default SystemHealthPanel;