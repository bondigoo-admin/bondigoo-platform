import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import moment from 'moment';
import { PlusCircle, List, CalendarIcon, User, Users, Video, BookOpen, Clock, AlertCircle } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { useParams } from 'react-router-dom';

import ErrorBoundary from './ErrorBoundary';
import { getSessionTypes, getTranslations } from '../services/adminAPI';
import LoadingSpinner from './LoadingSpinner'; 
import AddEditSessionModal from './AddEditSessionModal';
import ManageAvailabilityModal from './ManageAvailabilityModal';
import BookingDetailsModal from './BookingDetailsModal';
import ConflictResolution from './ConflictResolution';
import CoachSettings from './CoachSettings';
import ListView from './ListView';
import CalendarToolbar from './CalendarToolbar';

import { usePermissions } from '../hooks/usePermission';
import { useAuth } from '../contexts/AuthContext';
import { useConnectionCheck } from '../hooks/useConnectionCheck';
import { 
  generateRecurringSessions, 
  isOverlapping
} from '../utils/calendarHelpers';
import { getCoachAvailability, getCoachSettings } from '../services/coachAPI';
import { createBooking, updateSession, deleteSession, getCoachSessions, updateBooking } from '../services/bookingAPI';
import { 
  uploadSessionImage, 
  deleteSessionImage, 
  uploadSessionCourseMaterials, 
  deleteSessionCourseMaterial 
} from '../services/sessionAPI';
import { logger } from '../utils/logger.js';
import { getCalendarFormats, initializeMomentLocale } from '../utils/dateUtils';
import 'moment/locale/de';
import EventComponent, { SESSION_TYPE_IDS } from './EventComponent';

import { Button } from './ui/button.tsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog.tsx';

const localizer = momentLocalizer(moment);
const DraggableCalendar = withDragAndDrop(Calendar);

const WEBINAR_TYPE_ID_STRING = '66ec54f94a8965b22af33fd9';

