import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useUserDashboard } from '../../hooks/useUserDashboard';
import { useAuth } from '../../contexts/AuthContext';
import UpcomingSchedule from './UserUpcomingSchedule';
import ProgramCard from '../programs/ProgramCard';
import CoachCard from '../CoachCard';
import BookingDetailsModal from '../BookingDetailsModal';
import { Skeleton } from '../ui/skeleton.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Settings, BookOpen, User, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient, useMutation } from 'react-query';
import { toast } from 'react-hot-toast';
import { isEqual } from 'lodash';
import { logger } from '../../utils/logger';
import { updateUserDashboardPreferences } from '../../services/userAPI';
import DashboardCustomizationSheet from './overview/DashboardCustomizationSheet';
import UserActionCenter from './UserActionCenter';
import DashboardAnnouncementWidget from './overview/DashboardAnnouncementWidget';

const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

const ContinueLearningWidget = ({ enrollments, isLoading }) => {
  const { t } = useTranslation('userdashboard');
  const activePrograms = enrollments?.slice(0, 3) || [];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t('learning.title', 'Continue Learning')}</span>
          <Button asChild variant="ghost" size="sm">
            <Link to="../my-programs">{t('learning.viewAll', 'View All')} <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}
        {!isLoading && activePrograms.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground py-10">
            <BookOpen className="h-12 w-12 mb-4 text-muted-foreground" />
            <p className="font-semibold text-foreground">{t('learning.empty.title', 'Your learning library is empty.')}</p>
            <p className="mt-1 text-muted-foreground">{t('learning.empty.subtitle', 'Enroll in a program to get started.')}</p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/programs">{t('learning.empty.cta', 'Explore Programs')}</Link>
            </Button>
          </div>
        )}
        {!isLoading && activePrograms.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activePrograms.map(enrollment => (
              <ProgramCard
                key={enrollment._id}
                program={enrollment.program}
                view="user"
                progress={enrollment.progress?.completionPercentage || 0}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MyCoachWidget = ({ coach, isLoading, isAuthenticated }) => {
  const { t } = useTranslation('userdashboard');
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          {t('myCoach.title', 'My Coach')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading && <Skeleton className="h-80 w-full" />}
        {!isLoading && !coach && (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground py-10">
            <div>
              <p>{t('myCoach.empty.title', "You haven't connected with a coach yet.")}</p>
              <Button asChild size="sm" className="mt-4"><Link to="/coaches">{t('myCoach.empty.cta', 'Find a Coach')}</Link></Button>
            </div>
          </div>
        )}
        {!isLoading && coach && (
          <CoachCard coach={coach} isAuthenticated={isAuthenticated} variant="user-dashboard" />
        )}
      </CardContent>
    </Card>
  );
};

const userWidgetRegistry = {
  upcomingSchedule: {
    nameKey: 'userdashboard:widgets.upcomingSchedule',
    defaultName: 'Upcoming Sessions',
    component: UpcomingSchedule,
    size: 'half',
  },
  continueLearning: {
    nameKey: 'userdashboard:widgets.continueLearning',
    defaultName: 'Continue Learning',
    component: ContinueLearningWidget,
    size: 'wide',
  },
  myCoach: {
    nameKey: 'userdashboard:widgets.myCoach',
    defaultName: 'My Coach',
    component: MyCoachWidget,
    size: 'narrow',
  },
  actionCenter: {
    nameKey: 'userdashboard:widgets.actionCenter',
    defaultName: 'Action Center',
    component: UserActionCenter,
    size: 'half',
  },
  dashboardAnnouncements: {
    nameKey: 'userdashboard:widgets.announcements',
    defaultName: 'Announcements',
    component: DashboardAnnouncementWidget,
    size: 'full',
  },
};

const defaultUserLayoutConfig = [
  { key: 'dashboardAnnouncements', enabled: true, settings: {} },
  { key: 'actionCenter', enabled: true, settings: {} },
  { key: 'upcomingSchedule', enabled: true, settings: {} },
  { key: 'myCoach', enabled: true, settings: {} },
  { key: 'continueLearning', enabled: true, settings: {} },
];


const UserDashboardOverviewTab = () => {
  const { t } = useTranslation('userdashboard');
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const {
    overviewData,
    isLoadingOverview,
    enrollmentsData,
    isLoadingEnrollments,
    sessionsData,
    isLoadingSessions,
    actionCenterData
  } = useUserDashboard();

  const serverConfig = useMemo(() => {
    const savedPreferences = overviewData?.settings?.dashboardPreferences;
    if (!savedPreferences) {
        logger.debug('[UserDashboardOverviewTab] No saved preferences found, using default layout.');
        return defaultUserLayoutConfig;
    }
    const allKeys = new Set(Object.keys(userWidgetRegistry));
    const savedKeys = new Set(savedPreferences.map(w => w.key));

    const newWidgets = Array.from(allKeys)
      .filter(key => !savedKeys.has(key))
      .map(key => ({ key, enabled: true, settings: {} }));

    if (newWidgets.length > 0) {
        logger.info('[UserDashboardOverviewTab] Merging new widgets into saved preferences.', { newKeys: newWidgets.map(w => w.key) });
    }

    return [...savedPreferences, ...newWidgets];
  }, [overviewData]);
  const [config, setConfig] = useState(serverConfig);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const configOnOpen = useRef(null);
  const wasSheetOpen = usePrevious(isSheetOpen);

  useEffect(() => {
    setConfig(serverConfig);
  }, [serverConfig]);

  const mutation = useMutation(updateUserDashboardPreferences, {
    onMutate: async ({ preferences: newConfig }) => {
      const isReset = newConfig === null;
      const newPreferences = isReset ? defaultUserLayoutConfig : newConfig;
      
      const queryKey = ['userDashboardOverview', user?._id];
      await queryClient.cancelQueries(queryKey);
      const previousData = queryClient.getQueryData(queryKey);
      
      queryClient.setQueryData(queryKey, (oldData) => {
        if (!oldData) return;
        return { 
          ...oldData, 
          settings: { ...oldData.settings, dashboardPreferences: newPreferences }
        };
      });

      if (isReset) setConfig(defaultUserLayoutConfig);
      
      return { previousData };
    },
    onError: (err, newConfig, context) => {
      const queryKey = ['userDashboardOverview', user?._id];
      if (context.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
        setConfig(context.previousData.settings?.dashboardPreferences || defaultUserLayoutConfig);
      }
      toast.error(t('customization.saveError', 'Failed to save customization.'));
    },
    onSettled: () => {
      queryClient.invalidateQueries(['userDashboardOverview', user?._id]);
    },
    onSuccess: (data, variables) => {
      const isReset = variables.preferences === null;
      if (isReset) {
        toast.success(t('customization.resetSuccess', 'Dashboard reset successfully.'));
      } else {
        toast.success(t('customization.saveSuccess', 'Customization saved.'));
      }
      setIsSheetOpen(false);
    },
  });

  useEffect(() => {
    if (wasSheetOpen && !isSheetOpen) {
      if (configOnOpen.current && !isEqual(config, configOnOpen.current)) {
        logger.debug('[UserDashboardOverviewTab] Sheet closed with changes. Saving.');
        mutation.mutate({ userId: user._id, preferences: config });
      }
    }
  }, [isSheetOpen, wasSheetOpen, config, mutation, user]);

  const handleReset = useCallback(() => {
    mutation.mutate({ userId: user._id, preferences: null });
  }, [mutation, user]);

  const handleOpenSheet = () => {
    configOnOpen.current = config;
    setIsSheetOpen(true);
  };
  
  const upcomingSessions = useMemo(() => {
    if (!sessionsData?.sessions) return [];
    return sessionsData.sessions
      .filter(s => new Date(s.start) >= new Date())
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [sessionsData]);

  const handleSelectBooking = (booking) => {
    setSelectedBooking(booking);
  };

  const enabledWidgets = useMemo(() => config.filter(w => w.enabled), [config]);

 const renderWidget = (widgetConfig) => {
    const widgetDef = userWidgetRegistry[widgetConfig.key];
    if (!widgetDef) return null;
    const { component: Component } = widgetDef;
    let props = { settings: widgetConfig.settings };

    switch (widgetConfig.key) {
      case 'upcomingSchedule':
        props = { ...props, schedule: upcomingSessions, isLoading: isLoadingSessions, onSelectBooking: handleSelectBooking, isUserDashboard: true };
        break;
      case 'continueLearning':
        props = { ...props, enrollments: enrollmentsData?.enrollments, isLoading: isLoadingEnrollments };
        break;
      case 'myCoach':
        props = { ...props, coach: overviewData?.primaryCoach, isLoading: isLoadingOverview, isAuthenticated };
        break;
      case 'actionCenter':
        props = { ...props, notifications: actionCenterData, isLoading: isLoadingOverview };
        break;
      case 'dashboardAnnouncements':
        props = { ...props, isLoading: isLoadingOverview };
        break;
      default:
        break;
    }
    return <Component {...props} />;
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold tracking-tight">{t('overview.title', 'Overview')}</h2>
        <Button variant="outline" size="sm" onClick={handleOpenSheet}>
          <Settings className="mr-2 h-4 w-4" />
          {t('customization.button', 'Customize')}
        </Button>
      </div>

     <div className="grid grid-cols-1 lg:grid-cols-6 gap-6 items-stretch">
        {enabledWidgets.map(widgetConfig => {
          const widgetDef = userWidgetRegistry[widgetConfig.key];
          if (!widgetDef) return null;
          
          let className = '';
          switch (widgetDef.size) {
            case 'narrow':
              className = 'lg:col-span-2';
              break;
            case 'half':
              className = 'lg:col-span-3';
              break;
            case 'wide':
              className = 'lg:col-span-4';
              break;
            case 'full':
              className = 'lg:col-span-6';
              break;
            default:
              className = 'lg:col-span-6';
              break;
          }

          return (<div key={widgetConfig.key} className={className}>{renderWidget(widgetConfig)}</div>);
        })}
      </div>

       {selectedBooking && (
        <BookingDetailsModal
          bookingId={selectedBooking._id}
          existingBooking={selectedBooking}
          isInitialData={true}
          onClose={() => setSelectedBooking(null)}
          onSuggest={() => { /* No operation */ }}
        />
      )}

      <DashboardCustomizationSheet
        isOpen={isSheetOpen}
        setIsOpen={setIsSheetOpen}
        config={config}
        setConfig={setConfig}
        onReset={handleReset}
        isSaving={mutation.isLoading}
        widgetRegistry={userWidgetRegistry}
      />
    </div>
  );
};

export default UserDashboardOverviewTab;