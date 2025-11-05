import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { useAuth } from '../../../contexts/AuthContext';
import { useCoachOverview } from '../../../hooks/useCoachDashboard';
import { useQuery, useQueryClient, useMutation } from 'react-query';
import { useTranslation } from 'react-i18next';
import { getCoachReviews } from '../../../services/ReviewAPI';
import { getCoachSessions } from '../../../services/bookingAPI';
import { logger } from '../../../utils/logger';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import BookingDetailsModal from '../../BookingDetailsModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Button } from '../../ui/button.tsx';
import { Settings } from 'lucide-react';
import DashboardCustomizationSheet from './DashboardCustomizationSheet';
import SortableDashboardGridItem from './SortableDashboardGridItem';
import { widgetRegistry, defaultLayoutConfig } from './widgets/widgetDefinitions';
import { toast } from 'react-hot-toast';
import { isEqual } from 'lodash';
import { updateDashboardPreferences } from '../../../services/coachAPI';
import DashboardAnnouncementWidget from './DashboardAnnouncementWidget'; 

const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

const DashboardOverviewTab = () => {
  const { user } = useAuth();
  const { t } = useTranslation('coach_dashboard');
  const queryClient = useQueryClient();
  const coachId = user?._id;

  const [filters, setFilters] = useState({ dateRange: { period: 'last30days' } });
  const { data: overviewData, isLoading, isError } = useCoachOverview(coachId, filters);

  const serverConfig = useMemo(() => {
    const savedPreferences = overviewData?.dashboardPreferences;
    if (!savedPreferences) {
        logger.debug('[CoachDashboardOverviewTab] No saved preferences found, using default layout.');
        return defaultLayoutConfig;
    }
    const allKeys = new Set(Object.keys(widgetRegistry));
    const savedKeys = new Set(savedPreferences.map(w => w.key));

    const newWidgets = Array.from(allKeys)
      .filter(key => !savedKeys.has(key))
      .map(key => ({ key, enabled: true, settings: {} }));

    if (newWidgets.length > 0) {
        logger.info('[CoachDashboardOverviewTab] Merging new widgets into saved preferences.', { newKeys: newWidgets.map(w => w.key) });
    }
    
    return [...savedPreferences, ...newWidgets];
  }, [overviewData]);
  const [config, setConfig] = useState(serverConfig);
  
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [ratingData, setRatingData] = useState({ rating: 0.0, isLoading: true });
  const [selectedBooking, setSelectedBooking] = useState(null);

  const configOnOpen = useRef(null);
  const wasSheetOpen = usePrevious(isSheetOpen);

  useEffect(() => {
    setConfig(serverConfig);
  }, [serverConfig]);

  const mutation = useMutation(updateDashboardPreferences, {
    onMutate: async (newConfig) => {
      const isReset = newConfig === null;
      const newPreferences = isReset ? defaultLayoutConfig : newConfig;
      
      const queryKey = ['coachOverview', coachId, filters];

      await queryClient.cancelQueries(queryKey);
      const previousData = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (oldData) => {
        if (!oldData) return;
        return { ...oldData, dashboardPreferences: newPreferences };
      });
      
      if (isReset) setConfig(defaultLayoutConfig);

      return { previousData };
    },
    onError: (err, newConfig, context) => {
      const queryKey = ['coachOverview', coachId, filters];
      if (context.previousData) {
        queryClient.setQueryData(queryKey, context.previousData.dashboardPreferences || defaultLayoutConfig);
        setConfig(context.previousData.dashboardPreferences || defaultLayoutConfig);
      }
      toast.error(t('customization.saveError'));
    },
    onSettled: () => {
      const queryKey = ['coachOverview', coachId, filters];
      queryClient.invalidateQueries(queryKey);
    },
    onSuccess: (data, variables) => {
      const isReset = variables === null;
      if (isReset) {
        toast.success(t('customization.resetSuccess', 'Dashboard reset successfully.'));
        setIsSheetOpen(false);
      } else if (!isSheetOpen) { // Only show success toast for drag/drop if sheet is closed
        toast.success(t('customization.saveSuccess'));
      }
    },
  });

  useEffect(() => {
    if (wasSheetOpen && !isSheetOpen) {
      if (configOnOpen.current && !isEqual(config, configOnOpen.current)) {
        logger.debug('[DashboardOverviewTab] Sheet closed with changes. Saving.');
        mutation.mutate(config);
      }
    }
  }, [isSheetOpen, wasSheetOpen, config, mutation]);
  
  const handleReset = useCallback(() => {
    mutation.mutate(null);
  }, [mutation]);
  
