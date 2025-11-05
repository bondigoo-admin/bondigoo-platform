import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../ui/card.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { TrendingUp, Users, UserCheck, AlertTriangle, FileCheck, Banknote, BookOpen, Briefcase, CheckCircle, Ticket, Scale, Shield, Landmark, PiggyBank, Receipt, HandCoins, ArrowRightLeft, Percent, Info, ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { adminKpiDefinitions } from '../dashboard/adminKpiConstants';
import { Separator } from '../../ui/separator.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { cn } from '../../../lib/utils';

const iconMap = {
  grossMerchandiseVolume: Landmark,
  successfulTransactions: FileCheck,
  averageTransactionValue: Percent,
  netPlatformRevenue: TrendingUp,
  grossPlatformRevenue: PiggyBank,
  paymentProcessingFees: Receipt,
  platformVatLiability: Receipt,
  accruedCoachEarnings: HandCoins,
  totalCoachPayouts: Banknote,
  totalCustomerRefunds: ArrowRightLeft,
  newUserSignups: Users,
  pendingCoachApplications: UserCheck,
  totalSessionsBooked: Briefcase,
  completedSessions: CheckCircle,
  totalEnrollments: BookOpen,
  openPaymentDisputes: Shield,
  flaggedReviews: AlertTriangle,
  openSupportTickets: Ticket,
};

const TrendIndicator = ({ value, t }) => {
  if (value === null || value === undefined || isNaN(value)) {
    return null;
  }

  const isPositive = value > 0;
  const isNegative = value < 0;
  const color = isPositive ? 'text-emerald-500' : isNegative ? 'text-red-500' : 'text-muted-foreground';
  const Icon = isPositive ? ArrowUp : isNegative ? ArrowDown : null;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("text-xs font-medium flex items-center", color)}>
            {Icon && <Icon className="h-3 w-3 mr-0.5" />}
            {Math.abs(value * 100).toFixed(1)}%
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('trend.vsPeriod', 'vs. previous period')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const KpiStat = ({ title, value, trend, icon: Icon, description, isLoading, isHealthMetric, size = 'normal', t }) => {
    const isAttentionNeeded = isHealthMetric && !isLoading && parseFloat(String(value).replace(/[^0-9.-]+/g,"")) > 0;
    
    return (
        <div>
            <div className="flex items-center text-sm font-medium text-muted-foreground mb-1">
                {isLoading ? <Skeleton className="h-4 w-4 mr-2 rounded" /> : <Icon className={cn("h-4 w-4 mr-2 flex-shrink-0", isAttentionNeeded && "text-amber-500")} />}
                {isLoading ? <Skeleton className="h-4 w-24 rounded" /> : <span className="truncate">{title}</span>}
                {!isLoading && description && (
                    <TooltipProvider delayDuration={100}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="h-3 w-3 ml-1.5 text-muted-foreground/70" />
                            </TooltipTrigger>
                            <TooltipContent side="top" align="center" className="max-w-xs">
                                <p>{description}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
            {isLoading ? (
                <Skeleton className={`${size === 'large' ? 'h-9 w-40' : 'h-7 w-32'} rounded-md`} />
            ) : (
                <div className="flex items-baseline gap-2">
                    <div className={cn(
                        size === 'large' ? 'text-3xl font-bold' : 'text-2xl font-semibold',
                        isAttentionNeeded && "text-amber-500"
                    )}>
                        {value}
                    </div>
                    {trend !== undefined && <TrendIndicator value={trend} t={t} />}
                </div>
            )}
        </div>
    );
};

const kpiGroups = {
  marketplaceActivitySecondary: ['successfulTransactions', 'averageTransactionValue'],
  platformProfitabilitySecondary: ['grossPlatformRevenue', 'paymentProcessingFees', 'platformVatLiability'],
  cashFlow: ['accruedCoachEarnings', 'totalCoachPayouts', 'totalCustomerRefunds'],
  platformGrowth: ['newUserSignups', 'totalSessionsBooked', 'completedSessions', 'totalEnrollments'],
  platformHealth: ['pendingCoachApplications', 'openPaymentDisputes', 'flaggedReviews', 'openSupportTickets']
};

const healthMetricKeys = new Set(kpiGroups.platformHealth);

const AdminKpiGrid = ({ kpis, config, isLoading }) => {
  const { t } = useTranslation(['admin']);

  const kpiConfig = useMemo(() => {
    const savedConfig = config?.kpis || [];
    if (savedConfig.length === 0) {
      return adminKpiDefinitions.map(def => ({ key: def.key, enabled: true }));
    }
    const savedKeys = new Set(savedConfig.map(k => k.key));
    const newKpis = adminKpiDefinitions
      .filter(def => !savedKeys.has(def.key))
      .map(def => ({ key: def.key, enabled: true }));
    return [...savedConfig, ...newKpis];
  }, [config]);
  
  const kpiMap = useMemo(() => new Map(adminKpiDefinitions.map(kpi => [kpi.key, kpi])), []);

    const formatValue = (key, rawValue) => {
    if (['successfulTransactions', 'newUserSignups', 'pendingCoachApplications', 'totalSessionsBooked', 'completedSessions', 'totalEnrollments', 'openPaymentDisputes', 'flaggedReviews', 'openSupportTickets'].includes(key)) {
      return new Intl.NumberFormat('de-CH').format(rawValue);
    }
    const options = {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: rawValue < 1000 ? 2 : 0,
      maximumFractionDigits: rawValue < 1000 ? 2 : 0,
    };
    return new Intl.NumberFormat('de-CH', options).format(rawValue);
  };
  
  const getKpiData = (key) => {
    const isEnabled = kpiConfig.find(c => c.key === key)?.enabled;
    const kpiData = kpis?.[key];
    if (!isEnabled || kpiData === undefined || kpiData === null) return null;

    const def = kpiMap.get(key);
    if (!def) return null;

    const value = typeof kpiData === 'object' && kpiData.value !== undefined ? kpiData.value : kpiData;
    const trend = typeof kpiData === 'object' ? kpiData.change : undefined;

    return {
        key: def.key,
        title: t(def.titleKey),
        description: t(def.descriptionKey),
        value: formatValue(def.key, value),
        trend: trend,
        icon: iconMap[def.key] || TrendingUp,
        isHealthMetric: healthMetricKeys.has(def.key)
    };
  };

  const renderGroup = (keys) => keys.map(getKpiData).filter(Boolean);

  const Section = ({ title, description, children }) => (
    <Card>
        <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
            {children}
        </CardContent>
    </Card>
  );

  const primaryMarketplaceKpi = getKpiData('grossMerchandiseVolume');
  const secondaryMarketplaceKpis = renderGroup(kpiGroups.marketplaceActivitySecondary);
  const showMarketplaceCard = isLoading || primaryMarketplaceKpi || secondaryMarketplaceKpis.length > 0;

  const primaryProfitabilityKpi = getKpiData('netPlatformRevenue');
  const secondaryProfitabilityKpis = renderGroup(kpiGroups.platformProfitabilitySecondary);
  const showProfitabilityCard = isLoading || primaryProfitabilityKpi || secondaryProfitabilityKpis.length > 0;
  
  const cashFlowKpis = renderGroup(kpiGroups.cashFlow);
  const showCashFlowCard = isLoading || cashFlowKpis.length > 0;

  const platformGrowthKpis = renderGroup(kpiGroups.platformGrowth);
  const showPlatformGrowthCard = isLoading || platformGrowthKpis.length > 0;

  const platformHealthKpis = renderGroup(kpiGroups.platformHealth);
  const showPlatformHealthCard = isLoading || platformHealthKpis.length > 0;
  
  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {showMarketplaceCard && (
          <Section title={t('admin:kpis.groups.marketplaceActivity')} description={t('admin:kpis.groups.marketplaceActivityDesc')}>
              <div className="space-y-6">
                  {isLoading ? <KpiStat isLoading size="large" t={t} /> : (primaryMarketplaceKpi && (({ key, ...props }) => <KpiStat key={key} {...props} size="large" t={t} />)(primaryMarketplaceKpi)) }
                  {(isLoading || secondaryMarketplaceKpis.length > 0) && <Separator />}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                      {isLoading ? Array.from({length: 2}).map((_, i) => <KpiStat isLoading key={i} t={t} />) : secondaryMarketplaceKpis.map(({ key, ...kpiProps }) => <KpiStat {...kpiProps} key={key} t={t} />) }
                  </div>
              </div>
          </Section>
        )}
       {showProfitabilityCard && (
          <Section title={t('admin:kpis.groups.platformProfitability')} description={t('admin:kpis.groups.platformProfitabilityDesc')}>
            <div className="space-y-6">
                  {isLoading ? <KpiStat isLoading size="large" t={t} /> : (primaryProfitabilityKpi && (({ key, ...props }) => <KpiStat key={key} {...props} size="large" t={t} />)(primaryProfitabilityKpi)) }
                  {(isLoading || secondaryProfitabilityKpis.length > 0) && <Separator />}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6">
                      {isLoading ? Array.from({length: 3}).map((_, i) => <KpiStat isLoading key={i} t={t} />) : secondaryProfitabilityKpis.map(({ key, ...kpiProps }) => <KpiStat {...kpiProps} key={key} t={t} />) }
                  </div>
              </div>
          </Section>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {showCashFlowCard && (
            <Section title={t('admin:kpis.groups.cashFlow')} description={t('admin:kpis.groups.cashFlowDesc')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                    {isLoading ? Array.from({length: 3}).map((_, i) => <KpiStat isLoading key={i} t={t} />) : cashFlowKpis.map(({ key, ...kpiProps }) => <KpiStat {...kpiProps} key={key} t={t} />)}
                </div>
            </Section>
        )}
        {showPlatformGrowthCard && (
            <Section title={t('admin:kpis.groups.platformGrowth')} description={t('admin:kpis.groups.platformGrowthDesc')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                    {isLoading ? Array.from({length: 4}).map((_, i) => <KpiStat isLoading key={i} t={t} />) : platformGrowthKpis.map(({ key, ...kpiProps }) => <KpiStat {...kpiProps} key={key} t={t} />)}
                </div>
            </Section>
        )}
        {showPlatformHealthCard && (
            <Section title={t('admin:kpis.groups.platformHealth')} description={t('admin:kpis.groups.platformHealthDesc')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                   {isLoading ? Array.from({length: 4}).map((_, i) => <KpiStat isLoading key={i} t={t} />) : platformHealthKpis.map(({ key, ...kpiProps }) => <KpiStat {...kpiProps} key={key} t={t} />)}
                </div>
            </Section>
        )}
      </div>
    </div>
  );
};

export default AdminKpiGrid;