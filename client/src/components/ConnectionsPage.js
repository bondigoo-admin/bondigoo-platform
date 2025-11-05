import React from 'react';
import { useTranslation } from 'react-i18next';
import ConnectionsTab from './ConnectionsTab';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import BlockedUsersManagement from './BlockedUsersManagement';
import { Users, UserX } from 'lucide-react';

const ConnectionsPage = () => {
  const { t } = useTranslation(['common', 'connections']);
  const { user } = useAuth();

  return (
    <div className="container mx-auto max-w-7xl py-8 px-4">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('connections:pageTitle', 'Manage Connections')}</h1>
        <p className="mt-2 text-muted-foreground">{t('connections:pageSubtitle', 'View your network, pending requests, and manage blocked users.')}</p>
      </header>
      <Tabs defaultValue="network" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
          <TabsTrigger value="network"><Users className="mr-2 h-4 w-4" />{t('connections:myNetwork', 'My Network')}</TabsTrigger>
          <TabsTrigger value="blocked"><UserX className="mr-2 h-4 w-4" />{t('connections:blockedUsers', 'Blocked Users')}</TabsTrigger>
        </TabsList>
        <TabsContent value="network" className="mt-6">
          {user && <ConnectionsTab />}
        </TabsContent>
        <TabsContent value="blocked" className="mt-6">
          <BlockedUsersManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConnectionsPage;