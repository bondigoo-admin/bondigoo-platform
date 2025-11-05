import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Banknote, Users, Briefcase, Star, Clock, Percent, UserPlus, Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { kpiDefinitions } from './widgets/widgetDefinitions';

const StatCard = ({ title, value, icon, isLoading }) => {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-3/4" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
      </CardContent>
    </Card>
  );
};

const KpiGrid = ({ kpis, isLoading, settings }) => {
  const { t } = useTranslation(['coach_dashboard', 'common']);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount || 0);
  };

  const translatedBusiestDay = kpis?.busiestDay && kpis.busiestDay !== 'N/A' 
    ? t(`common:${kpis.busiestDay.toLowerCase()}`, kpis.busiestDay) 
    : 'N/A';

  const kpiDataMap = {
    // Earnings
    grossRevenue: { value: formatCurrency(kpis?.grossRevenue), icon: <Banknote className="h-4 w-4 text-muted-foreground" /> },
    netEarnings: { value: formatCurrency(kpis?.netEarnings), icon: <Banknote className="h-4 w-4 text-muted-foreground" /> },
    //platformFees: { value: formatCurrency(kpis?.platformFees), icon: <Banknote className="h-4 w-4 text-muted-foreground" /> },
    avgRevenuePerClient: { value: formatCurrency(kpis?.avgRevenuePerClient), icon: <Users className="h-4 w-4 text-muted-foreground" /> },
    
    
    // Programs
    totalEnrollments: { value: kpis?.totalEnrollments ?? 0, icon: <Users className="h-4 w-4 text-muted-foreground" /> },
    topProgram: { value: kpis?.topProgram || 'N/A', icon: <Star className="h-4 w-4 text-muted-foreground" /> },
    averageRating: { value: (kpis?.averageRating || 0).toFixed(1), icon: <Star className="h-4 w-4 text-muted-foreground" /> },

    // Bookings
    totalSessions: { value: kpis?.totalSessions ?? 0, icon: <Briefcase className="h-4 w-4 text-muted-foreground" /> },
    avgSessionDuration: { value: `${kpis?.avgSessionDuration || 0} min`, icon: <Clock className="h-4 w-4 text-muted-foreground" /> },
    cancellationRate: { value: `${kpis?.cancellationRate || 0}%`, icon: <Percent className="h-4 w-4 text-muted-foreground" /> },
    busiestDay: { value: translatedBusiestDay, icon: <Users className="h-4 w-4 text-muted-foreground" /> },

    // Clients
    totalClients: { value: kpis?.totalClients ?? 0, icon: <Users className="h-4 w-4 text-muted-foreground" /> },
    newClients: { value: kpis?.newClients ?? 0, icon: <UserPlus className="h-4 w-4 text-muted-foreground" /> },
  };
  
  const kpiConfig = settings?.kpiConfig || kpiDefinitions.map(def => ({ key: def.key, enabled: true }));
  const kpiMap = React.useMemo(() => new Map(kpiDefinitions.map(kpi => [kpi.key, kpi])), []);

  const kpiList = kpiConfig
    .filter(kpi => kpi.enabled && kpiDataMap[kpi.key]) // Ensure the KPI is defined
    .map(kpi => {
        const def = kpiMap.get(kpi.key);
        if (!def) return null;
        return {
          key: def.key,
          title: t(def.titleKey),
          value: kpiDataMap[def.key].value,
          icon: kpiDataMap[def.key].icon,
        };
    })
    .filter(Boolean);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>{t('kpis.title', 'Key Metrics')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {kpiList.map((kpi) => (
            <StatCard
              key={kpi.key}
              title={kpi.title}
              value={kpi.value}
              icon={kpi.icon}
              isLoading={isLoading}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default KpiGrid;