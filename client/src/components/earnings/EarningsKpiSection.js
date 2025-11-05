import React, { useEffect } from 'react'; 
import { useTranslation } from 'react-i18next';
import { Banknote, TrendingUp } from 'lucide-react';
import { useEarningsStats } from '../../hooks/useCoachDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { useAuth } from '../../contexts/AuthContext';

const KpiCard = ({ title, value, icon: Icon, currency = 'CHF' }) => (
    <Card className="transition-colors hover:bg-muted/50 dark:hover:bg-slate-800/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold md:text-3xl">
                {new Intl.NumberFormat('de-CH', { style: 'currency', currency }).format(value)}
            </div>
        </CardContent>
    </Card>
);

export const EarningsKpiSection = () => {
    const { t } = useTranslation('coach_dashboard');
    const { user } = useAuth();
    const { data, isLoading, isError, error } = useEarningsStats(user?._id); // Destructure isError and error

    // --- ADD THIS LOGGING BLOCK ---
    useEffect(() => {
        if (isLoading) {
            console.log('[EarningsKPI] Data is loading...');
        }
        if (isError) {
            console.error('[EarningsKPI] React Query encountered an error fetching stats:', error);
        }
        if (data) {
            console.log('[EarningsKPI] Received data from useEarningsStats hook:', JSON.stringify(data, null, 2));
            if (data.allTimeGross === 0 && data.allTimeNet === 0) {
                console.warn('[EarningsKPI] WARNING: Received data but all values are zero. This points to a backend aggregation issue.');
            }
        }
    }, [data, isLoading, isError, error]);
    // --- END LOGGING BLOCK ---

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-[110px] w-full" />
                <Skeleton className="h-[110px] w-full" />
                <Skeleton className="h-[110px] w-full" />
                <Skeleton className="h-[110px] w-full" />
            </div>
        );
    }
    
    // Add a check for data before rendering
    if (!data) {
        return <div>Error loading data or no data available.</div>;
    }

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title={t('earnings.netLast30Days')} value={data.last30DaysNet} icon={Banknote} />
            <KpiCard title={t('earnings.grossLast30Days')} value={data.last30DaysGross} icon={TrendingUp} />
            <KpiCard title={t('earnings.allTimeNet')} value={data.allTimeNet} icon={Banknote} />
            <KpiCard title={t('earnings.allTimeGross')} value={data.allTimeGross} icon={TrendingUp} />
        </div>
    );
};