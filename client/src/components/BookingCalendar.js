import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import PropTypes from 'prop-types';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../contexts/AuthContext';
import { Clock, Users, BookOpen, Video, ChevronLeft, ChevronRight, Loader2, Plus, Minus, Calendar as CalendarIcon, List } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import ErrorBoundary from './ErrorBoundary';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { toast } from 'react-hot-toast';
import { createBooking, getCoachSessions, getUserSessions, updateSession, deleteSession } from '../services/bookingAPI';
import { checkAvailability } from '../utils/clientBookingHelpers';
import { getSessionTypes, getTranslations } from '../services/adminAPI';
import { filterVisibleEvents, getBookingTypeForSlot } from '../utils/calendarHelpers';
import { 
  CALENDAR_VISIBILITY_DESCRIPTIONS,
} from '../utils/calendarConstants';
import { useConnectionManagement } from '../hooks/useConnectionManagement';
import UserBookingModal from './UserBookingModal';
import BookingDetailsModal from './BookingDetailsModal';
import { useBookingActions } from '../hooks/useBookingActions';
import { useNotificationSocket } from '../contexts/SocketContext';
import { logger } from '../utils/logger';
import ViewEditAvailabilityModal from './ViewEditAvailabilityModal';
import { getCalendarFormats, initializeMomentLocale } from '../utils/dateUtils';
import 'moment/locale/de';
import { Button } from './ui/button.tsx';
import CalendarToolbar from './CalendarToolbar';
import ListView from './ListView';
import EventComponent, { SESSION_TYPE_IDS } from './EventComponent';

const localizer = momentLocalizer(moment);

const WEBINAR_TYPE_ID_STRING = '66ec54f94a8965b22af33fd9';
const GROUP_TYPE_ID_STRING = '66ec54f44a8965b22af33fd5';
const WORKSHOP_TYPE_ID_STRING = '66ec54fe4a8965b22af33fdd';