const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = config.findIndex((item) => item.key === active.id);
      const newIndex = config.findIndex((item) => item.key === over.id);
      const newConfig = arrayMove(config, oldIndex, newIndex);
      setConfig(newConfig);
      mutation.mutate(newConfig);
    }
  };

  const enabledWidgets = useMemo(() => config.filter(w => w.enabled), [config]);

  const handleSelectBooking = (booking) => {
    logger.info('[DashboardOverviewTab] Opening booking details modal for booking:', { bookingId: booking?._id });
    setSelectedBooking(booking);
  };

  const handleCloseModal = () => setSelectedBooking(null);

  const handleOpenSheet = () => {
    configOnOpen.current = JSON.parse(JSON.stringify(config));
    setIsSheetOpen(true);
  };

  const { data: scheduleData, isLoading: isLoadingSchedule } = useQuery(
    ['dashboardCoachSessions', coachId], () => getCoachSessions(coachId), { enabled: !!coachId, staleTime: 5 * 60 * 1000 }
  );
  
  const upcomingSessions = useMemo(() => {
    if (!scheduleData?.regularBookings) return [];
    const allowedStatuses = ['confirmed', 'rescheduled', 'scheduled', 'pending_payment', 'pending_reschedule_coach_request', 'pending_reschedule_client_request', 'rescheduled_pending_attendee_actions'];
    const clientMap = new Map(overviewData?.analytics?.clients?.clientListTable?.map(client => [client._id, client]) || []);
    const enrichedAndFilteredBookings = scheduleData.regularBookings.filter(b => allowedStatuses.includes(b.status)).map(b => ({ ...b, user: clientMap.has(b.user) ? { _id: clientMap.get(b.user)._id, firstName: clientMap.get(b.user).name.split(' ')[0], lastName: clientMap.get(b.user).name.split(' ').slice(1).join(' '), profilePicture: { url: clientMap.get(b.user).profilePicture } } : b.user }));
    const now = new Date();
    const futureSessions = enrichedAndFilteredBookings.filter(b => new Date(b.start) >= now).sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, 5);
    return futureSessions.length > 0 ? futureSessions : enrichedAndFilteredBookings.filter(b => new Date(b.start) < now).sort((a, b) => new Date(b.start) - new Date(a.start)).slice(0, 5);
  }, [scheduleData, overviewData]);

  useEffect(() => {
    if (!coachId) { setRatingData({ rating: 0.0, isLoading: false }); return; }
    const fetchReviewData = async () => {
      try {
        setRatingData({ rating: 0.0, isLoading: true });
        const reviewData = await getCoachReviews(coachId);
        if (reviewData.success) { setRatingData({ rating: reviewData.averageRating, isLoading: false }); }
      } catch (err) {
        setRatingData(prev => ({ ...prev, isLoading: false }));
      }
    };
    fetchReviewData();
  }, [coachId]);
  
  const combinedKpis = useMemo(() => {
    if (!overviewData) return {};
    const { kpis: overviewKpis, analytics } = overviewData;
    const baseKpis = overviewKpis || {};
    const earningsKpis = analytics?.earnings?.kpis || {};
    const programsKpis = analytics?.programs?.kpis || {};
    const bookingsKpis = analytics?.bookings?.kpis || {};
    const clientsKpis = analytics?.clients?.kpis || {};
    return { ...baseKpis, ...earningsKpis, ...programsKpis, ...bookingsKpis, ...clientsKpis };
  }, [overviewData]);

  const kpisForGrid = useMemo(() => {
    return { ...combinedKpis, averageRating: ratingData.rating };
  }, [combinedKpis, ratingData.rating]);

if (isError) return <div className="text-center text-destructive p-8">{t('overview.errorLoading')}</div>;
  
const renderWidget = (widgetConfig, dragHandleProps) => {
    const widgetDef = widgetRegistry[widgetConfig.key];
    if (!widgetDef) return null;
    const { component: Component, needsCard } = widgetDef;
    let props = {
      isLoading: isLoading || ratingData.isLoading,
      settings: widgetConfig.settings,
      ...(!needsCard && { dragHandleProps }),
    };
    
    switch (widgetConfig.key) {
      case 'dashboardAnnouncements': 
      props = { ...props, dragHandleProps: dragHandleProps }; 
      break;
      case 'kpiGrid': props = { ...props, kpis: kpisForGrid }; break;
      case 'revenueChart': props = { ...props, data: overviewData?.revenueOverTime }; break;
      case 'actionCenter': props = { ...props, notifications: overviewData?.actionCenter }; break;
      case 'upcomingSchedule': props = { isLoading: isLoadingSchedule, schedule: upcomingSessions, onSelectBooking: handleSelectBooking }; break;
      default: break;
    }

    const content = <Component {...props} />;
    if (needsCard) {
      return (
        <Card className="h-full flex flex-col">
          <CardHeader {...dragHandleProps} className="cursor-move">
            <CardTitle>{t(widgetDef.nameKey, widgetDef.defaultName)}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">{content}</CardContent>
        </Card>
      );
    }
    return content;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
        <div className="flex items-center space-x-2">
          <Select 
            value={filters.dateRange.period} 
            onValueChange={(value) => setFilters({ dateRange: { period: value } })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t('kpis.timeRanges.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last7days">{t('kpis.timeRanges.last7days')}</SelectItem>
              <SelectItem value="last30days">{t('kpis.timeRanges.last30days')}</SelectItem>
              <SelectItem value="last90days">{t('kpis.timeRanges.last90days')}</SelectItem>
              <SelectItem value="allTime">{t('kpis.timeRanges.allTime')}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleOpenSheet}>
            <Settings className="mr-2 h-4 w-4" />
            {t('customization.button', 'Customize')}
          </Button>
        </div>
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={enabledWidgets.map(w => w.key)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {enabledWidgets.map(widgetConfig => {
              const widgetDef = widgetRegistry[widgetConfig.key];
              if (!widgetDef) return null;
              const className = widgetDef.size === 'wide' ? 'lg:col-span-2' : 'lg:col-span-1';
              return (
                <SortableDashboardGridItem key={widgetConfig.key} id={widgetConfig.key} className={className}>
                  {({ dragHandleProps }) => renderWidget(widgetConfig, dragHandleProps)}
                </SortableDashboardGridItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      
      {selectedBooking && (<BookingDetailsModal bookingId={selectedBooking._id} existingBooking={selectedBooking} isInitialData={true} onClose={handleCloseModal} onSuggest={() => { /* No operation */ }} />)}

      <DashboardCustomizationSheet
        isOpen={isSheetOpen}
        setIsOpen={setIsSheetOpen}
        config={config}
        setConfig={setConfig}
        onReset={handleReset}
        isSaving={mutation.isLoading}
        widgetRegistry={widgetRegistry}
      />
    </div>
  );
};

export default DashboardOverviewTab;