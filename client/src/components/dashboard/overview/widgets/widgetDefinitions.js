import React from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';
import { Skeleton } from '../../../ui/skeleton';

import KpiGrid from '../KpiGrid';
import ActionCenter from '../ActionCenter';
import UpcomingSchedule from '../UpcomingSchedule';
import KpiGridSettings from '../KpiGridSettings';
import DashboardAnnouncementWidget from '../DashboardAnnouncementWidget';

const localeMap = {
  en: enUS,
  de,
  fr,
};

const RevenueChartComponent = ({ data, isLoading }) => {
  const { t, i18n } = useTranslation('coach_dashboard');
  const locale = localeMap[i18n.language] || enUS;
  
  const formatCurrencyForChart = (value) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(value);
  const formatDateForChart = (dateString) => format(parseISO(dateString), 'MMM d', { locale });
  const formatTooltipDate = (dateString) => format(parseISO(dateString), 'PPP', { locale });

  if (isLoading) {
    return <Skeleton className="h-[350px] w-full" />;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={formatDateForChart} />
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrencyForChart(value).replace(/\s*CHF\s*/, '')} />
        <Tooltip 
            labelFormatter={formatTooltipDate}
            formatter={formatCurrencyForChart}
            contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)'
            }}
        />
        <Legend />
        <Line type="monotone" dataKey="grossRevenue" stroke="#8884d8" name={t('kpis.grossRevenue')} />
        <Line type="monotone" dataKey="netEarnings" stroke="#82ca9d" name={t('kpis.netEarnings')} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export const kpiDefinitions = [
    // Earnings KPIs
    { key: 'grossRevenue', titleKey: 'earnings.grossRevenue' },
    { key: 'netEarnings', titleKey: 'earnings.netEarnings' },
    { key: 'platformFees', titleKey: 'earnings.platformFees' },
    { key: 'avgRevenuePerClient', titleKey: 'earnings.avgRevenuePerClient' },
    { key: 'estimatedLtv', titleKey: 'analytics.clients.kpis.ltv' },
    
    // Program KPIs
    { key: 'totalEnrollments', titleKey: 'programs.kpis.totalEnrollments' },
    { key: 'topProgram', titleKey: 'programs.kpis.topProgram' },
    { key: 'averageRating', titleKey: 'kpis.averageRating' },
    
    // Booking KPIs
    { key: 'totalSessions', titleKey: 'analytics.bookings.kpis.totalSessions' },
    { key: 'avgSessionDuration', titleKey: 'analytics.bookings.kpis.avgDuration' },
    { key: 'cancellationRate', titleKey: 'analytics.bookings.kpis.cancellationRate' },
    { key: 'busiestDay', titleKey: 'analytics.bookings.kpis.busiestDay' },
    
    // Client KPIs
    { key: 'totalClients', titleKey: 'analytics.clients.kpis.totalClients' },
    { key: 'newClients', titleKey: 'kpis.newClients' },
    { key: 'returningClients', titleKey: 'analytics.clients.kpis.returningClients' },
];

export const widgetRegistry = {
  kpiGrid: {
    nameKey: 'widget.kpiGrid.name',
    defaultName: 'Key Metrics',
    component: KpiGrid,
    size: 'wide',
    needsCard: false,
    settingsComponent: KpiGridSettings,
  },
  revenueChart: {
    nameKey: 'widget.revenueChart.name',
    defaultName: 'Revenue Over Time',
    component: RevenueChartComponent,
    size: 'wide',
    needsCard: true,
  },
  actionCenter: {
    nameKey: 'widget.actionCenter.name',
    defaultName: 'Action Center',
    component: ActionCenter,
    size: 'narrow',
    needsCard: false,
  },
  upcomingSchedule: {
    nameKey: 'widget.upcomingSchedule.name',
    defaultName: 'Upcoming Schedule',
    component: UpcomingSchedule,
    size: 'narrow',
    needsCard: false,
  },
  dashboardAnnouncements: {
    nameKey: 'coach_dashboard:widgets.announcements',
    defaultName: 'Announcements',
    component: DashboardAnnouncementWidget,
    needsCard: false,
    size: 'wide',
  },
};

export const defaultLayoutConfig = [
  { key: 'dashboardAnnouncements', enabled: true, settings: {} },
  { key: 'kpiGrid', enabled: true, settings: {} },
  { key: 'actionCenter', enabled: true, settings: {} },
  { key: 'upcomingSchedule', enabled: true, settings: {} },
  { key: 'revenueChart', enabled: true, settings: {} },
];