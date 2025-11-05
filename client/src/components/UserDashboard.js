import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';
import UserDashboardOverviewTab from './dashboard/UserDashboardOverviewTab';
import UserSessionsTab from './dashboard/UserSessionsTab';
import UserProgramsTab from './dashboard/UserProgramsTab';
import UserCoachesTab from './dashboard/UserCoachesTab';
import { useTranslation } from 'react-i18next';

const UserDashboard = () => {
    const { user } = useAuth();
    const { t } = useTranslation('userdashboard');

    return (
        <div className="w-full px-4 sm:px-6 lg:px-8">
            <header className="mb-6 pt-4 sm:pt-6 lg:pt-8 md:mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                   {t('header.welcome', 'Welcome back, {{name}}!', { name: user?.firstName })}
                </h1>
                
            </header>

            <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                    <TabsTrigger value="overview">{t('tabs.overview', 'Overview')}</TabsTrigger>
                    <TabsTrigger value="my-sessions">{t('tabs.mySessions', 'My Sessions')}</TabsTrigger>
                    <TabsTrigger value="my-programs">{t('tabs.myPrograms', 'My Programs')}</TabsTrigger>
                    <TabsTrigger value="my-coaches">{t('tabs.myCoaches', 'My Coaches')}</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-6">
                    <UserDashboardOverviewTab />
                </TabsContent>
                <TabsContent value="my-sessions" className="mt-6">
                    <UserSessionsTab />
                </TabsContent>
                <TabsContent value="my-programs" className="mt-6">
                    <UserProgramsTab />
                </TabsContent>
                <TabsContent value="my-coaches" className="mt-6">
                    <UserCoachesTab />
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default UserDashboard;