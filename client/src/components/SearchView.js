import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSearchAPI } from '../hooks/useSearchAPI';
import { Input } from '../components/ui/input.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Label } from '../components/ui/label.tsx';
import { Skeleton } from '../components/ui/skeleton.jsx';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationLink, PaginationEllipsis, PaginationNext } from '../components/ui/pagination.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar.tsx';
import Highlight from '../components/ui/Highlight.js';

const getInitials = (name) => {
    if (!name) return '';
    const names = name.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
};

const SearchResultCard = ({ item, query }) => {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-start gap-4">
                    {item.avatar && (
                        <Avatar>
                            <AvatarImage src={item.avatar} alt={item.name} />
                            <AvatarFallback>{getInitials(item.name)}</AvatarFallback>
                        </Avatar>
                    )}
                    <div className="flex-1">
                        <CardTitle className="text-lg">
                           <Link to={item.path} className="hover:underline">
                             <Highlight text={item.name} match={query} />
                           </Link>
                        </CardTitle>
                        <CardDescription>
                            <Highlight text={item.detail} match={query} />
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
        </Card>
    );
};


const SearchView = () => {
    const { t } = useTranslation('search');
    const [searchParams, setSearchParams] = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
    const [selectedTypes, setSelectedTypes] = useState(searchParams.get('types')?.split(',') || []);
    
    const { data, isLoading } = useSearchAPI({
        query: searchParams.get('q') || '',
        scope: 'full',
        limit: 10,
        page: page,
        types: selectedTypes.join(','),
    });

    useEffect(() => {
        const newParams = new URLSearchParams();
        if (query) newParams.set('q', query);
        if (page > 1) newParams.set('page', page);
        if (selectedTypes.length > 0) newParams.set('types', selectedTypes.join(','));
        setSearchParams(newParams, { replace: true });
    }, [query, page, selectedTypes, setSearchParams]);

    const handleTypeChange = (type) => {
        setSelectedTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        );
        setPage(1);
    };
    
    const resultTypes = ['coaches', 'programs'];
    const results = data?.results ? [
        ...(data.results.coaches || []),
        ...(data.results.programs || []),
    ] : [];

    return (
        <div className="container mx-auto max-w-6xl p-4 md:p-8">
            <div className="mb-8">
                <Input
                    type="search"
                    placeholder={t('placeholder')}
                    className="w-full text-lg p-6"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                    }}
                />
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                <aside className="w-full md:w-1/4 lg:w-1/5">
                    <h2 className="text-xl font-semibold mb-4">{t('filtersTitle')}</h2>
                    <div className="space-y-4">
                        <h3 className="font-medium">{t('filterBy')}</h3>
                        {resultTypes.map(type => (
                            <div key={type} className="flex items-center space-x-2">
                                <Checkbox
                                    id={type}
                                    checked={selectedTypes.includes(type)}
                                    onCheckedChange={() => handleTypeChange(type)}
                                />
                                <Label htmlFor={type} className="capitalize cursor-pointer">
                                    {t(`groupHeadings.${type}`)}
                                </Label>
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="w-full md:w-3/4 lg:w-4/5">
                    {isLoading && (
                        <div className="space-y-4">
                            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                        </div>
                    )}
                    {!isLoading && results.length === 0 && (
                        <div className="text-center py-16">
                            <p className="text-muted-foreground">{t('noResults', { query })}</p>
                        </div>
                    )}
                    {!isLoading && results.length > 0 && (
                        <div className="space-y-4">
                            {results.map((item) => (
                                <SearchResultCard key={`${item.type}-${item._id}`} item={item} query={query} />
                            ))}
                        </div>
                    )}
                    {data?.pagination && data.pagination.totalPages > 1 && (
                        <div className="mt-8">
                             <Pagination>
                                <PaginationContent>
                                    <PaginationItem>
                                        <PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }} />
                                    </PaginationItem>
                                    {[...Array(data.pagination.totalPages)].map((_, i) => (
                                        <PaginationItem key={i}>
                                            <PaginationLink href="#" isActive={i + 1 === page} onClick={(e) => { e.preventDefault(); setPage(i + 1); }}>
                                                {i + 1}
                                            </PaginationLink>
                                        </PaginationItem>
                                    ))}
                                    <PaginationItem>
                                        <PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage(p => Math.min(data.pagination.totalPages, p + 1)); }} />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default SearchView;