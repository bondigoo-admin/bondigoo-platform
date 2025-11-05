import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useCoachOverview } from '../../hooks/useCoachDashboard';
import { Users, UserPlus, Repeat, Banknote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';

const localeMap = {
  en: enUS,
  de,
  fr,
};

const KpiCard = ({ title, value, icon: Icon, format }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            <div className="text-2xl font-bold">{format ? format(value) : value}</div>
        </CardContent>
    </Card>
);

const ClientAnalytics = ({ filters }) => {
    const { t, i18n } = useTranslation('coach_dashboard');
    const { user } = useAuth();
    const { data: overviewData, isLoading } = useCoachOverview(user?._id, filters);
    const locale = localeMap[i18n.language] || enUS;

    const analytics = overviewData?.analytics?.clients;
    const COLORS = ['#0088FE', '#00C49F'];

    const formatCurrency = (amount) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount || 0);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[110px]" />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <Skeleton className="lg:col-span-2 h-[350px]" />
                    <Skeleton className="lg:col-span-3 h-[350px]" />
                </div>
                <Skeleton className="h-[400px]" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard title={t('analytics.clients.kpis.totalClients', 'Total Clients')} value={analytics?.kpis?.totalClients || 0} icon={Users} />
                <KpiCard title={t('analytics.clients.kpis.newClients', 'New Clients')} value={analytics?.kpis?.newClients || 0} icon={UserPlus} />
                <KpiCard title={t('analytics.clients.kpis.returningClients', 'Returning Clients')} value={analytics?.kpis?.returningClients || 0} icon={Repeat} />
                <KpiCard title={t('analytics.clients.kpis.ltv', 'Est. Client LTV')} value={analytics?.kpis?.estimatedLtv || 0} icon={Banknote} format={formatCurrency} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>{t('analytics.clients.charts.newVsReturning', 'New vs. Returning Clients')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie data={analytics?.newVsReturning} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="hsl(var(--primary))" label>
                                    {analytics?.newVsReturning?.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>{t('analytics.clients.charts.topClients', 'Top 10 Clients by Revenue')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={analytics?.topClientsByRevenue} layout="vertical" margin={{ left: 100 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value) => formatCurrency(value).replace(/\s*CHF\s*/, '')} />
                                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tick={{ width: 90, textAnchor: 'end' }} />
                                <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }} />
                                <Bar dataKey="revenue" fill="hsl(var(--primary))" name={t('common:revenue')} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('analytics.clients.table.title', 'Client List')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('common:name')}</TableHead>
                                <TableHead>{t('common:email')}</TableHead>
                                <TableHead>{t('analytics.clients.table.firstSession', 'First Session')}</TableHead>
                                <TableHead>{t('analytics.clients.table.lastSession', 'Last Session')}</TableHead>
                                <TableHead className="text-right">{t('analytics.clients.table.totalSessions', 'Total Sessions')}</TableHead>
                                <TableHead className="text-right">{t('analytics.clients.table.totalSpend', 'Total Spend')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {analytics?.clientListTable?.length > 0 ? (
                                analytics.clientListTable.map((client) => (
                                    <TableRow key={client._id}>
                                        <TableCell>{client.name}</TableCell>
                                        <TableCell>{client.email}</TableCell>
                                        <TableCell>{client.firstSessionDate ? format(new Date(client.firstSessionDate), 'P', { locale }) : 'N/A'}</TableCell>
                                        <TableCell>{client.lastSessionDate ? format(new Date(client.lastSessionDate), 'P', { locale }) : 'N/A'}</TableCell>
                                        <TableCell className="text-right">{client.totalSessions}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(client.totalSpend)}</TableCell>
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

export default ClientAnalytics;