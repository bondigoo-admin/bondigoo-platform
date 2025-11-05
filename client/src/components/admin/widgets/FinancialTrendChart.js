import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button.tsx';
import { format } from 'date-fns';
import { cn } from '../../../lib/utils';

const plottableMetrics = [
    { key: 'gtv', nameKey: 'admin:kpis.gmv', color: '#8884d8' },
    { key: 'netPlatformRevenue', nameKey: 'admin:kpis.netPlatformRevenue', color: '#82ca9d' },
    { key: 'grossPlatformRevenue', nameKey: 'admin:kpis.grossPlatformRevenue', color: '#ffc658' },
    { key: 'accruedCoachEarnings', nameKey: 'admin:kpis.accruedCoachEarnings', color: '#ff8042' },
];

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="rounded-lg border bg-background p-2 shadow-sm">
                <div className="grid grid-cols-1 gap-2">
                    <p className="text-sm text-muted-foreground">
                        {format(new Date(label), 'PPP')}
                    </p>
                    {payload.map((p) => (
                        <div key={p.dataKey} className="flex items-center justify-between gap-4">
                            <div className="flex items-center">
                                <span className="mr-2 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                                <p className="text-sm font-medium">{p.name}</p>
                            </div>
                            <p className="text-sm font-semibold">
                                {new Intl.NumberFormat('de-CH', {
                                    style: 'currency',
                                    currency: 'CHF',
                                    minimumFractionDigits: p.value < 1000 ? 2 : 0,
                                    maximumFractionDigits: p.value < 1000 ? 2 : 0,
                                }).format(p.value)}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

const FinancialTrendChart = ({ data, isLoading }) => {
    const { t } = useTranslation(['admin']);
    const [selectedMetrics, setSelectedMetrics] = useState(['gtv', 'netPlatformRevenue']);

    const handleMetricToggle = (key) => {
        setSelectedMetrics(prev =>
            prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
        );
    };

    const yAxisFormatter = (value) => {
        const options = {
            minimumFractionDigits: value < 1000 ? 2 : 0,
            maximumFractionDigits: value < 1000 ? 2 : 0,
        };
        return new Intl.NumberFormat('de-CH', options).format(value);
    };
    const xAxisFormatter = (date) => format(new Date(date), 'MMM d');
    
    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>{t('financials.trendTitle', 'Financial Trends')}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                        {plottableMetrics.map(metric => (
                            <Button
                                key={metric.key}
                                variant={selectedMetrics.includes(metric.key) ? 'secondary' : 'outline'}
                                size="sm"
                                onClick={() => handleMetricToggle(metric.key)}
                                className="h-8"
                            >
                                <span className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
                                {t(metric.nameKey)}
                            </Button>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-grow min-h-[350px]">
                {isLoading ? (
                    <Skeleton className="h-full w-full" />
                ) : !data || data.length === 0 ? (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        {t('financials.noData', 'No data available for the selected period.')}
                    </div>
                ) : selectedMetrics.length === 0 ? (
                     <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        {t('financials.selectMetric', 'Please select a metric to display.')}
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tickFormatter={xAxisFormatter} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                            <YAxis tickFormatter={yAxisFormatter} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--accent))', fillOpacity: 0.5 }} />
                            {plottableMetrics.filter(m => selectedMetrics.includes(m.key)).map(metric => (
                                <Line
                                    key={metric.key}
                                    type="monotone"
                                    dataKey={metric.key}
                                    stroke={metric.color}
                                    name={t(metric.nameKey)}
                                    dot={false}
                                    strokeWidth={2}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
};

export default FinancialTrendChart;