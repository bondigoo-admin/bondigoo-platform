import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { usePrograms, useUserEnrollments } from '../../hooks/usePrograms';
import { useAuth } from '../../contexts/AuthContext';
import ProgramCard from './ProgramCard';
import { Button } from '../ui/button.tsx';
import { Loader2, ServerCrash, Frown, X, SlidersHorizontal, LayoutGrid, Grid3x3, List, Search, GraduationCap, Languages, BookOpen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet.jsx';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group.jsx';
import { cn } from '../../lib/utils';
import SearchableListSelector from '../SearchableListSelector';
import { Slider } from '../ui/slider.tsx';
import { Input } from '../ui/input.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import CheckboxFilterGroup from './CheckboxFilterGroup';
import ProgramsFilterSidebar from './ProgramsFilterSidebar';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '../ui/command.jsx';
import Highlight from '../ui/Highlight';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';

const getInitials = (name) => {
    if (!name) return '';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

const filterConfig = [
    { id: 'learningOutcomes', labelKey: 'filter_learning_outcome', component: SearchableListSelector, props: { listType: 'programLearningOutcomes', isFilter: true, isMulti: true, placeholderKey: 'programs:select_learning_outcomes' }, initialValue: [] },
    { id: 'author', labelKey: 'filter_author', component: 'SearchableListSelector', props: { listType: 'programAuthors', isFilter: true, isMulti: true, placeholderKey: 'programs:select_authors' }, initialValue: [] },
    { id: 'categories', labelKey: 'field_category_label', component: 'SearchableListSelector', props: { listType: 'programCategories', isFilter: true, isMulti: true, placeholderKey: 'programs:select_categories' }, initialValue: [] },
    { id: 'language', labelKey: 'common:language', component: 'SearchableListSelector', props: { listType: 'languages', isFilter: true, isMulti: true, placeholderKey: 'common:select_language_placeholder' }, initialValue: [] },
    { id: 'skillLevel', labelKey: 'skill_level', component: 'SearchableListSelector', props: { listType: 'skillLevels', isFilter: true, isMulti: true, placeholderKey: 'programs:select_skill_level_placeholder' }, initialValue: [] },
    { id: 'price', labelKey: 'price_range', component: 'PriceFilter', props: {}, initialValue: [0, 1000] },
    {
        id: 'contentTypes', labelKey: 'filter_content_types', component: 'CheckboxFilterGroup', props: {
            options: [
                { id: 'video', labelKey: 'contentType_video', labelDefault: 'Video' },
                { id: 'text', labelKey: 'contentType_text', labelDefault: 'Text/Reading' },
                { id: 'quiz', labelKey: 'contentType_quiz', labelDefault: 'Quiz' },
                { id: 'assignment', labelKey: 'contentType_assignment', labelDefault: 'Assignment' },
                { id: 'presentation', labelKey: 'contentType_presentation', labelDefault: 'Presentation' },
            ]
        }, initialValue: []
    },
    {
        id: 'contentDuration', labelKey: 'filter_content_duration', component: 'CheckboxFilterGroup', props: {
            options: [
                { id: '0-60', labelKey: 'duration_under_1h', labelDefault: 'Under 1 hour' },
                { id: '61-180', labelKey: 'duration_1_3h', labelDefault: '1 - 3 hours' },
                { id: '181-300', labelKey: 'duration_3_5h', labelDefault: '3 - 5 hours' },
                { id: '301-999999', labelKey: 'duration_over_5h', labelDefault: '5+ hours' },
            ]
        }, initialValue: []
    },
    {
        id: 'estimatedCompletionTime', labelKey: 'filter_completion_time', component: 'CheckboxFilterGroup', props: {
            options: [
                { id: '0-60', labelKey: 'duration_under_1h', labelDefault: 'Under 1 hour' },
                { id: '61-180', labelKey: 'duration_1_3h', labelDefault: '1 - 3 hours' },
                { id: '181-300', labelKey: 'duration_3_5h', labelDefault: '3 - 5 hours' },
                { id: '301-999999', labelKey: 'duration_over_5h', labelDefault: '5+ hours' },
            ]
        }, initialValue: []
    },
];

const generateInitialFilters = () => {
    const initialState = filterConfig.reduce((acc, filter) => {
        acc[filter.id] = filter.initialValue;
        return acc;
    }, {});
    initialState.sortBy = 'popularity_desc';
    initialState.searchTerm = '';
    return initialState;
};

const ProgramsPage = () => {
  const { t, i18n } = useTranslation(['programs', 'common']);
  const [filters, setFilters] = useState(generateInitialFilters());
  const [view, setView] = useState('grid');
  const [isDesktopSidebarVisible, setIsDesktopSidebarVisible] = useState(true);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInputValue, setSearchInputValue] = useState(searchParams.get('q') || '');
  const [debouncedSearchValue] = useDebounce(searchInputValue, 300);
  const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const { user } = useAuth();
  const { data: enrollments } = useUserEnrollments(user?._id);

  const enrolledProgramIds = useMemo(() => {
    if (!enrollments) return new Set();
    return new Set(enrollments.map(e => e.program._id));
  }, [enrollments]);

  useEffect(() => {
    document.querySelector('main')?.scrollTo(0, 0);
    const initialUrlFilters = generateInitialFilters();
    const urlSearchTerm = searchParams.get('q');
    if (urlSearchTerm) {
      initialUrlFilters.searchTerm = urlSearchTerm;
    }
    setFilters(initialUrlFilters);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
        if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
            setIsSearchPopoverOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: suggestions, isLoading: isLoadingSuggestions } = useQuery(
    ['programSearchSuggestions', debouncedSearchValue],
    async () => {
      const { data } = await axios.get(`/api/search/suggest?q=${debouncedSearchValue}`);
      return data;
    },
    { enabled: debouncedSearchValue.length > 1 && isSearchPopoverOpen }
  );
  
  const onFilterChange = useCallback((filterType, value) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
  }, []);

  const handleSearchSubmit = (term) => {
    const trimmedTerm = term.trim();
    onFilterChange('searchTerm', trimmedTerm);
    setSearchParams(prev => {
        if (trimmedTerm) prev.set('q', trimmedTerm);
        else prev.delete('q');
        return prev;
    }, { replace: true });
    setIsSearchPopoverOpen(false);
    searchInputRef.current?.blur();
  };
  
  const handleSuggestionSelect = (type, item) => {
    let searchTerm;
    if (type === 'program') {
        searchTerm = item.name;
    } else if (type === 'coach') {
        searchTerm = `${item.firstName} ${item.lastName}`;
    } else {
        searchTerm = item.translation || item.name;
    }
    if (searchTerm) {
        setSearchInputValue(searchTerm);
        handleSearchSubmit(searchTerm);
    }
  };

  const resetFilters = useCallback(() => {
    const initial = generateInitialFilters();
    setFilters(prev => ({ ...initial, sortBy: prev.sortBy }));
    setSearchInputValue('');
    searchParams.delete('q');
    setSearchParams(searchParams);
  }, [searchParams, setSearchParams]);

  const activePills = useMemo(() => {
    const pills = [];
    const initialFilters = generateInitialFilters();
    
    if (filters.searchTerm) {
      pills.push({
        id: 'searchTerm',
        display: `${t('common:search')}: "${filters.searchTerm}"`,
        remove: () => {
            onFilterChange('searchTerm', '');
            setSearchInputValue('');
            searchParams.delete('q');
            setSearchParams(searchParams);
        },
      });
    }

    filterConfig.forEach(filter => {
        const currentValue = filters[filter.id];
        const initialValue = initialFilters[filter.id];
        if (JSON.stringify(currentValue) === JSON.stringify(initialValue)) return;

        if (['learningOutcomes', 'author', 'categories', 'language', 'skillLevel'].includes(filter.id)) {
            currentValue.forEach(item => {
                pills.push({
                    id: `${filter.id}-${item._id}`,
                    display: item.name,
                    remove: () => onFilterChange(filter.id, currentValue.filter(i => i._id !== item._id))
                });
            });
        } else if (filter.id === 'price') {
            const display = `$${currentValue[0]} - $${currentValue[1] >= 1000 ? '1000+' : currentValue[1]}`;
            pills.push({ id: 'price', display, remove: () => onFilterChange('price', initialValue) });
        } else if (['contentTypes', 'contentDuration', 'estimatedCompletionTime'].includes(filter.id)) {
            currentValue.forEach(value => {
                const option = filter.props.options.find(opt => opt.id === value);
                if (option) {
                    pills.push({
                        id: `${filter.id}-${value}`,
                        display: t(option.labelKey, { ns: 'programs', defaultValue: option.labelDefault }),
                        remove: () => onFilterChange(filter.id, currentValue.filter(v => v !== value))
                    });
                }
            });
        }
    });
    return pills;
  }, [filters, onFilterChange, t, i18n.language, searchParams, setSearchParams]);

  const hasActiveFilters = activePills.length > 0;
  
  const apiFilters = useMemo(() => {
      const filtersForApi = { sortBy: filters.sortBy };
      if (filters.searchTerm) filtersForApi.searchTerm = filters.searchTerm;

      filterConfig.forEach(filter => {
        const value = filters[filter.id];
        if (Array.isArray(value) && value.length > 0) {
              if (['categories', 'language', 'skillLevel', 'learningOutcomes', 'author'].includes(filter.id)) {
                  filtersForApi[filter.id] = value.map(item => item._id).join(',');
              } else if (filter.id === 'price') {
                   if (value[0] !== 0 || value[1] !== 1000) filtersForApi.price = value;
              } else {
                  filtersForApi[filter.id] = value.join(',');
              }
        }
      });
      return filtersForApi;
    }, [filters]);

    const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, status, refetch } = usePrograms(apiFilters);

      useEffect(() => {
    refetch();
  }, [apiFilters, refetch]);

  const programs = data?.pages.flatMap(page => page.docs) || [];
  const programsCount = data?.pages[0]?.totalDocs || 0;
  const isLoading = status === 'loading';

const ResultItem = ({ onSelect, children }) => (
    <CommandItem onSelect={onSelect} className="flex items-center gap-x-4 p-2 cursor-pointer">
      {children}
    </CommandItem>
  );

const renderGroup = (title, items, icon, type) => {
    if (!items || items.length === 0) return null;
    const Icon = icon;
    return (
      <CommandGroup heading={title}>
        {items.map(item => {
          const displayName = item.translation || item.name || `${item.firstName} ${item.lastName}`;
          const detail = type === 'program' ? item.coachName : type === 'coach' ? null : t(`programs:filterByCategory.${type}`);
          const image = type === 'program' ? item.programImages?.[0]?.url : type === 'coach' ? item.profilePicture?.url : null;
          
          return (
            <ResultItem key={`${type}-${item._id}`} onSelect={() => handleSuggestionSelect(type, item)}>

              {type === 'coach' || image ? (
                <Avatar className="h-8 w-8">
                  <AvatarImage src={image} alt={displayName} />
                  <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
                </Avatar>
              ) : (
                // Fallback to Icon component only if it exists and there's no image.
                Icon && <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></div>
              )}
              {/* --- MODIFICATION END --- */}
              <div>
                <p className="text-sm font-medium text-foreground"><Highlight text={displayName} match={debouncedSearchValue} /></p>
                {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
              </div>
            </ResultItem>
          );
        })}
      </CommandGroup>
    );
  };
const hasSuggestions = suggestions && (suggestions.programs?.length > 0 || suggestions.coaches?.length > 0 || suggestions.specialties?.length > 0 || suggestions.languages?.length > 0);

const renderContent = () => {
    if (isLoading && programs.length === 0) {
      return (
        <div className="col-span-full flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      );
    }
    if (status === 'error') {
      return (
        <div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 p-12 text-center min-h-[40vh]">
          <ServerCrash className="h-16 w-16 text-destructive" />
          <h2 className="mt-4 text-xl font-semibold text-destructive">{t('programs_fetch_error_title')}</h2>
          <p className="mt-1 text-muted-foreground">{error.message}</p>
        </div>
      );
    }
    if (programs.length === 0 && !isLoading) {
      return (
        <div className="col-span-full flex flex-col items-center justify-center rounded-lg border border-dashed bg-background p-12 text-center min-h-[40vh]">
          <Frown className="h-16 w-16 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold text-foreground">{t('no_programs_title')}</h2>
          <p className="mt-1 text-muted-foreground">{t('no_programs_subtitle')}</p>
          {hasActiveFilters && (
            <Button onClick={resetFilters} className="mt-6">
              {t('clear_all_filters')}
            </Button>
          )}
        </div>
      );
    }
    return <>{programs.map((program) => <ProgramCard key={program._id} program={program} view={view} isEnrolled={enrolledProgramIds.has(program._id)} />)}</>;
  };

 return (
    <div className=" px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl lg:text-6xl">{t('programs')}</h1>
        <p className="mt-3 max-w-3xl mx-auto text-lg text-muted-foreground sm:text-xl">
          {t('page_subtitle', { ns: 'programs' , defaultValue: 'Explore our curated collection of programs and start your journey with world-class coaches today.' })}
        </p>
      </header>

     <div className="lg:flex lg:gap-8">
      <AnimatePresence>
          {isDesktopSidebarVisible && (
              <motion.aside
                  className="hidden lg:block w-80 flex-shrink-0"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 320, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
              >
                  <div className="bg-background rounded-lg border shadow-sm">
                      <div className="p-4 border-b">
                          <h2 className="text-lg font-semibold text-foreground">{t('filters_button', { ns: 'programs', defaultValue: 'Filters' })}</h2>
                      </div>
                      <div className="p-4">
                          <ProgramsFilterSidebar filters={filters} onFilterChange={onFilterChange} />
                      </div>
                  </div>
              </motion.aside>
          )}
      </AnimatePresence>
      <main className="flex-1 min-w-0">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div ref={searchContainerRef} className="relative w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                      ref={searchInputRef}
                      type="text"
                      placeholder={t('search_placeholder', { ns: 'programs', defaultValue: 'Search by program title, topic, or coach...' })}
                      value={searchInputValue}
                      onChange={(e) => setSearchInputValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit(searchInputValue)}
                      onFocus={() => setIsSearchPopoverOpen(true)}
                      className="pl-10 w-full"
                  />
                  <AnimatePresence>
                      {isSearchPopoverOpen && (
                          <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              transition={{ duration: 0.2 }}
                              className="absolute top-full left-0 mt-2 w-full z-50 rounded-lg border bg-popover text-popover-foreground shadow-md"
                          >
                              <Command shouldFilter={false} className="rounded-lg">
                                  <CommandList className="max-h-[40vh]">
                                    {isLoadingSuggestions && <div className="p-4 text-sm text-center">{t('common:loading')}...</div>}
                                    {!isLoadingSuggestions && debouncedSearchValue.length > 1 && !hasSuggestions && (<CommandEmpty>{t('common:noResultsFound')}</CommandEmpty>)}
                                    {!isLoadingSuggestions && debouncedSearchValue.length < 2 && (<div className="py-6 text-center text-sm text-muted-foreground">{t('search_prompt', {ns: 'programs', defaultValue: 'Start typing to find programs.'})}</div>)}
                                    {hasSuggestions && (
                                      <>
                                        {renderGroup(t('common:programs'), suggestions?.programs, BookOpen, 'program')}
                                        {renderGroup(t('common:coaches'), suggestions?.coaches, null, 'coach')}
                                        {renderGroup(t('programs:specialties'), suggestions?.specialties, GraduationCap, 'specialties')}
                                        {renderGroup(t('common:languages'), suggestions?.languages, Languages, 'languages')}
                                      </>
                                    )}
                                </CommandList>
                              </Command>
                          </motion.div>
                      )}
                  </AnimatePresence>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
               <div className="lg:hidden">
                <Sheet>
                <SheetTrigger asChild>
                    <Button variant="outline">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    <span>{t('filters_button', { ns: 'programs', defaultValue: 'Filters' })}</span>
                    {hasActiveFilters && (
                        <span className="ml-2 h-2 w-2 rounded-full bg-primary" />
                    )}
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-full sm:max-w-sm p-0 flex flex-col">
                    <SheetHeader className="p-4 border-b dark:border-slate-800">
                    <div className="flex justify-between items-center">
                        <SheetTitle>{t('filters_button', { ns: 'programs', defaultValue: 'Filters' })}</SheetTitle>
                    </div>
                    </SheetHeader>
                    <div className="p-4 overflow-y-auto flex-grow">
                    <ProgramsFilterSidebar filters={filters} onFilterChange={onFilterChange} />
                    </div>
                </SheetContent>
                </Sheet>
            </div>
            <Button
                variant="outline"
                className="hidden lg:inline-flex"
                onClick={() => setIsDesktopSidebarVisible(prev => !prev)}
            >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                <span>{t('filters_button', { ns: 'programs', defaultValue: 'Filters' })}</span>
                {hasActiveFilters && (
                    <span className="ml-2 h-2 w-2 rounded-full bg-primary" />
                )}
            </Button>

                <Select onValueChange={(value) => onFilterChange('sortBy', value)} value={filters.sortBy}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t('sort_by_placeholder', { ns: 'programs', defaultValue: 'Sort by...' })} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popularity_desc">{t('sort_popularity', { ns: 'programs', defaultValue: 'Popularity' })}</SelectItem>
                    <SelectItem value="createdAt_desc">{t('sort_newest', { ns: 'programs', defaultValue: 'Newest' })}</SelectItem>
                    <SelectItem value="price_asc">{t('sort_price_asc', { ns: 'programs', defaultValue: 'Price: Low to High' })}</SelectItem>
                    <SelectItem value="price_desc">{t('sort_price_desc', { ns: 'programs', defaultValue: 'Price: High to Low' })}</SelectItem>
                  </SelectContent>
                </Select>
                <ToggleGroup type="single" value={view} onValueChange={(val) => val && setView(val)} size="sm" className="hidden sm:flex">
                    <ToggleGroupItem value="grid" aria-label={t('common:view_grid', 'Grid View')}><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
                    <ToggleGroupItem value="compact" aria-label={t('common:view_compact', 'Compact View')}><Grid3x3 className="h-4 w-4" /></ToggleGroupItem>
                    <ToggleGroupItem value="list" aria-label={t('common:view_list', 'List View')}><List className="h-4 w-4" /></ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          
            <p className="text-sm text-muted-foreground font-medium">
              {isLoading && !programsCount ? (
                <span>{t('common:loading')}…</span>
              ) : (
                <span>{t('showing_programs', { ns: 'programs', count: programsCount })}</span>
              )}
            </p>

           {hasActiveFilters && (
                <div className="flex flex-wrap items-center gap-2">
                  {activePills.map(pill => (
                      <div key={pill.id} className="inline-flex items-center gap-x-1.5 rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          <span className="leading-none">{pill.display}</span>
                          <button type="button" onClick={pill.remove} className="flex-shrink-0 rounded-full p-0.5 text-indigo-600 hover:bg-indigo-200/60 hover:text-indigo-900 focus:outline-none focus:ring-1 focus:ring-ring dark:text-indigo-400 dark:hover:bg-indigo-800/80 dark:hover:text-indigo-100" aria-label={`${t('common:remove')} ${pill.display}`}>
                              <X className="h-3.5 w-3.5" />
                          </button>
                      </div>
                  ))}
                  <Button variant="link" size="sm" onClick={resetFilters} className="h-auto p-0 text-sm font-normal text-primary hover:text-primary/80">
                      {t('clear_all_filters')}
                  </Button>
                </div>
              )}
          </div>

          <div className={cn(
            `transition-opacity duration-300 ${isFetchingNextPage ? 'opacity-75' : 'opacity-100'}`,
            {
              'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-10': view === 'grid',
              'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4': view === 'compact',
              'space-y-6': view === 'list'
            }
          )}>
            {renderContent()}
          </div>

          {hasNextPage && (
            <div className="mt-12 flex justify-center">
              <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} variant="secondary" size="lg">
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span>{t('common:loading')}</span>
                  </>
                ) : (
                  <span>{t('load_more')}</span>
                )}
              </Button>
            </div>
          )}
      </main>
      </div>
    </div>
  );
};

export default ProgramsPage;