const BookingCalendar = ({ 
  userId, 
  coachName = 'Unknown Coach',  
  onBookingConfirmed, 
  coachSettings,
  viewMode = 'coach',
  isUserCalendar = false,
  isConnected: propIsConnected,
  isLoadingConnection: propIsLoadingConnection,
  isOwnProfile: propIsOwnProfile,
  ...props
}) => {

  const { t, i18n } = useTranslation(['bookingcalendar', 'managesessions', 'common']);
  useEffect(() => {
    initializeMomentLocale(i18n.language);
  }, [i18n.language]);
 
  const { user, userRole } = useContext(AuthContext);
  const [sessions, setSessions] = useState({ availability: [], regularBookings: [] });
  const [selectedSessionTypes, setSelectedSessionTypes] = useState([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookingToConfirm, setBookingToConfirm] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewType, setViewType] = useState('week');
  const [showList, setShowList] = useState(false);
  const queryClient = useQueryClient();
  const isConnected = propIsConnected;
  const isLoadingConnection = propIsLoadingConnection;
  useEffect(() => {
    logger.info('[BookingCalendar] Connection status from props:', {
      isConnected,
      isLoadingConnection,
    });
  }, [isConnected, isLoadingConnection]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [viewEditAvailabilityState, setViewEditAvailabilityState] = useState({ isOpen: false, slotData: null });
  const [calendarHeight, setCalendarHeight] = useState(70);
  const { suggestAlternativeTime } = useBookingActions();
  const { socket } = useNotificationSocket();
  
  const modalBookingData = useMemo(() => {
    if (!bookingToConfirm) return null;
    return {
      ...bookingToConfirm,
      sessionType: typeof bookingToConfirm.sessionType === 'string' ? {
        _id: bookingToConfirm.sessionType,
        name: t('common:oneOnOneSession', '1-on-1 Session'),
        price: 0
      } : bookingToConfirm.sessionType || {
        _id: '66ec4ea477bec414bf2b8859', 
        name: t('common:oneOnOneSession', '1-on-1 Session'),
        price: 0
      }
    };
  }, [bookingToConfirm, t]);

  const eventPropGetter = useCallback(
    () => ({
      className: '!m-0 !p-0 !border-0 !rounded-none',
    }),
    []
  );

  const isOwnProfile = propIsOwnProfile || user?.id === userId;

const handleNavigation = useCallback((action) => {
    if (action instanceof Date) {
      setCurrentDate(action);
      return;
    }

    const mDate = moment(currentDate);
    let newDate;

    switch (action) {
      case 'TODAY':
        newDate = new Date();
        break;
      case 'PREV':
        newDate = mDate.subtract(1, viewType).toDate();
        break;
      case 'NEXT':
        newDate = mDate.add(1, viewType).toDate();
        break;
      default:
        return;
    }
    setCurrentDate(newDate);
  }, [currentDate, viewType]);

const handleZoom = (direction) => {
    const step = 35; // How much to zoom in/out in vh units
    const max = 210; // Max height (e.g., 3x zoom)
    const min = 70;  // Min height (default)
    if (direction === 'in') {
      setCalendarHeight(prev => Math.min(max, prev + step));
    } else {
      setCalendarHeight(prev => Math.max(min, prev - step));
    }
  };
  
  const processedAvailability = useMemo(() => {
    if (!bookingToConfirm || !sessions.availability) {
      return { dateAvailability: new Map(), availableDates: [] };
    }
    logger.info('[BookingCalendar] Processing availability for modal (memoized).');
    const availabilityMap = new Map();
    const dates = [];
    const today = moment().startOf('day');
    const futureEnd = moment().add(3, 'months');

    for (let m = moment(today); m.isBefore(futureEnd); m.add(1, 'day')) {
      const dateStr = m.format('YYYY-MM-DD');
      dates.push(m.toDate());
      availabilityMap.set(dateStr, []);
    }

    sessions.availability
      .filter(session => moment(session.start).isSameOrAfter(today))
      .forEach(session => {
        const dateStr = moment(session.start).format('YYYY-MM-DD');
        if (availabilityMap.has(dateStr)) {
          availabilityMap.get(dateStr).push({ start: session.start, end: session.end, ...session });
        }
      });
    
    return { dateAvailability: availabilityMap, availableDates: dates };
  }, [sessions.availability, bookingToConfirm]);

    const visibleDateRange = useMemo(() => {
    const mDate = moment(currentDate);
    let start, end;

    switch (viewType) {
      case 'month':
        start = mDate.clone().startOf('month').startOf('week');
        end = mDate.clone().endOf('month').endOf('week');
        break;
      case 'week':
        start = mDate.clone().startOf('week');
        end = mDate.clone().endOf('week');
        break;
      case 'day':
        start = mDate.clone().startOf('day');
        end = mDate.clone().endOf('day');
        break;
      default:
        start = mDate.clone().startOf('week');
        end = mDate.clone().endOf('week');
        break;
    }
    return { start: start.toDate(), end: end.toDate() };
  }, [currentDate, viewType]);

const inViewRegularBookings = useMemo(() => {
    if (!sessions.regularBookings) return [];
    const { start: viewStart, end: viewEnd } = visibleDateRange;
    const cancelledStatuses = [
      'cancelled_by_coach',
      'cancelled_by_client',
      'cancelled_by_admin',
      'cancelled_due_to_reschedule',
      'declined',
    ];
    return sessions.regularBookings.filter(booking => {
      if (!booking) {
        return false;
      }
      if (cancelledStatuses.includes(booking.status)) {
        return false;
      }
      const bookingStart = new Date(booking.start);
      const bookingEnd = new Date(booking.end);
      return bookingStart < viewEnd && bookingEnd > viewStart;
    });
  }, [sessions.regularBookings, visibleDateRange]);

  const {
    data: sessionTypesData,
    isLoading: isLoadingTypes,
  } = useQuery('sessionTypes', getSessionTypes, {
    staleTime: 5 * 60 * 1000,
    onError: (error) => {
      logger.error('[BookingCalendar] Error fetching session types:', error);
      toast.error(t('managesessions:errorFetchingSessionTypes'));
    }
  });

  const sessionTypes = useMemo(() => {
    if (!sessionTypesData) {
      return [];
    }
    return sessionTypesData.map(type => ({
      ...type,
      id: type._id || type.id
    }));
  }, [sessionTypesData]);

const inViewAvailability = useMemo(() => {
    if (!sessions.availability) return [];
    const { start: viewStart, end: viewEnd } = visibleDateRange;
    return sessions.availability.filter(event => {
        if (!event || !event.start || !event.end) return false;
        const eventStart = new Date(event.start);
        const eventEnd = new Date(event.end);
        if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) return false;
        return eventStart < viewEnd && eventEnd > viewStart;
    });
  }, [sessions.availability, visibleDateRange]);

const visibleEvents = useMemo(() => {
  if (!sessions.availability || !sessions.regularBookings || (!coachSettings && viewMode !== 'user')) {
    logger.warn('[BookingCalendar] visibleEvents: sessions or coachSettings not ready.', { hasSessions: !!sessions, hasCoachSettings: !!coachSettings, viewMode });
    return [];
  }

  const { start: viewStart, end: viewEnd } = visibleDateRange;
  
  logger.info(`[BookingCalendar] Filtering events for view. Total availability: ${sessions.availability.length}, in view: ${inViewAvailability.length}. Total bookings: ${sessions.regularBookings.length}, in view: ${inViewRegularBookings.length}`);
  
  const isCoachViewingOwnCalendar = isUserCalendar && userRole === 'coach' && userId === user?.id;
  let allPotentialEvents = [];

  allPotentialEvents.push(...inViewAvailability.map(slot => ({
    ...slot,
    start: new Date(slot.start),
    end: new Date(slot.end),
    isAvailability: true,
    title: slot.title || t('bookingcalendar:availabilitySlot'),
    sessionType: slot.sessionType || { _id: '66ec551a4a8965b22af33fe3', name: 'Availability' }
  })));

  const regularBookingEvents = inViewRegularBookings.flatMap(booking => {
    const baseBookingEvent = {
      ...booking,
      isAvailability: false,
      title: booking.title || t('bookingcalendar:session'),
      sessionType: booking.sessionType || {
        _id: typeof booking.sessionType === 'string' ? booking.sessionType : (booking.sessionType?._id || booking.type),
        name: booking.sessionTypeName || (typeof booking.sessionType === 'object' ? booking.sessionType.name : 'Session'),
      },
    };

    let sessionTypeIdString;
    if (typeof baseBookingEvent.sessionType === 'string') {
      sessionTypeIdString = baseBookingEvent.sessionType;
    } else if (baseBookingEvent.sessionType && typeof baseBookingEvent.sessionType === 'object') {
      sessionTypeIdString = baseBookingEvent.sessionType._id?.toString() || baseBookingEvent.sessionType.id?.toString();
    }

    if (
      sessionTypeIdString === WEBINAR_TYPE_ID_STRING &&
      Array.isArray(booking.webinarSlots) &&
      booking.webinarSlots.length > 0
    ) {
      const slotEvents = booking.webinarSlots.map((slot, index) => {
        if (!slot.startTime || !slot.endTime) return null;
        const slotStart = new Date(slot.startTime);
        const slotEnd = new Date(slot.endTime);
        if (isNaN(slotStart.getTime()) || isNaN(slotEnd.getTime()) || slotStart >= slotEnd) return null;
        if (!(slotStart < viewEnd && slotEnd > viewStart)) return null;
        return {
          ...baseBookingEvent,
          start: slotStart,
          end: slotEnd,
          _id: `${booking._id}_slot_${index}`,
          originalBookingId: booking._id,
          slotIndex: index,
          title: booking.title || t('bookingcalendar:session'),
        };
      }).filter(slotEvent => slotEvent !== null);
      return slotEvents.length > 0 ? slotEvents : [{ ...baseBookingEvent, start: new Date(booking.start), end: new Date(booking.end) }];
    } else {
      return [{ ...baseBookingEvent, start: new Date(booking.start), end: new Date(booking.end) }];
    }
  });
  allPotentialEvents.push(...regularBookingEvents);

  if (viewMode === 'user' && !isCoachViewingOwnCalendar) {
    return allPotentialEvents.filter(event => {
      const parentBookingId = event.originalBookingId || event._id;
      const originalBookingDetails = sessions.regularBookings.find(b => b._id === parentBookingId);
      if (!originalBookingDetails) return false;
      const isPrimaryUser = (originalBookingDetails.user?._id || originalBookingDetails.userId) === user?.id;
      const isConfirmedAttendee = Array.isArray(originalBookingDetails.attendees) &&
        originalBookingDetails.attendees.some(
          att => (att.user?._id === user?.id || att.user === user?.id) && att.status === 'confirmed'
        );
      return !event.isAvailability && (isPrimaryUser || isConfirmedAttendee);
    });
  }

  const effectiveCoachSettings = coachSettings || user?.coachSettings;
  return filterVisibleEvents(allPotentialEvents, effectiveCoachSettings?.privacySettings?.calendarVisibility, isConnected, user?.id, userId);

}, [
    inViewAvailability, 
    inViewRegularBookings, 
    sessions.regularBookings, 
    sessions.availability,
    coachSettings, 
    isConnected, 
    user, 
    userRole, 
    userId, 
    viewMode, 
    t, 
    isUserCalendar, 
    visibleDateRange
]);

  const { 
    connections, 
    isLoading: isLoadingConnections, 
    error: connectionsError,
    getConnectionForCoach,
    handleCancel
  } = useConnectionManagement();

const canViewCalendar = useMemo(() => {
  logger.info('[BookingCalendar] Determining calendar visibility.', {
      viewMode,
      isOwnProfile,
      isLoadingConnection,
      isConnected,
      calendarVisibilitySetting: coachSettings?.privacySettings?.calendarVisibility,
    });
    if (viewMode === 'user') {
      return true;
    }
  
    if (isLoadingConnection) {
      return false;
    }
  
    if (isOwnProfile) {
      return true;
    }
  
    if (!coachSettings?.privacySettings) {
      logger.error('[BookingCalendar] Coach privacy settings are not available to determine calendar visibility');
      return false;
    }
    
    const { calendarVisibility } = coachSettings.privacySettings;
    
    let result;
    switch (calendarVisibility) {
      case 'public':
        result = true;
        break;
      case 'connectedOnly':
        result = isConnected;
        break;
      case 'private':
        result = false;
        break;
      default:
        result = false;
    }
    
    logger.info(`[BookingCalendar] Final canViewCalendar result: ${result}`, { visibility: calendarVisibility, isConnected, isLoading: isLoadingConnection });
    return result;
  }, [coachSettings, isConnected, isLoadingConnection, isOwnProfile, viewMode]);

  const { data: sessionTypeTranslations } = useQuery(
    ['sessionTypeTranslations', i18n.language],
    () => getTranslations('sessionTypes', i18n.language),
    {
      enabled: !!sessionTypes,
      onError: (error) => {
        console.error('Error fetching translations:', error);
        toast.error(t('managesessions:errorFetchingTranslations'));
      },
      refetchOnWindowFocus: false,
    }
  );

const currentUserId = user?.id;
const currentUserRole = user?.role;

const fetchSessions = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const isCoachViewingOwnCalendar = isUserCalendar && currentUserRole === 'coach' && userId === currentUserId;

    logger.info('[BookingCalendar] Fetching sessions:', {
      viewMode,
      isUserCalendar,
      isCoachViewingOwnCalendar,
      calendarOwnerUserId: userId,
      currentAuthUserId: user?.id,
      currentAuthUserRole: userRole,
      rangeStart: visibleDateRange.start,
      rangeEnd: visibleDateRange.end
    });

    const liveSessionFilter = (booking) => {
      const title = booking.title || '';
      return !booking.isLiveSession && !title.toLowerCase().startsWith('live');
    };

    let sessionsData;
    const { start, end } = visibleDateRange;

    if (isCoachViewingOwnCalendar) {
      logger.info('[BookingCalendar] Fetching full coach sessions for own calendar (as coach):', { coachId: user?.id });
      const response = await getCoachSessions(user?.id, start, end);
      sessionsData = {
        availability: response.availability || [],
        regularBookings: (response.regularBookings || []).filter(liveSessionFilter)
      };
    } else if (isUserCalendar) {
      logger.info('[BookingCalendar] Fetching user-specific sessions (as client/attendee):', { clientUserId: user?.id });
      const response = await getUserSessions(user?.id, start, end);
      sessionsData = {
        availability: [],
        regularBookings: response.sessions ? response.sessions.filter(liveSessionFilter).map(booking => ({
          ...booking,
          title: booking.sessionType?.name || booking.title || 'Session',
          start: new Date(booking.start),
          end: new Date(booking.end),
          user: { _id: user?.id, firstName: user?.firstName, lastName: user?.lastName },
          coach: booking.coach || {},
          sessionType: booking.sessionType || { name: 'Session' },
          timezone: booking.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          status: booking.status || 'confirmed'
        })) : []
      };
    } else {
      if (!canViewCalendar) {
        logger.info('[BookingCalendar] Cannot view this coach calendar, skipping session fetch');
        setSessions({ availability: [], regularBookings: [] });
        setLoading(false);
        return;
      }
      logger.info('[BookingCalendar] Fetching coach sessions for profile/public view:', { coachId: userId });
      const response = await getCoachSessions(userId, start, end);
      sessionsData = {
        availability: response.availability || [],
        regularBookings: (response.regularBookings || []).filter(liveSessionFilter)
      };
    }

    logger.info('[BookingCalendar] Formatted sessions from fetch:', {
      regularBookingsCount: sessionsData.regularBookings?.length || 0,
      availabilityCount: sessionsData.availability?.length || 0
    });

    setSessions(sessionsData);
  } catch (error) {
    logger.error('[BookingCalendar] Error fetching sessions:', error);
    setError('Failed to load calendar data');
    toast.error(t('bookingcalendar:errorFetchingSessions'));
  } finally {
    setLoading(false);
  }
}, [userId, isUserCalendar, canViewCalendar, currentUserId, currentUserRole, t, visibleDateRange]);

  const handleSaveAvailability = useCallback(async (availabilityData) => {
    setLoading(true);
    try {
      const sessionTypeForAvailability = sessionTypes.find(type => type.id === availabilityData.sessionTypeId) || {
        id: '66ec551a4a8965b22af33fe3',
        name: 'Availability'
      };

      const availabilityPayload = {
        ...availabilityData,
        coach: userId,
        user: userId,
        sessionType: {
          _id: sessionTypeForAvailability.id,
          name: sessionTypeForAvailability.name
        },
        isAvailability: true,
        price: null,
        payment: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        title: availabilityData.title || t('managesessions:availabilitySlot'),
        status: 'confirmed',
        overtime: availabilityData.overtime
      };

      if (availabilityPayload._id) {
        await updateSession(availabilityPayload._id, availabilityPayload);
      } else {
        await createBooking(availabilityPayload);
      }

      await fetchSessions();
      toast.success(t('managesessions:availabilitySaved'));
      setViewEditAvailabilityState({ isOpen: false, slotData: null });
    } catch (error) {
      logger.error('[BookingCalendar] Error saving availability:', error);
      toast.error(t('managesessions:errorSavingAvailability'));
    } finally {
      setLoading(false);
    }
  }, [userId, t, fetchSessions, sessionTypes]);

  const handleDeleteAvailability = useCallback(async (availabilityId) => {
    try {
      await deleteSession(availabilityId);
      await fetchSessions();
      toast.success(t('managesessions:availabilityDeleted'));
      setViewEditAvailabilityState({ isOpen: false, slotData: null });
    } catch (error) {
      logger.error('[BookingCalendar] Error deleting availability:', error);
      toast.error(t('managesessions:errorDeletingAvailability'));
    }
  }, [fetchSessions, t]);