const ManageSessions = ({ userId: propUserId, isEmbedded }) => {
  const { userId: paramUserId } = useParams();
  const userId = propUserId || paramUserId;
  const { t, i18n } = useTranslation(['common', 'managesessions', 'manageAvailability', 'bookingcalendar']);
  useEffect(() => {
      initializeMomentLocale(i18n.language);
    }, [i18n.language]);
  const { user } = useAuth();
  
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedSessionTypes, setSelectedSessionTypes] = useState([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [showList, setShowList] = useState(false);
  const [viewType, setViewType] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showConflictResolution, setShowConflictResolution] = useState(false);
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [showBookingDetailsModal, setShowBookingDetailsModal] = useState(false);
  const [calendarHeight, setCalendarHeight] = useState(70); 
  const { canManageAvailability } = usePermissions();
  const [sessionTypes, setSessionTypes] = useState([]);
  const [coachSettings, setCoachSettings] = useState(null);
  const { isConnected } = useConnectionCheck(user?.id, userId);

   useEffect(() => {
    if (window.innerWidth < 768) {
      setViewType('month');
    }
  }, []);
  
  const queryClient = useQueryClient();

  const {
    data: sessionsData,
    isLoading: isLoadingSessions,
    refetch: refetchSessions
  } = useQuery(
    ['coachSessions', userId],
    () => getCoachSessions(userId),
    {
      enabled: !!userId,
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      onError: (error) => {
        logger.error('[ManageSessions] useQuery error fetching sessions', { error: error.message });
        toast.error(t('managesessions:errorFetchingSessions'));
      },
    }
  );
  
  const { isLoading: isLoadingTypes } = useQuery(
    'sessionTypes',
    getSessionTypes,
    {
      staleTime: 5 * 60 * 1000,
      onSuccess: (fetchedData) => {
        const formattedTypes = fetchedData.map(type => ({
          id: type._id || type.id,
          name: type.name,
          duration: type.duration,
          price: type.price
        }));
        setSessionTypes(formattedTypes);
        setSelectedSessionTypes(formattedTypes.map(type => type.id));
      },
      onError: (error) => {
        console.error('[ManageSessions] Error fetching session types:', error);
        toast.error(t('managesessions:errorFetchingSessionTypes'));
      }
    }
  );

  const formattedSessionsData = useMemo(() => {
    if (!sessionsData || !sessionTypes || sessionTypes.length === 0) {
      return { availability: [], regularBookings: [] };
    }

    const availability = (sessionsData.availability || []).map(slot => ({
      ...slot,
      start: new Date(slot.start),
      end: new Date(slot.end),
      isAvailability: true,
      title: slot.title || t('managesessions:availabilitySlot'),
      sessionType: slot.sessionType || { _id: slot.type || '66ec551a4a8965b22af33fe3', name: 'Availability' }
    }));

    const regularBookings = (sessionsData.regularBookings || []).map(booking => {
      const typeId = booking.type || (typeof booking.sessionType === 'string' ? booking.sessionType : booking.sessionType?._id);
      const foundSessionType = sessionTypes.find(st => st.id === typeId) || { id: typeId, name: booking.sessionTypeName || 'Session' };
      return {
        ...booking,
        start: new Date(booking.start),
        end: new Date(booking.end),
        isAvailability: false,
        user: booking.user,
        coach: booking.coach,
        title: booking.title || t('managesessions:session'),
        sessionType: {
          _id: foundSessionType.id,
          name: foundSessionType.name,
          price: foundSessionType.price,
          duration: foundSessionType.duration
        }
      };
    });

    return { availability, regularBookings };
  }, [sessionsData, sessionTypes, t]);
 
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

  const { isLoading: isLoadingSettings } = useQuery(
    ['coachSettings', userId],
    () => getCoachSettings(userId),
    {
      onSuccess: setCoachSettings,
      onError: (error) => {
        console.error('[ManageSessions] Error fetching coach settings:', error);
        toast.error(t('managesessions:errorFetchingCoachSettings'));
      },
      refetchOnWindowFocus: false,
    }
  ); 
  
  const handleSelectSlot = useCallback(({ start, end }) => {
    setSelectedSession({ start, end });
    setShowAddEditModal(true);
  }, []);

const handleSelectEvent = useCallback((event) => {
    // First, handle the simple case of an availability slot
    if (event.isAvailability) {
        setSelectedSession(event);
        setShowAvailabilityModal(true);
        return;
    }

    let sessionForModal = event;

    // Check if the clicked event is a slot from a larger webinar booking
    if (event.originalBookingId && event.slotIndex !== undefined) {
        // Find the full parent booking object from the original data source
        const parentBooking = sessionsData?.regularBookings?.find(b => b._id === event.originalBookingId);
        
        if (parentBooking) {
            // If the parent is found, use its full data for the modal.
            // We also enrich it with details about which specific slot was clicked.
            sessionForModal = {
                ...parentBooking,
                start: new Date(parentBooking.start), // Ensure dates are Date objects
                end: new Date(parentBooking.end),
                originalClickedSlot: {
                    start: event.start,
                    end: event.end,
                    slotIndex: event.slotIndex,
                },
            };
        } else {
            // This is a fallback in case the parent booking isn't found, which is unlikely.
            console.warn(`[ManageSessions] Parent booking with ID ${event.originalBookingId} not found for webinar slot.`);
        }
    }
    
    // Set the prepared session (either the original or the full parent) and open the details modal
    setSelectedSession(sessionForModal);
    setShowBookingDetailsModal(true);
}, [sessionsData]);

  const handleDragEvent = useCallback(async ({ event, start, end }) => {
    try {
      const newStartTime = new Date(start).toISOString();
      const newEndTime = new Date(end).toISOString();
  
      if (event.isAvailability) {
        const payload = { start: newStartTime, end: newEndTime };
        await updateSession(event._id, payload);
        toast.success(t('managesessions:availabilityUpdated'));
      } else {
        const isWebinarSlot = event.originalBookingId && event.slotIndex !== undefined;
        const bookingIdToUpdate = isWebinarSlot ? event.originalBookingId : event._id;
  
        let bookingPayload = { ...event, _id: bookingIdToUpdate, start: newStartTime, end: newEndTime };
  
        if (isWebinarSlot) {
          const parentBooking = sessionsData?.regularBookings.find(b => b._id === bookingIdToUpdate);
          if (parentBooking && Array.isArray(parentBooking.webinarSlots)) {
            const updatedWebinarSlots = parentBooking.webinarSlots.map((slot, index) => 
              index === event.slotIndex ? { ...slot, startTime: newStartTime, endTime: newEndTime } : slot
            );
            bookingPayload.webinarSlots = updatedWebinarSlots;
            const slotStarts = updatedWebinarSlots.map(s => new Date(s.startTime).getTime());
            const slotEnds = updatedWebinarSlots.map(s => new Date(s.endTime).getTime());
            bookingPayload.start = new Date(Math.min(...slotStarts)).toISOString();
            bookingPayload.end = new Date(Math.max(...slotEnds)).toISOString();
          }
        }
        await updateBooking(bookingIdToUpdate, bookingPayload);
        toast.success(t('managesessions:sessionUpdated'));
      }
      await refetchSessions();
    } catch (error) {
      toast.error(t('managesessions:errorUpdatingSession') + (error.response?.data?.message ? `: ${error.response.data.message}` : ''));
      await refetchSessions();
    }
  }, [refetchSessions, t, sessionsData]);

  const handleDeleteSession = useCallback(async () => {
    if (!sessionToDelete) return;
    try {
      await deleteSession(sessionToDelete.id);
      await refetchSessions();
      toast.success(t('managesessions:sessionDeleted'));
    } catch (error) {
      console.error('[ManageSessions] Error deleting session:', error);
      toast.error(t('managesessions:errorDeletingSession'));
    } finally {
        setIsDeleteDialogOpen(false);
        setSessionToDelete(null);
    }
  }, [sessionToDelete, refetchSessions, t]);

  const handleAddSession = useCallback(() => {
    setSelectedSession(null);
    setShowAddEditModal(true);
  }, []);

  const handleSaveSession = useCallback(async (
      bookingPayloadFromModal, newImageFileObjectsArg, newCourseMaterialFilesArg, 
      originalSessionImagesFromDB, originalCourseMaterialsFromDB
    ) => {
    if (bookingPayloadFromModal.isAvailability) return;

    let sessionsToProcessForSave = bookingPayloadFromModal.isRecurring && !bookingPayloadFromModal._id
      ? generateRecurringSessions(bookingPayloadFromModal)
      : [bookingPayloadFromModal];
    
    const allCurrentBookingsForOverlap = [...(sessionsData?.availability || []), ...(sessionsData?.regularBookings || [])];
    const existingConflicts = allCurrentBookingsForOverlap.filter(existingEvent => 
      (existingEvent._id || existingEvent.id) !== (sessionsToProcessForSave[0]._id || sessionsToProcessForSave[0].id) &&
      isOverlapping(sessionsToProcessForSave[0], existingEvent)
    );

    if (existingConflicts.length > 0 && !bookingPayloadFromModal._id) { 
      setConflicts(existingConflicts.map(conflictingSession => ({ session1: sessionsToProcessForSave[0], session2: conflictingSession })));
      setShowConflictResolution(true);
      return; 
    }

    try {
      for (const individualSessionPayload of sessionsToProcessForSave) {
        const savedBookingResponse = individualSessionPayload._id
          ? { booking: await updateBooking(individualSessionPayload._id, individualSessionPayload) }
          : await createBooking(individualSessionPayload);

        if (!savedBookingResponse?.booking?._id || !savedBookingResponse.booking.sessionLink?.sessionId) {
          throw new Error('Failed to process booking details or obtain session link.');
        }
        
        const resultingBooking = savedBookingResponse.booking;
        const sessionLinkSessionIdForFiles = resultingBooking.sessionLink.sessionId;
        const shouldProcessFiles = (!bookingPayloadFromModal.isRecurring || !!bookingPayloadFromModal._id || individualSessionPayload === sessionsToProcessForSave[0]);

        if (shouldProcessFiles) {
          let finalImagesForPayload = [...(individualSessionPayload.sessionImages || [])];
          let finalMaterialsForPayload = [...(individualSessionPayload.courseMaterials || [])];

          const imagesToRemove = (originalSessionImagesFromDB || []).filter(orig => !finalImagesForPayload.some(kept => kept.publicId === orig.publicId));
          for (const img of imagesToRemove) await deleteSessionImage(sessionLinkSessionIdForFiles, img._id.toString());
          
          if (newImageFileObjectsArg?.length > 0) {
            for (const { file, _tempId, isMain } of newImageFileObjectsArg) {
              const res = await uploadSessionImage(sessionLinkSessionIdForFiles, file);
              const placeholderIndex = finalImagesForPayload.findIndex(img => img._tempId === _tempId);
              if (res.success && res.newImage && placeholderIndex !== -1) {
                finalImagesForPayload[placeholderIndex] = { ...res.newImage, isMain, _id: res.newImage._id };
              }
            }
          }
          individualSessionPayload.sessionImages = finalImagesForPayload.map(({_tempId, ...rest}) => rest);

          const materialsToRemove = (originalCourseMaterialsFromDB || []).filter(orig => !finalMaterialsForPayload.some(kept => kept.publicId === orig.publicId));
          for (const mat of materialsToRemove) await deleteSessionCourseMaterial(sessionLinkSessionIdForFiles, mat._id?.toString() || mat.publicId);

          if (newCourseMaterialFilesArg?.length > 0) {
            const filesOnly = newCourseMaterialFilesArg.map(obj => obj.file);
            const res = await uploadSessionCourseMaterials(sessionLinkSessionIdForFiles, filesOnly);
            if (res.success && Array.isArray(res.courseMaterials)) {
              newCourseMaterialFilesArg.forEach((originalFile, index) => {
                const serverMeta = res.courseMaterials[index];
                const placeholderIndex = finalMaterialsForPayload.findIndex(mat => mat._tempId === originalFile._tempId);
                if (serverMeta && placeholderIndex !== -1) {
                  finalMaterialsForPayload[placeholderIndex] = { ...serverMeta, _id: serverMeta._id };
                }
              });
            }
          }
          individualSessionPayload.courseMaterials = finalMaterialsForPayload.map(({_tempId, file, ...rest}) => rest);

          await updateBooking(resultingBooking._id, individualSessionPayload);
        }
      }
      await refetchSessions();
    } catch (error) {
      toast.error(t('managesessions:errorSavingSession') + (error.response?.data?.message ? `: ${error.response.data.message}`: ''));
      throw error; 
    }
  }, [userId, t, refetchSessions, sessionsData, setConflicts, setShowConflictResolution]);
  
  const handleConflictResolution = useCallback(async (keptSession, removedSession) => {
    try {
      await deleteSession(removedSession.id);
      await updateSession(keptSession.id, keptSession);
      await refetchSessions();
      setConflicts([]);
      setShowConflictResolution(false);
    } catch (error) {
      toast.error(t('managesessions:errorResolvingConflict'));
    }
  }, [refetchSessions, t]);
  
  const getTranslatedSessionTypeName = useCallback((typeId) => {
    if (!sessionTypes) return '';
    const type = sessionTypes.find(t => t.id === typeId);
    if (!type) return '';
    const translationKey = `sessionTypes_${typeId}`;
    return sessionTypeTranslations?.translations?.[translationKey]?.translation || type.name;
  }, [sessionTypes, sessionTypeTranslations]);

  const handleSessionTypeToggle = (typeId) => {
    setSelectedSessionTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    );
  };

  const handleDoubleClickEvent = useCallback((event) => {
    setSelectedSession(event);
    if (event.isAvailability) {
      setShowAvailabilityModal(true);
    } else {
      setShowBookingDetailsModal(true);
    }
  }, []);

