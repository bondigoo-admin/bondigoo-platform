import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import AdminProgramManagement from './AdminProgramManagement';
import AdminTranslationsTab from './AdminTranslationsTab';
import ListManagement from '../../ListManagement';

const AdminPlatformManagementTab = () => {
  const { t } = useTranslation(['admin']);

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">{t('platform.title', 'Platform & Content')}</h2>
      </div>
      <Tabs defaultValue="programs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="programs">{t('platform.programs', 'Programs')}</TabsTrigger>
          <TabsTrigger value="metadata">{t('platform.metadata', 'Metadata (Lists)')}</TabsTrigger>
          <TabsTrigger value="translations">{t('platform.translations', 'Translations')}</TabsTrigger>
        </TabsList>
        <TabsContent value="programs" className="space-y-4">
          <AdminProgramManagement />
        </TabsContent>
        <TabsContent value="metadata" className="space-y-4">
          <ListManagement />
        </TabsContent>
        <TabsContent value="translations" className="space-y-4">
          <AdminTranslationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPlatformManagementTab;