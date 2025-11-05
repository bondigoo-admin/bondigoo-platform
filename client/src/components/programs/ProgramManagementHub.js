import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useTranslation } from 'react-i18next';
import coachAPI from '../../services/coachAPI';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.tsx';
import { Badge } from '../ui/badge.tsx';
import ProgramAnalytics from '../analytics/ProgramAnalytics';
import ProgramSubmissionsPage from './ProgramSubmissionsPage';
import ProgramQAPage from './ProgramQAPage';
import ProgramStudentsPage from './ProgramStudentsPage';
import { useNotificationSocket } from '../../contexts/SocketContext';

const ProgramManagementHub = () => {
    const { t } = useTranslation(['coach_dashboard']);
    const queryClient = useQueryClient();
    const { socket, isConnected } = useNotificationSocket();

    const { data: counts } = useQuery('dashboardActionCounts', coachAPI.getDashboardActionCounts, {
        staleTime: 5 * 60 * 1000,
    });

    const { mutate: markSubmissionsRead } = useMutation(coachAPI.markAllSubmissionsAsReviewed, {
        onSuccess: () => {
            queryClient.invalidateQueries('dashboardActionCounts');
            queryClient.invalidateQueries('allCoachSubmissions');
        },
    });

    const { mutate: markQARead } = useMutation(coachAPI.markAllQAAsRead, {
        onSuccess: () => {
            queryClient.invalidateQueries('dashboardActionCounts');
            queryClient.invalidateQueries('allCoachQA');
        },
    });

    useEffect(() => {
        if (socket) {
            const handleUpdate = () => {
                queryClient.invalidateQueries('dashboardActionCounts');
            };
            socket.on('management_hub_update', handleUpdate);

            return () => {
                socket.off('management_hub_update', handleUpdate);
            };
        }
    }, [socket, queryClient]);

    const handleTabChange = (tabValue) => {
        if (tabValue === 'submissions' && counts?.newSubmissionsCount > 0) {
            markSubmissionsRead();
        } else if (tabValue === 'qa' && counts?.newQACommentsCount > 0) {
            markQARead();
        }
    };

    return (
        <Tabs defaultValue="participants" className="w-full" onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="participants">{t('tabs.participants', 'Participants')}</TabsTrigger>
                <TabsTrigger value="submissions" className="relative">
                    {t('tabs.submissions', 'Submissions')}
                    {counts?.newSubmissionsCount > 0 && (
                        <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 justify-center rounded-full p-0">
                            {counts.newSubmissionsCount}
                        </Badge>
                    )}
                </TabsTrigger>
                <TabsTrigger value="qa" className="relative">
                    {t('tabs.qa', 'Q&A')}
                    {counts?.newQACommentsCount > 0 && (
                         <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 justify-center rounded-full p-0">
                            {counts.newQACommentsCount}
                        </Badge>
                    )}
                </TabsTrigger>
            </TabsList>
            <TabsContent value="participants" className="mt-4">
                <ProgramStudentsPage viewMode="hub" />
            </TabsContent>
            <TabsContent value="submissions" className="mt-4">
                <ProgramSubmissionsPage viewMode="hub" />
            </TabsContent>
            <TabsContent value="qa" className="mt-4">
                <ProgramQAPage viewMode="hub" />
            </TabsContent>
        </Tabs>
    );
};

export default ProgramManagementHub;