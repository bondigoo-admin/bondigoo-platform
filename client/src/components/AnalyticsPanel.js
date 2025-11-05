import React, { useEffect, useState, useRef } from 'react';
import { Users, X, BarChart2, Users2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Chart } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import Draggable from 'react-draggable';
import { useVideoSocket } from '../contexts/SocketContext';
import { logger } from '../utils/logger';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card.tsx';
import { Button } from './ui/button.tsx';
import { ScrollArea } from './ui/scroll-area.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { Separator } from './ui/separator.jsx';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const AnalyticsPanel = ({ sessionId, analytics: initialAnalytics, onClose }) => {
  const { t } = useTranslation();
  const nodeRef = useRef(null);
  const contextValue = useVideoSocket();
  const socket = contextValue.socket;
  const isConnected = contextValue.isConnected;

  logger.info('[AnalyticsPanel] Render: Got context', {
    componentSessionId: sessionId,
    hasSocket: !!socket,
    isConnected: isConnected,
    socketId: socket?.id
  });

  const [analytics, setAnalytics] = useState(initialAnalytics || null);

  useEffect(() => {
    logger.info('[AnalyticsPanel] useEffect triggered', {
      componentSessionId: sessionId,
      hasSocket: !!socket,
      isConnected: isConnected,
      socketId: socket?.id
    });

    if (socket && isConnected) {
      logger.info('[AnalyticsPanel] useEffect: Socket is connected. Setting up listeners.', { sessionId, socketId: socket.id });
      logger.info('[AnalyticsPanel] Attempting to emit "join-session"', { sessionId, socketId: socket.id });
      try {
        socket.emit('join-session', sessionId);
      } catch (err) {
        logger.error('[AnalyticsPanel] CRITICAL: Error during socket.emit!', { error: err.message, stack: err.stack, sessionId, socketId: socket?.id });
      }

      const handleAnalyticsUpdate = (data) => {
        logger.info('[AnalyticsPanel] Real-time analytics update received', { data });
        setAnalytics(data);
      };

      socket.on('analytics-update', handleAnalyticsUpdate);

      return () => {
        logger.info('[AnalyticsPanel] Cleanup: Removing analytics listener', { sessionId, socketId: socket?.id });
        if (socket) {
          socket.off('analytics-update', handleAnalyticsUpdate);
        }
      };
    } else {
      logger.warn('[AnalyticsPanel] useEffect: Condition not met (socket && isConnected). Skipping listener setup.', {
        componentSessionId: sessionId,
        hasSocket: !!socket,
        isConnected: isConnected,
        socketId: socket?.id
      });
    }
  }, [socket, isConnected, sessionId]);

  const engagementChartData = analytics?.engagement ? {
    labels: ['Active', 'Passive'],
    datasets: [{
      data: [analytics.engagement.active, analytics.engagement.passive],
      backgroundColor: ['#10B981', '#EF4444'],
      borderWidth: 1,
    }],
  } : null;

  const toolUsageChartData = analytics?.toolUsage ? {
    labels: analytics.toolUsage.map(tool => tool.name),
    datasets: [{
      label: 'Usage Count',
      data: analytics.toolUsage.map(tool => tool.count),
      backgroundColor: '#3B82F6',
      borderColor: '#1E40AF',
      borderWidth: 1,
    }],
  } : null;

  return (
    <Draggable nodeRef={nodeRef} handle=".drag-handle" bounds="parent">
      <Card ref={nodeRef} className="w-full max-w-md md:w-96 absolute z-[1001] pointer-events-auto shadow-lg">
        <CardHeader className="drag-handle flex flex-row justify-between items-center p-4 cursor-move">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <BarChart2 size={20} /> {t('session.analytics')}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={20} />
            <span className="sr-only">{t('close')}</span>
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <ScrollArea className="h-auto max-h-[calc(80vh-70px)]">
            <div className="pr-3">
              {analytics ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-2 text-sm">
                    <Users size={16} className="text-muted-foreground" />
                    <span className="text-muted-foreground">{t('session.duration')}:</span>
                    <span className="font-medium">{analytics.duration} {t('session.minutes')}</span>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2 text-base">{t('session.engagement')}</h4>
                    {engagementChartData && (
                      <div className="h-40">
                        <Chart type="pie" data={engagementChartData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { enabled: true } } }} />
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2 text-base">{t('session.toolUsage')}</h4>
                    {toolUsageChartData && (
                      <div className="h-40">
                        <Chart type="bar" data={toolUsageChartData} options={{ maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'Count' } }, x: { title: { display: true, text: 'Tools' } } }, plugins: { legend: { display: false }, tooltip: { enabled: true } } }} />
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2 text-base">{t('session.lateArrivals')}</h4>
                    <ul className="space-y-2 max-h-40 overflow-y-auto">
                      {Array.isArray(analytics?.lateArrivals) && analytics.lateArrivals.length > 0 ? analytics.lateArrivals.map((arrival, i) => (
                        <li key={i} className="text-sm flex items-center gap-2 text-muted-foreground">
                          <Users2 size={16} />
                          {arrival.user} - {new Date(arrival.joinTime).toLocaleTimeString()}
                        </li>
                      )) : <p className="text-sm text-muted-foreground italic">{t('session.noLateArrivals')}</p>}
                    </ul>
                  </div>
                  {analytics?.breakoutRooms && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium mb-2 text-base">{t('session.breakoutRooms')}</h4>
                        <p className="text-sm text-muted-foreground">{t('session.timeInBreakout')}: <span className="text-foreground font-medium">{analytics.breakoutRooms.totalTime} {t('session.minutes')}</span></p>
                        <p className="text-sm text-muted-foreground">{t('session.participantDistribution')}: <span className="text-foreground font-medium">{Array.isArray(analytics.breakoutRooms.distribution) ? analytics.breakoutRooms.distribution.join(', ') : 'N/A'}</span></p>
                      </div>
                    </>
                  )}
                  {analytics?.feedback && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="font-medium mb-2 text-base">{t('session.feedback')}</h4>
                        <p className="text-sm text-muted-foreground">{t('session.averageRating')}: <span className="text-foreground font-medium">{analytics.feedback.averageRating}/5</span></p>
                        <ul className="space-y-2 mt-2">
                          {Array.isArray(analytics.feedback.comments) && analytics.feedback.comments.length > 0 ? analytics.feedback.comments.map((comment, i) => (
                            <li key={i} className="text-sm italic text-muted-foreground pl-4 border-l-2 border-border">{`"${comment}"`}</li>
                          )) : <p className="text-sm text-muted-foreground italic">{t('session.noComments')}</p>}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-1/3 mb-2" />
                    <div className="flex justify-center items-center">
                      <Skeleton className="h-36 w-36 rounded-full" />
                    </div>
                  </div>
                   <div className="space-y-2">
                    <Skeleton className="h-5 w-1/3 mb-2" />
                    <Skeleton className="h-36 w-full" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </Draggable>
  );
};

export default AnalyticsPanel;