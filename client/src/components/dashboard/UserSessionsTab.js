// src/components/dashboard/UserSessionsTab.js

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useUserDashboard } from '../../hooks/useUserDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.tsx';
import BookingCalendar from '../BookingCalendar';
import SessionJourneyItem from '../SessionJourneyItem';
import BookingDetailsModal from '../BookingDetailsModal';
import { Skeleton } from '../ui/skeleton.jsx';
import { Button } from '../ui/button.tsx';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx';
import { Calendar, Route, ChevronsDown, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import RefundRequestModal from '../refunds/RefundRequestModal';
import { useQueryClient } from 'react-query';
import { getBookingDetails } from '../../services/bookingAPI';
import { toast } from 'react-hot-toast';

const PAST_SESSIONS_PAGE_SIZE = 20;

const UserSessionsTab = () => {
    const { t } = useTranslation(['userdashboard', 'bookings']);
    const { user } = useAuth();
    const { sessionsData, overviewData, isLoading: isLoadingSessions, isError: isErrorSessions } = useUserDashboard();
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [showRefundModalForBooking, setShowRefundModalForBooking] = useState(null);
    const [isFetchingForModal, setIsFetchingForModal] = useState(false);
    const queryClient = useQueryClient();
    
    const [visiblePastSessionsCount, setVisiblePastSessionsCount] = useState(PAST_SESSIONS_PAGE_SIZE);

    const { upcomingSessions, allPastSessions } = useMemo(() => {
        const allSessions = sessionsData?.sessions || [];
        if (!allSessions.length) {
            return { upcomingSessions: [], allPastSessions: [] };
        }

        const now = new Date();
        const upcoming = [];
        const past = [];

        for (const session of allSessions) {
            if (new Date(session.start) >= now) {
                upcoming.push(session);
            } else {
                past.push(session);
            }
        }

        upcoming.sort((a, b) => new Date(a.start) - new Date(b.start));
        past.sort((a, b) => new Date(b.start) - new Date(a.start));

        return { upcomingSessions: upcoming, allPastSessions: past };
    }, [sessionsData]);

    const visiblePastSessions = useMemo(() => 
        allPastSessions.slice(0, visiblePastSessionsCount),
        [allPastSessions, visiblePastSessionsCount]
    );

    const handleLoadMore = () => {
        setVisiblePastSessionsCount(prevCount => prevCount + PAST_SESSIONS_PAGE_SIZE);
    };
    
    const handleSelectBooking = (booking) => {
        setSelectedBooking({
            bookingId: booking._id,
            existingBooking: booking,
            isInitialData: false
        });
    };

    const handleRequestRefund = async (booking) => {
        setIsFetchingForModal(true);
        try {
            const freshBookingData = await queryClient.fetchQuery(
                ['booking', booking._id],
                () => getBookingDetails(booking._id),
                { staleTime: 0 } // Force immediate refetch
            );
            setShowRefundModalForBooking(freshBookingData);
        } catch (error) {
            toast.error(t('common:errors.fetchBooking', 'Could not load the latest booking details. Please try again.'));
        } finally {
            setIsFetchingForModal(false);
        }
    };

    const renderJourney = () => {
        if (isLoadingSessions) {
            return (
                <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </div>
            );
        }

        if (upcomingSessions.length === 0 && allPastSessions.length === 0) {
            return <div className="text-center py-12 text-muted-foreground">{t('sessions.empty', 'You have no scheduled sessions.')}</div>;
        }

        return (
            <div className="space-y-8">
                <div>
                    <h3 className="text-lg font-semibold mb-3">{t('sessions.upcoming', 'Upcoming Sessions')}</h3>
                    {upcomingSessions.length > 0 ? (
                        <div>
                            {upcomingSessions.map(booking => (
                                <SessionJourneyItem
                                    key={booking._id}
                                    booking={booking}
                                    onSelect={() => handleSelectBooking(booking)}
                                    isSelected={selectedBooking?.bookingId === booking._id}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground pl-4">{t('sessions.noUpcoming', 'No upcoming sessions.')}</p>
                    )}
                </div>

                <div>
                    <h3 className="text-lg font-semibold mb-3">{t('sessions.past', 'Past Sessions')}</h3>
                    {visiblePastSessions.length > 0 ? (
                         <div>
                            {visiblePastSessions.map(booking => (
                                <SessionJourneyItem
                                    key={booking._id}
                                    booking={booking}
                                    onSelect={() => handleSelectBooking(booking)}
                                    isSelected={selectedBooking?.bookingId === booking._id}
                                    onRefundRequest={handleRequestRefund}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground pl-4">{t('sessions.noPast', 'No past sessions.')}</p>
                    )}
                    {visiblePastSessions.length < allPastSessions.length && (
                        <div className="text-center mt-6">
                            <Button variant="outline" onClick={handleLoadMore}>
                                <ChevronsDown className="mr-2 h-4 w-4" />
                                {t('sessions.loadMore', 'Load More Past Sessions')}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (isErrorSessions) {
        return (
            <Alert variant="destructive">
                <AlertTitle>{t('sessions.errorTitle', 'Error Loading Sessions')}</AlertTitle>
                <AlertDescription>{t('sessions.errorDescription', 'We could not load your sessions. Please try again later.')}</AlertDescription>
            </Alert>
        );
    }
    
    const primaryCoach = overviewData?.primaryCoach;
    const coachNameForCalendar = primaryCoach ? `${primaryCoach.firstName} ${primaryCoach.lastName}` : '';
    const coachSettingsForCalendar = primaryCoach?.settings || {};

    return (
        <div>
            {isFetchingForModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}
            <Tabs defaultValue="journey" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="journey"><Route className="mr-2 h-4 w-4" />{t('sessions.journey', 'Journey')}</TabsTrigger>
                    <TabsTrigger value="calendar"><Calendar className="mr-2 h-4 w-4" />{t('sessions.calendar', 'Calendar')}</TabsTrigger>
                </TabsList>
                <TabsContent value="journey" className="mt-6">
                    {renderJourney()}
                </TabsContent>
                <TabsContent value="calendar" className="mt-6">
                    <BookingCalendar 
                        viewMode="user"
                        userId={user._id}
                        isUserCalendar={true}
                        onBookingConfirmed={() => {/*empty*/}}
                        coachName={coachNameForCalendar}
                        coachSettings={coachSettingsForCalendar}
                    />
                </TabsContent>
            </Tabs>
            
           {selectedBooking && (
                <BookingDetailsModal
                    bookingId={selectedBooking.bookingId}
                    existingBooking={selectedBooking.existingBooking}
                    isInitialData={selectedBooking.isInitialData}
                    onClose={() => setSelectedBooking(null)}
                    onSuggest={() => {/*empty*/}}
                />
            )}

           {showRefundModalForBooking && (
                <RefundRequestModal
                    booking={showRefundModalForBooking}
                    isOpen={!!showRefundModalForBooking}
                    onClose={() => setShowRefundModalForBooking(null)}
                />
            )}
        </div>
    );
};

export default UserSessionsTab;