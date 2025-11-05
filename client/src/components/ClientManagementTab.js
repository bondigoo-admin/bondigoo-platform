
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useCoachOverview } from '../hooks/useCoachDashboard';
import { useQuery } from 'react-query';
import coachAPI from '../services/coachAPI';
import { Input } from './ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx';
import { Skeleton } from './ui/skeleton.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';
import { Progress } from './ui/progress.jsx';
import { format, isFuture, isPast, isToday } from 'date-fns';
import { de, enUS, fr } from 'date-fns/locale';
import SessionJourneyItem from './SessionJourneyItem';
import BookingDetailsModal from './BookingDetailsModal';
import { CalendarCheck2 } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { logger } from '../utils/logger';

const localeMap = {
  en: enUS,
  de: de,
  fr: fr,
};

const ClientListItem = ({ client, onSelect, isSelected, sortKey }) => {
    const { t, i18n } = useTranslation(['coach_dashboard', 'common']);
    const { user } = useAuth();
    const locale = localeMap[i18n.language] || enUS;

     logger.info('[ClientListItem] Data for left list:', { name: client.name, profilePicture: client.profilePicture });

    const getSortValue = () => {
        switch (sortKey) {
            case 'totalSpend':
                return `${t('analytics.clients.kpis.ltv', 'LTV')}: ${new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(client.totalSpend || 0)}`;
            case 'totalSessions':
                 return `${client.totalSessions || 0} ${t('common:sessions', 'Sessions')}`;
            case 'lastSessionDate':
            default:
                return client.lastSessionDate
                    ? `${t('analytics.clients.table.lastSession')}: ${format(new Date(client.lastSessionDate), 'P', { locale })}`
                    : t('analytics.clients.noSessions', 'No sessions yet');
        }
    };

    return (
        <div
            className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
            onClick={() => onSelect(client._id)}
        >
            <Avatar className="h-10 w-10 mr-4">
                <AvatarImage src={client.profilePicture} />
                <AvatarFallback>{client.name?.split(' ').map(n => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
                <p className="font-semibold truncate">{client.name}</p>
                <p className="text-sm text-muted-foreground truncate">{getSortValue()}</p>
            </div>
        </div>
    );
};

const EmptyState = ({ message }) => (
    <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
        <CalendarCheck2 className="h-12 w-12 mb-4" />
        <p>{message}</p>
    </div>
);

const SessionTimeline = ({ client, coach, bookings, onSelect, modalBooking, locale, clientId, onCancelRequest, onRescheduleRequest }) => {
    const { t } = useTranslation('coach_dashboard');
    const todayRef = useRef(null);
    const PAGE_SIZE = 20;
    const [visiblePastCount, setVisiblePastCount] = useState(PAGE_SIZE);

    useEffect(() => {
        if (todayRef.current) {
            todayRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, [clientId]);

    const timelineItems = useMemo(() => {
        if (!bookings || bookings.length === 0) return [];

        const upcoming = bookings.filter(b => isFuture(new Date(b.start)) || isToday(new Date(b.start))).sort((a, b) => new Date(a.start) - new Date(b.start));
        const past = bookings.filter(b => isPast(new Date(b.start)) && !isToday(new Date(b.start))).sort((a, b) => new Date(b.start) - new Date(a.start));

        const paginatedPast = past.slice(0, visiblePastCount);
        const hasMorePast = past.length > visiblePastCount;
        
        const groupBookingsByMonth = (bookingList) => {
            const grouped = bookingList.reduce((acc, booking) => {
                const date = new Date(booking.start);
                const key = format(date, 'MMMM yyyy', { locale });
                if (!acc[key]) {
                    acc[key] = [];
                }
                acc[key].push(booking);
                return acc;
            }, {});
            
            return Object.entries(grouped).map(([header, items]) => ({
                type: 'group',
                header,
                items,
            }));
        };
        
        const upcomingGrouped = groupBookingsByMonth(upcoming);
        const pastGrouped = groupBookingsByMonth(paginatedPast);

        const items = [];
        if (upcomingGrouped.length > 0) items.push(...upcomingGrouped.reverse());
        items.push({ type: 'today_marker' });
        if (pastGrouped.length > 0) items.push(...pastGrouped);
        if (hasMorePast) items.push({ type: 'load_more' });
        
        return items;

    }, [bookings, visiblePastCount, locale]);

    if (bookings && bookings.length === 0) {
        return <EmptyState message={t('clients.journey.noSessions', 'No sessions found for this client.')} />;
    }

    return (
        <div className="relative mt-4">
            {timelineItems.map((group) => {
                if (group.type === 'group') {
                    return (
                       <div key={`${group.header}-${group.items[0]._id}`} className="relative">
                            <div className="sticky top-0 z-10 bg-background/90 py-2 backdrop-blur-sm">
                                <h3 className="font-semibold text-sm text-foreground">{group.header}</h3>
                            </div>
                            <div className="space-y-2">
                                {group.items.map(b => (
                                    <SessionJourneyItem 
                                        key={b._id} 
                                        booking={b} 
                                        coach={coach}
                                        onSelect={onSelect} 
                                        isSelected={modalBooking?._id === b._id} 
                                        onCancelRequest={onCancelRequest}
                                        onRescheduleRequest={onRescheduleRequest}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                }
                if (group.type === 'today_marker') {
                    return (
                        <div key="today-marker" ref={todayRef} className="relative flex items-center py-4 my-2" aria-hidden="true">
                            <div className="flex-grow border-t border-primary/50"></div>
                           <span className="flex-shrink mx-4 text-xs font-semibold uppercase text-primary">{t('common:today', 'Today')}</span>
                            <div className="flex-grow border-t border-primary/50"></div>
                        </div>
                    );
                }
                 if (group.type === 'load_more') {
                    return (
                        <div key="load-more" className="flex justify-center py-4">
                            <Button variant="outline" onClick={() => setVisiblePastCount(c => c + PAGE_SIZE)}>
                                {t('clients.journey.loadMorePast', 'Load More Past Sessions')}
                            </Button>
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );
};


const ClientDetailPane = ({ clientId, coach }) => {
    const { t, i18n } = useTranslation(['coach_dashboard', 'common']);
    const [modalBooking, setModalBooking] = useState(null);
    const [actionBooking, setActionBooking] = useState(null);
    const [initialModalAction, setInitialModalAction] = useState(null);

    const { data, isLoading, isError, isFetching } = useQuery(
        ['clientDetails', clientId],
        () => coachAPI.getCoachClientDetails(clientId),
        { 
            enabled: !!clientId,
            keepPreviousData: true,
        }
    );
    
    const locale = localeMap[i18n.language] || enUS;

    const handleCancelRequest = (booking) => {
        setActionBooking(booking);
        setInitialModalAction('cancel');
    };

    const handleRescheduleRequest = (booking) => {
        setActionBooking(booking);
        setInitialModalAction('reschedule');
    };

    const closeModal = () => {
        setModalBooking(null);
        setActionBooking(null);
        setInitialModalAction(null);
    };

    const bookingInModal = actionBooking || modalBooking;

    const formatCurrency = (amount) => new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(amount || 0);

    if (!clientId) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground p-6 text-center">
                {t('clients.selectClientPrompt', 'Select a client from the list to see their details')}
            </div>
        );
    }

    if (isLoading && !data) {
        return (
            <div className="p-6 space-y-6">
                <div className="flex items-center space-x-4">
                    <Skeleton className="h-24 w-24 rounded-full" />
                    <div className="space-y-2 flex-1">
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
                </div>
                 <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="flex items-center space-x-4 p-2">
                                <Skeleton className="h-12 w-full" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (isError) return <div className="p-6 text-destructive">{t('common:error_generic')}</div>;

    const { client, kpis, programEnrollments, bookingHistory } = data;

    return (
        <>
            <div className={`p-4 md:p-6 space-y-6 transition-opacity ${isFetching ? 'opacity-50' : 'opacity-100'}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
                    <Avatar className="h-20 w-20 md:h-24 md:w-24">
                        <AvatarImage src={client?.profilePicture?.url} />
                        <AvatarFallback>{client?.firstName?.[0]}{client?.lastName?.[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h2 className="text-2xl font-bold">{client?.firstName} {client?.lastName}</h2>
                        <p className="text-muted-foreground">{client?.email}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('analytics.clients.kpis.ltv')}</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.totalSpend)}</div></CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('analytics.clients.table.totalSessions')}</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold">{kpis.totalSessions}</div></CardContent>
                    </Card>
                     <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{t('clients.activeSince', 'Active Since')}</CardTitle></CardHeader>
                        <CardContent><div className="text-lg font-bold">{format(new Date(kpis.activeSince), 'P', { locale })}</div></CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="journey">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="journey">{t('clients.journey.sessionJourney', 'Session Journey')}</TabsTrigger>
                        <TabsTrigger value="programs">{t('clients.programEnrollments', 'Program Enrollments')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="journey" className="mt-4">
                        <SessionTimeline 
                           bookings={bookingHistory}
                           client={client}
                           coach={coach}
                           onSelect={setModalBooking}
                           modalBooking={modalBooking}
                           locale={locale}
                           clientId={clientId}
                           onCancelRequest={handleCancelRequest}
                           onRescheduleRequest={handleRescheduleRequest}
                       />
                    </TabsContent>
                    <TabsContent value="programs" className="mt-4">
                       <div className="space-y-4">
                            {programEnrollments.length > 0 ? programEnrollments.map(e => (
                                 <Card key={e._id}>
                                     <CardContent className="p-4">
                                         <p className="font-semibold">{e.program.title}</p>
                                         <div className="flex items-center gap-4 mt-2">
                                             <Progress value={e.progress?.completionPercentage || 0} className="w-full sm:w-[80%]" />
                                             <span className="text-sm text-muted-foreground hidden sm:inline">{(e.progress?.completionPercentage || 0).toFixed(0)}%</span>
                                         </div>
                                     </CardContent>
                                 </Card>
                            )) : <div className="text-center text-muted-foreground p-10">{t('clients.noEnrollments', 'This client is not enrolled in any of your programs.')}</div>}
                       </div>
                    </TabsContent>
                </Tabs>
            </div>
            {bookingInModal && (
                <BookingDetailsModal
                    bookingId={bookingInModal._id}
                    existingBooking={bookingInModal}
                    isInitialData={true}
                    onClose={closeModal}
                    initialAction={actionBooking ? initialModalAction : null}
                    onSuggest={() => {/*empty*/}}
                />
            )}
        </>
    );
};

const ClientManagementTab = () => {
    const { t } = useTranslation('coach_dashboard');
    const { user } = useAuth();
    const { data: overviewData, isLoading } = useCoachOverview(user?._id, { period: 'allTime' });

    const [selectedClientId, setSelectedClientId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortKey, setSortKey] = useState('lastSessionDate');

    const clientList = useMemo(() => {
        let clients = overviewData?.analytics?.clients?.clientListTable || [];
        if (searchTerm) {
            clients = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        clients.sort((a, b) => {
            if (sortKey === 'totalSpend' || sortKey === 'totalSessions') {
                return (b[sortKey] || 0) - (a[sortKey] || 0);
            }
            if (sortKey === 'name') {
                return a.name.localeCompare(b.name);
            }
            const dateA = a.lastSessionDate ? new Date(a.lastSessionDate).getTime() : 0;
            const dateB = b.lastSessionDate ? new Date(b.lastSessionDate).getTime() : 0;
            return dateB - dateA;
        });
        return clients;
    }, [overviewData, searchTerm, sortKey]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
            <Card className="lg:col-span-1 xl:col-span-1 flex flex-col">
                <CardHeader>
                    <CardTitle>{t('clients.clientRoster', 'Client Roster')}</CardTitle>
                </CardHeader>
                <div className="px-6 pb-4 space-y-4">
                    <Input placeholder={t('common:searchByName')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    <Select value={sortKey} onValueChange={setSortKey}>
                        <SelectTrigger><SelectValue placeholder={t('common:sortBy')} /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="lastSessionDate">{t('clients.sort.lastActivity', 'Last Activity')}</SelectItem>
                            <SelectItem value="totalSpend">{t('clients.sort.totalSpend', 'Total Spend')}</SelectItem>
                            <SelectItem value="totalSessions">{t('clients.sort.totalSessions', 'Total Sessions')}</SelectItem>
                            <SelectItem value="name">{t('clients.sort.name', 'Name (A-Z)')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <CardContent className="flex-1 overflow-y-auto space-y-2 p-2 sm:p-6">
                    {isLoading && [...Array(10)].map((_, i) => (
                        <div key={i} className="flex items-center space-x-4 p-2">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="space-y-2 flex-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
                        </div>
                    ))}
                    {!isLoading && clientList.map(client => (
                        <ClientListItem
                            key={client._id}
                            client={client}
                            onSelect={setSelectedClientId}
                            isSelected={selectedClientId === client._id}
                            sortKey={sortKey}
                        />
                    ))}
                </CardContent>
            </Card>

            <div className="lg:col-span-2 xl:col-span-3 overflow-y-auto rounded-lg border">
                <ClientDetailPane clientId={selectedClientId} coach={user} />
            </div>
        </div>
    );
};

export default ClientManagementTab;