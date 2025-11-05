import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import { Search, Filter, X, GraduationCap, Languages, LayoutGrid, Grid3x3, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

import { searchCoaches } from '../hooks/useSearchAPI';
import { searchListItems } from '../services/coachAPI';
import FilterSidebar from './FilterSidebar';
import CoachCard from './CoachCard';
import ErrorBoundary from './ErrorBoundary';
import LoadingSpinner from './LoadingSpinner';

import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { getCoachReviews } from '../services/ReviewAPI';
import { getPriceConfiguration } from '../services/priceAPI';
import { getUserStatus } from '../services/statusAPI';
import { logger } from '../utils/logger';
import { useLiveSession } from '../contexts/LiveSessionContext';
import LiveSessionClientRequestModal from './LiveSessionClientRequestModal';
import LiveSessionWaitingRoom from './LiveSessionWaitingRoom';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './ui/command.jsx';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import Highlight from './ui/Highlight';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.jsx';
import { cn } from '../lib/utils';

const getInitials = (name) => {
    if (!name) return '';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

const filterConfig = [
    { id: 'specialties', initialValue: [], component: 'SearchableListSelector', props: { listType: 'specialties', placeholderKey: 'coachList:selectSpecialties', multiSelect: true, isFilter: true } },
    { id: 'languages', initialValue: [], component: 'SearchableListSelector', props: { listType: 'languages', placeholderKey: 'coachList:selectLanguages', multiSelect: true, isFilter: true } },
    { id: 'priceRange', initialValue: [null, null], component: 'PriceFilter' },
    { id: 'minRating', initialValue: 0, component: 'RatingFilter' },
    { id: 'educationLevels', initialValue: [], component: 'SearchableListSelector', props: { listType: 'educationLevels', placeholderKey: 'coachList:selectEducationLevels', multiSelect: true, isFilter: true } },
    { id: 'coachingStyles', initialValue: [], component: 'SearchableListSelector', props: { listType: 'coachingStyles', placeholderKey: 'coachList:selectCoachingStyles', multiSelect: true, isFilter: true } },
    { id: 'skills', initialValue: [], component: 'SearchableListSelector', props: { listType: 'skills', placeholderKey: 'coachList:selectSkills', multiSelect: true, isFilter: true } },
    { id: 'liveSessionAvailable', initialValue: false, component: 'Switch' },
    { id: 'isInsuranceRecognized', initialValue: false, component: 'Switch', labelKey: 'coachList:insuranceRecognized' },
    { id: 'liveSessionPriceRange', initialValue: [null, null], component: 'PriceFilter' },
];

const generateInitialFilters = () => {
    const initialState = filterConfig.reduce((acc, filter) => {
        acc[filter.id] = filter.initialValue;
        return acc;
    }, {});
    initialState.searchTerm = '';
    initialState.sortBy = 'popularity_desc';
    return initialState;
};

const CoachList = () => {
  const { t, i18n } = useTranslation(['common', 'connections', 'coachList', 'liveSession']);
  const currentLanguage = i18n.language;
  const { user } = useContext(AuthContext);
  const { requestLiveSession, outgoingRequestStatus, sessionId, sessionInfo, cancelLiveSessionRequest, resetOutgoingRequest } = useLiveSession();
  
  const [filters, setFilters] = useState(generateInitialFilters);
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isWaitingRoomOpen, setIsWaitingRoomOpen] = useState(false);
  const [isDesktopSidebarVisible, setIsDesktopSidebarVisible] = useState(true);
  const [view, setView] = useState('grid'); // 'grid', 'compact', 'list'

  const [searchParams, setSearchParams] = useSearchParams();
  const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState(''); // Initialize empty
  const [debouncedSearchValue] = useDebounce(searchInputValue, 300);
  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);

     const isSwissUser = useMemo(() => {
    const country = user?.billingDetails?.address?.country;
    logger.info(`[CoachList] Checking user's country for Insurance Filter. Found country: '${country}'`);
    return country === 'CH';
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
        if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
            setIsSearchPopoverOpen(false);
        }
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setIsSearchPopoverOpen(false);
        }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

useEffect(() => {
  document.querySelector('main')?.scrollTo(0, 0);
    const syncFromUrl = async () => {
        logger.info('[CoachList Mount] Syncing initial state from URL params.');
        const initialUrlFilters = generateInitialFilters();

        const urlSearchTerm = searchParams.get('q');
        if (urlSearchTerm) {
            initialUrlFilters.searchTerm = urlSearchTerm;
            setSearchInputValue(urlSearchTerm);
        }

        const liveAvailable = searchParams.get('liveSessionAvailable');
        if (liveAvailable === 'true') {
            initialUrlFilters.liveSessionAvailable = true;
        }

        const specialtyIds = searchParams.getAll('specialties');
        if (specialtyIds.length > 0) {
            try {
                // Fetch the full specialty objects to populate the filter state correctly
                const allSpecialties = await searchListItems('specialties', '', currentLanguage);
                const selectedSpecialties = allSpecialties.filter(s => specialtyIds.includes(s._id));
                if (selectedSpecialties.length > 0) {
                    initialUrlFilters.specialties = selectedSpecialties;
                }
            } catch (err) {
                logger.error('Failed to fetch specialties for URL param hydration', err);
            }
        }
        
        setFilters(initialUrlFilters);
    };

    syncFromUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const { data: suggestions, isLoading: isLoadingSuggestions } = useQuery(
    ['coachSearchSuggestions', debouncedSearchValue],
    async () => {
      const { data } = await axios.get(`/api/search/suggest?q=${debouncedSearchValue}`);
      return data;
    },
    {
      enabled: debouncedSearchValue.length > 1 && isSearchPopoverOpen,
    }
  );

const handleSearchSubmit = (term) => {
    const trimmedTerm = term.trim();
    logger.info(`[CoachList handleSearchSubmit] Submitting search: "${trimmedTerm}"`);
    onFilterChange('searchTerm', trimmedTerm);

    setSearchParams(prev => {
        if (trimmedTerm) {
            prev.set('q', trimmedTerm);
        } else {
            prev.delete('q');
        }
        return prev;
    }, { replace: true });

    setIsSearchPopoverOpen(false);
    searchInputRef.current?.blur();
  };

   const handleSuggestionSelect = (type, item) => {
    logger.info(`[CoachList handleSuggestionSelect] Suggestion selected. Type: ${type}`, item);
    let searchTerm;

    if (type === 'coach') {
        // For a coach, the search term is their full name.
        searchTerm = `${item.firstName} ${item.lastName}`;
    } else {
        // For any other type (Specialty, Language), the search term is its name.
        // This makes clicking "English" (Specialty) behave like typing "English" and hitting Enter.
        searchTerm = item.translation || item.name;
    }
    
    if (searchTerm) {
        setSearchInputValue(searchTerm);
        handleSearchSubmit(searchTerm);
    }
  };

   const onFilterChange = useCallback((filterType, value) => {
    logger.debug(`[CoachList onFilterChange] Filter changed -> Type: ${filterType}, Value:`, value);
    setPage(1);
    setFilters(prev => ({ ...prev, [filterType]: value }));
  }, []);
    
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
      
      if (Array.isArray(currentValue) && currentValue.length > 0) {
        if (filter.id === 'priceRange' || filter.id === 'liveSessionPriceRange') {
            if (currentValue[0] !== initialValue[0] || currentValue[1] !== initialValue[1]) {
                const isLivePrice = filter.id === 'liveSessionPriceRange';
                if (isLivePrice && !filters.liveSessionAvailable) {
                    return; 
                }
                const displayPrefix = isLivePrice ? t('liveSessionPriceShort', 'Live') + ': ' : '';
                const display = `${displayPrefix}$${currentValue[0] || '0'} - $${currentValue[1] || '∞'}`;
                pills.push({ id: filter.id, display, remove: () => onFilterChange(filter.id, initialValue) });
            }
        } else {
             currentValue.filter(item => item && item._id).forEach(item => {
                pills.push({
                    id: `${filter.id}-${item._id}`,
                    display: item.translation || item.name,
                    remove: () => onFilterChange(filter.id, currentValue.filter(i => i._id !== item._id))
                });
            });
        }
      } else if (filter.id === 'minRating' && currentValue > 0) {
        pills.push({
            id: 'minRating',
            display: `${currentValue}+ ${t('common:stars')}`,
            remove: () => onFilterChange('minRating', 0)
        });
      } else if (filter.id === 'liveSessionAvailable' && currentValue === true) {
        pills.push({
            id: 'liveSessionAvailable',
            display: t('coachList:liveSessionAvailable'),
            remove: () => onFilterChange('liveSessionAvailable', false)
        });
      } else if (filter.id === 'isInsuranceRecognized' && currentValue === true) {
        pills.push({
            id: 'isInsuranceRecognized',
            display: t('coachList:insuranceRecognized'),
            remove: () => onFilterChange('isInsuranceRecognized', false)
        });
      }
    });

    return pills;
  }, [filters, onFilterChange, t, searchParams, setSearchParams]);

    const resetFilters = useCallback(() => {
    setPage(1);
    const initial = generateInitialFilters();
    setFilters(prev => ({ ...initial, sortBy: prev.sortBy }));
  }, []);

