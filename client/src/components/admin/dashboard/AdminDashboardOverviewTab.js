import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { useAdminOverview } from '../../../hooks/useAdmin';
import * as adminAPI from '../../../services/adminAPI';
import { useQueryClient, useMutation } from 'react-query';
import { isEqual } from 'lodash';
import DashboardCustomizationSheet from '../../dashboard/overview/DashboardCustomizationSheet';
import SortableGridItemadmin from './SortableGridItemadmin';
import { adminWidgetRegistry } from './adminWidgetDefinitions';
import { defaultAdminLayoutConfig } from './adminKpiConstants';
import { Button } from '../../ui/button.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs.tsx';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../../../lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover.jsx';
import { Calendar } from '../../ui/calendar.jsx';
import { Input } from '../../ui/input.tsx';
import { Label } from '../../ui/label.tsx';

const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

const AdminDashboardOverviewTab = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(['admin']);
  const [timeframe, setTimeframe] = useState('7d');
  const [customDate, setCustomDate] = useState();
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [pickerRange, setPickerRange] = useState();
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');

  const queryParams = useMemo(() => {
    if (timeframe === 'custom' && customDate?.from && customDate?.to) {
      return { startDate: customDate.from.toISOString(), endDate: customDate.to.toISOString() };
    }
    return { timeframe };
  }, [timeframe, customDate]);

  const { data, isLoading, isError, error } = useAdminOverview(queryParams);

  const serverConfig = useMemo(() => {
    const savedPreferences = data?.dashboardPreferences || defaultAdminLayoutConfig;
    const allKeys = new Set(adminWidgetRegistry ? Object.keys(adminWidgetRegistry) : []);
    const savedKeys = new Set(savedPreferences.map(w => w.key));

    const newWidgets = Array.from(allKeys)
      .filter(key => !savedKeys.has(key))
      .map(key => ({ key, enabled: true }));

    return [...savedPreferences, ...newWidgets].map(widgetConfig => {
      const definition = adminWidgetRegistry[widgetConfig.key];
      if (!definition) return null;
      return {
        ...widgetConfig,
        size: widgetConfig.size || definition.defaultSize,
      };
    }).filter(Boolean);
  }, [data]);

  const [config, setConfig] = useState(serverConfig);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const configOnOpen = useRef(null);
  const wasSheetOpen = usePrevious(isSheetOpen);

  useEffect(() => {
    setConfig(serverConfig);
  }, [serverConfig]);

  const { mutate: updatePreferences, isLoading: isSaving } = useMutation(
    ({ preferences }) => adminAPI.updateAdminDashboardPreferences(preferences),
    {
      onMutate: async ({ preferences: newConfig }) => {
        const isReset = newConfig === null;
        
        const resetConfig = defaultAdminLayoutConfig.map(widgetConfig => {
            const definition = adminWidgetRegistry[widgetConfig.key];
            return { ...widgetConfig, size: definition?.defaultSize };
        });

        const newPreferences = isReset ? resetConfig : newConfig;
        
        const queryKey = ['adminOverview', queryParams];
        await queryClient.cancelQueries(queryKey);
        const previousData = queryClient.getQueryData(queryKey);
        
        queryClient.setQueryData(queryKey, (oldData) => {
          if (!oldData) return;
          const newOverviewData = { ...oldData, dashboardPreferences: newPreferences };
          return newOverviewData;
        });

        if (isReset) setConfig(resetConfig);
        
        return { previousData };
      },
      onError: (err, newConfig, context) => {
        const queryKey = ['adminOverview', queryParams];
        if (context.previousData) {
          queryClient.setQueryData(queryKey, context.previousData);
          setConfig(context.previousData.dashboardPreferences || defaultAdminLayoutConfig);
        }
        toast.error(`Error saving layout: ${err.message}`);
      },
      onSettled: () => {
        queryClient.invalidateQueries(['adminOverview']);
      },
      onSuccess: (data, variables) => {
        const isReset = variables.preferences === null;
        if (isReset) {
          toast.success('Dashboard reset successfully.');
        } else {
          toast.success('Layout saved.');
        }
        setIsSheetOpen(false);
      },
    }
  );

  useEffect(() => {
    if (isError) {
      toast.error(`Error loading dashboard: ${error.message}`);
    }
  }, [isError, error]);

  useEffect(() => {
    if (wasSheetOpen && !isSheetOpen) {
      if (configOnOpen.current && !isEqual(config, configOnOpen.current)) {
        handleSave(config);
      }
    }
  }, [isSheetOpen, wasSheetOpen, config]);

  const handleSave = useCallback((newConfig) => {
    if (!isEqual(newConfig, serverConfig)) {
      updatePreferences({ preferences: newConfig });
    }
  }, [serverConfig, updatePreferences]);


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
      handleSave(newConfig);
    }
  };

  const handleReset = useCallback(() => {
    updatePreferences({ preferences: null });
  }, [updatePreferences]);
  
  const handleOpenSheet = () => {
    configOnOpen.current = config;
    setIsSheetOpen(true);
  };

  const handlePresetClick = (preset) => {
    setTimeframe(preset);
    if (preset !== 'custom') {
      setCustomDate(undefined);
    }
  };

  useEffect(() => {
    if (isDatePopoverOpen) {
      setPickerRange(customDate);
      setStartTime(customDate?.from ? format(customDate.from, 'HH:mm') : '00:00');
      setEndTime(customDate?.to ? format(customDate.to, 'HH:mm') : '23:59');
    }
  }, [isDatePopoverOpen, customDate]);

  const handleApplyCustomDate = () => {
    if (pickerRange?.from && pickerRange?.to) {
      const fromWithTime = new Date(pickerRange.from);
      const [fromH, fromM] = startTime.split(':').map(Number);
      fromWithTime.setHours(fromH, fromM, 0, 0);

      const toWithTime = new Date(pickerRange.to);
      const [toH, toM] = endTime.split(':').map(Number);
      toWithTime.setHours(toH, toM, 59, 999);
      
      setCustomDate({ from: fromWithTime, to: toWithTime });
      setTimeframe('custom');
      setIsDatePopoverOpen(false);
    }
  };

  const enabledWidgets = serverConfig.filter(w => w.enabled);

  const getSizeClasses = (size) => {
    switch (size) {
        case 'Full': return 'md:col-span-2 lg:col-span-4';
        case 'Wide': return 'md:col-span-2 lg:col-span-2';
        case 'Narrow': return 'md:col-span-1 lg:col-span-1';
        default: return 'md:col-span-2 lg:col-span-2';
    }
  };

  return (
    <div className="flex-1 space-y-4">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Pulse Dashboard</h2>
       <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center space-x-1 rounded-md bg-muted p-1">
            <Button variant={timeframe === 'today' ? 'secondary' : 'ghost'} size="sm" className="px-3" onClick={() => handlePresetClick('today')}>{t('timeframes.today', 'Today')}</Button>
            <Button variant={timeframe === '7d' ? 'secondary' : 'ghost'} size="sm" className="px-3" onClick={() => handlePresetClick('7d')}>{t('timeframes.7d', '7 Days')}</Button>
            <Button variant={timeframe === 'all' ? 'secondary' : 'ghost'} size="sm" className="px-3" onClick={() => handlePresetClick('all')}>{t('timeframes.all', 'All Time')}</Button>
          </div>
          <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[240px] justify-start text-left font-normal",
                   timeframe === 'custom' && "border-primary",
                  !customDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {customDate?.from ? (
                  <span className="truncate text-xs">
                    {format(customDate.from, "MMM d, y, HH:mm")} - {format(customDate.to, "MMM d, y, HH:mm")}
                  </span>
                ) : (
                  <span>{t('timeframes.custom', 'Custom Range')}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={pickerRange?.from}
                selected={pickerRange}
                onSelect={setPickerRange}
                numberOfMonths={2}
              />
              <div className="p-4 border-t border-border">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start-time" className="text-sm font-medium">{t('labels.startTime', 'Start Time')}</Label>
                    <Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="end-time" className="text-sm font-medium">{t('labels.endTime', 'End Time')}</Label>
                    <Input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleApplyCustomDate} className="w-full mt-4">{t('buttons.apply', 'Apply')}</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={handleOpenSheet}>
            <Settings className="mr-2 h-4 w-4" />
            {t('customization.button', 'Customize')}
          </Button>
        </div>
      </div>
      
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {/* Render KPI Grid Separately and give it full width */}
        {enabledWidgets.find(w => w.key === 'adminKpiGrid') && (
            <div className="mb-4">
                 {(() => {
                    const widgetConfig = enabledWidgets.find(w => w.key === 'adminKpiGrid');
                    const widgetDef = adminWidgetRegistry[widgetConfig.key];
                    const WidgetComponent = widgetDef.component;
                    return <WidgetComponent isLoading={isLoading} kpis={data?.kpis} config={widgetConfig} />;
                })()}
            </div>
        )}

        {/* Render the rest of the widgets in the sortable grid */}
        <SortableContext items={enabledWidgets.filter(w => w.key !== 'adminKpiGrid').map(w => w.key)} strategy={rectSortingStrategy}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {isLoading
              ? defaultAdminLayoutConfig.filter(w => w.enabled && w.key !== 'adminKpiGrid').map(widgetConfig => {
                  const widgetDef = adminWidgetRegistry[widgetConfig.key];
                  const sizeClasses = getSizeClasses(widgetDef.defaultSize);
                  return <div key={widgetConfig.key} className={sizeClasses}><Skeleton className="h-[300px] w-full" /></div>;
                })
              : enabledWidgets.filter(w => w.key !== 'adminKpiGrid').map((widgetConfig) => {
                  const widgetDef = adminWidgetRegistry[widgetConfig.key];
                  if (!widgetDef) return null;
                  
                  const WidgetComponent = widgetDef.component;
                  const sizeClasses = getSizeClasses(widgetConfig.size);
                  
                  const widgetProps = { isLoading, config: widgetConfig };
                  if (widgetConfig.key === 'financialTrendChart') widgetProps.data = data?.financialTrend;
                  if (widgetConfig.key === 'actionCenterQueue') widgetProps.items = data?.actionCenterItems;
                  if (widgetConfig.key === 'systemHealthPanel') widgetProps.health = data?.systemHealth;

                  return (
                    <SortableGridItemadmin key={widgetConfig.key} id={widgetConfig.key} className={sizeClasses}>
                      <WidgetComponent {...widgetProps} />
                    </SortableGridItemadmin>
                  );
                })}
          </div>
        </SortableContext>
      </DndContext>

      <DashboardCustomizationSheet
        isOpen={isSheetOpen}
        setIsOpen={setIsSheetOpen}
        config={config}
        setConfig={setConfig}
        onReset={handleReset}
        isSaving={isSaving}
        widgetRegistry={adminWidgetRegistry}
      />
    </div>
  );
};

export default AdminDashboardOverviewTab;