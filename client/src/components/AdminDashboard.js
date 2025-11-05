import React from 'react';
import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  CircleDollarSign,
  Box,
  ShieldCheck,
  Server,
  List,
  Globe
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import ListManagement from './ListManagement';
import TranslationManagement from './TranslationManagement';
import AdminDashboardOverviewTab from './admin/dashboard/AdminDashboardOverviewTab';
import AdminUserManagementTab from './admin/user-management/AdminUserManagementTab';
import AdminFinancialsTab from './admin/financials/AdminFinancialsTab';
import AdminPlatformManagementTab from './admin/platform/AdminPlatformManagementTab';
import AdminModerationTab from './admin/moderation/AdminModerationTab';
import AdminSystemToolsTab from './admin/system/AdminSystemToolsTab';

const AdminSidebar = () => {
  const { t } = useTranslation(['admin', 'common']);
  const location = useLocation();
  const basePath = '/admin/';

  const navItems = [
    { to: 'overview', icon: LayoutDashboard, label: t('sidebar.pulse', 'Pulse') },
    { to: 'users', icon: Users, label: t('sidebar.roster', 'Roster') },
    { to: 'financials', icon: CircleDollarSign, label: t('sidebar.financials', 'Financials') },
    { to: 'platform', icon: Box, label: t('sidebar.platform', 'Platform') },
    { to: 'moderation', icon: ShieldCheck, label: t('sidebar.moderation', 'Moderation') },
    { to: 'system', icon: Server, label: t('sidebar.system', 'System') },
  ];
  
  const legacyItems = [
    { to: 'lists', icon: List, label: t('admin:manageLists') },
    { to: 'translations', icon: Globe, label: t('admin:translations') },
  ];

  const NavItem = ({ to, icon: Icon, label }) => {
    const fullPath = basePath + to;
    const isActive = location.pathname.startsWith(fullPath);
    return (
        <li>
            <NavLink
                to={to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-primary ${
                    isActive ? 'bg-muted text-primary' : 'text-muted-foreground'
                }`}
             >
                <Icon className="h-4 w-4" />
                {label}
            </NavLink>
        </li>
    );
  };

  return (
    <aside className="hidden border-r bg-background md:block">
      <div className="flex h-full max-h-screen flex-col gap-2">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <span className="font-semibold">{t('admin:adminDashboard')}</span>
        </div>
        <ScrollArea className="flex-1">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
            <ul className="space-y-1">
              {navItems.map((item) => <NavItem key={item.to} {...item} />)}
              <Separator className="my-4" />
              <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('sidebar.legacyTools', 'Legacy Tools')}</p>
              {legacyItems.map((item) => <NavItem key={item.to} {...item} />)}
            </ul>
          </nav>
        </ScrollArea>
      </div>
    </aside>
  );
};

const AdminDashboard = () => {
  return (
    <div className="grid h-full w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <AdminSidebar />
      <div className="flex flex-col overflow-hidden">
       <main className="flex-1 overflow-y-auto bg-background/95 p-4 md:p-6 lg:p-8">
           <Routes>
            <Route path="/" element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<AdminDashboardOverviewTab />} />
            <Route path="users/*" element={<AdminUserManagementTab />} />
            <Route path="financials/*" element={<AdminFinancialsTab />} />
            <Route path="platform/*" element={<AdminPlatformManagementTab />} />
            <Route path="moderation/*" element={<AdminModerationTab />} />
            <Route path="system/*" element={<AdminSystemToolsTab />} />
            <Route path="lists" element={<ListManagement />} />
            <Route path="translations" element={<TranslationManagement />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;