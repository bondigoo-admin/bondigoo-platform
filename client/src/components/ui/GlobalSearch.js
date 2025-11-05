import React, { useState, useEffect } from 'react';
import { useSearchStore } from '../../hooks/useSearchStore';
import { useDebounce } from 'use-debounce';
import { useQuery } from 'react-query';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './command.jsx';
import { Avatar, AvatarFallback, AvatarImage } from './avatar.tsx';
import { User, BookOpen, GraduationCap, Link2, CalendarCheck2 } from 'lucide-react';
import { logger } from '../../utils/logger';

const getInitials = (name) => {
    if (!name) return '';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

const getProfilePath = (item) => {
    if (item.role) {
        return item.role === 'coach' ? `/coach/${item._id}` : `/profile/${item._id}`;
    }
    return item.path;
};

const ResultItem = ({ path, onClick, children }) => {
    const navigate = useNavigate();

    const handleSelect = (e) => {
        e.preventDefault();
        logger.info(`[GlobalSearch] ResultItem selected. Navigating to path: "${path}"`);
        onClick();
        navigate(path);
    };
    
    return (
        <Link to={path} onClick={handleSelect} className="rounded-sm">
            <CommandItem 
              onSelect={handleSelect} 
              className="flex items-center gap-x-4 p-2 cursor-pointer"
            >
                {children}
            </CommandItem>
        </Link>
    );
};

export const GlobalSearch = () => {
    const { isOpen, onClose } = useSearchStore();
    const [value, setValue] = useState('');
    const [debouncedValue] = useDebounce(value, 300);

    useEffect(() => {
        if (!isOpen) {
            setValue('');
        }
    }, [isOpen]);

    const { data, isLoading } = useQuery({
        queryKey: ['globalSearch', debouncedValue],
        queryFn: async () => {
            logger.info(`[GlobalSearch] Executing search query for term: "${debouncedValue}"`);
            const { data } = await axios.get(`/api/search?q=${debouncedValue}`);
            logger.info(`[GlobalSearch] Successfully fetched search data for "${debouncedValue}".`, data);
            return data;
        },
        enabled: debouncedValue.length > 1,
    });

    const handleClose = () => {
        onClose();
    };

    const renderGroup = (title, items, icon) => {
        if (!items || items.length === 0) return null;
        
        const Icon = icon;

        return (
            <CommandGroup heading={title}>
                {items.map(item => (
                    <ResultItem key={`${item.type}-${item._id || item.path}`} path={getProfilePath(item)} onClick={handleClose}>
                        {item.avatar ? (
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={item.avatar} alt={item.name} />
                                <AvatarFallback>{getInitials(item.name)}</AvatarFallback>
                            </Avatar>
                        ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                                <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                            </div>
                        )}
                        <div className="flex flex-col">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                            {item.detail && <p className="text-xs text-slate-600 dark:text-slate-400">{item.detail}</p>}
                        </div>
                    </ResultItem>
                ))}
            </CommandGroup>
        );
    };

    return (
        <CommandDialog open={isOpen} onOpenChange={onClose}> 
            <CommandInput 
                placeholder="Search coaches, programs, or navigate..." 
                className="h-12 text-base border-b border-slate-200 dark:border-slate-800"
                value={value}
                onValueChange={setValue}
            />
            <CommandList className="max-h-[50vh]">
                {isLoading && <div className="py-6 text-center text-sm text-slate-500">Loading...</div>}
                
                {!isLoading && debouncedValue.length > 1 && !data && (
                    <CommandEmpty>No results found.</CommandEmpty>
                )}
                
               {data && (
                    <>
                        {renderGroup('Coaches', data.coaches, User)}
                        {renderGroup('Users', data.users, User)}
                        {renderGroup('Your Connections', data.connections, User)}
                        {renderGroup('Programs', data.programs, GraduationCap)}
                        {renderGroup('Your Bookings', data.bookings, CalendarCheck2)}
                        {renderGroup('Session Types', data.sessionTypes, BookOpen)}
                        {renderGroup('Navigation', data.navigation, Link2)}
                    </>
                )}
            </CommandList>
        </CommandDialog>
    );
};