useEffect(() => {
  if (isUserCalendar || canViewCalendar) {
    console.log('[BookingCalendar] Initiating session fetch due to view permission change.');
    fetchSessions();
  }
}, [isUserCalendar, canViewCalendar, fetchSessions]);  

useEffect(() => {
    if (!socket) return;

    const handleAvailabilityUpdateEvent = (data) => {
        const detail = data || {}; 
        if (detail && typeof detail === 'object') {
            const { action, availabilityId, originalBookingId } = detail;
            logger.info('[BookingCalendar] Socket availability_update:', { action, availabilityId, originalBookingId });
            if (action === 'created' || action === 'restored') {
                fetchSessions().catch(err => logger.error('[BookingCalendar] Error refetching sessions for availability_update:', err));
            }
        } else {
            logger.warn('[BookingCalendar] Socket availability_update missing detail or malformed:', detail);
        }
    };

    const handleBookingUpdateEvent = (data) => {
        const detail = data || {};
        if (detail && typeof detail === 'object' && detail.bookingId) {
            const { bookingId, status, bookingData } = detail;
            logger.info('[BookingCalendar] Socket booking_update:', { bookingId, status, hasFullBookingData: !!bookingData });

            const isCancellation = ['cancelled_by_client', 'cancelled_by_coach', 'declined'].includes(status);

            if (isCancellation) {
                logger.info(`[BookingCalendar] Removing booking ${bookingId} locally due to status: ${status}.`);
                setSessions(prev => ({
                    ...prev,
                    regularBookings: prev.regularBookings.filter(b => b._id !== bookingId),
                }));
            } else if (bookingData && bookingData._id === bookingId) {
                logger.info(`[BookingCalendar] Upserting booking ${bookingId} locally with full data.`);
                const updatedBooking = { ...bookingData, start: new Date(bookingData.start), end: new Date(bookingData.end) };
                setSessions(prev => {
                    const existingBookingIndex = prev.regularBookings.findIndex(b => b._id === bookingId);
                    if (existingBookingIndex > -1) {
                        const newBookings = [...prev.regularBookings];
                        newBookings[existingBookingIndex] = updatedBooking;
                        return { ...prev, regularBookings: newBookings };
                    } else {
                        return { ...prev, regularBookings: [...prev.regularBookings, updatedBooking] };
                    }
                });
            } else if (status === 'rescheduled_pending_attendee_actions') {
                logger.info(`[BookingCalendar] Booking ${bookingId} status ${status} requires refetch due to complexity.`);
                fetchSessions().catch(err => logger.error(`[BookingCalendar] Error refetching for booking ${bookingId} status ${status}:`, err));
            } else if (status) {
                logger.info(`[BookingCalendar] Updating booking ${bookingId} status locally to ${status}.`);
                setSessions(prev => ({
                    ...prev,
                    regularBookings: prev.regularBookings.map(b =>
                        b._id === bookingId ? { ...b, status: status } : b
                    )
                }));
            }
            
            queryClient.invalidateQueries(['booking', bookingId]);
            queryClient.invalidateQueries(['userSessions']);
        } else {
            logger.warn('[BookingCalendar] Socket booking_update missing detail.bookingId or malformed:', detail);
        }
    };

    socket.on('availability_update', handleAvailabilityUpdateEvent);
    socket.on('booking_update', handleBookingUpdateEvent);

    return () => {
        socket.off('availability_update', handleAvailabilityUpdateEvent);
        socket.off('booking_update', handleBookingUpdateEvent);
    };
}, [socket, fetchSessions, queryClient]);

  const handleSessionTypeToggle = (typeId) => {
    setSelectedSessionTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    );
  };

const renderSessionTypeButtons = () => (
    <div className="session-type-buttons">
      <button 
        onClick={() => setSelectedSessionTypes(sessionTypes.map(type => type.id))}
        className={selectedSessionTypes.length === sessionTypes.length ? 'active' : ''}
      >
        {t('bookingcalendar:all')}
      </button>
      {sessionTypes.map(type => (
        <button 
          key={type.id} 
          onClick={() => handleSessionTypeToggle(type.id)}
          className={selectedSessionTypes.includes(type.id) ? 'active' : ''}
        >
          {getSessionTypeIcon(type.id)}
          {getTranslatedSessionTypeName(type.id)}
        </button>
      ))}
    </div>
  );

const getTranslatedSessionTypeName = useCallback((typeId) => {
    if (!sessionTypes) return '';
    const type = sessionTypes.find(t => t.id === typeId);
    if (!type) return '';
    const translationKey = `sessionTypes_${typeId}`;
    const translatedName = sessionTypeTranslations?.translations?.[translationKey]?.translation || type.name;
    return translatedName;
  }, [sessionTypes, sessionTypeTranslations]);

  const getSessionTypeIcon = (typeId) => {
    if (!sessionTypes) return null;
    const type = sessionTypes.find(t => t.id === typeId);
    if (!type) return null;
    switch (type.name.toLowerCase()) {
      case 'availability': return <Clock size={18} />;
      case '1 on 1': return <Users size={18} />;
      case 'group': return <Users size={18} />;
      case 'workshop': return <BookOpen size={18} />;
      case 'webinar': return <Video size={18} />;
      default: return null;
    }
  };

  const handleSelectEvent = useCallback((event) => {
    logger.info('[BookingCalendar] handleSelectEvent fired. Processing event click.', {
      eventId: event._id,
      isAvailability: event.isAvailability,
      originalBookingId: event.originalBookingId,
      viewMode,
      isOwnProfile,
      userRole
    });

    let eventToProcess = { ...event };
    let bookingIdForModal = event._id;

    if (event.originalBookingId && event.slotIndex !== undefined) {
      logger.info('[BookingCalendar] Clicked a webinar slot, finding parent booking.');
      const parentBooking = sessions.regularBookings.find(b => b._id === event.originalBookingId);
      if (parentBooking) {
        eventToProcess = {
          ...parentBooking,
          _id: parentBooking._id,
          start: new Date(parentBooking.start),
          end: new Date(parentBooking.end),
          title: parentBooking.title || parentBooking.sessionType?.name || t('bookingcalendar:session'),
          sessionType: parentBooking.sessionType || { name: 'Session' },
          isAvailability: false,
          webinarSlots: parentBooking.webinarSlots,
          originalClickedSlot: { start: event.start, end: event.end, slotIndex: event.slotIndex }
        };
        bookingIdForModal = parentBooking._id;
        logger.info('[BookingCalendar] Using parent webinar booking for modal.', { parentBookingId: bookingIdForModal });
      } else {
        logger.warn('[BookingCalendar] Parent booking not found for webinar slot. Using originalBookingId as fallback.', { originalBookingId: event.originalBookingId });
        bookingIdForModal = event.originalBookingId;
      }
    }

    if (eventToProcess.isAvailability) {
      logger.info('[BookingCalendar] Event is an availability slot.');

      if (isOwnProfile && userRole === 'coach') {
        logger.info('[BookingCalendar] Coach viewing own calendar. Opening ViewEditAvailabilityModal.');
        setViewEditAvailabilityState({ isOpen: true, slotData: eventToProcess });
        return;
      }

      logger.info('[BookingCalendar] Client viewing coach calendar. Opening UserBookingModal to create a booking.');
      const currentTime = moment();
      const eventStart = moment(eventToProcess.start);
      const eventEnd = moment(eventToProcess.end);

      if (eventEnd.isBefore(currentTime)) {
        toast.error(t('bookingcalendar:pastSlotError'));
        return;
      }

      let slotStartTimeForBooking = eventToProcess.start;
      if (eventStart.isBefore(currentTime)) {
        const bufferMinutes = 15;
        const adjustedStart = moment(currentTime).add(bufferMinutes, 'minutes');
        if (adjustedStart.isSameOrAfter(eventEnd)) {
          toast.error(t('bookingcalendar:invalidTimeSlot'));
          return;
        }
        slotStartTimeForBooking = adjustedStart.toDate();
      }

      const sessionTypeId = eventToProcess.sessionType?._id || eventToProcess.sessionType?.id || eventToProcess.sessionType;
      let sessionTypeForBooking = sessionTypes?.find(type => type._id === sessionTypeId || type.id === sessionTypeId);

      if (!sessionTypeForBooking && sessionTypes?.length > 0) {
        sessionTypeForBooking = sessionTypes[0];
        logger.warn('[BookingCalendar] Session type from availability slot ambiguous, using first available type.');
      }

      if (!sessionTypeForBooking) {
        toast.error(t('bookingcalendar:sessionTypeError'));
        logger.error('[BookingCalendar] No suitable session type found for booking from availability slot.', { eventSessionType: eventToProcess.sessionType, availableTypes: sessionTypes });
        return;
      }

      const bookingType = getBookingTypeForSlot(eventToProcess, coachSettings, isConnected);
      if (!bookingType) {
        toast.error(t('bookingcalendar:unavailableSlot'));
        return;
      }

      const bookingDetailsToConfirm = {
        coach: userId,
        coachId: userId,
        user: user?.id,
        userId: user?.id,
        coachName: coachName,
        availableForInstantBooking: eventToProcess.availableForInstantBooking,
        sessionType: {
          _id: sessionTypeForBooking._id || sessionTypeForBooking.id,
          name: sessionTypeForBooking.name,
          price: sessionTypeForBooking.price,
        },
        sessionTypeName: getTranslatedSessionTypeName(sessionTypeForBooking._id || sessionTypeForBooking.id),
        start: slotStartTimeForBooking,
        end: new Date(eventToProcess.end),
        timezone: eventToProcess.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        type: bookingType,
        status: bookingType === 'FIRM' ? 'confirmed' : 'requested',
        isAvailability: false,
        title: getTranslatedSessionTypeName(sessionTypeForBooking._id || sessionTypeForBooking.id),
        price: {
          base: sessionTypeForBooking.price || 0,
          currency: coachSettings?.currency || 'USD',
          final: sessionTypeForBooking.price || 0
        },
        payment: {
          required: (sessionTypeForBooking.price || 0) > 0,
          status: 'pending'
        },
        overtime: eventToProcess.overtime
      };

      logger.info('[BookingCalendar] Setting bookingToConfirm from availability slot.', { bookingDetailsToConfirm });
      setBookingToConfirm(bookingDetailsToConfirm);

    } else {
      logger.info('[BookingCalendar] Event is a booked session. Opening BookingDetailsModal.');
      const [firstName, ...lastNameParts] = coachName.split(' ');
      const lastName = lastNameParts.join(' ');

      const formattedBooking = {
        _id: eventToProcess._id,
        coach: {
          firstName,
          lastName,
          _id: userId,
          profilePicture: eventToProcess.coach?.profilePicture
        },
        user: eventToProcess.user || {
          _id: user?.id,
          firstName: user?.firstName,
          lastName: user?.lastName,
          profilePicture: user?.profilePicture
        },
        sessionType: {
          _id: eventToProcess.sessionType?._id || eventToProcess.sessionType?.id || (typeof eventToProcess.sessionType === 'string' ? eventToProcess.sessionType : 'defaultTypeId'),
          name: eventToProcess.sessionType?.name || eventToProcess.title || 'Session',
          price: eventToProcess.sessionType?.price || 0
        },
        start: new Date(eventToProcess.start),
        end: new Date(eventToProcess.end),
        status: eventToProcess.status || 'confirmed',
        title: eventToProcess.title || eventToProcess.sessionType?.name || 'Session',
        timezone: eventToProcess.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        type: eventToProcess.type,
        virtualMeeting: eventToProcess.virtualMeeting,
        description: eventToProcess.description,
        preparationRequired: eventToProcess.preparationRequired,
        followUpTasks: eventToProcess.followUpTasks,
        price: eventToProcess.price || { base: { amount: { amount: eventToProcess.sessionType?.price || 0 }}, currency: 'CHF', final: { amount: { amount: eventToProcess.sessionType?.price || 0 }} },
        payment: eventToProcess.payment,
        webinarSlots: eventToProcess.webinarSlots,
        earlyBirdPrice: eventToProcess.earlyBirdPrice,
        earlyBirdDeadline: eventToProcess.earlyBirdDeadline,
        attendees: eventToProcess.attendees,
        maxAttendees: eventToProcess.maxAttendees,
        courseMaterials: eventToProcess.courseMaterials,
        webinarLink: eventToProcess.webinarLink,
        originalClickedSlot: eventToProcess.originalClickedSlot
      };

      setSelectedBooking({
        bookingId: formattedBooking._id,
        existingBooking: formattedBooking,
        isInitialData: true
      });
    }
  }, [
    viewMode, 
    isOwnProfile, 
    userRole,
    sessions.regularBookings, 
    t, 
    sessionTypes, 
    coachSettings, 
    isConnected, 
    coachName, 
    userId, 
    user, 
    getTranslatedSessionTypeName
  ]);

  const handleBookingButtonClick = useCallback(() => {
    const initialData = {
      coachName,
      coachId: userId,
      userId: user?.id,
      type: 'button_click',
      start: null,
      end: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isAvailability: false,
    };
    
    console.log('[BookingButton] Creating modal with:', initialData);
    setBookingToConfirm(initialData);
  }, [userId, user?.id, coachName]);

const BookingButton = () => {
  const { t } = useTranslation(['bookingcalendar']);
  
  return (
    <button
      onClick={handleBookingButtonClick}
      className="booking-action-button"
    >
      {t('bookingcalendar:bookSession')}
    </button>
  );
};

  const handleSelectSlot = (slotInfo) => {
    console.log('[BookingCalendar] Slot selected:', slotInfo);
    if (!coachSettings || !coachSettings.availabilityManagement) {
      console.error('[BookingCalendar] Coach settings or availability management not available');
      return;
    }
    const isAvailable = checkAvailability(slotInfo, coachSettings.availabilityManagement);
    console.log('[BookingCalendar] Is slot available:', isAvailable);
    if (isAvailable) {
      console.log('[BookingCalendar] Setting booking to confirm:', slotInfo);
      setBookingToConfirm({
        start: slotInfo.start,
        end: slotInfo.end,
        coachName: coachName
      });
    } else {
      console.log('[BookingCalendar] Slot unavailable');
      toast.error(t('bookingcalendar:slotUnavailable'));
    }
  };


const handleBookingConfirm = useCallback(async (bookingDetails) => {
  try {
    logger.info('[BookingCalendar] Creating booking:', {
      ...bookingDetails,
      payment: 'PAYMENT_INFO_REDACTED'
    });

      logger.info('[BookingCalendar] handleBookingConfirm received details:', {
        ...bookingDetails,
        receivedOvertime: bookingDetails?.overtime,
        payment: 'PAYMENT_INFO_REDACTED'
      });
  
      const formattedBookingDetails = {
        start: new Date(bookingDetails.start),
        end: new Date(bookingDetails.end),
        timezone: bookingDetails.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        coach: bookingDetails.coachId || bookingDetails.coach || userId,
        user: bookingDetails.userId || bookingDetails.user || user?.id,
        sessionType: bookingDetails.sessionType._id || bookingDetails.sessionType.id,
        title: bookingDetails.sessionTypeName || bookingDetails.title,
        type: bookingDetails.type,
        status: bookingDetails.status,
        isAvailability: false,
         price: bookingDetails.price,
        payment: bookingDetails.type === 'FIRM' ? {
          required: true,
          status: 'pending'
        } : null,
        overtime: bookingDetails.overtime,
        availableForInstantBooking: bookingDetails.availableForInstantBooking,
        firmBookingThreshold: bookingDetails.firmBookingThreshold,
        recurringPattern: bookingDetails.recurringPattern,
        recurringEndDate: bookingDetails.recurringEndDate,
        description: bookingDetails.description,
        tags: bookingDetails.tags,
        discountCode: bookingDetails.discountCode,
      };
  
      logger.info('[BookingCalendar] Formatted Booking Price:', {
        baseAmount: formattedBookingDetails.price?.base?.amount,
        finalAmount: formattedBookingDetails.price?.final?.amount,
        discounts: formattedBookingDetails.price?.discounts?.length
      });

      logger.info('[BookingCalendar] Calling createBooking (API Service) with:', {
        ...formattedBookingDetails,
        price: formattedBookingDetails.price ? 'PRICE_PRESENT' : 'NO_PRICE',
        payment: formattedBookingDetails.payment ? 'PAYMENT_PRESENT' : 'NO_PAYMENT',
        overtime: formattedBookingDetails.overtime
     });
  
      const response = await createBooking(formattedBookingDetails);
  
      if (!response || (!response.booking && !response.paymentIntentClientSecret)) {
        throw new Error('Invalid response from booking creation');
      }
  
  const createdBooking = {
        ...response.booking,
        _id: response.booking._id || response.booking.id,
        start: new Date(response.booking.start || bookingDetails.start),
        end: new Date(response.booking.end || bookingDetails.end),
        paymentIntentClientSecret: response.paymentIntentClientSecret
      };
  
      logger.info('[BookingCalendar] Booking created successfully (API Response handled):', {
        bookingId: createdBooking._id,
        status: createdBooking.status,
        hasPaymentIntent: !!createdBooking.paymentIntentClientSecret,
        overtimeInResponse: createdBooking.overtime 
      });
  
      await fetchSessions();
  
      if (createdBooking.paymentIntentClientSecret || createdBooking.type === 'FIRM') {
        logger.info('[BookingCalendar] Payment required for booking:', {
          bookingId: createdBooking._id,
          type: createdBooking.type,
          timestamp: new Date().toISOString()
        });
        setBookingToConfirm(prev => ({ ...prev, ...createdBooking, _id: createdBooking._id }));
        return createdBooking;
     } else {
        logger.info('[BookingCalendar] No payment required, closing modal:', {
          bookingId: createdBooking._id,
          type: createdBooking.type,
          timestamp: new Date().toISOString()
        });
        setBookingToConfirm(null);
        await onBookingConfirmed(createdBooking);
        
        if (createdBooking.status === 'confirmed') {
          toast.success(t('bookings:bookingConfirmed'));
        }
        
        return createdBooking;
      }
    } catch (error) {
      logger.error('[BookingCalendar] Error creating booking:', error);
  
      logger.error('[BookingCalendar] Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
    });
    throw error;
  }
}, [userId, user, t, fetchSessions, onBookingConfirmed]);

   const handleCloseDetailsModal = useCallback((result) => {
    setSelectedBooking(null);
    if (result?.action === 'cancelled' || result?.action === 'decline' || result?.action === 'declined') {
        logger.info('[BookingCalendar] Cancellation/Decline confirmed in details modal, triggering refetch.', { bookingId: result.bookingId, action: result.action });
        fetchSessions();
    }
}, [fetchSessions]);

