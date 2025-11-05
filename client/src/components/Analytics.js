import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useProgramAnalytics, useCoachOverview } from '../hooks/useCoachDashboard';
import { Users, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table.tsx';
import { Badge } from './ui/badge.tsx';
import { Progress } from './ui/progress.jsx';
import { Skeleton } from './ui/skeleton.jsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

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

const Analytics = ({ dateRange }) => {
  const { t } = useTranslation(['programs', 'common', 'coach_dashboard']);
  const { user } = useAuth();
  
  const { data: analyticsData, isLoading: isLoadingTable } = useProgramAnalytics(user?._id);
  const { data: overviewData, isLoading: isLoadingOverview } = useCoachOverview(user?._id, dateRange);

  const isLoading = isLoadingTable || isLoadingOverview;

  const kpis = overviewData?.analytics?.programs?.kpis;
  const enrollmentsPerProgram = overviewData?.analytics?.programs?.enrollmentsPerProgram || [];
  const revenuePerProgram = overviewData?.analytics?.programs?.revenuePerProgram || [];

  const formatCurrency = (amount) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount || 0);

  const statusVariant = {
    published: 'secondary',
    draft: 'outline',
    archived: 'destructive',
  };

  const renderContent = () => {
    if (isLoading) {
        return (
          <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                  <Skeleton className="h-[110px]" />
                  <Skeleton className="h-[110px]" />
                  <Skeleton className="h-[110px]" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Skeleton className="h-[350px]" />
                  <Skeleton className="h-[350px]" />
              </div>
              <Skeleton className="h-[400px]" />
          </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard title={t('coach_dashboard:programs.kpis.totalEnrollments')} value={kpis?.totalEnrollments || 0} icon={Users} />
                <KpiCard title={t('coach_dashboard:programs.kpis.topProgram')} value={kpis?.topProgram || 'N/A'} icon={Star} />
                <KpiCard title={t('coach_dashboard:programs.kpis.avgRating')} value={kpis?.avgRating?.toFixed(1) || '0.0'} icon={Star} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('coach_dashboard:programs.charts.enrollmentsTitle', 'Enrollments per Program')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart data={enrollmentsPerProgram} layout="vertical" margin={{ right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} tick={{ textAnchor: 'end' }} />
                                <Tooltip cursor={{ fill: 'hsl(var(--muted-foreground) / 0.2)' }} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }} />
                                <Bar dataKey="enrollments" fill="hsl(var(--primary))" name={t('enrollments')} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>{t('coach_dashboard:programs.charts.revenueTitle', 'Revenue per Program')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={350}>
                            <BarChart data={revenuePerProgram} layout="vertical" margin={{ right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(value) => formatCurrency(value).replace(/\s*CHF\s*/, '')} />
                                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} tick={{ textAnchor: 'end' }} />
                                <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }} />
                                <Bar dataKey="revenue" fill="#82ca9d" name={t('coach_dashboard:kpis.grossRevenue')} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('program_performance_all_time', {ns: 'programs'})}</CardTitle>
                <CardDescription>{t('program_performance_desc', {ns: 'programs', defaultValue: 'A detailed list of all your programs and their lifetime statistics.'})}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">{t('program_title', {ns: 'programs'})}</TableHead>
                      <TableHead>{t('status', {ns: 'common'})}</TableHead>
                      <TableHead className="text-right">{t('enrollments', {ns: 'programs'})}</TableHead>
                      <TableHead>{t('completion_rate', {ns: 'programs'})}</TableHead>
                      <TableHead className="text-right">{t('price', {ns: 'common'})}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analyticsData && analyticsData.length > 0 ? (
                      analyticsData.map((program) => (
                        <TableRow key={program.programId}>
                          <TableCell className="font-medium">{program.title}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[program.status]}>
                                {t(`status_${program.status}`, {ns: 'programs'})}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{program.enrollmentCount}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                                <Progress value={program.completionRate} className="w-[60%]" />
                                <span className="text-sm text-muted-foreground">{program.completionRate.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(program.basePrice.amount)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          {t('no_program_data', {ns: 'programs'})}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
        </div>
    );
  }

  return renderContent();
};

export default Analytics;