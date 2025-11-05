import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useQuery } from 'react-query';
import coachAPI from '../../services/coachAPI';
import { useProgramAnalytics } from '../../hooks/useCoachDashboard';
import { Users, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

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

const ProgramAnalytics = ({ filters }) => {
  const { t } = useTranslation(['programs', 'common', 'coach_dashboard']);
  const { user } = useAuth();
  
  const { data: tableData, isLoading } = useProgramAnalytics(user?._id, filters);

  const analytics = useMemo(() => {
    if (!tableData || tableData.length === 0) {
      return {
        kpis: {
          totalEnrollments: 0,
          topProgram: 'N/A',
          avgRating: 0,
        },
        enrollmentsPerProgram: [],
        revenuePerProgram: [],
      };
    }

    const totalEnrollments = tableData.reduce((sum, p) => sum + p.enrollmentCount, 0);

    const topProgram = tableData.reduce((max, p) => (p.revenue > max.revenue ? p : max), tableData[0]).title || 'N/A';
    
    const ratedPrograms = tableData.filter(p => p.averageRating > 0);
    const avgRating = ratedPrograms.length > 0
      ? ratedPrograms.reduce((sum, p) => sum + p.averageRating, 0) / ratedPrograms.length
      : 0;

    return {
      kpis: {
        totalEnrollments,
        topProgram,
        avgRating,
      },
      enrollmentsPerProgram: tableData.map(p => ({ name: p.title, enrollments: p.enrollmentCount })),
      revenuePerProgram: tableData.map(p => ({ name: p.title, revenue: p.revenue })),
    };
  }, [tableData]);

  const formatCurrency = (amount) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount || 0);

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
              <KpiCard title={t('coach_dashboard:programs.kpis.totalEnrollments')} value={analytics.kpis.totalEnrollments} icon={Users} />
              <KpiCard title={t('coach_dashboard:programs.kpis.topProgram')} value={analytics.kpis.topProgram} icon={Star} />
              <KpiCard title={t('coach_dashboard:programs.kpis.avgRating')} value={analytics.kpis.avgRating.toFixed(1)} icon={Star} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                  <CardHeader>
                      <CardTitle>{t('coach_dashboard:programs.charts.enrollmentsTitle', 'Enrollments per Program')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                      <ResponsiveContainer width="100%" height={350}>
                          <BarChart data={analytics.enrollmentsPerProgram} layout="vertical" margin={{ right: 20, left: 100 }}>
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
                          <BarChart data={analytics.revenuePerProgram} layout="vertical" margin={{ right: 20, left: 100 }}>
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
              <CardTitle>{t('coach_dashboard:programs.table.title', 'Program Performance')}</CardTitle>
              <CardDescription>{t('programs:program_performance_desc', 'A detailed list of all your programs and their lifetime statistics.')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">{t('program_title')}</TableHead>
                    <TableHead className="text-right">{t('enrollments')}</TableHead>
                    <TableHead className="text-right">{t('completion_rate')}</TableHead>
                    <TableHead className="text-right">{t('common:revenue')}</TableHead>
                    <TableHead className="text-right">{t('coach_dashboard:kpis.averageRating')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableData && tableData.length > 0 ? (
                    tableData.map((program) => (
                      <TableRow key={program.programId}>
                        <TableCell className="font-medium">{program.title}</TableCell>
                        <TableCell className="text-right">{program.enrollmentCount}</TableCell>
                        <TableCell className="text-right">{program.completionRate.toFixed(0)}%</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(program.revenue)}</TableCell>
                        <TableCell className="text-right">{program.averageRating.toFixed(1)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        {t('no_program_data')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
      </div>
  );
};

export default ProgramAnalytics;