const handleCloseBookingModal = useCallback((result) => {
    setBookingToConfirm(null);

    if (result?.action === 'cancelled' && result.bookingId) {
        logger.info('[BookingCalendar] Cancellation confirmed in modal, performing immediate UI update.', { bookingId: result.bookingId });
        
        const cancelledBooking = sessions.regularBookings.find(b => b._id === result.bookingId);
        
        if (!cancelledBooking) {
            logger.warn('[BookingCalendar] Could not find cancelled booking in local state to perform merge. Refetching as fallback.', { bookingId: result.bookingId });
            fetchSessions();
            return;
        }

        setSessions(prev => {
            const updatedBookings = prev.regularBookings.filter(b => b._id !== result.bookingId);
            const restoredStart = new Date(cancelledBooking.start);
            const restoredEnd = new Date(cancelledBooking.end);

            const adjacentBefore = prev.availability.find(a => new Date(a.end).getTime() === restoredStart.getTime());
            const adjacentAfter = prev.availability.find(a => new Date(a.start).getTime() === restoredEnd.getTime());

            let mergedStart = restoredStart;
            let mergedEnd = restoredEnd;
            let propertiesToInherit = {
                availableForInstantBooking: cancelledBooking.metadata?.availabilitySettings?.availableForInstantBooking ?? false,
                firmBookingThreshold: cancelledBooking.metadata?.availabilitySettings?.firmBookingThreshold ?? 24,
                title: t('bookingcalendar:availabilitySlot'),
                sessionType: cancelledBooking.sessionType,
            };
            
            const slotsToMergeIds = [];
            if (adjacentBefore) {
                mergedStart = new Date(adjacentBefore.start);
                slotsToMergeIds.push(adjacentBefore._id);
                propertiesToInherit = {
                    availableForInstantBooking: adjacentBefore.availableForInstantBooking,
                    firmBookingThreshold: adjacentBefore.firmBookingThreshold,
                    title: adjacentBefore.title,
                    sessionType: adjacentBefore.sessionType,
                };
            }
            if (adjacentAfter) {
                mergedEnd = new Date(adjacentAfter.end);
                slotsToMergeIds.push(adjacentAfter._id);
            }

            const remainingAvailability = prev.availability.filter(a => !slotsToMergeIds.includes(a._id));
            
            const newMergedSlot = {
                ...cancelledBooking,
                ...propertiesToInherit,
                _id: `coalesced-${result.bookingId}`,
                start: mergedStart,
                end: mergedEnd,
                isAvailability: true,
                status: 'confirmed',
            };

            return {
                regularBookings: updatedBookings,
                availability: [...remainingAvailability, newMergedSlot],
            };
        });
    }
}, [sessions.regularBookings, sessions.availability, fetchSessions, t]);

  const handleSuggestAlternativeTime = useCallback(async (suggestedTime) => {
    if (!selectedBooking?.bookingId) return;
    try {
      await suggestAlternativeTime({
        bookingId: selectedBooking.bookingId,
        suggestedTime
      });
      queryClient.invalidateQueries(['sessions']);
      await fetchSessions();
      setSelectedBooking(null);
      toast.success(t('bookingcalendar:suggestionSent'));
    } catch (error) {
      logger.error('[BookingCalendar] Error suggesting time:', error);
      toast.error(t('bookingcalendar:suggestionError'));
    }
  }, [selectedBooking, suggestAlternativeTime, queryClient, fetchSessions, t]);

