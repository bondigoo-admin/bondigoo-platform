import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminModerationQueue } from '../../../hooks/useAdmin';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../../ui/table.tsx';
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '../../ui/pagination.jsx';
import { Button } from '../../ui/button.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '../../ui/card.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { MoreHorizontal, MessageSquare, User, ShieldAlert, Clock } from 'lucide-react';
import ManageFlagModal from './ManageFlagModal';
import { formatDistanceToNow } from 'date-fns';
import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs.tsx';

const ModerationQueue = () => {
    const { t } = useTranslation(['admin', 'common']);
    const [filters, setFilters] = useState({ page: 1, limit: 10, status: 'pending' });
    const { data, isLoading } = useAdminModerationQueue(filters);
    const [selectedFlag, setSelectedFlag] = useState(null);

    const handleManageFlag = (item, flag) => {
        setSelectedFlag({ item, flag });
    };

    const handleStatusChange = (status) => {
        setFilters(prev => ({ ...prev, status, page: 1 }));
    };

    const getTrustScoreClasses = (score) => {
        if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 border-green-200/80';
        if (score >= 50) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300 border-yellow-200/80';
        return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border-red-200/80';
    };

    const getStatusBadge = (status) => {
        const statusText = t(`moderation.flagStatuses.${status}`, status);
        if (status === 'pending') {
            return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-700/60">{statusText}</Badge>;
        }
        if (status.startsWith('resolved_dismissed')) {
             return <Badge variant="outline">{statusText}</Badge>;
        }
        if (status.startsWith('resolved')) {
            return <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700/60">{statusText}</Badge>
        }
        return <Badge variant="secondary">{statusText}</Badge>;
    };

const getProfilePictureUrl = (user) => {
        if (!user) return '';
        if (user.role === 'coach' && user.coachProfilePicture?.url) {
            return user.coachProfilePicture.url;
        }
        return user.profilePicture?.url || '';
    };

    const UserInfoCell = ({ user, label }) => (
        <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
                <AvatarImage src={getProfilePictureUrl(user)} />
                <AvatarFallback>{user?.firstName?.[0]}{user?.lastName?.[0]}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
                <span className="font-medium text-sm text-foreground">{user?.firstName} {user?.lastName}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {label}
                    <Badge className={`h-5 px-1.5 text-xs font-normal border ${getTrustScoreClasses(user?.trustScore)}`}>
                        TS: {user?.trustScore ?? 'N/A'}
                    </Badge>
                </span>
            </div>
        </div>
    );
    
    const renderContent = (type, content, author) => {
        const text = type === 'review' ? `"${content.comment}"` : t('moderation.types.userContent', { name: `${author.firstName} ${author.lastName}` });
        const truncatedText = text.length > 60 ? text.slice(0, 57) + '...' : text;

        return (
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger className="text-left">
                       <span className="font-medium text-sm">{truncatedText}</span>
                    </TooltipTrigger>
                    {text.length > 60 && <TooltipContent><p className="max-w-xs">{text}</p></TooltipContent>}
                </Tooltip>
            </TooltipProvider>
        );
    }

    const renderDesktopView = () => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[120px]">{t('moderation.table.type', 'Typ')}</TableHead>
                    <TableHead className="w-[25%]">{t('moderation.table.content', 'Inhalt')}</TableHead>
                    <TableHead>{t('moderation.table.author', 'Autor')}</TableHead>
                    <TableHead>{t('moderation.table.flaggedBy', 'Gemeldet von')}</TableHead>
                    <TableHead>{t('moderation.table.reason', 'Grund')}</TableHead>
                    <TableHead className="hidden md:table-cell">{t('moderation.table.date', 'Datum')}</TableHead>
                    <TableHead>{t('moderation.table.status', 'Status')}</TableHead>
                    <TableHead className="text-right">{t('moderation.table.actions', 'Aktionen')}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                            <TableCell><Skeleton className="h-6 w-20 rounded-md" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-4/5" /></TableCell>
                            <TableCell><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="space-y-1.5"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16" /></div></div></TableCell>
                            <TableCell><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="space-y-1.5"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-16" /></div></div></TableCell>
                            <TableCell><Skeleton className="h-6 w-28 rounded-md" /></TableCell>
                            <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                            <TableCell><Skeleton className="h-6 w-20 rounded-md" /></TableCell>
                            <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-sm" /></TableCell>
                        </TableRow>
                    ))
                ) : data?.items?.length > 0 ? (
                    data.items.map(({ type, content, flag }) => {
                        const author = type === 'review' ? content.raterId : content;
                        return (
                            <TableRow key={flag._id}>
                                <TableCell><Badge variant="outline">{t(`moderation.types.${type}`, type)}</Badge></TableCell>
                                <TableCell>{renderContent(type, content, author)}</TableCell>
                                <TableCell><UserInfoCell user={author} label={t('moderation.author', 'Autor')} /></TableCell>
                                <TableCell><UserInfoCell user={flag.flaggedBy} label={t('moderation.reporter', 'Melder')} /></TableCell>
                                <TableCell><Badge variant="outline">{t(`moderation.flagReasons.${flag.reason}`, flag.reason)}</Badge></TableCell>
                                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}</TableCell>
                                <TableCell>{getStatusBadge(flag.status)}</TableCell>
                                <TableCell className="text-right">
                                    {flag.status === 'pending' && (
                                        <Button variant="ghost" size="icon" onClick={() => handleManageFlag(content, flag)}>
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">Manage Flag</span>
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })
                ) : (
                    <TableRow><TableCell colSpan={8} className="h-48 text-center text-muted-foreground">{t('moderation.noFlags')}</TableCell></TableRow>
                )}
            </TableBody>
        </Table>
    );

    const renderMobileView = () => (
        <div className="space-y-4">
            {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-lg" />)
            ) : data?.items?.length > 0 ? (
                 data.items.map(({ type, content, flag }) => {
                    const author = type === 'review' ? content.raterId : content;
                    return (
                        <Card key={flag._id}>
                             <CardHeader className="pb-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex flex-col">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            {t(`moderation.flagReasons.${flag.reason}`, flag.reason)}
                                        </CardTitle>
                                        <CardDescription className="flex items-center gap-1.5 text-xs pt-1">
                                            <Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}
                                        </CardDescription>
                                    </div>
                                    {getStatusBadge(flag.status)}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <blockquote className="border-l-4 pl-4 italic text-sm">
                                    {type === 'review' ? `"${content.comment}"` : t('moderation.types.userContent', { name: `${author.firstName} ${author.lastName}` })}
                                </blockquote>
                                <div className="space-y-3">
                                    <UserInfoCell user={author} label={t('moderation.author', 'Autor')} />
                                    <UserInfoCell user={flag.flaggedBy} label={t('moderation.reporter', 'Melder')} />
                                </div>
                            </CardContent>
                            {flag.status === 'pending' && (
                               <CardFooter>
                                    <Button className="w-full" onClick={() => handleManageFlag(content, flag)}>
                                        {t('moderation.manageFlagTitle')}
                                    </Button>
                                </CardFooter>
                            )}
                        </Card>
                    );
                })
            ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center h-48">
                    <p className="text-muted-foreground">{t('moderation.noFlags')}</p>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">{t('moderation.pageTitle', 'Moderation & Sicherheit')}</h2>
                <p className="text-muted-foreground">
                    {t('moderation.pageSubtitle', 'Überprüfen und verwalten Sie von Benutzern gemeldete Inhalte.')}
                </p>
            </div>

            <Card>
                <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <CardTitle>{t('moderation.queueTitle', 'Moderations-Warteschlange')}</CardTitle>
                     <Tabs defaultValue="pending" onValueChange={handleStatusChange}>
                        <TabsList>
                            <TabsTrigger value="pending">{t('moderation.status.pending', 'Ausstehend')}</TabsTrigger>
                            <TabsTrigger value="resolved">{t('moderation.status.resolved', 'Gelöst')}</TabsTrigger>
                            <TabsTrigger value="all">{t('moderation.status.all', 'Alle Status')}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="hidden md:block overflow-x-auto">
                        {renderDesktopView()}
                    </div>
                    <div className="md:hidden p-4 sm:p-6">
                        {renderMobileView()}
                    </div>
                </CardContent>
                {data?.totalPages > 1 && (
                     <CardFooter className="flex items-center justify-between border-t py-4">
                        <div className="text-sm text-muted-foreground">
                             {t('common:pageNumber', { current: data.currentPage, total: data.totalPages })}
                        </div>
                        <Pagination className="m-0">
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))} disabled={filters.page === 1 || isLoading} />
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationNext onClick={() => setFilters(prev => ({ ...prev, page: Math.min(data.totalPages, prev.page + 1) }))} disabled={filters.page === data.totalPages || isLoading} />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </CardFooter>
                )}
            </Card>

           {selectedFlag && (
                <ManageFlagModal
                    item={selectedFlag.item}
                    flag={selectedFlag.flag}
                    isOpen={!!selectedFlag}
                    onClose={() => setSelectedFlag(null)}
                />
            )}
        </div>
    );
};

export default ModerationQueue;