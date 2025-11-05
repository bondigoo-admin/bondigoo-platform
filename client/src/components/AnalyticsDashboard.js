import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';
import { EarningsDashboard } from './earnings/EarningsDashboard';
import ProgramAnalytics from './analytics/ProgramAnalytics';
import BookingsAnalytics from './analytics/BookingsAnalytics';
import ClientAnalytics from './analytics/ClientAnalytics';
import { useQuery } from 'react-query';
import coachAPI from '../services/coachAPI';
import { useAuth } from '../contexts/AuthContext';
import { useCoachOverview } from '../hooks/useCoachDashboard';
import { Button } from './ui/button.tsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from './ui/sheet.jsx';
import { DateRange } from 'react-day-picker';
import { format, subDays } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';
import { Calendar as CalendarIcon, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Calendar } from './ui/calendar.jsx';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover.jsx';
import { Badge } from './ui/badge.tsx';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from './ui/command.jsx';
import { Checkbox } from './ui/checkbox.tsx';
import { ScrollArea } from './ui/scroll-area.jsx';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion.jsx';

const localeMap = {
  en: enUS,
  de,
  fr,
};

const FilterGroup = ({ options, selected, onChange, placeholder, isLoading }) => {
    const { t } = useTranslation(['common']);
    const handleSelect = (value) => {
        const newSelected = selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value];
        onChange(newSelected);
    };

    return (
        <Command className="rounded-lg border">
            <CommandInput placeholder={placeholder} />
            <CommandList>
                <ScrollArea className="h-[150px]">
                    <CommandEmpty>{isLoading ? t('loading', 'Loading...') : t('noResultsFound', 'No results found.')}</CommandEmpty>
                    <CommandGroup>
                        {options.map((option) => (
                            <CommandItem
                                key={option.value}
                                value={option.label}
                                onSelect={() => handleSelect(option.value)}
                                className="cursor-pointer"
                            >
                                <Checkbox
                                    checked={selected.includes(option.value)}
                                    className="mr-2"
                                    aria-label={`Select ${option.label}`}
                                />
                                <span>{option.label}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </ScrollArea>
            </CommandList>
        </Command>
    );
};

const FilterControls = ({
    filters,
    setFilters,
    programOptions,
    clientOptions,
    sessionTypeOptions,
    isLoadingPrograms,
    isLoadingClients,
    isLoadingSessionTypes,
}) => {
    const { t } = useTranslation(['coach_dashboard', 'common']);

    const handleFilterChange = useCallback((filterKey, value) => {
        setFilters(prevFilters => ({
            ...prevFilters,
            [filterKey]: value
        }));
    }, [setFilters]);

    return (
        <Accordion type="multiple" className="w-full">
            <AccordionItem value="programs">
                <AccordionTrigger>
                    <div className="flex items-center gap-2">
                        <span className="font-medium hover:no-underline">{t('analytics.programs', 'Programs')}</span>
                        {filters.programs.length > 0 && <Badge variant="secondary">{filters.programs.length}</Badge>}
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <FilterGroup
                        options={programOptions}
                        selected={filters.programs}
                        onChange={value => handleFilterChange('programs', value)}
                        placeholder={t('analytics.searchPrograms', 'Search programs...')}
                        isLoading={isLoadingPrograms}
                    />
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="clients">
                <AccordionTrigger>
                    <div className="flex items-center gap-2">
                        <span className="font-medium hover:no-underline">{t('analytics.clients', 'Clients')}</span>
                        {filters.clients.length > 0 && <Badge variant="secondary">{filters.clients.length}</Badge>}
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                     <FilterGroup
                        options={clientOptions}
                        selected={filters.clients}
                        onChange={value => handleFilterChange('clients', value)}
                        placeholder={t('analytics.searchClients', 'Search clients...')}
                        isLoading={isLoadingClients}
                    />
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="sessionTypes">
                <AccordionTrigger>
                    <div className="flex items-center gap-2">
                        <span className="font-medium hover:no-underline">{t('analytics.sessionTypes', 'Session Types')}</span>
                        {filters.sessionTypes.length > 0 && <Badge variant="secondary">{filters.sessionTypes.length}</Badge>}
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <FilterGroup
                        options={sessionTypeOptions}
                        selected={filters.sessionTypes}
                        onChange={value => handleFilterChange('sessionTypes', value)}
                        placeholder={t('analytics.searchSessionTypes', 'Search session types...')}
                        isLoading={isLoadingSessionTypes}
                    />
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    );
};


const AnalyticsDashboard = () => {
    const { t, i18n } = useTranslation(['coach_dashboard', 'common']);
    const { user } = useAuth();
    const coachId = user?._id;
    const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
    const locale = localeMap[i18n.language] || enUS;

    const defaultDateRange = { from: subDays(new Date(), 29), to: new Date() };

    const [activeFilters, setActiveFilters] = useState({
        dateRange: defaultDateRange,
        programs: [],
        clients: [],
        sessionTypes: [],
    });

    const [tempFilters, setTempFilters] = useState(activeFilters);

    useEffect(() => {
        setTempFilters(activeFilters);
    }, [activeFilters]);

    const { data: programsData = { docs: [] }, isLoading: isLoadingPrograms } = useQuery(
        ['coachProgramsList', coachId],
        () => coachAPI.getProgramsForCoach(coachId),
        { enabled: !!coachId }
    );
    const programsList = programsData.docs;

    const { data: overviewData, isLoading: isLoadingClients } = useCoachOverview(coachId, { period: 'allTime' });
    
    const clientsList = useMemo(
        () => overviewData?.analytics?.clients?.clientListTable || [],
        [overviewData]
    );
    
    const { data: sessionTypesList = [], isLoading: isLoadingSessionTypes } = useQuery(
        ['sessionTypes'],
        coachAPI.getSessionTypes
    );

    const createOptions = (items) => {
      if (!items || items.length === 0) return [];
      
      const uniqueItems = [];
      const seenIds = new Set();

      for (const item of items) {
          const value = item._id || item.id;
          if (value && !seenIds.has(value)) {
              seenIds.add(value);
              uniqueItems.push({
                  value,
                  label: item.title || item.name
              });
          }
      }
      return uniqueItems.filter(item => item.label);
    };

    const programOptions = useMemo(() => createOptions(programsList), [programsList]);
    const clientOptions = useMemo(() => createOptions(clientsList), [clientsList]);
    const sessionTypeOptions = useMemo(() => createOptions(sessionTypesList), [sessionTypesList]);
    
    const handleApplyFilters = () => {
        setActiveFilters(tempFilters);
        setIsFilterSheetOpen(false);
    };

    const handleClearAllFilters = () => {
        const cleared = {
            dateRange: defaultDateRange,
            programs: [], clients: [], sessionTypes: [],
        };
        setTempFilters(cleared);
        setActiveFilters(cleared);
        setIsFilterSheetOpen(false);
    };
    
    const handleRemovePill = (pill) => {
        const newFilters = { ...activeFilters };
        if (pill.type === 'dateRange') {
            newFilters.dateRange = defaultDateRange;
        } else {
            newFilters[pill.type] = newFilters[pill.type].filter(id => id !== pill.value);
        }
        setActiveFilters(newFilters);
    };
    
    const activePills = useMemo(() => {
        const pills = [];
        const isDefaultDateRange = activeFilters.dateRange?.from?.toDateString() === defaultDateRange.from?.toDateString() && activeFilters.dateRange?.to?.toDateString() === defaultDateRange.to?.toDateString();

        if (!isDefaultDateRange && activeFilters.dateRange?.from) {
            pills.push({
                id: 'dateRange', type: 'dateRange',
                display: `${format(activeFilters.dateRange.from, "P", { locale })} - ${activeFilters.dateRange.to ? format(activeFilters.dateRange.to, "P", { locale }) : ''}`,
            });
        }
        
        const allOptions = {
            programs: programOptions,
            clients: clientOptions,
            sessionTypes: sessionTypeOptions,
        };

        ['programs', 'clients', 'sessionTypes'].forEach(type => {
            activeFilters[type].forEach(id => {
                const option = allOptions[type].find(opt => opt.value === id);
                if (option) {
                    pills.push({ id: `${type}-${id}`, type, value: id, display: option.label });
                }
            });
        });

        return pills;
    }, [activeFilters, defaultDateRange, locale, programOptions, clientOptions, sessionTypeOptions]);
    
    const nonDatePills = activePills.filter(p => p.type !== 'dateRange');

    const finalFilters = {
        dateRange: activeFilters.dateRange,
        programIds: activeFilters.programs,
        clientIds: activeFilters.clients,
        sessionTypeIds: activeFilters.sessionTypes,
    };
    
    const filterControlsProps = {
        filters: tempFilters,
        setFilters: setTempFilters,
        programOptions,
        clientOptions,
        sessionTypeOptions,
        isLoadingPrograms,
        isLoadingClients,
        isLoadingSessionTypes,
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{t('analytics.title', 'Analytics & Reports')}</h2>
                    <p className="text-muted-foreground">{t('analytics.description', 'Deep dive into your business performance.')}</p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button id="date" variant="outline" className={cn("w-full sm:w-[260px] justify-start text-left font-normal", !activeFilters.dateRange && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {activeFilters.dateRange?.from ? (
                                    activeFilters.dateRange.to ? (
                                        <>{format(activeFilters.dateRange.from, "P", { locale })} - {format(activeFilters.dateRange.to, "P", { locale })}</>
                                    ) : (
                                        format(activeFilters.dateRange.from, "P", { locale })
                                    )
                                ) : (
                                    <span>Pick a date</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={activeFilters.dateRange?.from}
                                selected={activeFilters.dateRange}
                                onSelect={(range) => setActiveFilters(f => ({ ...f, dateRange: range || defaultDateRange }))}
                                numberOfMonths={2}
                            />
                        </PopoverContent>
                    </Popover>
                    <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
                        <SheetTrigger asChild>
                            <Button variant="outline" className="w-full sm:w-auto">
                                <SlidersHorizontal className="mr-2 h-4 w-4" />
                                {t('analytics.filters', 'Filters')}
                                {nonDatePills.length > 0 && <Badge variant="secondary" className="ml-2">{nonDatePills.length}</Badge>}
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="w-full sm:max-w-md flex flex-col">
                            <SheetHeader>
                                <SheetTitle>{t('analytics.filters', 'Filters')}</SheetTitle>
                            </SheetHeader>
                            <div className="py-4 flex-1 overflow-y-auto">
                               <FilterControls {...filterControlsProps} />
                            </div>
                            <SheetFooter>
                                 <Button variant="ghost" onClick={handleClearAllFilters}>{t('common:clearAll')}</Button>
                                 <div className="flex gap-2">
                                    <SheetClose asChild><Button variant="outline">{t('common:cancel')}</Button></SheetClose>
                                    <Button onClick={handleApplyFilters}>{t('common:apply')}</Button>
                                 </div>
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>

            {activePills.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                  {activePills.map(pill => (
                      <div
                          key={pill.id}
                          className="inline-flex items-center gap-x-1.5 rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      >
                          <span className="leading-none">{pill.display}</span>
                          <button
                              type="button"
                              onClick={() => handleRemovePill(pill)}
                              className="flex-shrink-0 rounded-full p-0.5 text-indigo-600 hover:bg-indigo-200/60 hover:text-indigo-900 focus:outline-none focus:ring-1 focus:ring-ring dark:text-indigo-400 dark:hover:bg-indigo-800/80 dark:hover:text-indigo-100"
                              aria-label={`${t('common:remove')} ${pill.display}`}
                          >
                              <X className="h-3.5 w-3.5" />
                          </button>
                      </div>
                  ))}
                  <Button
                      variant="link"
                      size="sm"
                      onClick={handleClearAllFilters}
                      className="h-auto p-0 text-sm font-normal text-primary hover:text-primary/80"
                  >
                      {t('common:clearAll')}
                  </Button>
              </div>
            )}

            <Tabs defaultValue="earnings">
                <div className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <TabsList className="w-max md:w-full md:grid md:grid-cols-4">
                        <TabsTrigger value="earnings">{t('analytics.subtabs.earnings', 'Earnings')}</TabsTrigger>
                        <TabsTrigger value="programs">{t('analytics.subtabs.programs', 'Programs')}</TabsTrigger>
                        <TabsTrigger value="bookings">{t('analytics.subtabs.bookings', 'Bookings')}</TabsTrigger>
                        <TabsTrigger value="clients">{t('analytics.subtabs.clients', 'Clients')}</TabsTrigger>
                    </TabsList>
                </div>
                <TabsContent value="earnings" className="mt-4">
                    <EarningsDashboard filters={finalFilters} />
                </TabsContent>
                <TabsContent value="programs" className="mt-4">
                    <ProgramAnalytics filters={finalFilters} />
                </TabsContent>
                <TabsContent value="bookings" className="mt-4">
                    <BookingsAnalytics filters={finalFilters} />
                </TabsContent>
                <TabsContent value="clients" className="mt-4">
                    <ClientAnalytics filters={finalFilters} />
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default AnalyticsDashboard;