const legendItems = useMemo(() => {
    const items = {
      available: false,
      requested: false,
      confirmedTypes: new Map(),
    };

    if (!visibleEvents || !sessionTypes) {
      return items;
    }

   const getColorClassForEvent = (event) => {
        const sessionTypeId = event.sessionType?._id || event.sessionType;
        if (event.isAvailability) return 'bg-green-500 dark:bg-green-500';
        if (event.status === 'requested') return 'bg-amber-500 dark:bg-amber-500';
        if (sessionTypeId === SESSION_TYPE_IDS.ONE_ON_ONE) return 'bg-blue-500 dark:bg-blue-500';
        if (event.maxAttendees > 1) return 'bg-violet-500 dark:bg-violet-500';
        return 'bg-slate-400 dark:bg-slate-500';
    };

    visibleEvents.forEach(event => {
      if (event.isAvailability) {
        items.available = true;
      } else {
        if (event.status === 'requested') {
          items.requested = true;
        } else if (event.status === 'confirmed') {
          const sessionTypeInfo = event.sessionType;
          const typeId = (typeof sessionTypeInfo === 'object' && sessionTypeInfo !== null)
            ? sessionTypeInfo._id || sessionTypeInfo.id
            : sessionTypeInfo;

          if (typeId && !items.confirmedTypes.has(typeId)) {
            const typeName = getTranslatedSessionTypeName(typeId) || 'Confirmed Session';
            items.confirmedTypes.set(typeId, {
              id: typeId,
              name: typeName,
              colorClass: getColorClassForEvent(event),
            });
          }
        }
      }
    });

    return {
      ...items,
      confirmedTypes: Array.from(items.confirmedTypes.values()),
    };
  }, [visibleEvents, getTranslatedSessionTypeName, sessionTypes]);

const calendarProps = useMemo(() => {
    const formats = {
        ...getCalendarFormats(localizer),
        eventTimeRangeFormat: () => '',
    };
  return {
    localizer,
    events: visibleEvents,
    startAccessor: (event) => new Date(event.start),
    endAccessor: (event) => new Date(event.end),
    style: { height: `${calendarHeight}vh`, minHeight: '500px' },
    views: ['month', 'week', 'day'],
    selectable: true,
    onSelectSlot: handleSelectSlot,
    onSelectEvent: handleSelectEvent,
    tooltipAccessor: (event) => event ? `${event.title || ''}: ${moment(event.start).format('HH:mm')} - ${moment(event.end).format('HH:mm')}` : '',
    messages: {
      today: t('common:today'),
      next: t('common:next'),
      previous: t('common:prev'),
      month: t('common:month'),
      week: t('common:week'),
      day: t('common:day'),
      agenda: t('common:agenda'),
    },
    components: {
     event: (props) => props.event ? <EventComponent {...props} /> : null
    },
    eventPropGetter: eventPropGetter,
    min: moment().startOf('day').toDate(),
    max: moment().endOf('day').toDate(),
    scrollToTime: moment().startOf('day').add(6, 'hours').toDate(),
    formats: formats,
    step: 30,
    timeslots: 2,
    view: viewType,
    onView: setViewType,
    date: currentDate,
    onNavigate: setCurrentDate,
    toolbar: false,
  };
}, [
    visibleEvents,
    handleSelectSlot,
    handleSelectEvent,
    viewType,
    currentDate,
    t,
    eventPropGetter,
    calendarHeight
]);

  useEffect(() => {
    if (!coachName) {
      console.error('[BookingCalendar] Coach name is missing!', {
        userId,
        coachSettings,
        props: {
          userId,
          coachName,
          onBookingConfirmed,
          coachSettings
        }
      });
    }
  }, [coachName, userId, coachSettings]);

  useEffect(() => {
    return () => {
      logger.info('[BookingCalendar] Cleanup on unmount or state change', {
        bookingToConfirm: !!bookingToConfirm,
        selectedBooking: !!selectedBooking,
        timestamp: new Date().toISOString(),
      });
      setBookingToConfirm(null);
      setSelectedBooking(null);
    };
  }, []);

  if (error || connectionsError) {
    console.error('[BookingCalendar] Error:', error || connectionsError);
    return (
      <div className="error-message bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">{t('bookingcalendar:errorLoadingCalendar')}</strong>
        <span className="block sm:inline"> {(error || connectionsError).toString()}</span>
      </div>
    );
  }

  if (!canViewCalendar) {
    console.log('[BookingCalendar] User cannot view calendar');
    return (
      <div className="mt-4 p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700">
        <p>{t('bookingcalendar:calendarNotAccessible')}</p>
        <p>{CALENDAR_VISIBILITY_DESCRIPTIONS[coachSettings?.privacySettings?.calendarVisibility]}</p>
      </div>
    );
  }

return (
  <ErrorBoundary>
     <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
            { isUserCalendar ? t('bookingcalendar:myBookings') : t('bookingcalendar:calendarTitle', { name: coachName })}
          </h1>
          <div className="flex items-center flex-wrap gap-2">
            {!isOwnProfile && viewMode !== 'user' && (
                <Button onClick={handleBookingButtonClick}>
                {t('bookingcalendar:bookSession')}
                </Button>
            )}
            <Button variant="outline" onClick={() => setShowList(!showList)}>
                {showList ? <CalendarIcon className="mr-2 h-4 w-4" /> : <List className="mr-2 h-4 w-4" />}
                {showList ? t('managesessions:showCalendar') : t('managesessions:showList')}
            </Button>
          </div>
      </div>

      {showList ? (
        <ListView sessions={visibleEvents} onEditSession={handleSelectEvent} />
      ) : (
         <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
            <CalendarToolbar
            currentDate={currentDate}
            onNavigate={handleNavigation}
            onView={setViewType}
            view={viewType}
            views={['month', 'week', 'day']}
            onZoom={handleZoom}
            zoomDisabled={{
                out: calendarHeight <= 70,
                in: calendarHeight >= 210,
            }}
            />
            <div className="p-2 md:p-4">
              <div style={{ height: '70vh', overflowY: 'auto' }}>
                <Calendar {...calendarProps} />
              </div>
            </div>
        </div>
      )}

      <AnimatePresence>
        {selectedBooking && (
            <BookingDetailsModal
                bookingId={selectedBooking.bookingId}
                onClose={handleCloseDetailsModal}
                existingBooking={selectedBooking.existingBooking}
                isInitialData={selectedBooking.isInitialData}
                source="calendar"
                onSuggest={handleSuggestAlternativeTime}
                />
            )}

            {viewEditAvailabilityState.isOpen && viewEditAvailabilityState.slotData && (
                <ViewEditAvailabilityModal
                isOpen={viewEditAvailabilityState.isOpen}
                onClose={() => setViewEditAvailabilityState({ isOpen: false, slotData: null })}
                onSave={handleSaveAvailability}
                onDelete={handleDeleteAvailability}
                slotData={viewEditAvailabilityState.slotData}
                />
            )}
            
            {bookingToConfirm && (
                 <UserBookingModal
                    isOpen={!!bookingToConfirm}
                    onClose={handleCloseBookingModal}
                    onConfirm={handleBookingConfirm}
                    bookingData={modalBookingData}
                    coachSettings={coachSettings}
                    userId={user?.id}
                    coachId={userId}
                    dateAvailability={processedAvailability.dateAvailability}
                    availableDates={processedAvailability.availableDates}
                    coachName={coachName}
                    />
            )}
      </AnimatePresence>
      
      <div className="mt-4 flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="calendar-legend flex flex-wrap gap-x-4 gap-y-2">
              {legendItems.available && (
              <div className="legend-item inline-flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                  <span className="text-sm text-muted-foreground">{t('bookingcalendar:available')}</span>
              </div>
              )}
              {legendItems.requested && (
              <div className="legend-item inline-flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span className="text-sm text-muted-foreground">{t('bookingcalendar:pendingRequest')}</span>
              </div>
              )}
              {legendItems.confirmedTypes.map(type => (
              <div className="legend-item inline-flex items-center gap-2" key={type.id}>
                  <div className={`h-3 w-3 rounded-full ${type.colorClass}`} />
                  <span className="text-sm text-muted-foreground">{type.name}</span>
              </div>
              ))}
          </div>

          <div className="timezone-info text-sm text-muted-foreground">
              {t('bookingcalendar:timezone')}: {moment.tz.guess()}
          </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}

BookingCalendar.propTypes = {
  userId: PropTypes.string.isRequired,
  coachName: PropTypes.string.isRequired,
  onBookingConfirmed: PropTypes.func.isRequired,
  coachSettings: PropTypes.object.isRequired,
  viewMode: PropTypes.oneOf(['coach', 'user']),
};

export default BookingCalendar;