import AdminKpiGrid from '../widgets/AdminKpiGrid';
import FinancialTrendChart from '../widgets/FinancialTrendChart';
import AdminActionCenter from '../widgets/AdminActionCenter';
import SystemHealthPanel from '../widgets/SystemHealthPanel';
import RecentActivityFeed from '../widgets/RecentActivityFeed';
import AdminKpiSettings from '../widgets/settings/AdminKpiSettings';

export const adminWidgetRegistry = {
  adminKpiGrid: {
    nameKey: 'widget.adminKpiGrid.name',
    defaultName: 'Platform KPIs',
    component: AdminKpiGrid,
    defaultSize: 'Full',
    needsCard: false,
    settingsComponent: AdminKpiSettings,
  },
  financialTrendChart: {
    nameKey: 'widget.financialTrend.name',
    defaultName: 'Financial Trends',
    component: FinancialTrendChart,
    defaultSize: 'Wide',
    availableSizes: ['Wide', 'Full'],
    needsCard: false, // Component provides its own Card
    settingsComponent: null,
  },
  actionCenterQueue: {
    nameKey: 'widget.actionCenter.name',
    defaultName: 'Action Center',
    component: AdminActionCenter,
    defaultSize: 'Narrow',
    availableSizes: ['Narrow', 'Wide'],
    needsCard: false, // Component provides its own Card
    settingsComponent: null,
  },
  systemHealthPanel: {
    nameKey: 'widget.systemHealth.name',
    defaultName: 'System Health',
    component: SystemHealthPanel,
    defaultSize: 'Narrow',
    availableSizes: ['Narrow', 'Wide'],
    needsCard: false, // Component provides its own Card
    settingsComponent: null,
  },
  recentActivityFeed: {
    nameKey: 'widget.recentActivity.name',
    defaultName: 'Recent Activity',
    component: RecentActivityFeed,
    defaultSize: 'Narrow',
    availableSizes: ['Narrow', 'Wide'],
    needsCard: false, // Component provides its own Card
    settingsComponent: null,
  },
};