import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useCoachOverview } from '../../hooks/useCoachDashboard';
import { BarChart as BarChartIcon, Clock, Percent, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { format } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';

const localeMap = {
  en: enUS,
  de,
  fr,
};

const KpiCard = ({ title, value, icon: Icon }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{value}</div>
        </CardContent>
    </Card>
);

const BookingsAnalytics = ({ filters }) => {
    const { t, i18n } = useTranslation(['coach_dashboard', 'common']);
    const { user } = useAuth();
    const { data: overviewData, isLoading } = useCoachOverview(user?._id, filters);
    const locale = localeMap[i18n.language] || enUS;

    const analytics = overviewData?.analytics?.bookings;
    const busiestDay = analytics?.kpis?.busiestDay;
    const translatedBusiestDay = busiestDay && busiestDay !== 'N/A' ? t(`common:${busiestDay.toLowerCase()}`) : 'N/A';

    const formatCurrency = (amount) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount || 0);

    // ... (isLoading block remains the same)

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard title={t('analytics.bookings.kpis.totalSessions', 'Total Sessions')} value={analytics?.kpis?.totalSessions || 0} icon={BarChartIcon} />
                <KpiCard title={t('analytics.bookings.kpis.avgDuration', 'Avg. Duration (min)')} value={analytics?.kpis?.avgSessionDuration || 0} icon={Clock} />
                <KpiCard title={t('analytics.bookings.kpis.cancellationRate', 'Cancellation Rate')} value={`${analytics?.kpis?.cancellationRate || 0}%`} icon={Percent} />
                <KpiCard title={t('analytics.bookings.kpis.busiestDay', 'Busiest Day')} value={translatedBusiestDay} icon={Users} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('analytics.bookings.charts.volumeByType', 'Session Volume by Type')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart data={analytics?.volumeByType}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }} />
                                <Bar dataKey="count" fill="hsl(var(--primary))" name={t('common:sessions', 'Sessions')} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>{t('analytics.bookings.charts.bookingHotspots', 'Booking Hotspots (Day of Week)')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart data={analytics?.bookingHotspots}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="day" 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={12} 
                                    tickFormatter={(day) => t(`common:${day.toLowerCase()}_short`)} 
                                />
                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false}/>
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                                    labelFormatter={(label) => t(`common:${label.toLowerCase()}`)}
                                />
                                <Bar dataKey="count" fill="#82ca9d" name={t('common:bookings', 'Bookings')} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('analytics.bookings.table.title', 'All Sessions')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('common:date')}</TableHead>
                                <TableHead>{t('common:client')}</TableHead>
                                <TableHead>{t('common:type')}</TableHead>
                                <TableHead>{t('common:status')}</TableHead>
                                <TableHead className="text-right">{t('common:duration')}</TableHead>
                                <TableHead className="text-right">{t('common:revenue')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {analytics?.sessionsTable?.length > 0 ? (
                                analytics.sessionsTable.map((session) => (
                                    <TableRow key={session._id}>
                                        <TableCell>{format(new Date(session.date), 'P', { locale })}</TableCell>
                                        <TableCell>{session.clientName}</TableCell>
                                        <TableCell>{session.sessionType}</TableCell>
                                        <TableCell>{session.status}</TableCell>
                                        <TableCell className="text-right">{session.duration} min</TableCell>
                                        <TableCell className="text-right">{formatCurrency(session.revenue)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">{t('common:noData')}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
};

export default BookingsAnalytics;