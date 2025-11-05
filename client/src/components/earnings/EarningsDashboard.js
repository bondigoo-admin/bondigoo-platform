import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useCoachOverview } from '../../hooks/useCoachDashboard';
import { TransactionHistory } from './TransactionHistory';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Banknote, TrendingUp, Users } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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

export const EarningsDashboard = ({ filters }) => {
    const { t } = useTranslation('coach_dashboard');
    const { user } = useAuth();
    const { data: overviewData, isLoading } = useCoachOverview(user?._id, filters);

    const formatCurrency = (amount) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount || 0);
    
    const kpis = overviewData?.analytics?.earnings?.kpis;
    const revenueOverTime = overviewData?.analytics?.earnings?.revenueOverTime || [];
    const revenueBySource = overviewData?.analytics?.earnings?.revenueBySource || [];
    
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF'];

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px]" />) : (
                    <>
                        <KpiCard title={t('earnings.grossRevenue')} value={kpis?.grossRevenue || 0} icon={TrendingUp} format={formatCurrency} />
                        <KpiCard title={t('earnings.netEarnings')} value={kpis?.netEarnings || 0} icon={Banknote} format={formatCurrency} />
                        <KpiCard title={t('earnings.platformFees')} value={kpis?.platformFees || 0} icon={Banknote} format={formatCurrency} />
                        <KpiCard title={t('earnings.avgRevenuePerClient')} value={kpis?.avgRevenuePerClient || 0} icon={Users} format={formatCurrency} />
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>{t('earnings.revenueOverTimeTitle', 'Revenue Over Time')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <Skeleton className="h-[300px] w-full" /> : (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={revenueOverTime}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(value).replace(/\s*CHF\s*/, '')} />
                                    <Tooltip formatter={formatCurrency} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }} />
                                    <Legend />
                                    <Line type="monotone" dataKey="grossRevenue" name={t('kpis.grossRevenue')} stroke="hsl(var(--primary))" />
                                    <Line type="monotone" dataKey="netEarnings" name={t('kpis.netEarnings')} stroke="#82ca9d" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>{t('earnings.revenueBySourceTitle', 'Revenue by Source')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                         {isLoading ? <Skeleton className="h-[300px] w-full" /> : (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie data={revenueBySource} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} fill="hsl(var(--primary))" label>
                                        {revenueBySource.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => formatCurrency(value)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                         )}
                    </CardContent>
                </Card>
            </div>
            
            <TransactionHistory />
        </div>
    );
};