const apiFilters = useMemo(() => {
   logger.debug('[CoachList useMemo] Recalculating apiFilters. Current filters state:', filters);
   const params = {
      sortBy: filters.sortBy,
      lang: currentLanguage,
    };
    if (filters.searchTerm) params.searchTerm = filters.searchTerm;
    if (filters.minRating > 0) params.minRating = filters.minRating;
    if (filters.liveSessionAvailable) params.liveSessionAvailable = true;
    if (filters.isInsuranceRecognized) params.isInsuranceRecognized = true;
    
    const [minPrice, maxPrice] = filters.priceRange;
    if (minPrice !== null && minPrice >= 0) params.minPrice = minPrice;
    if (maxPrice !== null) params.maxPrice = maxPrice;
    
    const [minLivePrice, maxLivePrice] = filters.liveSessionPriceRange || [null, null];
    if (minLivePrice !== null && minLivePrice >= 0) params.minLivePrice = minLivePrice;
    if (maxLivePrice !== null) params.maxLivePrice = maxLivePrice;
    
     ['specialties', 'languages', 'educationLevels', 'coachingStyles', 'skills'].forEach(key => {
        if (filters[key]?.length > 0) {
            params[key] = filters[key].filter(item => item && item._id).map(item => item._id).join(',');
        }
    });

    logger.debug('[CoachList] Final API filter parameters being generated:', { ...params });

    return params;
  }, [filters, currentLanguage]);

  const queryKey = ['coaches', page, limit, apiFilters];

   const { data: coachesData, isLoading, error } = useQuery(queryKey, async ({ queryKey }) => {
    logger.info('[CoachList useQuery] Firing coaches query with key:', queryKey);
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...apiFilters
    });
    
    logger.info('[CoachList] Constructed URLSearchParams for API request:', queryParams.toString());

    // The searchCoaches hook now returns coaches and facets together
    const initialData = await searchCoaches(queryParams);
    
    if (!initialData?.coaches || initialData.coaches.length === 0) {
      logger.info('[CoachList useQuery] No coaches found in initial fetch.');
      return initialData;
    }
    logger.info(`[CoachList useQuery] Found ${initialData.coaches.length} coaches. Starting data enrichment.`);

    const listTypesToTranslate = ['specialties', 'languages', 'educationLevels', 'coachingStyles', 'skills'];
    const idMap = {};
    listTypesToTranslate.forEach(type => { idMap[type] = new Set(); });

    initialData.coaches.forEach(coach => {
        listTypesToTranslate.forEach(type => {
            if (coach[type] && Array.isArray(coach[type])) {
                coach[type].forEach(item => item && item._id && idMap[type].add(item._id));
            }
        });
    });

    const translationPromises = listTypesToTranslate
        .filter(type => idMap[type].size > 0)
        .map(type => searchListItems(type, '', currentLanguage).then(items => ({ type, items })));

    const translationResults = await Promise.all(translationPromises);

    const translationMaps = listTypesToTranslate.reduce((acc, type) => {
        acc[type] = new Map();
        return acc;
    }, {});

    translationResults.forEach(({ type, items }) => {
        items.forEach(item => {
            if (item.translation) {
                translationMaps[type].set(item._id, item.translation);
            }
        });
    });

    const coachesWithTranslations = initialData.coaches.map(coach => {
        const newCoach = { ...coach };
        listTypesToTranslate.forEach(type => {
            if (newCoach[type] && Array.isArray(newCoach[type])) {
                newCoach[type] = newCoach[type].map(item => {
                    if (item && item._id) {
                        const translation = translationMaps[type].get(item._id);
                        return translation ? { ...item, translation } : item;
                    }
                    return item;
                });
            }
        });
        return newCoach;
    });

   const coachDataPromises = coachesWithTranslations.map(async (coach) => {
       const statusPromise = coach.user?.status
           ? Promise.resolve(coach.user.status)
           : getUserStatus(coach.userId);

       const [reviewResult, priceConfigResult, statusResult] = await Promise.allSettled([
        getCoachReviews(coach.userId),
        getPriceConfiguration(coach.userId),
        statusPromise
       ]);

      const reviews = reviewResult.status === 'fulfilled' ? reviewResult.value.reviews : [];
      const rating = reviewResult.status === 'fulfilled' ? reviewResult.value.averageRating : 0;
      
      const rawPriceData = priceConfigResult.status === 'fulfilled' ? priceConfigResult.value : null;
      const priceConfig = rawPriceData?.priceConfig || rawPriceData;
      
      let status = 'offline';
      if (statusResult.status === 'fulfilled') {
          status = statusResult.value;
      } else {
          logger.error(`[CoachList] Failed to fetch status for coach ${coach.userId}:`, statusResult.reason);
      }

      if (!priceConfig) {
        if (priceConfigResult.status === 'rejected') {
          logger.warn(`[CoachList] Failed to fetch price config for coach ${coach.userId}:`, priceConfigResult.reason.message);
        } else {
          logger.info(`[CoachList] No price config found for coach ${coach.userId}.`);
        }
      }

      let minimumHourlyRate = null;
      if (priceConfig && priceConfig.baseRate && typeof priceConfig.baseRate.amount === 'number') {
        const currency = priceConfig.baseRate.currency || 'CHF';
        const sessionRates = (priceConfig.sessionTypeRates || []).map(r => r.rate?.amount).filter(a => typeof a === 'number');
        const allRates = [priceConfig.baseRate.amount, ...sessionRates];
        const positiveRates = allRates.filter(r => r > 0);

        let minRate = null;
        if (positiveRates.length > 0) {
          minRate = Math.min(...positiveRates);
        } else if (allRates.some(r => r === 0)) {
          minRate = 0;
        }

        if (minRate !== null) {
          minimumHourlyRate = { amount: minRate, currency };
        }
      }
      
      const liveSessionRate = priceConfig?.liveSessionRate || null;

      return { 
        ...coach, 
        user: { ...coach.user, status },
        reviews, 
        rating, 
        minimumHourlyRate,
        liveSessionRate 
      };
    });

    const enrichedCoaches = await Promise.all(coachDataPromises);
    logger.info('[CoachList] Enriched Coach Data for Rendering:', enrichedCoaches);

    return {
      ...initialData, // This includes the facets from the API response
      coaches: enrichedCoaches,
    };
  }, {
    keepPreviousData: true,
    onError: (err) => {
      toast.error(t('coachList:errorFetchingCoaches'));
      logger.error('[CoachList useQuery] Query failed:', err);
    }
  });

  const facetData = coachesData?.facets;
  const isLoadingFacets = isLoading; // Facets are loading when coaches are loading.

  const hasActiveFilters = activePills.length > 0;

   const handleInitiateRequest = useCallback((coachForRequest) => {
    setSelectedCoach(coachForRequest);
    setIsRequestModalOpen(true);
  }, []);

  const handleConfirmRequest = useCallback(async (payload) => {
    try {
        await requestLiveSession(payload);
        setIsRequestModalOpen(false);
    } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to request live session.');
        logger.error('[CoachList] Failed to request live session', error);
    }
  }, [requestLiveSession]);

  useEffect(() => {
    if (outgoingRequestStatus === 'pending' || outgoingRequestStatus === 'accepted') {
        setIsWaitingRoomOpen(true);
    } 
    else if (outgoingRequestStatus === 'declined' || outgoingRequestStatus === 'cancelled') {
        const timer = setTimeout(() => {
            setIsWaitingRoomOpen(false);
            resetOutgoingRequest();
        }, 3000);
        
        return () => clearTimeout(timer);
    }
  }, [outgoingRequestStatus, resetOutgoingRequest]);

  const handleCloseWaitingRoom = useCallback(() => {
    setIsWaitingRoomOpen(false);
    resetOutgoingRequest();
  }, [resetOutgoingRequest]);

  const handleCancelLiveRequest = useCallback(async () => {
    try {
      await cancelLiveSessionRequest();
    } catch (error) {
      logger.error('[CoachList] Error while calling cancelLiveSessionRequest API', error);
      toast.error(t('liveSession:error.cancelFailed'));
    } finally {
      handleCloseWaitingRoom();
    }
  }, [cancelLiveSessionRequest, handleCloseWaitingRoom, t]);

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
          return (
            <ResultItem key={`${type}-${item._id}`} onSelect={() => handleSuggestionSelect(type, item)}>
              {type === 'coach' ? (
                <Avatar className="h-8 w-8"><AvatarImage src={item.profilePicture?.url} alt={displayName} /><AvatarFallback>{getInitials(displayName)}</AvatarFallback></Avatar>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></div>
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  <Highlight text={displayName} match={debouncedSearchValue} />
                </p>
                {type !== 'coach' && <p className="text-xs text-muted-foreground">{t(`coachList:filterByCategory.${type}`)}</p>}
              </div>
            </ResultItem>
          );
        })}
      </CommandGroup>
    );
  };

  const hasSuggestions = suggestions && (suggestions.coaches?.length > 0 || suggestions.specialties?.length > 0 || suggestions.languages?.length > 0);

 return (
    <ErrorBoundary>
     {selectedCoach && (
        <LiveSessionClientRequestModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          coach={selectedCoach}
          onConfirmRequest={handleConfirmRequest}
        />
     )}
     {selectedCoach && user && (
       <LiveSessionWaitingRoom
            isOpen={isWaitingRoomOpen}
            onClose={handleCloseWaitingRoom}
            coach={selectedCoach}
            user={user}
            sessionId={sessionId}
            onCancelRequest={handleCancelLiveRequest}
            status={outgoingRequestStatus}
            declineMessage={sessionInfo?.declineMessage}
            skipDeviceCheck={true}
        />
     )}
     <div className="px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-4 text-foreground">
          {t('coachList:findYourPerfectCoach')}
        </h1>
        <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">{t('coachList:subtitle')}</p>
        
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
                        <h2 className="text-lg font-semibold text-foreground">{t('coachList:filters')}</h2>
                    </div>
                    <div className="p-4">
                         <FilterSidebar filters={filters} onFilterChange={onFilterChange} facetData={facetData} isLoadingFacets={isLoadingFacets} isSwissUser={isSwissUser} />
                    </div>
                </div>
            </motion.aside>
            )}
        </AnimatePresence>
        <main className="flex flex-col gap-6 flex-1 min-w-0">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div ref={searchContainerRef} className="relative w-full">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                          key={currentLanguage}
                          ref={searchInputRef}
                          type="text"
                          variant="compact"
                          placeholder={t('coachList:searchByNameSpecialty')}
                          value={searchInputValue}
                          onChange={(e) => setSearchInputValue(e.target.value)}
                          onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                  handleSearchSubmit(searchInputValue);
                              }
                          }}
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
                                        
                                        {!isLoadingSuggestions && debouncedSearchValue.length > 1 && !hasSuggestions && (
                                            <CommandEmpty>{t('common:noResultsFound')}</CommandEmpty>
                                        )}

                                        {!isLoadingSuggestions && debouncedSearchValue.length < 2 && (
                                          <div className="py-6 text-center text-sm text-muted-foreground">{t('coachList:searchPrompt')}</div>
                                        )}

                                        {hasSuggestions && (
                                          <>
                                            {renderGroup(t('coachList:coaches'), suggestions?.coaches, null, 'coach')}
                                            {renderGroup(t('coachList:specialties'), suggestions?.specialties, GraduationCap, 'specialties')}
                                            {renderGroup(t('coachList:languages'), suggestions?.languages, Languages, 'languages')}
                                          </>
                                        )}
                                    </CommandList>
                                  </Command>
                              </motion.div>
                          )}
                      </AnimatePresence>
                  </div>
                  <div className="flex-shrink-0 self-end sm:self-center flex items-center gap-2">
                    <div className="lg:hidden">
                    <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline">
                            <Filter className="mr-2 h-4 w-4" />
                            <span className="sm:hidden">{t('coachList:filtersShort')}</span>
                            <span className="hidden sm:inline">{t('coachList:filters')}</span>
                            {hasActiveFilters && (
                                <span className="ml-2 h-2 w-2 rounded-full bg-primary" />
                            )}
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-full sm:max-w-sm p-0 flex flex-col">
                        <SheetHeader className="p-4 border-b dark:border-slate-800">
                            <SheetTitle>{t('coachList:filters')}</SheetTitle>
                        </SheetHeader>
                        <div className="p-4 overflow-y-auto flex-grow">
                             <FilterSidebar filters={filters} onFilterChange={onFilterChange} facetData={facetData} isLoadingFacets={isLoadingFacets} isSwissUser={isSwissUser} />
                        </div>
                    </SheetContent>
                    </Sheet>
                </div>
                <Button
                    variant="outline"
                    className="hidden lg:inline-flex"
                    onClick={() => setIsDesktopSidebarVisible(prev => !prev)}
                >
                    <Filter className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">{t('coachList:filters')}</span>
                    {hasActiveFilters && (
                        <span className="ml-2 h-2 w-2 rounded-full bg-primary" />
                    )}
                </Button>
                    <Select onValueChange={(value) => onFilterChange('sortBy', value)} value={filters.sortBy}>
                      <SelectTrigger className="w-[140px] sm:w-[180px]">
                        <SelectValue placeholder={t('coachList:sortBy')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="popularity_desc">{t('coachList:sort_popularity')}</SelectItem>
                        <SelectItem value="rating_desc">{t('coachList:sort_rating')}</SelectItem>
                        <SelectItem value="price_asc">{t('coachList:sort_price_asc')}</SelectItem>
                        <SelectItem value="price_desc">{t('coachList:sort_price_desc')}</SelectItem>
                        <SelectItem value="newest_desc">{t('coachList:sort_newest')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <ToggleGroup type="single" value={view} onValueChange={(val) => val && setView(val)} size="sm" className="hidden sm:flex">
                        <ToggleGroupItem value="grid" aria-label={t('coachList:viewGrid')}><LayoutGrid className="h-4 w-4" /></ToggleGroupItem>
                        <ToggleGroupItem value="compact" aria-label={t('coachList:viewCompact')}><Grid3x3 className="h-4 w-4" /></ToggleGroupItem>
                        <ToggleGroupItem value="list" aria-label={t('coachList:viewList')}><List className="h-4 w-4" /></ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>

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
                        {t('coachList:clearAllFilters')}
                    </Button>
                  </div>
                )}
            </div>

            <div className="flex-grow">
              {isLoading && page === 1 ? (
                <LoadingSpinner />
              ) : error ? (
                <div className="text-destructive text-center py-10">{t('coachList:errorFetchingCoaches')}</div>
              ) : coachesData?.coaches?.length > 0 ? (
                <>
                  <div className={cn({
                    'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6': view === 'grid',
                    'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4': view === 'compact',
                    'space-y-4': view === 'list',
                  })}>
                    {coachesData.coaches.map(coach => (
                      <CoachCard key={coach.userId} coach={coach} isAuthenticated={!!user} onInitiateRequest={handleInitiateRequest} view={view} />
                    ))}
                  </div>
                  {coachesData.hasMore && (
                    <div className="text-center mt-8">
                      <Button onClick={() => setPage(p => p + 1)} disabled={isLoading}>
                        {isLoading ? t('common:loading') : t('coachList:loadMore')}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-10 rounded-lg border-2 border-dashed">
                    <h3 className="text-xl font-semibold tracking-tight">{t('coachList:noResultsTitle')}</h3>
                    <p className="text-muted-foreground mt-2 max-w-md mx-auto">{t('coachList:noResultsSubtitle')}</p>
                    {hasActiveFilters && (
                        <Button variant="default" size="sm" onClick={resetFilters} className="mt-4">
                            {t('coachList:clearAllFilters')}
                        </Button>
                    )}
                </div>
              )}
        </div>
    </main>
  </div>
</div>
</ErrorBoundary>
  );
};

export default CoachList;