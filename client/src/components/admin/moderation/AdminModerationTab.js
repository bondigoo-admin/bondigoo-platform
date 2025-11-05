import React, { useEffect } from 'react';
import { useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import ModerationQueue from './ModerationQueue';
import SupportTicketingSystem from './support/SupportTicketingSystem';
import UserSafetyCenter from './safety/UserSafetyCenter';
import { useNotificationSocket } from '../../../contexts/SocketContext';
import VerificationQueue from './verifications/VerificationQueue';
import { logger } from '../../../utils/logger';

const AdminModerationTab = () => {
  const { t } = useTranslation(['admin']);
  const { socket } = useNotificationSocket();
  const queryClient = useQueryClient();

useEffect(() => {
    if (socket) {
      const handleModerationUpdate = (data) => {
        logger.info('[WebSocket] Received moderation_action_complete event. Invalidating queue.', data);
        queryClient.invalidateQueries('adminModerationQueue');
      };
      
      const handleVerificationUpdate = (data) => {
        logger.info('[WebSocket] Received verification_action_complete event. Invalidating queue.', data);
        queryClient.invalidateQueries('adminVerificationQueue');
      };
      
      logger.info("[WebSocket] Attaching listeners for moderation and verification updates.");
      socket.on('moderation_action_complete', handleModerationUpdate);
      socket.on('verification_action_complete', handleVerificationUpdate);

      return () => {
        logger.info("[WebSocket] Detaching listeners.");
        socket.off('moderation_action_complete', handleModerationUpdate);
        socket.off('verification_action_complete', handleVerificationUpdate);
      };
    }
}, [socket, queryClient]);

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{t('moderation.title', 'Moderation & Safety')}</h2>
      </div>
      <Tabs defaultValue="queue" className="flex flex-col flex-1 min-h-0">
        <TabsList className="self-start">
          <TabsTrigger value="queue">{t('moderation.tabs.queue', 'Moderation Queue')}</TabsTrigger>
          <TabsTrigger value="support">{t('moderation.tabs.support', 'Support Center')}</TabsTrigger>
          <TabsTrigger value="safety">{t('moderation.tabs.safety', 'User Safety')}</TabsTrigger>
          <TabsTrigger value="verifications">{t('moderation.tabs.verifications', 'Verifications')}</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="flex-1 min-h-0 mt-4">
            <ModerationQueue />
        </TabsContent>
        <TabsContent value="support" className="flex-1 min-h-0 mt-4">
            <SupportTicketingSystem />
        </TabsContent>
        <TabsContent value="safety" className="flex-1 min-h-0 mt-4">
            <UserSafetyCenter />
        </TabsContent>
        <TabsContent value="verifications" className="flex-1 min-h-0 mt-4">
          <VerificationQueue />
      </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminModerationTab;