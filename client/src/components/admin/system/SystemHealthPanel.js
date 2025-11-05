import React, { useEffect } from 'react';
import { useAdminSystemHealth } from '../../../hooks/useAdmin';
import { useQueryClient } from 'react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Database, ListChecks, Component as Redis } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { useNotificationSocket } from '../../../contexts/SocketContext';

const SystemHealthPanel = () => {
  const { data, isLoading, isError, error } = useAdminSystemHealth();
  const { t } = useTranslation(['admin', 'common']);
  const { socket, isConnected } = useNotificationSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleHealthUpdate = (healthUpdate) => {
      queryClient.setQueryData('adminSystemHealth', (oldData) => {
        if (!oldData) return healthUpdate;
        // Merge new data with old data for a smoother update
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (isError) {
    return <div className="text-red-500 p-4">{t('system.health.error', 'Error loading system health:')} {error.message}</div>;
  }

  const getStatusVariant = (status) => {
    switch (status) {
      case 'connected':
      case 'healthy':
        return 'success';
      case 'degraded':
        return 'warning';
      default:
        return 'destructive';
    }
  };

  const StatusBadge = ({ status }) => (
    <Badge variant={getStatusVariant(status)} className="capitalize">{status}</Badge>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('system.health.database', 'Database')}</CardTitle>
          <Database className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <StatusBadge status={data?.database?.status} />
            <span className="text-xs text-muted-foreground">{t('system.health.latency', 'Latency:')} {data?.database?.latencyMs}ms</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('system.health.redis', 'Redis Cache')}</CardTitle>
          <Redis className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <StatusBadge status={data?.redis?.status} />
            <span className="text-xs text-muted-foreground">{t('system.health.latency', 'Latency:')} {data?.redis?.latencyMs}ms</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t('system.health.memory', 'Memory Used:')} {data?.redis?.memoryUsed}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('system.health.jobQueues', 'Job Queues')}</CardTitle>
          <div className="flex items-center gap-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <div className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('system.health.realtimeUpdates', 'Real-time Updates:')} {isConnected ? t('common:status.connected', 'Connected') : t('common:status.disconnected', 'Disconnected')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
            <StatusBadge status={data?.jobQueues?.status} />
        </CardContent>
      </Card>
      
      {data?.jobQueues?.queues?.map(queue => (
        <Card key={queue.name} className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold truncate">{queue.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <TooltipProvider>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <Tooltip><TooltipTrigger><div className="flex flex-col items-center p-2 rounded-md bg-muted/50"><span className="font-bold text-lg">{queue.active}</span><span className="text-xs text-muted-foreground">{t('system.health.jobs.active', 'Active')}</span></div></TooltipTrigger><TooltipContent>{t('system.health.jobs.activeTooltip', 'Jobs currently being processed.')}</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><div className="flex flex-col items-center p-2 rounded-md bg-muted/50"><span className="font-bold text-lg">{queue.waiting}</span><span className="text-xs text-muted-foreground">{t('system.health.jobs.waiting', 'Waiting')}</span></div></TooltipTrigger><TooltipContent>{t('system.health.jobs.waitingTooltip', 'Jobs waiting in the queue to be processed.')}</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><div className="flex flex-col items-center p-2 rounded-md bg-muted/50"><span className="font-bold text-lg">{queue.completed}</span><span className="text-xs text-muted-foreground">{t('system.health.jobs.completed', 'Completed')}</span></div></TooltipTrigger><TooltipContent>{t('system.health.jobs.completedTooltip', 'Jobs successfully processed (recently).')}</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><div className="flex flex-col items-center p-2 rounded-md bg-muted/50"><span className={`font-bold text-lg ${queue.failed > 0 ? 'text-destructive' : ''}`}>{queue.failed}</span><span className="text-xs text-muted-foreground">{t('system.health.jobs.failed', 'Failed')}</span></div></TooltipTrigger><TooltipContent>{t('system.health.jobs.failedTooltip', 'Jobs that have failed all retry attempts.')}</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger><div className="flex flex-col items-center p-2 rounded-md bg-muted/50"><span className={`font-bold text-lg ${queue.delayed > 0 ? 'text-amber-600' : ''}`}>{queue.delayed}</span><span className="text-xs text-muted-foreground">{t('system.health.jobs.delayed', 'Delayed')}</span></div></TooltipTrigger><TooltipContent>{t('system.health.jobs.delayedTooltip', 'Jobs scheduled to run at a future time.')}</TooltipContent></Tooltip>
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SystemHealthPanel;