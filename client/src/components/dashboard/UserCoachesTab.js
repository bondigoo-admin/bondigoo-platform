import React from 'react';
import { useUserDashboard } from '../../hooks/useUserDashboard';
import { useAuth } from '../../contexts/AuthContext';
import CoachCard from '../CoachCard';
import { Skeleton } from '../ui/skeleton.jsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx';
import { useTranslation } from 'react-i18next';
import { logger } from '../../utils/logger';
import { Button } from '../ui/button.tsx';
import { Link } from 'react-router-dom';

const UserCoachesTab = () => {
    const { t } = useTranslation(['userdashboard', 'common']);
    const { isAuthenticated } = useAuth();
    
    // Fetch all necessary data sources from the central hook
    const { 
        overviewData, 
        connectionsData, 
        isLoading: isLoadingOverview, 
        isLoadingConnections, 
        isError: isErrorOverview, 
        isErrorConnections 
    } = useUserDashboard();

    // Combine primary coach and other connections into a single, deduplicated list.
    // This ensures the coach from the overview is always present.
    const allMyCoaches = React.useMemo(() => {
        const coachMap = new Map();

        // 1. Prioritize the primary coach from the overview data.
        if (overviewData?.primaryCoach?.user) {
            logger.info('[UserCoachesTab] Adding primaryCoach from overviewData.', { coachId: overviewData.primaryCoach._id });
            coachMap.set(overviewData.primaryCoach._id, overviewData.primaryCoach);
        }

        // 2. Add other 'accepted' connections, avoiding duplicates.
        if (Array.isArray(connectionsData)) {
            connectionsData.forEach(connection => {
                const isValidConnection = connection && connection.status === 'accepted' && connection.coach && connection.coach.user;
                if (isValidConnection && !coachMap.has(connection.coach._id)) {
                    logger.info('[UserCoachesTab] Adding accepted coach from connectionsData.', { coachId: connection.coach._id });
                    coachMap.set(connection.coach._id, connection.coach);
                }
            });
        }
        
        // Return the final list of unique coaches.
        return Array.from(coachMap.values());

    }, [overviewData, connectionsData]);

    const isLoading = isLoadingOverview || isLoadingConnections;
    const isError = isErrorOverview || isErrorConnections;

    if (isError) {
         return (
            <Alert variant="destructive">
                <AlertTitle>{t('common:error')}</AlertTitle>
                <AlertDescription>{t('common:errors.loadCoaches', 'There was a problem loading your coaches. Please try again later.')}</AlertDescription>
            </Alert>
        );
    }
    
    return (
        <div>
            {isLoading && (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-96 w-full" />
                    ))}
                </div>
            )}
            
            {!isLoading && allMyCoaches.length === 0 && (
                <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
                    <h3 className="text-lg font-semibold">{t('coaches.emptyTitle', 'You haven\'t connected with any coaches yet.')}</h3>
                    <p className="mt-1">{t('coaches.emptySubtitle', 'Find and connect with coaches to see them here.')}</p>
                     <Button asChild size="sm" className="mt-4">
                        <Link to="/coaches">{t('coaches.cta', 'Find a Coach')}</Link>
                    </Button>
                </div>
            )}

            {!isLoading && allMyCoaches.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {allMyCoaches.map(coach => (
                       <CoachCard 
                            key={coach._id}
                            coach={coach}
                            isAuthenticated={isAuthenticated}
                            variant="user-dashboard"
                       />
                    ))}
                </div>
            )}
        </div>
    );
};

export default UserCoachesTab;