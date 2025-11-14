import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Users, MessageSquare, GraduationCap, Briefcase, UserCircle, Bell, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useConversations } from '../../hooks/useConversations';
import { useNotifications } from '../../hooks/useNotifications';
import { cn } from '../../lib/utils';

const BottomTabBar = () => {
  const { t } = useTranslation(['header', 'common']);
  const { isAuthenticated, userRole, userId } = useAuth();
  const { conversations } = useConversations();
  const { notifications } = useNotifications();

  const totalUnreadMessages = React.useMemo(() => {
    if (!isAuthenticated || !conversations) return 0;
    return conversations.reduce((sum, conv) => sum + (Number(conv.unreadCount) || 0), 0);
  }, [conversations, isAuthenticated]);

  const unreadNotificationsCount = React.useMemo(() => {
    if (!isAuthenticated || !notifications) return 0;
    return notifications.filter(n => !n.isRead).length;
  }, [notifications, isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  const baseLinkClass = "flex flex-col items-center justify-center gap-1 p-2 text-muted-foreground transition-colors hover:text-primary flex-1";
  const activeLinkClass = "text-primary font-medium";

  const getNavLinkClass = ({ isActive }) => cn(baseLinkClass, isActive && activeLinkClass);

  const badge = (count) => (
    count > 0 && (
      <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-background transform translate-x-1/3 -translate-y-1/3">
        {count > 9 ? '9+' : count}
      </span>
    )
  );

  const clientLinks = [
    { to: "/dashboard", icon: LayoutDashboard, label: t('header:dashboard') },
    { to: "/coaches", icon: Users, label: t('header:findCoaches') },
    { to: "/messages", icon: MessageSquare, label: t('header:messages'), badgeCount: totalUnreadMessages },
    { to: "/programs", icon: GraduationCap, label: t('programs', { ns: 'common' }) },
    { to: "/profile", icon: UserCircle, label: t('header:profile') },
  ];

  const coachLinks = [
    { to: "/dashboard", icon: LayoutDashboard, label: t('header:dashboard') },
    { to: `/manage-sessions/${userId}`, icon: Calendar, label: t('header:manageSessions', 'Calendar') },
    { to: "/messages", icon: MessageSquare, label: t('header:messages'), badgeCount: totalUnreadMessages },
    { to: "/notifications", icon: Bell, label: t('header:notifications'), badgeCount: unreadNotificationsCount },
    { to: "/profile", icon: UserCircle, label: t('header:profile') },
  ];
  
  if (userRole === 'admin') {
      return null;
  }

  const links = userRole === 'coach' ? coachLinks : clientLinks;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t bg-background shadow-[0_-2px_10px_-3px_rgba(0,0,0,0.1)] dark:shadow-[0_-2px_10px_-3px_rgba(255,255,255,0.05)]" style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}>
      {links.map(({ to, icon: Icon, label, badgeCount }) => (
        <NavLink key={to} to={to} className={getNavLinkClass} end>
          <div className="relative">
            <Icon className="h-6 w-6" />
            {badge(badgeCount)}
          </div>
        </NavLink>
      ))}
    </nav>
  );
};

export default BottomTabBar;