import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import SystemHealthPanel from './SystemHealthPanel';
import WebhookMonitor from './WebhookMonitor';
import JobQueueManager from './JobQueueManager';
import FeatureFlagManager from './FeatureFlagManager';
import AnnouncementManager from './AnnouncementManager';
import CacheManager from './CacheManager';

const AdminSystemToolsTab = () => {
  const { t } = useTranslation(['admin']);

  return (
     <div className="flex h-full flex-col space-y-4 p-4 md:p-8 pt-6">
     <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{t('system.title', 'System Management')}</h2>
      </div>
      <Tabs defaultValue="webhooks" className="flex flex-1 flex-col gap-4 min-h-0">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="health">{t('system.tabs.health', 'Health')}</TabsTrigger>
          <TabsTrigger value="webhooks">{t('system.tabs.webhooks', 'Webhook Monitor')}</TabsTrigger>
          <TabsTrigger value="jobs">{t('system.tabs.jobs', 'Job Queues')}</TabsTrigger>
          <TabsTrigger value="features">{t('system.tabs.features', 'Feature Flags')}</TabsTrigger>
          <TabsTrigger value="announcements">{t('system.tabs.announcements', 'Announcements')}</TabsTrigger>
          <TabsTrigger value="cache">{t('system.tabs.cache', 'Cache Manager')}</TabsTrigger>
        </TabsList>
        <TabsContent value="health" className="flex-1 min-h-0">
          <SystemHealthPanel />
        </TabsContent>
        <TabsContent value="webhooks" className="flex-1 min-h-0">
          <WebhookMonitor />
        </TabsContent>
        <TabsContent value="jobs" className="flex-1 min-h-0">
          <JobQueueManager />
        </TabsContent>
        <TabsContent value="features" className="flex-1 min-h-0">
            <FeatureFlagManager />
        </TabsContent>
        <TabsContent value="announcements" className="flex-1 min-h-0">
            <AnnouncementManager />
        </TabsContent>
        <TabsContent value="cache" className="flex-1 min-h-0">
            <CacheManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSystemToolsTab;