import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from 'react-query';
import { useDebounce } from 'use-debounce';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Search, GraduationCap, Languages } from 'lucide-react';

import { Input } from './ui/input.tsx';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './ui/command.jsx';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx';
import Highlight from './ui/Highlight';
import { Button } from './ui/button.tsx';

const getInitials = (name) => {
    if (!name) return '';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

const CoachSearchInput = ({ 
    onSearchSubmit, 
    onSuggestionSelect, 
    initialValue = '', 
    showButton = false,
    inputClassName = '',
    placeholderKey = 'coachList:searchByNameSpecialty'
}) => {
    const { t } = useTranslation(['common', 'coachList', 'home']);
    const [searchInputValue, setSearchInputValue] = useState(initialValue);
    const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState(false);
    const [debouncedSearchValue] = useDebounce(searchInputValue, 300);
    const searchContainerRef = useRef(null);

    useEffect(() => {
        setSearchInputValue(initialValue);
    }, [initialValue]);

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
        ['searchSuggestions', debouncedSearchValue],
        async () => {
            const { data } = await axios.get(`/api/search/suggest?q=${debouncedSearchValue}`);
            return data;
        },
        { enabled: debouncedSearchValue.length > 1 && isSearchPopoverOpen }
    );

    const handleInternalSuggestionSelect = (type, item) => {
        setIsSearchPopoverOpen(false);
        onSuggestionSelect(type, item);
    };

    const handleInternalSearchSubmit = () => {
        setIsSearchPopoverOpen(false);
        onSearchSubmit(searchInputValue);
    };

    const ResultItem = ({ onSelect, children }) => (
        <CommandItem onSelect={onSelect} className="flex items-center gap-x-4 p-2 cursor-pointer">{children}</CommandItem>
    );

    const renderGroup = (title, items, icon, type) => {
        if (!items || items.length === 0) return null;
        const Icon = icon;
        return (
            <CommandGroup heading={title}>
                {items.map(item => {
                    const displayName = item.translation || item.name || `${item.firstName} ${item.lastName}`;
                    return (
                        <ResultItem key={`${type}-${item._id}`} onSelect={() => handleInternalSuggestionSelect(type, item)}>
                            {type === 'coach' ? (
                                <Avatar className="h-8 w-8"><AvatarImage src={item.profilePicture?.url} alt={displayName} /><AvatarFallback>{getInitials(displayName)}</AvatarFallback></Avatar>
                            ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                            )}
                            <div>
                                <p className="text-sm font-medium text-foreground"><Highlight text={displayName} match={debouncedSearchValue} /></p>
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
        <div ref={searchContainerRef} className="relative w-full">
            <div className={`flex flex-col sm:flex-row gap-2 ${!showButton && 'w-full'}`}>
                <div className="relative flex-grow">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder={t(placeholderKey)}
                        value={searchInputValue}
                        onChange={(e) => setSearchInputValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleInternalSearchSubmit(); }}
                        onFocus={() => setIsSearchPopoverOpen(true)}
                        className={`pl-10 w-full ${inputClassName}`}
                    />
                </div>
                {showButton && (
                    <Button size="lg" className="h-14 text-lg" onClick={handleInternalSearchSubmit}>
                        {t('coachList:searchCoachesButton', 'Search Coaches')}
                    </Button>
                )}
            </div>
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
                                {!isLoadingSuggestions && debouncedSearchValue.length > 1 && !hasSuggestions && <CommandEmpty>{t('common:noResultsFound')}</CommandEmpty>}
                                {!isLoadingSuggestions && debouncedSearchValue.length < 2 && <div className="py-6 text-center text-sm text-muted-foreground">{t('coachList:searchPrompt')}</div>}
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
    );
};

export default CoachSearchInput;