const handleManageAvailability = useCallback(() => {
    if (!canManageAvailability(userId)) {
      toast.error(t('managesessions:notAuthorizedToManageAvailability'));
      return;
    }
    const newAvailabilityDefaults = {
      isRecurring: false,
      selectedDates: [],
    };
    setSelectedSession(newAvailabilityDefaults);
    setShowAvailabilityModal(true);
  }, [canManageAvailability, userId, t]);
  
  const handleSaveAvailability = useCallback(async (availabilityData) => {
    if (!canManageAvailability(userId)) {
      toast.error(t('managesessions:notAuthorizedToManageAvailability'));
      return;
    }
    try {
      const sessionType = sessionTypes.find(type => type.id === availabilityData.sessionTypeId) || { id: '66ec551a4a8965b22af33fe3', name: 'Availability' };
      const payload = {
        ...availabilityData,
        coach: userId, user: userId,
        sessionType: { _id: sessionType.id, name: sessionType.name },
        isAvailability: true, price: null, payment: null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        title: availabilityData.title || t('managesessions:availabilitySlot'),
        status: 'confirmed',
        priceOverride: availabilityData.priceOverride, 
      };
      if (payload._id) {
        await updateSession(payload._id, payload);
      } else {
        await createBooking(payload);
      }
      await refetchSessions();
      toast.success(t('managesessions:availabilitySaved'));
      setShowAvailabilityModal(false);
    } catch (error) {
      toast.error(t('managesessions:errorSavingAvailability'));
    }
  }, [userId, t, refetchSessions, canManageAvailability, sessionTypes]);

  const handleDeleteAvailability = useCallback(async (availabilityId) => {
    try {
      await deleteSession(availabilityId);
      await refetchSessions();
      toast.success(t('managesessions:availabilityDeleted'));
    } catch (error) {
      toast.error(t('managesessions:errorDeletingAvailability'));
    }
  }, [refetchSessions, t]);

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

  const handleNavigation = useCallback((actionOrDate) => {
    logger.info('[ManageSessions] Navigation action received', { action: actionOrDate, currentView: viewType });

    if (actionOrDate instanceof Date && !isNaN(actionOrDate.getTime())) {
      setCurrentDate(actionOrDate);
      return;
    }
    
    if (typeof actionOrDate === 'string') {
      const mDate = moment(currentDate);
      let newDate;

      switch (actionOrDate.toUpperCase()) {
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
          logger.warn(`[ManageSessions] Unknown string navigation action: ${actionOrDate}`);
          return;
      }

      if (newDate && !isNaN(newDate.getTime())) {
        setCurrentDate(newDate);
      } else {
        logger.error('[ManageSessions] Failed to calculate new date', { action: actionOrDate });
        toast.error(t('managesessions:errorNavigatingCalendar'));
      }
      return;
    }

    logger.warn('[ManageSessions] Invalid argument passed to handleNavigation', { arg: actionOrDate });
  }, [currentDate, viewType, t]);

  const filteredSessions = useMemo(() => {
    if (!sessionsData) return [];
  
    const allSessions = [
      ...(sessionsData.availability || []).map(session => ({
        ...session, start: new Date(session.start), end: new Date(session.end), isAvailability: true,
        title: session.title || t('managesessions:availabilitySlot'),
        sessionType: session.sessionType || { _id: session.type || '66ec551a4a8965b22af33fe3', name: 'Availability' },
      })),
      ...(sessionsData.regularBookings || []).filter(b => !b.isLiveSession).flatMap(booking => {
        const baseBooking = { ...booking, isAvailability: false, title: booking.title || t('managesessions:session'),
          sessionType: booking.sessionType || { _id: typeof booking.sessionType === 'string' ? booking.sessionType : (booking.sessionType?._id || booking.type), name: booking.sessionTypeName || 'Session' },
        };
        const typeId = typeof baseBooking.sessionType === 'string' ? baseBooking.sessionType : baseBooking.sessionType?._id?.toString();
  
        if (typeId === WEBINAR_TYPE_ID_STRING && Array.isArray(booking.webinarSlots) && booking.webinarSlots.length > 0) {
          return booking.webinarSlots.map((slot, index) => {
            const start = new Date(slot.startTime);
            const end = new Date(slot.endTime);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
            return { ...baseBooking, start, end, _id: `${booking._id}_slot_${index}`, originalBookingId: booking._id, slotIndex: index };
          }).filter(Boolean);
        }
        return [{ ...baseBooking, start: new Date(booking.start), end: new Date(booking.end) }];
      }),
    ];
  
    const hiddenStatuses = [
      'declined', 
      'cancelled_by_coach', 
      'cancelled_by_client', 
      'cancelled_by_admin',
      'cancelled_due_to_reschedule'
    ];
    const visibleSessions = allSessions.filter(session => !hiddenStatuses.includes(session.status));

    return selectedSessionTypes.length === sessionTypes.length
      ? visibleSessions
      : visibleSessions.filter(session => {
          let id = typeof session.sessionType === 'string' ? session.sessionType : session.sessionType?._id?.toString();
          return selectedSessionTypes.includes(id);
        });
  }, [sessionsData, selectedSessionTypes, sessionTypes.length, t]);

  const legendItems = useMemo(() => {
    const items = {
      available: false,
      requested: false,
      confirmedTypes: new Map(),
    };

    if (!filteredSessions || !sessionTypes) {
      return items;
    }

    const getColorClassForEvent = (event) => {
      const sessionTypeId = event.sessionType?._id || event.sessionType;
      if (event.isAvailability) return 'bg-green-500';
      if (event.status === 'requested') return 'bg-amber-500';
      if (sessionTypeId === SESSION_TYPE_IDS.ONE_ON_ONE) return 'bg-blue-500';
      if (event.maxAttendees > 1) return 'bg-violet-500';
      return 'bg-slate-400';
    };

    filteredSessions.forEach(event => {
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
  }, [filteredSessions, getTranslatedSessionTypeName, sessionTypes]);


   const formats = {
    ...getCalendarFormats(localizer),
    eventTimeRangeFormat: () => '',
  };

  const eventPropGetter = useCallback(
    () => ({
      className: '!m-0 !p-0 !border-0 !rounded-none',
    }),
    []
  );

      const calendarProps = useMemo(() => ({
      localizer,
      events: filteredSessions,
      startAccessor: "start",
      endAccessor: "end",
      style: { height: `${calendarHeight}vh`, minHeight: '500px' },
      views: ['month', 'week', 'day'],
      step: 30,
      timeslots: 2,
      min: moment().startOf('day').toDate(),
      max: moment().endOf('day').toDate(),
      scrollToTime: moment().startOf('day').add(6, 'hours').toDate(),
      formats: formats,
      messages: { today: t('common:today'), next: t('common:next'), previous: t('common:prev'), month: t('common:month'), week: t('common:week'), day: t('common:day') },
      onSelectEvent: handleSelectEvent,
      onSelectSlot: handleSelectSlot,
      selectable: true,
      resizable: true,
      onEventDrop: handleDragEvent,
      onEventResize: handleDragEvent,
      onDoubleClickEvent: handleDoubleClickEvent,
      eventPropGetter: eventPropGetter,
      view: viewType,
      onView: setViewType,
      date: currentDate,
      onNavigate: setCurrentDate,
      toolbar: false,
      components: {
          event: (props) => (
              <EventComponent 
                  {...props} 
                  calendarOwnerId={userId}
              />
          )
      }
  }), [filteredSessions, handleSelectEvent, handleSelectSlot, handleDragEvent, handleDoubleClickEvent, userId, eventPropGetter, viewType, currentDate, t, calendarHeight]);

  const handleOpenEditModalFromDetails = useCallback((sessionToEdit) => {
    setSelectedSession(sessionToEdit);
    setShowBookingDetailsModal(false);
    setShowAddEditModal(true);
  }, []);

  const handleCloseBookingDetailsModal = useCallback(() => {
    setShowBookingDetailsModal(false);
    setSelectedSession(null);
  }, []);

  if (isLoadingTypes || isLoadingSettings || isLoadingSessions) return <LoadingSpinner />;
  if (error) return <div className="p-4 text-destructive">{error}</div>;

  return (
    <ErrorBoundary>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
            {t('managesessions:manageSessions')}
          </h1>
         <div className="flex items-center flex-wrap gap-2">
          {canManageAvailability(userId) && (
    <Button 
        onClick={handleManageAvailability}
        className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800"
    >
        <PlusCircle className="mr-2 h-4 w-4" />
        {t('managesessions:manageAvailability')}
    </Button>
)}
            <Button onClick={handleAddSession}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('managesessions:addSession')}
            </Button>
           
            <Button variant="outline" onClick={() => setShowList(!showList)}>
                {showList ? <CalendarIcon className="mr-2 h-4 w-4" /> : <List className="mr-2 h-4 w-4" />}
                {showList ? t('managesessions:showCalendar') : t('managesessions:showList')}
            </Button>
          </div>
        </div>
        
       {showList ? (
          <ListView 
            sessions={filteredSessions}
            onEditSession={handleSelectEvent}
          />
        ) : (
         <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
            <CalendarToolbar
              currentDate={currentDate}
              onNavigate={handleNavigation}
              view={viewType}
              onView={setViewType}
              sessionTypes={sessionTypes}
              selectedSessionTypes={selectedSessionTypes}
              onFilterChange={handleSessionTypeToggle}
              getTranslatedSessionTypeName={getTranslatedSessionTypeName}
              onZoom={handleZoom}
              zoomDisabled={{
                out: calendarHeight <= 70,
                in: calendarHeight >= 210,
              }}
            />
            <div className="p-2 md:p-4">
              <div style={{ height: '70vh', overflowY: 'auto' }}>
                <DraggableCalendar {...calendarProps} />
              </div>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {showAddEditModal && (
            <AddEditSessionModal
              isOpen={showAddEditModal}
              onClose={() => { setShowAddEditModal(false); setSelectedSession(null); }}
              onSave={handleSaveSession}
              sessionData={selectedSession}
              sessionTypes={sessionTypes}
              coachId={userId}
              existingSessions={[...(sessionsData?.availability || []), ...(sessionsData?.regularBookings || [])]}
              coachSettings={coachSettings}
            />
          )}

          {showBookingDetailsModal && selectedSession && (
            <BookingDetailsModal
              bookingId={selectedSession.originalBookingId || selectedSession._id}
              existingBooking={selectedSession}
              isInitialData={true}
              onClose={handleCloseBookingDetailsModal}
              onOpenEditModal={handleOpenEditModalFromDetails}
              onSave={handleSaveSession}
              sessionTypes={sessionTypes}
              source="manage-sessions-calendar"
            />
          )}
          
          {showAvailabilityModal && (
            <ManageAvailabilityModal
              isOpen={showAvailabilityModal}
              onClose={() => setShowAvailabilityModal(false)}
              onSave={handleSaveAvailability}
              onDelete={handleDeleteAvailability}
              availabilityData={selectedSession}
              coachId={userId}
              sessionTypes={sessionTypes || []}
            />
          )}

          {showConflictResolution && (
            <ConflictResolution
              conflicts={conflicts}
              onResolve={handleConflictResolution}
              onClose={() => setShowConflictResolution(false)}
            />
          )}

          {showSettings && (
            <CoachSettings
              userId={userId}
              onClose={() => setShowSettings(false)}
              onSettingsUpdated={refetchSessions}
            />
          )}
        </AnimatePresence>
        
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('managesessions:confirmDeleteSessionTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('managesessions:confirmDeleteSession')}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setSessionToDelete(null)}>{t('common:cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSession}>{t('common:confirm')}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

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
                {t('managesessions:timezone')}: {moment.tz.guess()}
            </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default ManageSessions;