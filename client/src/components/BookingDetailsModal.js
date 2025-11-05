import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, Users, MessageSquare, CreditCard, AlertCircle, CheckCircle, Video, Globe, User, ChevronDown, ChevronUp, Loader2, PlusCircle, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Download, FileText, Check, Trash2, Info, Undo, AlertTriangle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useBookingActions } from '../hooks/useBookingActions';
import { useToast } from '../hooks/useToast';
import PropTypes from 'prop-types';
import { getBookingDetails, getBookingPublicSummary, updateBooking, updateBookingOvertimeSettings, registerForWebinar, calculateCancellationDetails, cancelBookingByCoach, cancelBookingByClient, checkRescheduleEligibility, requestReschedule, getCoachAvailabilityForReschedule, submitCoachTimeProposal, respondToTimeProposal, cancelWebinarRegistrationByClient, requestRescheduleByClient, proposeRescheduleByCoach, respondToCoachRescheduleProposalByClient } from '../services/bookingAPI';
import { getSessionRecordings, getBookingOvertimeSettings, getSessionDetails } from '../services/sessionAPI';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent 
} from './ui/card.tsx';
import { Badge } from './ui/badge.tsx';
import { useQueryClient } from 'react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog.tsx';
import { Textarea } from './ui/textarea.tsx';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import BookingActions from './BookingActions';
import ErrorBoundary from './ErrorBoundary';
import LoadingSpinner from './LoadingSpinner';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar.tsx';
import { Button } from './ui/button.tsx';
import { formatDate, formatTime, calculateDuration } from '../utils/dateUtils';
import { usePermissions } from '../hooks/usePermission';
import { useProfilePicture } from '../hooks/useProfilePicture';
import PaymentPopup from './payment/PaymentPopup';
import { usePayment } from '../contexts/PaymentContext';
import {  PaymentOrchestrator } from  '../services/PaymentOrchestratorService';
import {  PAYMENT_STEPS, PAYMENT_TIMING  } from '../constants/paymentConstants';
import ContextualMessageInput from './messaging/ContextualMessageInput';
import { Switch } from './ui/switch.tsx';
import { Input } from './ui/input.tsx';
import { useConnectionCheck } from '../hooks/useConnectionCheck';
import WebinarSessionForm from './sessionForms/WebinarSessionForm';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';
import moment from 'moment';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import SuggestAlternativeTimeModal from './SuggestAlternativeTimeModal';
import PolicyDisplay from './PolicyDisplay';
import SessionLocationDisplay from './SessionLocationDisplay';
import RefundRequestModal from './refunds/RefundRequestModal';
import RefundResponseModal from './refunds/RefundResponseModal';
import { CoachRefundModal } from './refunds/CoachRefundModal';
import CancellationModal from './refunds/CancellationModal';
import WebinarPricingInterface from './WebinarPricingInterface';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.jsx';

const MODAL_STATES = {
  BOOKING: 'booking',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_ACTIVE: 'payment_active',
  PAYMENT_COMPLETE: 'payment_complete',
  PAYMENT_FAILED: 'payment_failed'
};

const WEBINAR_TYPE_ID_STRING_CONST = '66ec54f94a8965b22af33fd9';

const getInitials = (firstName = '', lastName = '') => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

const getSessionTypeNameFromList = (typeId, typesList) => {
  if (!typeId || !typesList || !typesList.length) return null;
  const foundType = typesList.find(st => st.id === typeId);
  return foundType?.name || null;
};

const typeSpecificFields = {
  '66ec4ea477bec414bf2b8859': ['sessionGoal', 'clientNotes', 'preparationRequired', 'followUpTasks'],
  '66ec54f44a8965b22af33fd5': ['minAttendees', 'maxAttendees', 'sessionTopic', 'prerequisites', 'earlyBirdDeadline', 'earlyBirdPrice'],
  '66ec54f94a8965b22af33fd9': ['webinarTitle', 'webinarPlatform', 'webinarLink', 'earlyBirdDeadline', 'earlyBirdPrice'],
  '66ec54fe4a8965b22af33fdd': ['workshopTitle', 'learningObjectives', 'materialsProvided', 'whatToBring', 'skillLevel', 'earlyBirdDeadline', 'earlyBirdPrice'],
};

const BookingDetailsModal = ({ 
  bookingId, 
  onClose, 
  onSuggest, 
  existingBooking, 
  isLoadingProp,
  isInitialData = false,
  source, 
  initialAction,
  onOpenEditModal,
  onSave,
  sessionTypes,
   onCancelBookingInitiate,
}) => {
const renderCountRef = useRef(0);
  const prevPropsRef = useRef({ bookingId, onClose, onSuggest, existingBooking, isLoadingProp, isInitialData, source, initialAction, onOpenEditModal, onSave, sessionTypes, onCancelBookingInitiate });
  const renderReasonRef = useRef('Initial Render');
  const initialActionHandled = useRef(false);



  renderCountRef.current += 1;
  if (renderCountRef.current > 1) {
      const currentProps = { bookingId, onClose, onSuggest, existingBooking, isLoadingProp, isInitialData, source, initialAction, onOpenEditModal, onSave, sessionTypes, onCancelBookingInitiate };
      const changedProps = Object.keys(currentProps).filter(
          key => prevPropsRef.current[key] !== currentProps[key]
      );
      
      if (changedProps.length > 0) {
          renderReasonRef.current = `Props changed: ${changedProps.join(', ')}`;
          const changesDetail = changedProps.reduce((acc, key) => {
              acc[key] = { from: 'ref A', to: 'ref B', note: 'Reference changed' };
              return acc;
          }, {});
          logger.debug('[BDM Perf Debug] Prop changes detected:', changesDetail);
      } else {
          renderReasonRef.current = 'Internal state or context update';
      }
      prevPropsRef.current = currentProps;
  }
  
  logger.debug(`[BDM Render] BookingDetailsModal rendering. Count: ${renderCountRef.current}. Reason: ${renderReasonRef.current}`);
  const { t, i18n } = useTranslation(['bookings', 'common']);

  const { showToast } = useToast();
  const navigate = useNavigate(); 
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [message, setMessage] = useState('');
  const { acceptBooking, declineBooking } = useBookingActions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { isCoach, canManageAvailability } = usePermissions();
  const [expanded, setExpanded] = useState(false);
  const isUserCoach = user?.role === 'coach';
  const { stripePromise } = usePayment();

  // Session link state
  const [sessionUrl, setSessionUrl] = useState('');
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isRecordingsExpanded, setIsRecordingsExpanded] = useState(false);
  const [isParticipantsExpanded, setIsParticipantsExpanded] = useState(false);
  const [isMaterialsExpanded, setIsMaterialsExpanded] = useState(false);
  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaymentInProgress, setIsPaymentInProgress] = useState(false);
  const [overtimeSettings, setOvertimeSettings] = useState(null);
  const [isEditingOvertime, setIsEditingOvertime] = useState(false);
  const [overtimeForm, setOvertimeForm] = useState({
    allowOvertime: false,
    freeOvertimeDuration: 0,
    paidOvertimeDuration: 0,
    overtimeRate: 0,
  });
  const [overtimeErrors, setOvertimeErrors] = useState({});
  const [isOvertimeExpanded, setIsOvertimeExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [internalFormData, setInternalFormData] = useState(null);
  const [internalFormErrors, setInternalFormErrors] = useState({});
  const [isInternalSubmitting, setIsInternalSubmitting] = useState(false);
  const [coachSettingsForForm, setCoachSettingsForForm] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [webinarPaymentConfig, setWebinarPaymentConfig] = useState(null);
  const [paymentPopupProps, setPaymentPopupProps] = useState({});
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [currentGalleryImageIndex, setCurrentGalleryImageIndex] = useState(0);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationDetails, setCancellationDetails] = useState(null);
  const [isCalculatingCancellation, setIsCalculatingCancellation] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleEligibility, setRescheduleEligibility] = useState(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [coachAvailability, setCoachAvailability] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [selectedRescheduleSlots, setSelectedRescheduleSlots] = useState([]);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);
  const [availabilityCalendarMonth, setAvailabilityCalendarMonth] = useState(new Date());
  const [tempSelectedDate, setTempSelectedDate] = useState(null);
  const [isPolicyExpanded, setIsPolicyExpanded] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showRefundResponseModal, setShowRefundResponseModal] = useState(false);
  const [showCoachRefundModal, setShowCoachRefundModal] = useState(false);

  const modalRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const [isPositionManagedByJS, setIsPositionManagedByJS] = useState(false);

  const [showSuggestAlternativeTimeModal, setShowSuggestAlternativeTimeModal] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !modalRef.current) return;
      const newX = e.clientX - dragStartOffset.x;
      const newY = e.clientY - dragStartOffset.y;
      setPosition({ x: newX, y: newY });
    };
    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartOffset]);

  useEffect(() => {
    if (modalRef.current) {
      if (isPositionManagedByJS) {
        modalRef.current.style.setProperty('top', `${position.y}px`, 'important');
        modalRef.current.style.setProperty('left', `${position.x}px`, 'important');
        modalRef.current.style.setProperty('transform', 'none', 'important');
        modalRef.current.style.setProperty('margin', '0px', 'important');
      } else {
        modalRef.current.style.removeProperty('top');
        modalRef.current.style.removeProperty('left');
        modalRef.current.style.removeProperty('transform');
        modalRef.current.style.removeProperty('margin');
      }
    }
  }, [isPositionManagedByJS, position]);

  const handleMouseDownOnTitle = (e) => {
    if (e.button !== 0 || !modalRef.current) return;
    const modalRect = modalRef.current.getBoundingClientRect();
    const currentStartX = isPositionManagedByJS ? position.x : modalRect.left;
    const currentStartY = isPositionManagedByJS ? position.y : modalRect.top;
    if (!isPositionManagedByJS) {
      setPosition({ x: currentStartX, y: currentStartY });
      setIsPositionManagedByJS(true);
    }
    setIsDragging(true);
    setDragStartOffset({
      x: e.clientX - currentStartX,
      y: e.clientY - currentStartY,
    });
    e.preventDefault();
  };

    const [originalFormData, setOriginalFormData] = useState(null);
    const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);

const handleLocationEditToggle = useCallback(() => {
    setIsEditingDetails(prev => !prev);
}, []);

const formatDateTimeForDisplay = useCallback((dateStrOrObj) => {
  if (!dateStrOrObj) return t('common:notSet');
  const date = new Date(dateStrOrObj);
  return date.toLocaleString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}, [i18n.language, t]);

const formatDateForDisplay = useCallback((dateStrOrObj) => {
  if (!dateStrOrObj) return t('common:notSet');
  const date = new Date(dateStrOrObj);
  return date.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' });
}, [i18n.language, t]);

const formatTimeForDisplay = useCallback((dateStrOrObj) => {
  if (!dateStrOrObj) return t('common:notSet');
  const date = new Date(dateStrOrObj);
  return date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
}, [i18n.language, t]);

const actualApiBookingId = useMemo(() => {
    if (existingBooking?.originalBookingId) {
     
      return existingBooking.originalBookingId;
    }
    if (bookingId && bookingId.includes('_slot_')) {
        const extractedId = bookingId.split('_slot_')[0];
        logger.warn('[BookingDetailsModal] Using actualApiBookingId extracted from prop bookingId. This is a fallback if existingBooking.originalBookingId was not present, which might indicate an issue in ManageSessions event propagation.', { extractedId, propBookingId: bookingId });
        return extractedId;
    }
   
    return bookingId;
  }, [bookingId, existingBooking]);

  useEffect(() => {
    logger.info('[BookingDetailsModal] Mounted. Checking for onSave prop.', {
        bookingId: actualApiBookingId,
        hasOnSave: typeof onSave === 'function',
        source: source,
    });
}, [onSave, actualApiBookingId, source]);

const { data: publicBookingSummary, isLoading: isLoadingPublicSummary } = useQuery(
    ['bookingPublicSummary', actualApiBookingId],
    () => getBookingPublicSummary(actualApiBookingId),
    {
      enabled: !!actualApiBookingId,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      structuralSharing: true,
      onError: (err) => {
        logger.warn(`[BDM] Could not fetch public summary for ${actualApiBookingId}.`, { error: err.message });
      }
    }
  );

  const canAccessPrivateDetails = useMemo(() => {
    const baseData = publicBookingSummary || existingBooking;
    if (!user || !baseData) return false;

    const isCoach = user.role === 'coach' && baseData.coach?._id === user._id;
    if (isCoach) return true;

    const isConfirmedAttendee = baseData.attendeesCount > 0 && Array.isArray(baseData.attendees) 
      ? baseData.attendees.some(att => att.user?._id === user._id && att.status === 'confirmed')
      : false;

    return isConfirmedAttendee;
  }, [publicBookingSummary, existingBooking, user]);

  useEffect(() => {
    logger.debug('[BDM Perf] publicBookingSummary object reference changed.');
  }, [publicBookingSummary]);

  const { data: fetchedBookingDocument, error, isLoading: isLoadingPrivateDetails } = useQuery(
    ['booking', actualApiBookingId],
    () => getBookingDetails(actualApiBookingId),
    {
      enabled: !!actualApiBookingId && canAccessPrivateDetails,
      staleTime: 5000,
      onError: (err) => {
        if (err.response?.status !== 403) {
          logger.error(`[BDM] Error fetching private booking document for ID: ${actualApiBookingId}`, { error: err.message });
        }
      }
    }
  );

  useEffect(() => {
    logger.debug('[BDM Perf] fetchedBookingDocument object reference changed.');
  }, [fetchedBookingDocument]);

  const bookingData = useMemo(() => {
    if (fetchedBookingDocument) {
      return fetchedBookingDocument;
    }
    if (publicBookingSummary) {
      return publicBookingSummary;
    }
    if (existingBooking) {
      return existingBooking;
    }
    return null;
  }, [fetchedBookingDocument, publicBookingSummary, existingBooking]);

  useEffect(() => {
    logger.debug('[BDM Perf] bookingData object reference changed.');
  }, [bookingData]);

  const currentDisplayBooking = bookingData;

    

  const isAlreadyBooked = useMemo(() => {
    if (!bookingData?.attendees || !user?._id) {
        if (bookingData?.attendeesCount > 0) {
            return false;
        }
        return false;
    }
    return bookingData.attendees.some(
      att => att.user && (att.user._id?.toString() === user._id || att.user.toString() === user._id) && att.status === 'confirmed'
    );
  }, [bookingData?.attendees, bookingData?.attendeesCount, user?._id]);
  
  const isCurrentUserCoachOfThisBooking = useMemo(() => {
    if (!user || user.role !== 'coach' || !bookingData?.coach) return false;
    const coachId = typeof bookingData.coach === 'object' ? bookingData.coach._id : bookingData.coach;
    return String(user._id) === String(coachId);
  }, [user?._id, user?.role, bookingData?.coach]);

  const canAccessContent = useMemo(() => {
    return !!fetchedBookingDocument;
  }, [fetchedBookingDocument]);

  const fetchCoachAvailability = async (dateForMonth) => {
    if (!currentDisplayBooking?.coach || !actualApiBookingId || !currentDisplayBooking?.start || !currentDisplayBooking?.end) {
      logger.warn('[BookingDetailsModal fetchCoachAvailability] Bailing: Missing required data for fetching availability.', {
        hasCoach: !!currentDisplayBooking?.coach,
        hasBookingId: !!actualApiBookingId,
        hasBookingStart: !!currentDisplayBooking?.start,
        hasBookingEnd: !!currentDisplayBooking?.end,
      });
      return;
    }
    
    const coachId = typeof currentDisplayBooking.coach === 'object' ? currentDisplayBooking.coach._id : currentDisplayBooking.coach;

    logger.info('[BookingDetailsModal fetchCoachAvailability] Attempting to fetch availability.', {
        coachId,
        actualApiBookingId,
        month: dateForMonth.getMonth() + 1,
        year: dateForMonth.getFullYear(),
    });
    setIsLoadingAvailability(true);
    setCoachAvailability([]);
    try {
      const month = dateForMonth.getMonth() + 1;
      const year = dateForMonth.getFullYear();
      const availabilityData = await getCoachAvailabilityForReschedule(
        coachId,
        actualApiBookingId,
        currentDisplayBooking.start,
        currentDisplayBooking.end,
        month,
        year
      );
      logger.info('[BookingDetailsModal fetchCoachAvailability] Successfully fetched availability.', { count: availabilityData.availableSlots?.length || 0 });
      setCoachAvailability(availabilityData.availableSlots || []);
    } catch (error) {
      logger.error('[BookingDetailsModal] Error fetching coach availability for reschedule:', error);
      showToast({ type: 'error', message: t('bookings:errors.fetchAvailabilityFailed') });
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  
  
  const handleRescheduleMonthChange = (date) => {
    setAvailabilityCalendarMonth(date);
    fetchCoachAvailability(date);
    setTempSelectedDate(null); 
    setSelectedRescheduleSlots([]); 
  };

  const handleRescheduleDateSelect = (date) => {
    setTempSelectedDate(date);
    setSelectedRescheduleSlots([]); 
  };
  
  const toggleRescheduleSlot = (slot) => {
    setSelectedRescheduleSlots(prev => {
      const isSelected = prev.some(s => new Date(s.start).getTime() === new Date(slot.start).getTime());
      if (isSelected) {
        return prev.filter(s => new Date(s.start).getTime() !== new Date(slot.start).getTime());
      } else {
        if (prev.length < 3) {
          return [...prev, slot];
        }
        showToast({type: 'info', message: t('bookings:maxRescheduleSlotsReached')});
        return prev;
      }
    });
  };

const handleConfirmReschedule = async (submittedSlots, clientMessage) => {
  if (!submittedSlots || submittedSlots.length === 0) {
    showToast({ type: 'error', message: t('bookings:errors.selectRescheduleSlot') });
    setIsSubmittingReschedule(false); 
    return;
  }
  setIsSubmittingReschedule(true);
  try {
    const payload = {
      proposedSlots: submittedSlots.map(s => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })),
      requestMessage: clientMessage,
    };
    const result = await requestRescheduleByClient(actualApiBookingId, payload);
    
    showToast({ type: 'success', message: result.isAutomatic ? t('bookings:rescheduleConfirmedAutomatically') : t('bookings:rescheduleRequestSent') });
      
    queryClient.invalidateQueries(['booking', actualApiBookingId]);
    queryClient.invalidateQueries(['userSessions']);
    queryClient.invalidateQueries(['userCalendar']);
      
    setShowSuggestAlternativeTimeModal(false); 
    onClose();
  } catch (error) {
    logger.error('[BookingDetailsModal] Error submitting reschedule request:', error);
    showToast({ type: 'error', message: error.response?.data?.message || error.message || t('bookings:errors.rescheduleRequestFailed') });
  } finally {
    setIsSubmittingReschedule(false);
  }
};

  const handleOpenSuggestAlternativeTimeModal = () => {
  if (!currentDisplayBooking) {
    logger.warn('[BookingDetailsModal] Attempted to open SuggestAlternativeTimeModal without currentDisplayBooking.');
    return;
  }
  setShowSuggestAlternativeTimeModal(true);
};

const handleCoachSubmitProposalCallback = async (bookingIdToUpdate, slots, message) => {
  if (!currentDisplayBooking) throw new Error("Booking data not available.");
  setIsLoading(true); 
  try {
    await proposeRescheduleByCoach(bookingIdToUpdate, { proposedSlots: slots.map(s => ({start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString()})), reason: message });
    showToast({ type: 'success', message: t('bookings:proposalSentSuccessfully') });
    queryClient.invalidateQueries(['booking', actualApiBookingId]);
    queryClient.invalidateQueries(['userSessions']);
    queryClient.invalidateQueries(['userCalendar']);
    queryClient.invalidateQueries(['coachSessions', currentDisplayBooking?.coach?._id]);
    setShowSuggestAlternativeTimeModal(false);
  } catch (error) {
    logger.error('[BookingDetailsModal] Error submitting coach time proposal:', error);
    throw error; 
  } finally {
    setIsLoading(false);
  }
};

const handleClientRespondToProposalCallback = async (bookingIdToUpdate, coachRequestId, action, selectedSlot, message) => {
  if (!currentDisplayBooking) throw new Error("Booking data not available.");
  setIsLoading(true);
  try {
    const selectedTimePayload = selectedSlot ? { start: new Date(selectedSlot.start).toISOString(), end: new Date(selectedSlot.end).toISOString() } : null;
    await respondToCoachRescheduleProposalByClient(bookingIdToUpdate, coachRequestId, action, selectedTimePayload, message);
    showToast({ type: 'success', message: t('bookings:proposalResponseSent') });
    queryClient.invalidateQueries(['booking', actualApiBookingId]);
    queryClient.invalidateQueries(['userSessions']);
    queryClient.invalidateQueries(['userCalendar']);
    queryClient.invalidateQueries(['coachSessions', currentDisplayBooking?.coach?._id]);
    setShowSuggestAlternativeTimeModal(false);
  } catch (error) {
    logger.error('[BookingDetailsModal] Error responding to time proposal:', error);
    throw error;
  } finally {
    setIsLoading(false);
  }
};

const handleClientRescheduleInitiate = async () => {
    logger.info('[BookingDetailsModal handleClientRescheduleInitiate] Initiating reschedule process.', { actualApiBookingId });
    setIsCheckingEligibility(true);
    setRescheduleEligibility(null);
    try {
      const eligibilityData = await checkRescheduleEligibility(actualApiBookingId);
      logger.info('[BookingDetailsModal handleClientRescheduleInitiate] Eligibility check response received.', { eligibilityData });
      setRescheduleEligibility(eligibilityData);
if (eligibilityData.canReschedule) {
    logger.info('[BookingDetailsModal handleClientRescheduleInitiate] Client can reschedule. Setting eligibility and attempting to show SuggestAlternativeTimeModal.');
       setShowSuggestAlternativeTimeModal(true); 
} else {
        logger.warn('[BookingDetailsModal handleClientRescheduleInitiate] Client cannot reschedule.', { reason: eligibilityData.reason });
        showToast({ type: 'info', message: eligibilityData.reason || t('bookings:errors.rescheduleNotAllowed') });
      }
    } catch (error) {
      logger.error('[BookingDetailsModal] Error checking reschedule eligibility:', error);
      showToast({ type: 'error', message: error.message || t('bookings:errors.rescheduleEligibilityCheckFailed') });
    } finally {
      setIsCheckingEligibility(false);
      logger.info('[BookingDetailsModal handleClientRescheduleInitiate] Finished reschedule initiation attempt.');
    }
  };

   const isDeepEqual = (obj1, obj2) => {
    if (!obj1 || !obj2) return obj1 === obj2;

    const replacer = (key, value) => {
      if (value instanceof File) {
        return { _isFile: true, name: value.name, size: value.size, type: value.type };
      }
      if (value instanceof Date) {
        return value.getTime();
      }
      if (key === "_tempId" || (typeof key === 'string' && key.startsWith('__'))) {
        return undefined;
      }
      return value;
    };
    return JSON.stringify(obj1, replacer) === JSON.stringify(obj2, replacer);
  };
  
    const sessionTypeIdFromBooking = useMemo(
    () => currentDisplayBooking?.sessionType?._id || currentDisplayBooking?.sessionType,
    [currentDisplayBooking]
  );

   const isWebinarType = useMemo(() => sessionTypeIdFromBooking === '66ec54f94a8965b22af33fd9', [sessionTypeIdFromBooking]);

   const isCoachOfBooking = useMemo(() => {
    if (!user || user.role !== 'coach' || !currentDisplayBooking || !currentDisplayBooking.coach) return false;
    const bookingCoachRef = currentDisplayBooking.coach;
    const bookingCoachId = typeof bookingCoachRef === 'object' ? bookingCoachRef._id : bookingCoachRef;

    const comparison = String(user._id) === String(bookingCoachId);
     logger.debug('[BDM isCoachOfBooking Check]', {
        isCoach: comparison,
        loggedInUserId: user._id,
        bookingCoachIdFromRef: bookingCoachId,
        bookingCoachRefType: typeof bookingCoachRef,
    });
    return comparison;
  }, [user, currentDisplayBooking]);

   const coachCanRespondToRefundRequest = useMemo(() => {
        if (!currentDisplayBooking || !isCoachOfBooking) return false;
        
        const ticket = currentDisplayBooking.disputeTicket;
        return ticket && ticket.status === 'awaiting_coach_response';
    }, [currentDisplayBooking, isCoachOfBooking]);

const canCoachCancelThisBooking = useMemo(() => {
    if (!currentDisplayBooking || !isCoachOfBooking) return false;

    const terminalOrNonCancellableByCoachStatuses = [
        'cancelled', 
        'cancelled_by_client', 
        'cancelled_by_coach', 
        'cancelled_by_admin',
        'cancelled_due_to_reschedule',
        'completed', 
        'no_show'
    ];
    if (terminalOrNonCancellableByCoachStatuses.includes(currentDisplayBooking.status)) {
        logger.debug('[BDM canCoachCancelThisBooking] Status not cancellable by coach.', { currentStatus: currentDisplayBooking.status });
        return false;
    }
    
    logger.debug('[BDM canCoachCancelThisBooking] Conditions met. Coach can cancel this booking.', { bookingId: currentDisplayBooking._id, status: currentDisplayBooking.status, isWebinarType });
    return true;
}, [currentDisplayBooking, isCoachOfBooking, isWebinarType]);

  const isClientOfBooking = useMemo(() => {
    if (!user || !currentDisplayBooking) return false;

    let bookingUserRef = currentDisplayBooking.user;
    let bookingUserId = null;

    if (bookingUserRef) {
        bookingUserId = typeof bookingUserRef === 'object' ? bookingUserRef._id : bookingUserRef;
    } else if (isWebinarType && Array.isArray(currentDisplayBooking.attendees) && currentDisplayBooking.attendees.length > 0) {
        // For webinars, if top-level user is null, check if logged-in user is among attendees
        const attendeeEntry = currentDisplayBooking.attendees.find(att => {
            const attendeeUserObj = att.user;
            const attendeeUserId = typeof attendeeUserObj === 'object' ? attendeeUserObj?._id : attendeeUserObj;
            return String(attendeeUserId) === String(user._id);
        });
        if (attendeeEntry) {
            // If found, consider this user the client for action purposes in this context
            bookingUserId = user._id; 
            logger.debug('[BDM isClientOfBooking Check] Logged-in user found in webinar attendees.', {
                loggedInUserId: user._id,
                attendeeEntryUser: attendeeEntry.user
            });
        }
    }
    
    const comparison = bookingUserId ? String(user._id) === String(bookingUserId) : false;

    logger.debug('[BDM isClientOfBooking Check]', {
        isClient: comparison,
        loggedInUserId: user._id,
        derivedBookingUserId: bookingUserId,
        bookingUserRefAtStart: currentDisplayBooking.user, // Log original state
        isWebinarTypeCheck: isWebinarType,
        attendeesCount: currentDisplayBooking.attendees?.length
    });
    return comparison;
  }, [user, currentDisplayBooking, isWebinarType]);

  

const clientCanReschedule = useMemo(() => {
    if (!currentDisplayBooking || !user || !isClientOfBooking || new Date(currentDisplayBooking.start) < new Date()) return false;
    const nonReschedulableStatuses = ['cancelled', 'cancelled_by_client', 'cancelled_by_coach', 'completed', 'no_show', 'declined'];
    if (nonReschedulableStatuses.includes(currentDisplayBooking.status)) return false;
    
    const sessionIsOneOnOne = currentDisplayBooking.sessionType && 
                              !['66ec54f94a8965b22af33fd9', '66ec54f44a8965b22af33fd5', '66ec54fe4a8965b22af33fdd'].includes(
                                typeof currentDisplayBooking.sessionType === 'object' ? currentDisplayBooking.sessionType._id?.toString() : currentDisplayBooking.sessionType?.toString()
                              );
    return sessionIsOneOnOne; 
  }, [currentDisplayBooking, user, isClientOfBooking]);
  
 const isCurrentUserTheBookingCoach = useMemo(
    () => user?.role === 'coach' && isCoachOfBooking, // Uses the robust check
    [user, isCoachOfBooking]
  );
  
  const isWebinarFull = useMemo(() => {
      if (!currentDisplayBooking || typeof currentDisplayBooking.maxAttendees !== 'number') return false;
      return (currentDisplayBooking.attendees?.length || 0) >= currentDisplayBooking.maxAttendees;
  }, [currentDisplayBooking?.attendees, currentDisplayBooking?.maxAttendees]);

  const applicablePriceInfo = useMemo(() => {
   

    if (!currentDisplayBooking || !isWebinarType) {
        logger.warn('[applicablePriceInfo] Bailing early: No currentDisplayBooking or not a webinar type.', {
            isWebinarType,
            hasCurrentDisplayBooking: !!currentDisplayBooking,
        });
        return { amountDisplay: t('common:notAvailable'), currency: '', reason: '', amount: 0, isEarlyBird: false };
    }
    
    const now = new Date();
    let displayAmount;
    let reason = '';
    let isEarlyBird = false;
    const currency = currentDisplayBooking.price?.currency || 'CHF';

    const ebPrice = currentDisplayBooking.earlyBirdPrice;
    const ebDeadlineString = currentDisplayBooking.earlyBirdDeadline;

    let numericEbPrice = typeof ebPrice === 'string' ? parseFloat(ebPrice) : ebPrice;
    const isEbPriceNumberValid = numericEbPrice != null && typeof numericEbPrice === 'number' && isFinite(numericEbPrice) && numericEbPrice > 0;
    
    let ebDeadlineDate = null;
    if (ebDeadlineString) {
        ebDeadlineDate = new Date(ebDeadlineString);
    }
    const isEbDeadlineDateValid = ebDeadlineDate instanceof Date && !isNaN(ebDeadlineDate);
    const isEbCurrentlyActive = isEbDeadlineDateValid && now < ebDeadlineDate;

   

    if (isEbPriceNumberValid && isEbCurrentlyActive) {
        displayAmount = numericEbPrice;
        reason = ` (${t('bookings:earlyBird')})`;
        isEarlyBird = true;
        
    } else {
        displayAmount = currentDisplayBooking.price?.final?.amount?.amount;
      
    }

    if (typeof displayAmount !== 'number' || isNaN(displayAmount)) {
        logger.error('[applicablePriceInfo] Final displayAmount is not a valid number or not configured.', { 
            bookingId: currentDisplayBooking._id,
            calculatedDisplayAmount: displayAmount,
            regularPriceSource: currentDisplayBooking.price?.final?.amount?.amount,
            ebPriceSource: numericEbPrice,
         });
        return { amountDisplay: t('common:notConfigured'), currency, reason: '', amount: 0, isEarlyBird: false };
    }

    return { 
        amount: displayAmount, 
        amountDisplay: `${displayAmount.toFixed(2)} ${currency}`, 
        reason, 
        currency,
        isEarlyBird
    };
  }, [currentDisplayBooking, isWebinarType, t]);
  
  const firstWebinarSlot = useMemo(() => 
      currentDisplayBooking?.webinarSlots && currentDisplayBooking.webinarSlots.length > 0 
          ? currentDisplayBooking.webinarSlots[0] 
          : null,
  [currentDisplayBooking?.webinarSlots]);
  
  const webinarEffectiveStartTime = useMemo(() => {
      if (!isWebinarType) return new Date(0); 
      return firstWebinarSlot 
          ? new Date(firstWebinarSlot.startTime) 
          : (currentDisplayBooking?.start ? new Date(currentDisplayBooking.start) : new Date(0));
  }, [firstWebinarSlot, currentDisplayBooking?.start, isWebinarType]);
  
  const canBookWebinar = useMemo(() => 
      isWebinarType &&
      !isCurrentUserCoachOfThisBooking && 
      !isAlreadyBooked && 
      !isWebinarFull && 
      webinarEffectiveStartTime > new Date(),
  [isWebinarType, isCurrentUserCoachOfThisBooking, isAlreadyBooked, isWebinarFull, webinarEffectiveStartTime]);
  
  const isBookingClosed = useMemo(() => isWebinarType && webinarEffectiveStartTime <= new Date(), [isWebinarType, webinarEffectiveStartTime]);

  const isCoachCreatedSessionType = useMemo(() => {
    if (!sessionTypeIdFromBooking) {
      logger.warn('[BookingDetailsModal] sessionTypeIdFromBooking is undefined', {
        bookingId: actualApiBookingId, // Use actualApiBookingId for consistency in logging
        currentDisplayBookingId: currentDisplayBooking?._id,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
    const result =
      isWebinarType ||
      sessionTypeIdFromBooking === '66ec54f44a8965b22af33fd5' ||
      sessionTypeIdFromBooking === '66ec54fe4a8965b22af33fdd';
    
    return result;
  }, [isWebinarType, sessionTypeIdFromBooking, actualApiBookingId, currentDisplayBooking?._id]); // Added currentDisplayBooking?._id

  const shouldBeEditableInThisModal = useMemo(() => {
    const result = isCoachCreatedSessionType && isCurrentUserTheBookingCoach; // Use isCurrentUserTheBookingCoach
    
    return result;
  }, [isCoachCreatedSessionType, isCurrentUserTheBookingCoach, actualApiBookingId]); 

  const isCoachAuthoredAndNoClient = useMemo(() => 
    !currentDisplayBooking?.user && isCurrentUserCoachOfThisBooking && isCoachCreatedSessionType,
    [currentDisplayBooking, isCurrentUserCoachOfThisBooking, isCoachCreatedSessionType]
  );

  const hasUnsavedChanges = useMemo(() => {
    if (!originalFormData || !internalFormData || !shouldBeEditableInThisModal) {
      return false;
    }
    return !isDeepEqual(originalFormData, internalFormData);
  }, [originalFormData, internalFormData, shouldBeEditableInThisModal]);

  const activeCoachProposalForClient = useMemo(() => {
    if (currentDisplayBooking?.status === 'pending_reschedule_coach_request' && Array.isArray(currentDisplayBooking.rescheduleRequests)) {
      const request = currentDisplayBooking.rescheduleRequests
        .filter(r => r.status === 'pending_client_action' && r.proposedBy?.toString() !== user?._id?.toString())
        .sort((a, b) => new Date(b.proposedAt) - new Date(a.proposedAt))[0];
  
      if (request) {
        return {
          requestId: request._id,
          proposerRole: 'coach', 
          proposedSlots: request.proposedSlots.map(s => ({ start: new Date(s.start), end: new Date(s.end) })),
          proposerMessage: request.requestMessage || request.reason || request.coachMessage, 
        };
      }
    }
    return null;
  }, [currentDisplayBooking, user]);


  const openImageGallery = (index = 0) => {
    setCurrentGalleryImageIndex(index);
    setShowImageGallery(true);
  };

  const closeImageGallery = () => {
    setShowImageGallery(false);
  };

  const nextGalleryImage = () => {
    setCurrentGalleryImageIndex((prevIndex) => (prevIndex + 1) % (currentDisplayBooking?.sessionImages?.length || 1));
  };

  const prevGalleryImage = () => {
   
    setCurrentGalleryImageIndex((prevIndex) => (prevIndex - 1 + (currentDisplayBooking?.sessionImages?.length || 1)) % (currentDisplayBooking?.sessionImages?.length || 1));
  };

  const galleryImages = useMemo(() => {
    if (currentDisplayBooking && currentDisplayBooking.sessionImages && currentDisplayBooking.sessionImages.length > 0) {
      return currentDisplayBooking.sessionImages.filter(img => img.url);
    }
    return [];
  }, [currentDisplayBooking]);

  const titlePictureDisplayUrl = useMemo(() => {
    if (galleryImages.length > 0) {
      const mainImage = galleryImages.find(img => img.isMain === true);
      const picToDisplay = mainImage || galleryImages[0];
      return picToDisplay?.url || null;
    }
    return null;
  }, [galleryImages]);

  const clientParticipantId = useMemo( // This was correctly placed
    () => currentDisplayBooking?.user?._id,
    [currentDisplayBooking]
  );

  const { isConnected: isConnectedToClient, isLoading: isLoadingConnection } = useConnectionCheck( // Correctly placed
      user?._id,
      clientParticipantId
  );

  const { data: sessionData, isLoading: recordingsLoading, error: recordingsError } = useQuery( // Correctly placed
    ['sessionRecordings', actualApiBookingId], 
    () => getSessionRecordings(actualApiBookingId), 
    {
      enabled: !!actualApiBookingId && !!currentDisplayBooking, 
    onSuccess: (data) => {
        logger.info('[BookingDetailsModal] Session recordings loaded', {
          actualBookingId: actualApiBookingId, 
          recordingCount: data.recordings.length,
        });
      },
      onError: (err) => {
        logger.error('[BookingDetailsModal] Error fetching session recordings:', { actualBookingId: actualApiBookingId, error: err.message });
      },
    }
  );
  
  const { data: overtimeData, isLoading: overtimeLoading, error: overtimeError } = useQuery(
    ['overtimeSettings', actualApiBookingId],
    () => getBookingOvertimeSettings(actualApiBookingId),
    {
      enabled: !!actualApiBookingId && !!currentDisplayBooking && isCurrentUserTheBookingCoach, // ADDED isCurrentUserTheBookingCoach
      onSuccess: (data) => {
       
        setOvertimeSettings(data);
        setOvertimeForm({
          allowOvertime: data?.allowOvertime ?? false,
          freeOvertimeDuration: data?.freeOvertimeDuration ?? 0,
          paidOvertimeDuration: data?.paidOvertimeDuration ?? 0,
          overtimeRate: data?.overtimeRate ?? 0,
        });
      },
      onError: (err) => {
        logger.error('[BookingDetailsModal] Error fetching overtime settings:', { actualBookingId: actualApiBookingId, error: err.message, response: err.response?.data });
        if (err.response?.status !== 403) { // Avoid toast for 403 if query somehow still runs
            showToast({
              type: 'error',
              message: t('bookings:errors.fetchOvertimeSettings'),
            });
        }
      },
    }
  );

  useEffect(() => {

  
    return () => {
     
  
      if (!showPaymentPopup) {
        PaymentOrchestrator.handleCleanup(actualApiBookingId, {
          source: 'booking_details_modal',
          reason: 'component_unmount',
          preserveState: false,
        });
      }
    };
  }, [bookingId, showPaymentPopup, currentDisplayBooking, actualApiBookingId]);

const sessionLinkData = bookingData?.sessionLink;
  const bookingDataId = bookingData?._id;

  useEffect(() => {
    if (!bookingDataId) {
      logger.warn('[BookingDetailsModal] No booking data available to retrieve session link');
      setSessionLoading(false);
      setSessionError(t('bookings:errors.noBookingData'));
      return;
    }

    if (sessionLinkData && sessionLinkData.sessionId && sessionLinkData.token) {
      const baseUrl = process.env.REACT_APP_FRONTEND_URL || 'http://localhost:3000';
      if (!process.env.REACT_APP_FRONTEND_URL) {
        logger.error('[BookingDetailsModal] REACT_APP_FRONTEND_URL not defined; using fallback', {
          bookingId: bookingDataId,
        });
      }
      const newSessionUrl = `${baseUrl}/video-conference/${sessionLinkData.sessionId}?token=${sessionLinkData.token}`;
    
      setSessionUrl(newSessionUrl);
      setSessionLoading(false);
      setSessionError(null);
    } else {
      logger.warn('[BookingDetailsModal] Session link missing or incomplete', {
        bookingId: bookingDataId,
        sessionLink: sessionLinkData,
      });
      setSessionLoading(false);
      setSessionError(t('bookings:errors.noSessionLink'));
    }
  }, [sessionLinkData, bookingDataId]);

 useEffect(() => {
    // Find the Dialog's overlay element (Radix UI typically adds data attributes)
    const dialogOverlay = document.querySelector('[data-radix-overlay],[data-radix-dialog-overlay]');
    
    if (dialogOverlay) {
      // Disable pointer events on BDM's overlay if any subsequent modal/overlay is active
       if (showPaymentPopup || showImageGallery || showCancelModal || showSuggestAlternativeTimeModal)  {
        dialogOverlay.classList.add('disable-pointer-events');
        if (showPaymentPopup) {
          
        }
        if (showImageGallery) {
            
        }
      } else {
        // Restore pointer events for BDM's overlay if it's the topmost active modal
        dialogOverlay.classList.remove('disable-pointer-events');
       
      }
    } else {
      logger.warn('[BookingDetailsModal] Dialog overlay not found for pointer events toggle', {
        bookingId,
        timestamp: new Date().toISOString(),
      });
    }
  
    // Cleanup on unmount
    return () => {
      if (dialogOverlay) {
        // Always attempt to remove the class on unmount, just in case
        dialogOverlay.classList.remove('disable-pointer-events');
      }
    };
 }, [showPaymentPopup, showImageGallery, showCancelModal, showSuggestAlternativeTimeModal, bookingId]);

  useEffect(() => {
    const handlePaymentNotification = (event) => {
      const notification = event.detail;
      if (notification.type === 'payment_received' && notification.metadata?.bookingId === bookingId) {
       
        queryClient.setQueryData(['booking', bookingId], (oldData) => {
          const updatedData = {
            ...oldData,
            payment: { ...oldData?.payment, status: 'completed' },
          };
        
          return updatedData;
        });
        queryClient.invalidateQueries(['booking', bookingId]);
      }
    };
  
    window.addEventListener('notification', handlePaymentNotification);
    return () => {
      window.removeEventListener('notification', handlePaymentNotification);
     
    };
  }, [bookingId, queryClient]);

  useEffect(() => {
    if (overtimeData) {
     
      setOvertimeSettings(overtimeData);
      setOvertimeForm({
        allowOvertime: overtimeData?.allowOvertime ?? false,
        freeOvertimeDuration: overtimeData?.freeOvertimeDuration ?? 0,
        paidOvertimeDuration: overtimeData?.paidOvertimeDuration ?? 0,
        overtimeRate: overtimeData?.overtimeRate ?? 100,
      });
    }
  }, [overtimeData, bookingId]);

 

    const shouldShowActions = (booking, user) => {
    if (!booking || !user) return false;
    
    const isBookingRequested = booking.status === 'requested';
    const isUserCoach = user?.role === 'coach';
    
    // Show actions for coach when they aren't the client
    if (isUserCoach) {
      return isBookingRequested && booking.user?._id !== user._id;
    }
    
    // Show actions for client when they aren't the coach
    return isBookingRequested && booking.coach?._id !== user._id;
  };

const getStatusBadge = (status) => {
    const statusConfig = {
      confirmed: { icon: CheckCircle, className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
      pending: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400' },
      requested: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400' },
      declined: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
      cancelled: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
      cancelled_by_client: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
      cancelled_by_coach: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
      completed: { icon: CheckCircle, className: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
      pending_payment: { icon: CreditCard, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400' },
      no_show: { icon: User, className: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
      pending_reschedule_coach_request: { icon: Clock, className: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400' },
      pending_reschedule_client_request: { icon: Clock, className: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400' },
    };

    const config = statusConfig[status] || statusConfig.pending;

    return (
      <Badge variant="outline" className={`flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1 text-xs sm:text-sm ${config.className}`}>
        <config.icon className="h-3.5 w-3.5" />
        <span className="font-medium">{t(`bookings:status.${status}`)}</span>
      </Badge>
    );
  };

  const handleAction = async (action) => {
    try {
    
      
      switch (action) {
        case 'accept':
          await acceptBooking(bookingId, message);
          showToast({
            type: 'success',
            message: t('bookings:acceptSuccess')
          });
          break;
        case 'decline':
          await declineBooking(bookingId, message);
          showToast({
            type: 'success',
            message: t('bookings:declineSuccess')
          });
          break;
        case 'message':
          setShowMessageInput(true);
          return;
        case 'reschedule':
          setIsRescheduling(true);
          break;
        default:
          logger.warn('[BookingDetailsModal] Unknown action:', action);
          return;
      }

      queryClient.invalidateQueries(['booking', bookingId]);
      onClose();
    } catch (error) {
      logger.error('[BookingDetailsModal] Action error:', error);
      showToast({
        type: 'error',
        message: t('common:errors.actionFailed')
      });
    }
  };

const handleCopyLink = useCallback((urlToCopy) => {
    if (!urlToCopy) {
      logger.warn('[BookingDetailsModal] Attempted to copy link, but no URL was provided.');
      showToast({ type: 'error', message: t('bookings:errors.copySessionLink') });
      return;
    }
    navigator.clipboard.writeText(urlToCopy).then(() => {
      setCopied(true);
      showToast({
        type: 'success',
        message: t('bookings:sessionLinkCopied')
      });
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      logger.error('[BookingDetailsModal] Failed to copy session link:', err);
      showToast({
        type: 'error',
        message: t('bookings:errors.copySessionLink')
      });
    });
  }, [showToast, t]);

const renderMessageInput = () => {
    if (!showMessageInput) return null;

    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="mt-4 p-4 bg-muted/50 dark:bg-muted/20 rounded-lg"
      >
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('bookings:enterMessage')}
          className="min-h-[80px]"
        />
        <div className="flex justify-end space-x-2 mt-4">
          <Button
            onClick={() => setShowMessageInput(false)}
            variant="outline"
          >
            {t('common:cancel')}
          </Button>
          <Button
            onClick={() => {
              handleAction(message);
              setShowMessageInput(false);
            }}
          >
            {t('common:send')}
          </Button>
        </div>
      </motion.div>
    );
  };
const renderParticipants = (currentBookingData, currentUser, isConnected, connectionLoading) => {
  if (!currentBookingData || !currentDisplayBooking.coach) {
      logger.warn('[BookingDetailsModal.renderParticipants] No booking data or coach missing.', { bookingId: currentBookingData?._id });
      return null;
  }

  const bookingParticipants = [];
  if (currentDisplayBooking.coach) {
    bookingParticipants.push({ data: currentDisplayBooking.coach, isBookingCoach: true, displayRole: t('bookings:coach') });
  }

  if (isWebinarType) {
    if (Array.isArray(currentDisplayBooking.attendees)) {
      currentDisplayBooking.attendees.forEach(attendee => {
        if (attendee.user && attendee.status === 'confirmed') {
          const attendeeUserObject = typeof attendee.user === 'object' ? attendee.user : { _id: attendee.user }; 
          if (attendeeUserObject._id !== currentDisplayBooking.coach?._id) {
            bookingParticipants.push({ data: attendeeUserObject, isBookingCoach: false, displayRole: t('bookings:attendee') });
          }
        }
      });
    }
  } else {
    if (currentDisplayBooking.user) {
      bookingParticipants.push({ data: currentDisplayBooking.user, isBookingCoach: false, displayRole: t('bookings:client') });
    }
  }
  
  const getParticipantInteractionState = (participantData, isCoachParticipant) => {
      let isClickable = false;
      let targetUrl = '';
      let tooltipContent = null;
      let opensInNewTab = false; 
      const participantId = participantData._id;
      const profileVisibility = participantData.settings?.profileVisibility;
      let ariaLabel = `${participantData.firstName || ''} ${participantData.lastName || ''}`;
      let baseAriaLabel = ariaLabel;

      if (user?._id === participantId) {
          isClickable = true;
          targetUrl = '/profile/me'; 
          opensInNewTab = true;
          ariaLabel = t('common:viewYourProfile');
          tooltipContent = null;
      } else if (isCoachParticipant) {
          isClickable = true;
          targetUrl = `/coach/${participantId}`; 
          opensInNewTab = true; 
          ariaLabel = `${t('common:viewProfileOf')} ${baseAriaLabel} (${t('bookings:coach')})`;
          tooltipContent = null;
      } else { 
          const effectiveVisibility = profileVisibility || 'private';
          targetUrl = `/profile/${participantId}`; 
          const baseClickableAriaLabel = `${t('common:viewProfileOf')} ${baseAriaLabel} (${t('bookings:client')})`;
          const baseNonClickableAriaLabel = `${t('common:viewProfileOf')} ${baseAriaLabel} (${t('bookings:client')})`;

          if (isLoadingConnection) {
              isClickable = false;
              opensInNewTab = false;
              tooltipContent = t('common:loadingConnectionStatus');
              ariaLabel = `${baseNonClickableAriaLabel} (${tooltipContent})`;
          } else if (effectiveVisibility === 'public') {
              isClickable = true;
              opensInNewTab = true; 
              ariaLabel = baseClickableAriaLabel;
          } else if (effectiveVisibility === 'connections') {
              isClickable = isConnectedToClient; 
              opensInNewTab = isConnectedToClient; 
              if (!isClickable) {
                  tooltipContent = t('bookings:profileVisibleConnectionsOnly');
                  ariaLabel = `${baseNonClickableAriaLabel} (${tooltipContent})`;
              } else {
                  ariaLabel = baseClickableAriaLabel;
              }
          } else { 
              isClickable = false;
              opensInNewTab = false;
              tooltipContent = t('bookings:profilePrivate');
              ariaLabel = `${baseNonClickableAriaLabel} (${tooltipContent})`;
          }
      }
      
      if (isClickable && (opensInNewTab || !tooltipContent) ) {
           tooltipContent = null;
      }

      return { isClickable, targetUrl, tooltipContent, ariaLabel, baseAriaLabel, participantId, opensInNewTab };
  };

    return (
      <Card className="bg-muted/30 dark:bg-muted/20">
        <CardContent className="p-4">
          <Collapsible onOpenChange={setIsParticipantsExpanded}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between text-left">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {bookingParticipants.map((p) => {
                      if (!p.data?._id) return null;
                      const profilePictureUrl = p.isBookingCoach 
                        ? p.data.coachProfilePicture?.url || p.data.profilePicture?.url || '' 
                        : p.data.profilePicture?.url || '';
                      return (
                        <Avatar key={p.data._id} className="h-6 w-6 border-2 border-background dark:border-muted">
                          <AvatarImage src={profilePictureUrl} alt={`${p.data.firstName} ${p.data.lastName}`} />
                          <AvatarFallback className="text-xs">{getInitials(p.data.firstName, p.data.lastName)}</AvatarFallback>
                        </Avatar>
                      );
                    })}
                  </div>
                  <h4 className="text-sm font-semibold">{t('bookings:participants')} ({bookingParticipants.filter(p => p.data && p.data._id).length})</h4>
                </div>
                <div className="p-0 -mr-2 h-8 w-8 flex items-center justify-center">
                  {isParticipantsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 overflow-hidden pt-3 border-t dark:border-border/50">
              <ul className="space-y-1">
                {bookingParticipants.map((p) => {
                  if (!p.data?._id) return null;
                  const participant = p.data;
                  const isCoachParticipant = p.isBookingCoach;
                  const { isClickable, targetUrl, tooltipContent, ariaLabel, baseAriaLabel, opensInNewTab } = getParticipantInteractionState(participant, isCoachParticipant);
                  const profilePictureUrl = isCoachParticipant 
                    ? participant.coachProfilePicture?.url || participant.profilePicture?.url || ''
                    : participant.profilePicture?.url || '';
                  
                  const handleInteraction = (e) => {
                    if (isClickable) {
                      e.stopPropagation();
                      if (opensInNewTab) window.open(targetUrl, '_blank', 'noopener,noreferrer');
                      else navigate(targetUrl);
                    }
                  };

                  const participantItem = (
                    <li
                      key={participant._id}
                      onClick={handleInteraction}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleInteraction(e)}
                      tabIndex={isClickable ? 0 : -1}
                      role={isClickable ? 'link' : undefined}
                      aria-label={ariaLabel}
                      className={`flex items-center gap-3 rounded-md p-1.5 transition-colors ${isClickable ? 'cursor-pointer hover:bg-background dark:hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring' : 'cursor-default'}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profilePictureUrl} alt={baseAriaLabel} />
                        <AvatarFallback>{getInitials(participant.firstName, participant.lastName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{baseAriaLabel}</span>
                        <span className="text-xs text-muted-foreground">{p.displayRole}</span>
                      </div>
                    </li>
                  );

                  if (tooltipContent && !isClickable) {
                    return (
                      <TooltipProvider key={`${participant._id}-tooltip`} delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>{participantItem}</TooltipTrigger>
                          <TooltipContent><p>{tooltipContent}</p></TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }
                  return participantItem;
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    );
};

const renderSessionDetails = (currentBookingData, isConnected, connectionLoading) => {
  if (!currentBookingData) {
    logger.warn('[BookingDetailsModal.renderSessionDetails] No booking data available', { bookingId });
    return null;
  }
  
  const isWebinarOrGroupType = 
  (typeof currentBookingData.sessionType === 'string' && 
   ['66ec54f94a8965b22af33fd9', '66ec54f44a8965b22af33fd5', '66ec54fe4a8965b22af33fdd'].includes(currentBookingData.sessionType)) ||
  (currentBookingData.sessionType?._id && 
   ['66ec54f94a8965b22af33fd9', '66ec54f44a8965b22af33fd5', '66ec54fe4a8965b22af33fdd'].includes(currentBookingData.sessionType._id.toString()));
  
  const summaryParticipants = [];
  if (currentBookingData.coach) {
      summaryParticipants.push({ data: currentBookingData.coach, isBookingCoach: true });
  }
  if (!isWebinarOrGroupType && currentBookingData.user) {
      if (!summaryParticipants.some(p => p.data._id === currentBookingData.user._id)) {
          summaryParticipants.push({ data: currentBookingData.user, isBookingCoach: false });
      }
  }
  const attendeesCount = isWebinarOrGroupType ? (currentBookingData.attendees || []).filter(att => att.status === 'confirmed').length : 0;

  const hasWebinarDetails = isWebinarOrGroupType && (
    currentBookingData.maxAttendees != null ||
    currentBookingData.webinarPlatform ||
    currentBookingData.webinarLanguage
  );

  const InfoItem = ({ icon: Icon, label, children }) => (
    <div className="flex items-start gap-2.5">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-semibold text-foreground">{children}</div>
      </div>
    </div>
  );

    return (
    <div className="space-y-4">
      <Card className="bg-muted/30 dark:bg-muted/20">
        <CardContent className="p-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <InfoItem icon={Calendar} label={t('bookings:date')}>
                {currentBookingData.start ? formatDateForDisplay(currentBookingData.start) : t('bookings:unknownDateTime')}
              </InfoItem>
              
             <InfoItem icon={Clock} label={t('bookings:time')}>
                {isWebinarType && currentDisplayBooking.webinarSlots && currentDisplayBooking.webinarSlots.length > 0 ? (
                  <div className="flex flex-col">
                    {currentDisplayBooking.webinarSlots.map((slot, index) => (
                      <span key={index} className="text-sm font-semibold text-foreground">
                        {slot.startTime && slot.endTime ? `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}` : t('common:notSet')}
                      </span>
                    ))}
                  </div>
                ) : (
                  currentDisplayBooking.start && currentDisplayBooking.end ? `${formatTime(currentDisplayBooking.start)} - ${formatTime(currentDisplayBooking.end)}` : t('common:notSet')
                )}
              </InfoItem>
              
              <InfoItem icon={Users} label={t('bookings:duration')}>
                {currentBookingData.start && currentDisplayBooking.end ? `${calculateDuration(currentBookingData.start, currentDisplayBooking.end)} ${t('bookings:minutes')}` : t('common:notAvailable')}
              </InfoItem>

              <InfoItem icon={Users} label={isWebinarOrGroupType ? (attendeesCount > 0 ? t('bookings:participants') : t('bookings:coach')) : t('bookings:participants')}>
                <div className="flex items-center">
                  <div className="flex -space-x-2">
                    {summaryParticipants.map((p) => {
                      if (!p.data?._id) return null;
                      const profilePictureUrl = p.isBookingCoach
                        ? p.data.coachProfilePicture?.url || p.data.profilePicture?.url || ''
                        : p.data.profilePicture?.url || '';
                      return (
                        <Avatar key={p.data._id} className="h-6 w-6 border-2 border-background dark:border-muted">
                          <AvatarImage src={profilePictureUrl} alt={`${p.data.firstName} ${p.data.lastName}`} />
                          <AvatarFallback className="text-xs">{getInitials(p.data.firstName, p.data.lastName)}</AvatarFallback>
                        </Avatar>
                      );
                    })}
                  </div>
                  {attendeesCount > 0 &&
                    <span className="pl-3 text-sm font-semibold text-foreground">
                      +{attendeesCount}
                    </span>
                  }
                </div>
              </InfoItem>
            </div>

            {hasWebinarDetails && (
              <>
                <div className="border-t border-border/50" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  {isWebinarOrGroupType && currentBookingData.maxAttendees != null && (
                    <InfoItem icon={Users} label={t('bookings:maxAttendees')}>
                      {currentBookingData.maxAttendees}
                    </InfoItem>
                  )}
                  {isWebinarOrGroupType && currentBookingData.webinarPlatform && (
                    <InfoItem icon={Video} label={t('bookings:platform')}>
                      {currentBookingData.webinarPlatform}
                    </InfoItem>
                  )}
                  {isWebinarOrGroupType && currentBookingData.webinarLanguage && (
                    <InfoItem icon={Globe} label={t('bookings:language')}>
                      {t(`common:${currentBookingData.webinarLanguage}`, currentBookingData.webinarLanguage)}
                    </InfoItem>
                  )}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

       {!currentBookingData.virtualMeeting?.joinUrl && (
        currentBookingData.webinarLink && isWebinarType ? (
            canAccessContent ? (
              <a href={currentBookingData.webinarLink.startsWith('http') ? currentBookingData.webinarLink : `https://${currentBookingData.webinarLink}`} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium text-primary hover:bg-muted/50 transition-colors" onClick={() => logger.info('[BookingDetailsModal] External webinar link clicked', { bookingId: currentBookingData._id, webinarLink: currentBookingData.webinarLink })}>
                  <Globe className="h-5 w-5" /> {t('bookings:joinWebinar')}
              </a>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium text-muted-foreground opacity-60">
                      <Globe className="h-5 w-5" /> {t('bookings:joinWebinar')}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent><p>{t('bookings:bookToAccess')}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
        ) : null
      )}

    </div>
  );
};

const handlePayNow = useCallback(async () => {
  try {
    setIsPaymentInProgress(true);

    // Step 1: Check if the booking data from the server already has a client secret.
    let clientSecret = currentDisplayBooking.payment?.stripe?.clientSecret || currentDisplayBooking.payment?.paymentRecord?.stripe?.clientSecret;

    // Step 2: If no client secret exists, call the backend to create one.
    if (!clientSecret) {
      logger.info('[BookingDetailsModal] No clientSecret found on booking. Creating new PaymentIntent.', { bookingId: actualApiBookingId });
      // Dynamically import to avoid circular dependency if paymentAPI imports something from a component.
      const paymentAPI = (await import('../services/paymentAPI')).default;
      const intentResponse = await paymentAPI.createPaymentIntent(actualApiBookingId, {
        price: currentDisplayBooking.price,
        metadata: { source: 'BookingDetailsModal_PayNow' }
      });
      clientSecret = intentResponse.clientSecret;
      
      if (!clientSecret) {
        throw new Error('Failed to create a payment intent. Client secret was not returned.');
      }
      
      // Optimistically update the local booking data in React Query's cache with the new secret.
      queryClient.setQueryData(['booking', actualApiBookingId], (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          payment: {
            ...oldData.payment,
            status: 'pending',
            stripe: {
              ...oldData.payment?.stripe,
              paymentIntentId: intentResponse.paymentIntent.id,
              clientSecret: clientSecret,
            },
          },
        };
      });
    } else {
      logger.info('[BookingDetailsModal] Found existing clientSecret on booking.', { bookingId: actualApiBookingId });
    }

    // Step 3: Initialize the PaymentOrchestrator with the now-guaranteed clientSecret.
    const flowId = currentDisplayBooking.payment?.stripe?.paymentIntentId || actualApiBookingId;
    await PaymentOrchestrator.initializePayment({
      flowId: flowId,
      bookingId: actualApiBookingId,
      amount: Math.round(currentDisplayBooking.price.final.amount.amount * 100),
      currency: currentDisplayBooking.price.currency || 'CHF',
      timing: PAYMENT_TIMING.IMMEDIATE,
      metadata: {
        bookingType: currentDisplayBooking.sessionType?.name || 'unknown',
        sessionType: currentDisplayBooking.sessionType?._id || 'unknown',
        duration: calculateDuration(currentDisplayBooking.start, currentDisplayBooking.end) || 60,
        priceStructure: currentDisplayBooking.price,
        confirmationId: actualApiBookingId,
        preserveOnUnmount: true,
        flowState: 'post_booking',
        isPreBooking: false,
        modalState: MODAL_STATES.PAYMENT_ACTIVE,
        paymentStep: PAYMENT_STEPS.METHOD,
        clientSecret: clientSecret, 
      },
    });

    // Step 4: Synchronize state and show the popup.
    const flowData = await PaymentOrchestrator.ensureFlowStateSynchronization(flowId, actualApiBookingId, { createIfMissing: true });
    if (!flowData) {
      throw new Error('Failed to synchronize payment flow state');
    }

    setShowPaymentPopup(true);

  } catch (error) {
    logger.error('[BookingDetailsModal] Error preparing payment flow', {
      error: error.message,
      bookingId: actualApiBookingId,
      timestamp: new Date().toISOString(),
    });
    showToast({ type: 'error', message: t('bookings:errors.paymentFlowError', 'Could not start payment process.') });
    setShowPaymentPopup(false);
  } finally {
    setIsPaymentInProgress(false);
  }
}, [actualApiBookingId, currentDisplayBooking, queryClient, showToast, t]);

 useEffect(() => {
    if (initialAction === 'pay_now' && currentDisplayBooking && !initialActionHandled.current) {
      initialActionHandled.current = true;
      handlePayNow();
    }
  }, [initialAction, currentDisplayBooking, handlePayNow]);

  const validateOvertimeForm = () => {
    const errors = {};
    const freeOvertime = overtimeForm.freeOvertimeDuration === '' ? 0 : Number(overtimeForm.freeOvertimeDuration);
    const paidOvertime = overtimeForm.paidOvertimeDuration === '' ? 0 : Number(overtimeForm.paidOvertimeDuration);
    const overtimeRate = overtimeForm.overtimeRate === '' ? 0 : Number(overtimeForm.overtimeRate);

    if (freeOvertime < 0) {
      errors.freeOvertimeDuration = t('bookings:errors.freeOvertimeNonNegative');
    }
    if (paidOvertime < 0) {
      errors.paidOvertimeDuration = t('bookings:errors.paidOvertimeNonNegative');
    }
    if (overtimeRate < 0) {
      errors.overtimeRate = t('bookings:errors.overtimeRateNonNegative');
    }

    setOvertimeErrors(errors);
   
    return Object.keys(errors).length === 0;
  };

  const handleOvertimeInputChange = (e) => {
    const { name, value, type, checked } = e.target;
  
    setOvertimeForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value === '' ? '' : Number(value) || 0,
    }));
  };

  const handleOvertimeSubmit = async (e) => {
    e.preventDefault();
    if (!validateOvertimeForm()) {
      showToast({
        type: 'error',
        message: t('bookings:errors.overtimeValidationFailed'),
      });
      return;
    }
  
    try {
      await updateBookingOvertimeSettings(actualApiBookingId, overtimeForm);
      setOvertimeSettings(overtimeForm);
      setIsEditingOvertime(false);
      setIsOvertimeExpanded(false); // Collapse the overtime section
      showToast({
        type: 'success',
        message: t('bookings:overtimeSettingsUpdated'),
      });
      queryClient.invalidateQueries(['overtimeSettings', actualApiBookingId]);
    } catch (error) {
      logger.error('[BookingDetailsModal] Error updating overtime settings:', error);
      showToast({
        type: 'error',
        message: t('bookings:errors.updateOvertimeSettings'),
      });
    }
  };


  const populateInternalFormData = useCallback((parentDocument) => {
    if (!parentDocument) {
      logger.warn('[BookingDetailsModal] populateInternalFormData called with null parentDocument. Form will be empty or use defaults.');
      setInternalFormData(null);
      return;
    }

  
    const isWebinarTypeFromParent = (parentDocument.sessionType?._id || parentDocument.sessionType) === '66ec54f94a8965b22af33fd9';
  
    const webinarSlotsForForm = (parentDocument.webinarSlots || []).map(slot => ({ 
      date: slot.date ? new Date(slot.date) : new Date(), 
      startTime: slot.startTime ? new Date(slot.startTime) : new Date(), 
      endTime: slot.endTime ? new Date(slot.endTime) : new Date(new Date().setHours(new Date().getHours() + 1)) 
    }));
    
    if (isWebinarTypeFromParent && webinarSlotsForForm.length === 0 && !parentDocument._id) { 
      webinarSlotsForForm.push({ date: new Date(), startTime: new Date(), endTime: new Date(new Date().setHours(new Date().getHours() + 1)) });
    }
  
    const formData = {
      id: parentDocument._id, // Ensure 'id' is part of the populated form data
      title: parentDocument.title || '',
      description: parentDocument.description || '',
      price: parentDocument.price?.base?.amount?.amount?.toString() || parentDocument.price?.final?.amount?.amount?.toString() || '0',
      currency: parentDocument.price?.currency || 'CHF',
      earlyBirdPrice: parentDocument.earlyBirdPrice?.toString() || '',
      earlyBirdDeadline: parentDocument.earlyBirdDeadline ? new Date(parentDocument.earlyBirdDeadline) : null,
      minAttendees: parentDocument.minAttendees?.toString() || '',
      maxAttendees: parentDocument.maxAttendees?.toString() || '',
      webinarPlatform: parentDocument.webinarPlatform || 'coachconnect',
      webinarLink: parentDocument.webinarLink || '',
      presenterBio: parentDocument.presenterBio || '',
      qaSession: parentDocument.qaSession || false,
      recordingAvailable: parentDocument.recordingAvailable || false,
      replayAccessDuration: parentDocument.replayAccessDuration?.toString() || '',
      isPublic: parentDocument.isPublic !== undefined ? parentDocument.isPublic : true,
      showInWebinarBrowser: parentDocument.showInWebinarBrowser !== undefined ? parentDocument.showInWebinarBrowser : true,
      webinarLanguage: parentDocument.webinarLanguage || 'en',
      location: parentDocument.location || '',
      isOnline: parentDocument.isOnline !== undefined ? parentDocument.isOnline : false,
      virtualMeeting: parentDocument.virtualMeeting || { joinUrl: '' },
      skillLevel: parentDocument.skillLevel || 'allLevels',
      webinarSlots: webinarSlotsForForm,
     sessionImages: parentDocument.sessionImages || [],
      courseMaterials: parentDocument.courseMaterials || [], 
      prerequisites: parentDocument.prerequisites || '',
      learningObjectives: parentDocument.learningObjectives || '',
      whatToBring: parentDocument.whatToBring || '',
      materialsProvided: parentDocument.materialsProvided || '',
      sessionTopic: parentDocument.sessionTopic || '',
      tags: parentDocument.tags || [],
      certificationOffered: parentDocument.certificationOffered || false,
      certificationDetails: parentDocument.certificationDetails || '',
      type: parentDocument.sessionType?._id || parentDocument.sessionType,
      availableForInstantBooking: parentDocument.availableForInstantBooking !== undefined ? parentDocument.availableForInstantBooking : false,
    };

  
 setInternalFormData(formData);
    setOriginalFormData(formData);
    
  }, [actualApiBookingId]);
  
useEffect(() => {
    const sourceData = fetchedBookingDocument || existingBooking;

    if (sourceData) {
        if (!internalFormData || internalFormData.id !== sourceData._id) {
            populateInternalFormData(sourceData);
        }
    }
}, [fetchedBookingDocument, existingBooking, populateInternalFormData, internalFormData]);

const handleInternalFormInputChange = useCallback(async (e) => {
    const { name, value, type, checked, files } = e.target;

    if (name === 'virtualMeeting') {
        setInternalFormData(prev => ({ ...prev, virtualMeeting: value }));
        return;
    }
   
    if (name === 'sessionImages_new_file') {
        if (files && files[0]) {
            setInternalFormData(prev => ({
                ...prev,
                sessionImages: [...(prev.sessionImages || []), files[0]] 
            }));
        }
        return;
    }
    if (name === 'sessionImages_new_file_multiple') {
         if (files && files.length > 0) {
             setInternalFormData(prev => ({
                ...prev,
                sessionImages: [...(prev.sessionImages || []), ...Array.from(files)]
            }));
         }
         return;
    }
    if (name === 'sessionImages_delete_id') {
        setInternalFormData(prev => {
            const imageToDelete = value; // This is image._id or the File object itself
            const updatedImages = (prev.sessionImages || []).filter(img => {
                if (img instanceof File) return img !== imageToDelete; // If value is the File object
                return img._id !== imageToDelete; // If value is the _id string
            });
            
            let mainStillExists = updatedImages.some(img => img.isMain);
            if (!mainStillExists && updatedImages.length > 0) {
                const firstImageAsMain = { ...updatedImages[0], isMain: true };
                updatedImages[0] = firstImageAsMain;
                for(let i = 1; i < updatedImages.length; i++) {
                    if (updatedImages[i].isMain) updatedImages[i] = { ...updatedImages[i], isMain: false };
                }
            } else if (updatedImages.length === 0) {
                // No images left, nothing to mark as main
            } else if (!mainStillExists && updatedImages.length > 0) { // Double check logic, should be covered
                updatedImages[0].isMain = true;
            }


            return { ...prev, sessionImages: updatedImages };
        });
        return;
    }
 if (name === 'sessionImages_set_main_id') {
        setInternalFormData(prev => {
            const imageToSetAsMain = value; 
            const newImages = (prev.sessionImages || []).map(img => ({
                ...img,
                isMain: (img instanceof File ? img === imageToSetAsMain : img._id === imageToSetAsMain)
            }));
            return { ...prev, sessionImages: newImages };
        });
        return;
    }
     if (name === 'sessionImages_reordered') {
        setInternalFormData(prev => ({ ...prev, sessionImages: value }));
        return;
    }

    setInternalFormData(prev => { // This part should remain
      let newValues = {};
      if (type === 'checkbox') {
        newValues = { [name]: checked };
      } else if (type === 'file') {
        if (name === 'titlePicture') { // This whole 'titlePicture' case can be removed
          // newValues = { [name]: e.target.files[0] || null }; 
        } else if (name === 'courseMaterials') {
          const newFiles = Array.from(e.target.files);
          const existingNonFileMaterials = (prev.courseMaterials || []).filter(item => !(item instanceof File));
          // const newFileObjects = (prev.courseMaterials || []).filter(item => item instanceof File); // This line is potentially problematic
          const currentFileObjects = (prev.courseMaterials || []).filter(item => item instanceof File); // Better naming
          newValues = { [name]: [...existingNonFileMaterials, ...currentFileObjects, ...newFiles] };
        }
      } else {
        newValues = { [name]: value };
      }
      return { ...prev, ...newValues };
    });
}, []);

const handleInternalWebinarSlotChange = useCallback((index, field, value) => {
  setInternalFormData(prev => {
      const updatedWebinarSlots = [...(prev.webinarSlots || [])];
      const currentSlot = { ...(updatedWebinarSlots[index] || {}) };

      if (field === 'date') currentSlot.date = value;
      else if (field === 'startTime') currentSlot.startTime = value;
      else if (field === 'endTime') currentSlot.endTime = value;
      
      if (field === 'startTime' && currentSlot.endTime && value >= currentSlot.endTime) {
          currentSlot.endTime = new Date(value.getTime() + 60 * 60 * 1000); 
      }
      updatedWebinarSlots[index] = currentSlot;
      return { ...prev, webinarSlots: updatedWebinarSlots };
  });
}, []);

const handleInternalRemoveWebinarSlot = (index) => {
  setInternalFormData(prev => ({...prev, webinarSlots: prev.webinarSlots.filter((_, i) => i !== index) }));
};

const handleInternalRemoveCourseMaterial = useCallback((indexToRemove) => {
  setInternalFormData(prev => {
      const updatedMaterials = prev.courseMaterials.filter((_, index) => index !== indexToRemove);
      return { ...prev, courseMaterials: updatedMaterials };
  });
}, []);

const handleInternalDateChange = useCallback((date, fieldName) => {
  setInternalFormData(prev => ({...prev, [fieldName]: date}));
}, []);

const handleCloseAttempt = () => {
  if (hasUnsavedChanges && shouldBeEditableInThisModal) {
    setShowUnsavedChangesModal(true);
  } else {
    onClose();
  }
};

const handleInternalSave = async () => {
   

    if (!internalFormData.type) {
        showToast({ type: 'error', message: t('managesessions:typeRequired') });
        return;
    }
    if (internalFormData.type !== '66ec54f94a8965b22af33fd9' && (!internalFormData.title || !internalFormData.title.trim())) {
        showToast({ type: 'error', message: t('managesessions:titleRequired') });
        return;
    }

    setIsInternalSubmitting(true);
    try {
        // Separate File objects from metadata within internalFormData
        const newSessionImageFiles = (internalFormData.sessionImages || []).filter(item => item instanceof File);
        const newCourseMaterialFiles = (internalFormData.courseMaterials || []).filter(item => item instanceof File);

        // Get metadata of existing (non-File) title picture from the form
        const existingSessionImagesMetaInForm = (internalFormData.sessionImages || []).filter(
            item => item && typeof item === 'object' && !(item instanceof File) && item.url 
        );
        
        // Get metadata of existing (non-File) course materials from the form
        const existingCourseMaterialsMetaInForm = (internalFormData.courseMaterials || []).filter(
            item => item && typeof item === 'object' && !(item instanceof File)
        );

       logger.debug('[BookingDetailsModal handleInternalSave] Files & Metadata separation:', {
            newSessionImageFilesCount: newSessionImageFiles.length,
            newCourseMaterialFilesCount: newCourseMaterialFiles.length,
            existingSessionImagesMetaInFormCount: existingSessionImagesMetaInForm.length,
            existingCourseMaterialsMetaInFormCount: existingCourseMaterialsMetaInForm.length
        });

        // Prepare the bookingPayload for onSave:
        // This payload contains all text fields and settings.
        // It should NOT contain the raw File objects for titlePicture or courseMaterials.
        // It should also NOT contain the metadata for new files, as that will be generated by the upload process in the parent.
        // It SHOULD contain the metadata for *existing* files that are being kept.
        
        const bookingPayloadForOnSave = {
            ...internalFormData, // Spread all text fields and other settings
            _id: actualApiBookingId,
            coachId: bookingData.coach?._id || user?.id,
            sessionTypeId: internalFormData.type,
            price: internalFormData.price === '' || internalFormData.price === null || internalFormData.price === undefined ? null : parseFloat(internalFormData.price),
            earlyBirdPrice: internalFormData.earlyBirdPrice === '' || internalFormData.earlyBirdPrice === null ? null : parseFloat(internalFormData.earlyBirdPrice),
            earlyBirdDeadline: internalFormData.earlyBirdDeadline ? new Date(internalFormData.earlyBirdDeadline).toISOString() : null,
            minAttendees: internalFormData.minAttendees !== '' && internalFormData.minAttendees !== null ? parseInt(internalFormData.minAttendees, 10) : undefined,
            maxAttendees: internalFormData.maxAttendees !== '' && internalFormData.maxAttendees !== null ? parseInt(internalFormData.maxAttendees, 10) : undefined,
            isAvailability: false,
            // Crucially, replace the File objects or mixed arrays with ONLY existing metadata for these fields in this payload
           sessionImages: existingSessionImagesMetaInForm, // This is metadata or null
            courseMaterials: existingCourseMaterialsMetaInForm, // This is an array of metadata
        };

        if (internalFormData.type === '66ec54f94a8965b22af33fd9') { // Webinar
            bookingPayloadForOnSave.webinarSlots = (internalFormData.webinarSlots || []).map(slot => ({
                date: new Date(slot.date).toISOString().split('T')[0],
                startTime: new Date(slot.startTime).toISOString(),
                endTime: new Date(slot.endTime).toISOString()
            }));
            if (bookingPayloadForOnSave.webinarSlots.length > 0) {
                const firstSlotDate = new Date(bookingPayloadForOnSave.webinarSlots[0].date);
                const firstSlotStartTime = new Date(bookingPayloadForOnSave.webinarSlots[0].startTime);
                bookingPayloadForOnSave.start = new Date(firstSlotDate.getFullYear(), firstSlotDate.getMonth(), firstSlotDate.getDate(), firstSlotStartTime.getHours(), firstSlotStartTime.getMinutes()).toISOString();
                
                const lastSlot = bookingPayloadForOnSave.webinarSlots[bookingPayloadForOnSave.webinarSlots.length - 1];
                const lastSlotDate = new Date(lastSlot.date);
                const lastSlotEndTime = new Date(lastSlot.endTime);
                bookingPayloadForOnSave.end = new Date(lastSlotDate.getFullYear(), lastSlotDate.getMonth(), lastSlotDate.getDate(), lastSlotEndTime.getHours(), lastSlotEndTime.getMinutes()).toISOString();
            } else {
                bookingPayloadForOnSave.start = internalFormData.start ? new Date(internalFormData.start).toISOString() : null;
                bookingPayloadForOnSave.end = internalFormData.end ? new Date(internalFormData.end).toISOString() : null;
            }
        } else { // For other types, or if webinar has no slots (shouldn't happen if validated)
            bookingPayloadForOnSave.start = internalFormData.start ? new Date(internalFormData.start).toISOString() : null;
            bookingPayloadForOnSave.end = internalFormData.end ? new Date(internalFormData.end).toISOString() : null;
        }

if (onSave && typeof onSave === 'function') {
            await onSave(
                bookingPayloadForOnSave,                 // Main booking data (contains existing metadata)
                newSessionImageFiles,                    // Array of new File objects for session images
                newCourseMaterialFiles,                  // Array of new File objects for materials
              
                bookingData?.sessionImages || [],        // Original session images from DB (for diffing deletions on Cloudinary)
                bookingData?.courseMaterials || []       // Original course materials from DB (for diffing deletions on Cloudinary)
            );
            showToast({ type: 'success', message: t('managesessions:sessionUpdated') });
            onClose();
        } else {
            logger.error('[BookingDetailsModal] onSave prop is missing or not a function.');
            showToast({ type: 'error', message: 'Error saving: Save handler not configured.' });
        }

    } catch (error) {
        logger.error('[BookingDetailsModal] Error during internal save:', { error: error.message, stack: error.stack });
        showToast({ type: 'error', message: t('managesessions:errorSavingSession') + (error.response?.data?.message ? `: ${error.response.data.message}`: '') });
        setInternalFormErrors(prev => ({ ...prev, submit: error.message || t('managesessions:errorSavingSession') }));
    } finally {
        setIsInternalSubmitting(false);
    }
};

const handleLocationSave = useCallback(async (locationData) => {
  setIsInternalSubmitting(true);
  try {
    const payload = { _id: actualApiBookingId, ...locationData };
    
    if (onSave && typeof onSave === 'function') {
      logger.info('[BookingDetailsModal] Saving location via onSave prop.');
      await onSave(payload, [], [], currentDisplayBooking?.sessionImages || [], currentDisplayBooking?.courseMaterials || []);
    } else {
      logger.warn('[BookingDetailsModal] onSave prop not provided. Falling back to direct API call for location save.');
      if (typeof updateBooking !== 'function') {
        throw new Error('updateBooking function is not available.');
      }
      await updateBooking(actualApiBookingId, payload);
    }

    showToast({ type: 'success', message: t('managesessions:sessionUpdated') });
    await queryClient.invalidateQueries(['booking', actualApiBookingId]);
    setIsEditingDetails(false);
  } catch (error) {
    logger.error('[BookingDetailsModal] Error during location save:', { 
        errorMessage: error.message, 
        hasOnSave: typeof onSave === 'function',
        stack: error.stack 
    });
    showToast({ type: 'error', message: t('managesessions:errorSavingSession') + (error.response?.data?.message ? `: ${error.response.data.message}`: '') });
  } finally {
    setIsInternalSubmitting(false);
  }
}, [actualApiBookingId, onSave, queryClient, currentDisplayBooking, showToast, t]);

const handleSimpleFormChange = useCallback((fieldName, value) => {
    setInternalFormData(prev => ({ ...prev, [fieldName]: value }));
}, []);

  const handlePaymentComplete = useCallback(async (success) => {
   
    setShowPaymentPopup(false);
    setIsPaymentInProgress(false);
    if (success) {
      try {
        // Optimistically update status
        queryClient.setQueryData(['booking', bookingId], (oldData) => {
          const updatedData = {
            ...oldData,
            payment: { ...oldData?.payment, status: 'completed' },
          };
          
          return updatedData;
        });
        // Invalidate and refetch
        await queryClient.invalidateQueries(['booking', actualApiBookingId]);
        const refetched = await queryClient.refetchQueries(['booking', bookingId], { exact: true });
        const newData = queryClient.getQueryData(['booking', bookingId]);
       
        onClose();
        // Dispatch event to notify payment completion
        window.dispatchEvent(new CustomEvent('payment_completed', {
          detail: { bookingId, status: 'completed' },
        }));
       
      } catch (error) {
        logger.error('[BookingDetailsModal] Failed to refetch booking data', {
          bookingId,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        showToast({
          type: 'error',
          message: t('common:errors.fetchBooking'),
        });
      }
    }
  }, [bookingId, onClose, queryClient, showToast, t]);

const renderPaymentDetails = () => {
    if (!currentDisplayBooking || !currentDisplayBooking.price || isWebinarType || (isCoachAuthoredAndNoClient && !currentDisplayBooking.user)) {
      return null;
    }

    const finalAmount = currentDisplayBooking.payment?.paymentRecord?.amount?.total 
      ? currentDisplayBooking.payment.paymentRecord.amount.total 
      : (currentDisplayBooking.price.final?.amount?.amount ?? 0);

    if (finalAmount <= 0) return null;
  
    const paymentStatus = currentDisplayBooking.payment?.status || 'pending'; 
    let statusConfig;
    
    switch (paymentStatus) {
      case 'completed':
        statusConfig = { text: t('bookings:paymentStatus.completed'), className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
        break;
      case 'pending':
      case 'payment_required':
      case 'payment_processing':
        statusConfig = { text: t('bookings:paymentStatus.pending'), className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400' };
        break;
      case 'failed':
      case 'disputed':
      case 'cancelled':
        statusConfig = { text: t('bookings:paymentStatus.failed'), className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
        break;
      default:
        statusConfig = { text: t(`bookings:paymentStatus.${paymentStatus}`), className: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' };
    }

    const showPayNowButton = currentDisplayBooking &&
      (currentDisplayBooking.status === 'pending_payment' || currentDisplayBooking.status === 'confirmed') &&
      (paymentStatus === 'pending' || paymentStatus === 'payment_required') &&
      isClientOfBooking;

    return (
      <Card className="bg-muted/30 dark:bg-muted/20">
        <CardContent className="p-4">
          <h4 className="mb-3 text-sm font-semibold">{t('bookings:paymentDetails')}</h4>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold text-foreground">
                  {new Intl.NumberFormat(i18n.language, {
                    style: 'currency',
                    currency: currentDisplayBooking.price.currency || 'CHF'
                  }).format(finalAmount)}
                </span>
              </div>
              {currentDisplayBooking.payment && (
                <Badge variant="outline" className={statusConfig.className}>{statusConfig.text}</Badge>
              )}
            </div>
            {showPayNowButton && (
              <Button onClick={handlePayNow} disabled={isLoading || isPaymentInProgress}>
                {isPaymentInProgress ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                {t('bookings:payNow')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

const handleAddWebinarSlot = useCallback(() => {
  if (!shouldBeEditableInThisModal) {
    logger.warn('[BookingDetailsModal] Attempted to add webinar slot in non-editable mode', { bookingId });
    return;
  }

  const newSlot = {
    start: new Date(),
    end: new Date(new Date().getTime() + 60 * 60 * 1000) // Default to 1 hour later
  };

  setInternalFormData((prev) => {
    const updatedSlots = [...(prev.webinarSlots || []), newSlot];
   
    return { ...prev, webinarSlots: updatedSlots };
  });
}, [shouldBeEditableInThisModal, bookingId]);

const handleWebinarPaymentComplete = useCallback(async (success, paymentDetails) => {

  
  setShowPaymentPopup(false);
  setIsPaymentInProgress(false);
  setIsRegistering(false);
  setWebinarPaymentConfig(null);

  let effectivelySuccessful = success;
  let toastMessage = '';
  let toastType = success ? 'success' : 'error';
  let toastDuration = 7000;

  if (
    !success &&
    paymentDetails?.error?.message?.includes("Cannot read properties of undefined (reading 'toUpperCase')")
  ) {
    logger.warn('[BookingDetailsModal] Webinar payment reported as failed due to known notification formatting issue in PaymentAPI.confirmPayment. Treating as effectively successful for UX and relying on webhook for final booking state.', {
      bookingId: actualApiBookingId,
      originalErrorMessage: paymentDetails.error.message
    });
    effectivelySuccessful = true; 
    toastMessage = t('bookings:webinarBookingProcessedNotificationIssue');
    toastType = 'info';
  } else if (success) {
    toastMessage = t('bookings:webinarPaymentSuccessFinalizing');
    toastType = 'success';
  } else {
    toastMessage = paymentDetails?.error?.message || t('bookings:paymentFailed');
    toastType = 'error';
    logger.error('[BookingDetailsModal] Webinar payment genuinely failed or an unhandled error occurred.', {
        bookingId: actualApiBookingId,
        paymentDetailsError: paymentDetails?.error
    });
  }

  showToast({ 
    type: toastType, 
    message: toastMessage, 
    duration: toastDuration 
  });

  if (effectivelySuccessful) {
 
    await queryClient.invalidateQueries(['booking', actualApiBookingId]);
    await queryClient.invalidateQueries(['userSessions']); 
    await queryClient.invalidateQueries(['userCalendar']);
  }
}, [actualApiBookingId, queryClient, showToast, t]);


const handleBookWebinar = async (discountCode) => {
  if (!currentDisplayBooking?._id || !isWebinarType) {
      showToast({ type: 'error', message: t('bookings:errors.webinarRegistrationConfigError') });
      return;
  }
  setIsRegistering(true);
  setIsPaymentInProgress(true);

  try {
      const response = await registerForWebinar(currentDisplayBooking._id, discountCode);
     
      if (response.freeBooking) {
          showToast({ type: 'success', message: response.message || t('bookings:webinarFreeBookingSuccess') });
          await queryClient.invalidateQueries(['booking', actualApiBookingId]);
          // ... other query invalidations ...
          setIsRegistering(false);
          setIsPaymentInProgress(false); 
          return;
      }

      if (!response.bookingId || !response.paymentIntentId || !response.clientSecret || response.amount == null || !response.currency) {
          logger.error('[BDM.handleBookWebinar] Invalid/incomplete response from registerForWebinar API.', { response });
          showToast({ type: 'error', message: t('bookings:errors.webinarRegistrationResponseError') });
          setIsRegistering(false);
          setIsPaymentInProgress(false); 
          return;
      }

      const flowIdForOrchestrator = response.paymentIntentId;
      const stripePaymentIntentId = response.paymentIntentId;
      const stripeClientSecret = response.clientSecret;
      const actualWebinarEventMongoDBId = response.bookingId; 

      

      const metadataForOrchestrator = {
          actualBookingId: actualWebinarEventMongoDBId,       
          userId: user?._id,
          paymentIntentId: stripePaymentIntentId,     
          clientSecret: stripeClientSecret,         
          flowType: 'webinar_registration',
          originalAmount: response.amount, 
          originalCurrency: response.currency,
          preserveOnUnmount: false,
          modalState: MODAL_STATES.PAYMENT_ACTIVE,
          paymentStep: PAYMENT_STEPS.METHOD,
      };



      await PaymentOrchestrator.initializePayment({
          flowId: flowIdForOrchestrator,
          amount: response.amount,
          currency: response.currency,
          timing: PAYMENT_TIMING.IMMEDIATE,
          metadata: metadataForOrchestrator,
      });

      const initializedFlowData = PaymentOrchestrator.getFlowData(flowIdForOrchestrator);
  
      const synchronizedFlowData = await PaymentOrchestrator.ensureFlowStateSynchronization(flowIdForOrchestrator, actualWebinarEventMongoDBId, { createIfMissing: true });
      if (!synchronizedFlowData || !PaymentOrchestrator.getFlowData(flowIdForOrchestrator)?.metadata?.clientSecret) {
         logger.error('[BDM.handleBookWebinar] Synchronization failed or clientSecret missing post-sync.', { 
            flowIdForOrchestrator, 
            retrievedFlowData: PaymentOrchestrator.getFlowData(flowIdForOrchestrator) 
        });
         throw new Error('Flow state inconsistent after sync for webinar.');
      }
   

      setWebinarPaymentConfig({
          clientSecret: stripeClientSecret,
          paymentIntentId: stripePaymentIntentId,
          amount: response.amount,
          currency: response.currency,
          onComplete: handleWebinarPaymentComplete,
          bookingId: flowIdForOrchestrator, 
          contextualBookingId: actualWebinarEventMongoDBId, 
          sessionStartTime: webinarEffectiveStartTime,
          priceDetails: {
              final: { amount: { amount: response.amount }, currency: response.currency },
              currency: response.currency
          },
      });
      
      setShowPaymentPopup(true);

} catch (error) {
      logger.error("[BDM.handleBookWebinar] Critical failure in webinar booking/payment setup.", {
          errorMessage: error.response?.data?.message || error.message,
          errorStack: error.stack,
          webinarBookingId: currentDisplayBooking._id,
          discountCodeUsed: discountCode
      });
      showToast({ type: 'error', message: error.response?.data?.message || t('bookings:errors.webinarBookingFailedGeneral') });
      setShowPaymentPopup(false);
      setIsPaymentInProgress(false);
  } finally {
      setIsRegistering(false);
  }
};

const handleOpenCancelModal = async () => {
   
    if (!currentDisplayBooking?._id) {
      logger.warn('[BookingDetailsModal] handleOpenCancelModal: currentDisplayBooking or _id is missing.');
      return;
    }
    
    setShowCancelModal(true);
    setCancellationDetails(null); 

    if (isCoachOfBooking) {
      
        setIsCalculatingCancellation(false); 
        
        const coachCancellationData = {
            canCancel: true,
            isCoachCancellation: true, 
            currency: currentDisplayBooking.price?.currency || 'CHF',
            applicableTierDescriptionKey: 'bookings:coachCancellationFullRefundInfo', 
        };

        if (isWebinarType) {
            coachCancellationData.webinarAttendeesCount = (currentDisplayBooking.attendees || [])
                .filter(att => att.status === 'confirmed').length; 
            coachCancellationData.grossRefundToClient = t('bookings:fullRefundToAllAttendees'); 
        } else { 
            coachCancellationData.clientName = currentDisplayBooking.user ? `${currentDisplayBooking.user.firstName} ${currentDisplayBooking.user.lastName}` : t('bookings:theClient');
            coachCancellationData.grossRefundToClient = (currentDisplayBooking.price?.final?.amount?.amount || 0);
        }
        setCancellationDetails(coachCancellationData);

    } else { // Client is initiating
        setIsCalculatingCancellation(true);
        try {
          const details = await calculateCancellationDetails(currentDisplayBooking._id);
        
          setCancellationDetails(details);
        } catch (error) {
          logger.error('[BookingDetailsModal] Error fetching cancellation details for client:', error);
          const errorMessage = error.response?.data?.message || t('bookings:errors.fetchCancellationDetailsFailed');
          setCancellationDetails({ 
            error: true, 
            message: errorMessage,
            canCancel: false 
          });
          showToast({
            type: 'error',
            message: errorMessage,
          });
        } finally {
          setIsCalculatingCancellation(false);
        }
    }
  };

const handleConfirmCancellation = async (reason) => {
    if (!currentDisplayBooking?._id || !cancellationDetails || (!cancellationDetails.canCancel && !cancellationDetails.isCoachCancellation)) {
        logger.warn('[BookingDetailsModal] handleConfirmCancellation: Conditions not met.', {
            bookingId: currentDisplayBooking?._id,
            cancellationDetailsCanCancel: cancellationDetails?.canCancel,
            isCoachCancellation: cancellationDetails?.isCoachCancellation,
        });
        return;
    }
    setIsCancelling(true);
    try {
      let successMessageKey = 'bookings:cancelSuccess'; // Default for client 1-on-1

      if (isCoachOfBooking && cancellationDetails.isCoachCancellation) { 
        await cancelBookingByCoach(currentDisplayBooking._id, reason);
        successMessageKey = isWebinarType ? 'bookings:coachWebinarCancelSuccess' : 'bookings:coachOneOnOneCancelSuccess';
    } else if (isClientOfBooking) { // Client initiating
        if (isWebinarType) {
          await cancelWebinarRegistrationByClient(currentDisplayBooking._id, reason);
          successMessageKey = 'bookings:webinarRegistrationCancelSuccess'; 
        } else {
          await cancelBookingByClient(currentDisplayBooking._id, reason);
          // successMessageKey remains 'bookings:cancelSuccess'
        }
      } else {
        logger.error('[BookingDetailsModal] handleConfirmCancellation: Unhandled cancellation scenario.', { isCoachOfBooking, isClientOfBooking, isWebinarType });
        throw new Error(t('bookings:errors.cancelFailed'));
      }
      
      showToast({
        type: 'success',
        message: t(successMessageKey),
      });
      
      queryClient.invalidateQueries(['booking', actualApiBookingId]);
      queryClient.invalidateQueries(['userSessions']);
      queryClient.invalidateQueries(['userCalendar']); 
      queryClient.invalidateQueries(['coachSessions', currentDisplayBooking?.coach?._id]); 
      
      setShowCancelModal(false);
      setCancellationDetails(null);
      onClose({ action: 'cancelled', bookingId: currentDisplayBooking._id });
    } catch (error) {
      logger.error('[BookingDetailsModal] Error confirming cancellation:', error);
      showToast({
        type: 'error',
        message: error.response?.data?.message || t('bookings:errors.cancelFailed'),
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const sessionTitleForCancellationPrompt = useMemo(() => {
    if (!currentDisplayBooking) return t('bookings:thisSession', 'this session');
    
    const genericTitlesForCheck = [
      t('bookings:availabilityTitle', { defaultValue: 'Verfügbarkeit' }).toLowerCase(),
      'verfügbarkeit',
      'availability'
    ];

    // Determine the base name for the session type
    let baseSessionTypeName = t('bookings:session'); // Default
    if (currentDisplayBooking.sessionType?.name) {
        const keyPart = currentDisplayBooking.sessionType.name.toLowerCase().replace(/\s+/g, '');
        baseSessionTypeName = t(`bookings:sessionTypes.${keyPart}`, { defaultValue: currentDisplayBooking.sessionType.name });
    } else if (sessionTypeIdFromBooking && sessionTypes && sessionTypes.length > 0) {
        const rawName = getSessionTypeNameFromList(sessionTypeIdFromBooking, sessionTypes);
        if (rawName) {
            const keyPart = rawName.toLowerCase().replace(/\s+/g, '');
            baseSessionTypeName = t(`bookings:sessionTypes.${keyPart}`, { defaultValue: rawName });
        }
    }

    if (currentDisplayBooking.title && !genericTitlesForCheck.includes(currentDisplayBooking.title.toLowerCase())) {
      // If title is specific and not generic "Availability"
      return currentDisplayBooking.title;
    }
    // If title is generic or missing, use the translated session type name
    return baseSessionTypeName;
  }, [currentDisplayBooking, sessionTypeIdFromBooking, sessionTypes, t]);

const canClientCancelThisBooking = useMemo(() => {
    logger.debug('[BDM canClientCancelThisBooking] Evaluating eligibility.', {
        isClientOfBookingResult: isClientOfBooking, 
        hasCurrentDisplayBooking: !!currentDisplayBooking,
        hasUser: !!user,
        bookingStatus: currentDisplayBooking?.status
    });

    if (!isClientOfBooking) { 
        logger.debug('[BDM canClientCancelThisBooking] Early exit: not client of booking (based on isClientOfBooking).');
        return false;
    }
    if (!currentDisplayBooking || new Date(currentDisplayBooking.start) < new Date()) { 
        logger.debug('[BDM canClientCancelThisBooking] Early exit: currentDisplayBooking is null/undefined or in the past.');
        return false;
    }

    const cancellableStatuses = ['confirmed', 'pending_payment', 'requested', 'scheduled', 'pending_minimum_attendees', 'rescheduled_pending_attendee_actions', 'pending_reschedule_coach_request', 'pending_reschedule_client_request'];
    
    if (!cancellableStatuses.includes(currentDisplayBooking.status)) {
        logger.debug('[BDM canClientCancelThisBooking] Status not in cancellableStatuses.', { currentStatus: currentDisplayBooking.status, cancellableStatuses });
        return false;
    }
  
    logger.debug('[BDM canClientCancelThisBooking] Conditions met. Client can cancel this booking.', { bookingId: currentDisplayBooking._id });
    return true;
  }, [currentDisplayBooking, user, isClientOfBooking]);

  const coachCanProactivelyRefund = useMemo(() => {
        if (!currentDisplayBooking || !isCoachOfBooking) return false;
        
        const payment = currentDisplayBooking.payment?.paymentRecord;
        if (!payment) return false;

        const isRefundableStatus = ['completed', 'succeeded', 'partially_refunded'].includes(payment.status);
        const hasRefundableAmount = (payment.amount?.total || 0) > (payment.amount?.refunded || 0);

        return isRefundableStatus && hasRefundableAmount;
    }, [currentDisplayBooking, isCoachOfBooking]);

const renderContent = () => {
  const isBookingQueryLoading = isLoadingProp || !currentDisplayBooking;
  const noOp = () => { return; };

  if (isBookingQueryLoading && !existingBooking) {
    return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>;
  }

  if (coachCanProactivelyRefund) availableBookingActions.push('coach_proactive_refund');

  if (error && !currentDisplayBooking) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-destructive">
        <AlertCircle className="mb-2 h-8 w-8" />
        <p>{t('common:errors.fetchBooking')}</p>
        <Button onClick={() => queryClient.invalidateQueries(['booking', actualApiBookingId])} className="mt-4">{t('common:retry')}</Button>
      </div>
    );
  }

  if (!currentDisplayBooking) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <AlertCircle className="mb-2 h-8 w-8" />
        <p>{t('bookings:noSessionDetails')}</p>
      </div>
    );
  }

  if (showImageGallery && galleryImages.length > 0) {
    return (
      <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={closeImageGallery}>
        <button className="absolute right-4 top-4 z-[20002] rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20" onClick={closeImageGallery} aria-label={t('common:close')}><X size={24} /></button>
        <div className="relative h-full w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex h-full flex-col items-center justify-center">
            <img src={galleryImages[currentGalleryImageIndex]?.url} alt={`${t('image')} ${currentGalleryImageIndex + 1}`} className="block max-h-full max-w-full rounded-lg object-contain" />
            {galleryImages.length > 1 && (
              <div className="absolute -bottom-12 flex items-center justify-center gap-4 text-white">
                <Button variant="ghost" size="icon" className="rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); prevGalleryImage(); }} aria-label={t('common:previous')}><ChevronLeftIcon size={24} /></Button>
                <span className="font-mono text-sm">{currentGalleryImageIndex + 1} / {galleryImages.length}</span>
                <Button variant="ghost" size="icon" className="rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); nextGalleryImage(); }} aria-label={t('common:next')}><ChevronRightIcon size={24} /></Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  let chatOtherPartyId = null;
  if (currentDisplayBooking && user) {
    const isUserTheBookingCoach = user?._id === currentDisplayBooking.coach?._id;
    const isUserTheBookingClient = user?._id === currentDisplayBooking.user?._id;
    if (isUserTheBookingCoach && currentDisplayBooking.user?._id) chatOtherPartyId = currentDisplayBooking.user._id;
    else if (isUserTheBookingClient && currentDisplayBooking.coach?._id) chatOtherPartyId = currentDisplayBooking.coach._id;
  }
  let otherPartyForContextualChat = null;
  if (chatOtherPartyId) {
    if (user?._id === currentDisplayBooking.coach?._id) otherPartyForContextualChat = currentDisplayBooking.user;
    else if (user?._id === currentDisplayBooking.user?._id) otherPartyForContextualChat = currentDisplayBooking.coach;
  }

  const isDisplayModeForSpecificForm = !shouldBeEditableInThisModal;
  
  let rawSessionTypeName = currentDisplayBooking.sessionType?.name || getSessionTypeNameFromList(sessionTypeIdFromBooking, sessionTypes);
  let translatedSessionTypeName = rawSessionTypeName ? t(`bookings:sessionTypes.${rawSessionTypeName.toLowerCase().replace(/\s+/g, '')}`, { defaultValue: rawSessionTypeName }) : t('bookings:session');
  let titleToDisplay;
  const bookingTitle = currentDisplayBooking.title;
  const genericTitlesForCheck = [t('bookings:availabilityTitle', { defaultValue: 'Verfügbarkeit' }).toLowerCase(), 'verfügbarkeit', 'availability'];
  if (isWebinarType && bookingTitle) titleToDisplay = bookingTitle;
  else if (bookingTitle && !genericTitlesForCheck.includes(bookingTitle.toLowerCase()) && bookingTitle.toLowerCase() !== (rawSessionTypeName || '').toLowerCase() && bookingTitle.toLowerCase() !== translatedSessionTypeName.toLowerCase()) titleToDisplay = `${translatedSessionTypeName}: ${bookingTitle}`;
  else titleToDisplay = translatedSessionTypeName;

  const availableBookingActions = [];
  if (currentDisplayBooking.status === 'requested' && user && isCoachOfBooking && currentDisplayBooking.user) {
    availableBookingActions.push('accept', 'decline');
    if (!isWebinarType) availableBookingActions.push('coach_propose_alternatives');
  }
  if (isClientOfBooking) {
    if (canClientCancelThisBooking) availableBookingActions.push('cancel_by_client');
    if (clientCanReschedule) availableBookingActions.push('client_reschedule_session');
    if (currentDisplayBooking.rescheduleProposal?.proposerRole === 'coach' && currentDisplayBooking.rescheduleProposal?.status === 'pending_client_action') availableBookingActions.push('client_respond_to_proposal');
  }
  if (isCoachOfBooking) {
    if (canCoachCancelThisBooking) availableBookingActions.push('cancel_by_coach');
    const coachCanProposeForEstablishedBooking = !isWebinarType && currentDisplayBooking.user && (currentDisplayBooking.status === 'confirmed' || currentDisplayBooking.status === 'pending_reschedule_client_request');
    const coachHasActiveProposalToClient = currentDisplayBooking.rescheduleProposal?.proposerRole === 'coach' && currentDisplayBooking.rescheduleProposal?.status === 'pending_client_action';
    if (coachCanProposeForEstablishedBooking && !coachHasActiveProposalToClient) availableBookingActions.push('coach_propose_alternatives');
  }
  const canShowGenericMessageButton = !chatOtherPartyId && ['requested', 'confirmed', 'pending', 'pending_reschedule_client_request', 'pending_reschedule_coach_request'].includes(currentDisplayBooking.status);
  if (canShowGenericMessageButton && ((isClientOfBooking && currentDisplayBooking.coach) || (isCoachOfBooking && currentDisplayBooking.user))) availableBookingActions.push('message');

  if (coachCanRespondToRefundRequest) availableBookingActions.push('review_refund_request');

const simplifiedPriceRelatedDataForDisplay = internalFormData ? {
      clientPaysTotal: parseFloat(internalFormData.price) || 0,
      coachVatRatePercent: currentDisplayBooking.price?.vat?.rate ?? (coachSettingsForForm?.vatRate ?? 0),
      coachPlatformFeePercent: currentDisplayBooking.price?.platformFee?.percentage ?? (coachSettingsForForm?.platformFeePercentage ?? 0),
      coachReceives: currentDisplayBooking.price?.base?.amount?.amount ?? 0,
      actualPlatformFeeAmount: currentDisplayBooking.price?.platformFee?.amount ?? 0,
      actualVatAmount: currentDisplayBooking.price?.vat?.amount ?? 0,
      earlyBirdClientPaysTotal: parseFloat(internalFormData.earlyBirdPrice) || null,
    } : {};

  if (isCoachCreatedSessionType && !internalFormData) return <div className="flex h-64 items-center justify-center"><LoadingSpinner /></div>;
  const showWebinarBookingInterface = isWebinarType && !isCurrentUserCoachOfThisBooking && (currentDisplayBooking.price?.final?.amount?.amount > 0 || currentDisplayBooking.earlyBirdPrice > 0);
  const sessionTypeSpecificFields = internalFormData ? (typeSpecificFields[internalFormData.type] || []) : [];

  if (clientCanRequestRefund) availableBookingActions.push('request_refund');
  
  const showOtherTabs = isCoachCreatedSessionType && internalFormData;
  const showAdvancedTabForCoach = showOtherTabs && user?.role === 'coach';

const renderSummary = () => (
    <div className="space-y-4">
      {renderSessionDetails(currentDisplayBooking, isConnectedToClient, isLoadingConnection)}
      <SessionLocationDisplay
        booking={currentDisplayBooking}
        isEditing={isEditingDetails}
        onEditToggle={handleLocationEditToggle}
        onSave={handleLocationSave}
        isSaving={isInternalSubmitting}
        canEdit={isCoachOfBooking}
        sessionUrl={sessionUrl}
        canAccessContent={canAccessContent}
        onCopyLink={handleCopyLink}
        copied={copied}
      />
      {renderPaymentDetails()}
      
      {renderParticipants(currentDisplayBooking, user, isConnectedToClient, isLoadingConnection)}
     
      {currentDisplayBooking.cancellationPolicy && (currentDisplayBooking.cancellationPolicy.oneOnOne || currentDisplayBooking.cancellationPolicy.webinar) && (
        <Card className="bg-muted/30 dark:bg-muted/20"><CardContent className="p-4">
          <Collapsible onOpenChange={setIsPolicyExpanded}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between text-left">
                <h4 className="flex items-center gap-2 text-sm font-semibold"><Info size={16} />{t('bookings:cancellationPolicyTitle')}</h4>
                <div className="p-0 -mr-2 h-8 w-8 flex items-center justify-center">{isPolicyExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 overflow-hidden pt-3 border-t dark:border-border/50"><PolicyDisplay policy={isWebinarType ? currentDisplayBooking.cancellationPolicy.webinar : currentDisplayBooking.cancellationPolicy.oneOnOne} policyType={isWebinarType ? 'webinar' : 'oneOnOne'} lastUpdated={currentDisplayBooking.cancellationPolicy.lastUpdated} condensed={true} showTitle={false} /></CollapsibleContent>
          </Collapsible>
        </CardContent></Card>
      )}
      {isCoachCreatedSessionType && canAccessContent && currentDisplayBooking.courseMaterials && currentDisplayBooking.courseMaterials.length > 0 && (
        <Card className="bg-muted/30 dark:bg-muted/20"><CardContent className="p-4">
            <Collapsible onOpenChange={setIsMaterialsExpanded}>
                               <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between text-left">
                        <h4 className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} />{t('bookings:courseMaterials')} ({currentDisplayBooking.courseMaterials.filter(m => m.url && m.name).length})</h4>
                        <div className="p-0 -mr-2 h-8 w-8 flex items-center justify-center">{isMaterialsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 overflow-hidden pt-3 border-t dark:border-border/50"><ul className="max-h-60 space-y-1 overflow-y-auto">
                    {currentDisplayBooking.courseMaterials.map((material, index) => (
                      material.url && material.name && (
                        <li key={material._id || `material-${index}`} className="group flex items-center justify-between gap-2 rounded-md p-1.5 hover:bg-background dark:hover:bg-muted/50">
                          <a href={material.url} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center gap-2 overflow-hidden text-sm" title={material.name}>
                            <FileText size={16} className="flex-shrink-0 text-muted-foreground" />
                            <span className="truncate">{material.name}</span>
                            {material.size && <span className="text-xs text-muted-foreground">({(material.size / (1024*1024)).toFixed(2)}MB)</span>}
                          </a>
                          <a href={material.url} download={material.name} className="opacity-0 transition-opacity group-hover:opacity-100" aria-label={`${t('common:download')} ${material.name}`}><Download size={16} className="text-muted-foreground" /></a>
                        </li>
                      )))}
                </ul></CollapsibleContent>
            </Collapsible>
        </CardContent></Card>
      )}
      {!isWebinarType && isCurrentUserTheBookingCoach && (overtimeLoading || overtimeSettings) && (
        <Card className="bg-muted/30 dark:bg-muted/20">
          <CardContent className="p-4">
            <Collapsible open={isOvertimeExpanded} onOpenChange={setIsOvertimeExpanded}>
             <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between text-left">
                  <h4 className="flex items-center gap-2 text-sm font-semibold">
                    <Clock size={16} />
                    {t('bookings:overtimeSettingsTitle')}
                  </h4>
                  <div className="p-0 -mr-2 h-8 w-8 flex items-center justify-center">
                    {isOvertimeExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 overflow-hidden pt-3 border-t dark:border-border/50">
                {overtimeLoading && <div className="flex items-center justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>}
                {overtimeError && !overtimeLoading && <div className="text-sm text-destructive">{t('bookings:errors.fetchOvertimeSettings')}</div>}
                {!overtimeLoading && !overtimeError && overtimeSettings && (
                  isEditingOvertime ? (
                    <form onSubmit={handleOvertimeSubmit} className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="allowOvertime" className="text-sm font-medium">{t('bookings:allowOvertime')}</label>
                        <Switch
                          id="allowOvertime"
                          name="allowOvertime"
                          checked={overtimeForm.allowOvertime}
                          onCheckedChange={(checked) => handleOvertimeInputChange({ target: { name: 'allowOvertime', type: 'checkbox', checked } })}
                        />
                      </div>
                      {overtimeForm.allowOvertime && (
                        <div className="space-y-3">
                          <div>
                            <label htmlFor="freeOvertimeDuration" className="mb-1 block text-xs text-muted-foreground">{t('bookings:freeOvertimeDuration')} ({t('bookings:minutes')})</label>
                            <Input
                              type="number"
                              id="freeOvertimeDuration"
                              name="freeOvertimeDuration"
                              value={overtimeForm.freeOvertimeDuration}
                              onChange={handleOvertimeInputChange}
                              min="0"
                            />
                            {overtimeErrors.freeOvertimeDuration && <p className="mt-1 text-xs text-destructive">{overtimeErrors.freeOvertimeDuration}</p>}
                          </div>
                          <div>
                            <label htmlFor="paidOvertimeDuration" className="mb-1 block text-xs text-muted-foreground">{t('bookings:paidOvertimeDuration')} ({t('bookings:minutes')})</label>
                            <Input
                              type="number"
                              id="paidOvertimeDuration"
                              name="paidOvertimeDuration"
                              value={overtimeForm.paidOvertimeDuration}
                              onChange={handleOvertimeInputChange}
                              min="0"
                            />
                            {overtimeErrors.paidOvertimeDuration && <p className="mt-1 text-xs text-destructive">{overtimeErrors.paidOvertimeDuration}</p>}
                          </div>
                          <div>
                            <label htmlFor="overtimeRate" className="mb-1 block text-xs text-muted-foreground">{t('bookings:overtimeRate')} ({t('bookings:surchargePercentage', 'Surcharge %')})</label>
                            <Input
                              type="number"
                              id="overtimeRate"
                              name="overtimeRate"
                              value={overtimeForm.overtimeRate}
                              onChange={handleOvertimeInputChange}
                              min="0"
                            />
                            {overtimeErrors.overtimeRate && <p className="mt-1 text-xs text-destructive">{overtimeErrors.overtimeRate}</p>}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          setIsEditingOvertime(false);
                          setOvertimeForm({
                            allowOvertime: overtimeSettings?.allowOvertime ?? false,
                            freeOvertimeDuration: overtimeSettings?.freeOvertimeDuration ?? 0,
                            paidOvertimeDuration: overtimeSettings?.paidOvertimeDuration ?? 0,
                            overtimeRate: overtimeSettings?.overtimeRate ?? 0,
                          });
                          setOvertimeErrors({});
                        }}>
                          {t('common:cancel')}
                        </Button>
                        <Button type="submit" size="sm">{t('common:save')}</Button>
                      </div>
                    </form>
                 ) : (
                    <div className="space-y-2 pt-2 text-sm">
                      <div className="flex justify-between">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex cursor-help items-center gap-1">{t('bookings:allowOvertime')}: <Info size={14} className="text-muted-foreground" /></span>
                            </TooltipTrigger>
                            <TooltipContent><p>{t('bookings:tooltips.allowOvertime', 'Enables tracking and potential charging for time beyond the scheduled session end.')}</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Badge variant={overtimeSettings.allowOvertime ? 'default' : 'outline'} className={overtimeSettings.allowOvertime ? 'bg-green-100 text-green-800' : ''}>
                          {overtimeSettings.allowOvertime ? t('common:yes') : t('common:no')}
                        </Badge>
                      </div>
                      {overtimeSettings.allowOvertime && (
                        <>
                          <div className="flex justify-between">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex cursor-help items-center gap-1">{t('bookings:freeOvertimeDuration')}: <Info size={14} className="text-muted-foreground" /></span>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('bookings:tooltips.freeOvertime', 'A grace period in minutes before paid overtime begins.')}</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <span className="font-medium">{overtimeSettings.freeOvertimeDuration} {t('bookings:minutes')}</span>
                          </div>
                          <div className="flex justify-between">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex cursor-help items-center gap-1">{t('bookings:paidOvertimeDuration')}: <Info size={14} className="text-muted-foreground" /></span>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('bookings:tooltips.paidOvertime', 'The maximum duration in minutes for which overtime can be charged.')}</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <span className="font-medium">{overtimeSettings.paidOvertimeDuration} {t('bookings:minutes')}</span>
                          </div>
                          <div className="flex justify-between">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex cursor-help items-center gap-1">{t('bookings:overtimeRate')} ({t('bookings:surchargePercentage', 'Surcharge %')}): <Info size={14} className="text-muted-foreground" /></span>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('bookings:tooltips.overtimeRate', 'The percentage of the session\'s hourly rate to charge for paid overtime.')}</p></TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <span className="font-medium">{overtimeSettings.overtimeRate}%</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-end pt-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingOvertime(true)}>{t('common:edit')}</Button>
                      </div>
                    </div>
                  )
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}
      {chatOtherPartyId && currentDisplayBooking && otherPartyForContextualChat && (
        <div className="pt-4 border-t dark:border-border/50"><h4 className="text-sm font-medium mb-2">{t('bookings:chatAboutBooking')}</h4>
            <ContextualMessageInput contextId={currentDisplayBooking._id} contextType="booking" recipientId={chatOtherPartyId} placeholderText={t('bookings:sendMessageTo', { name: otherPartyForContextualChat?.firstName || t('bookings:participant') })} />
        </div>
      )}
        {currentDisplayBooking.disputeTicket && (
                    <Card className="bg-muted/30 dark:bg-muted/20">
                        <CardContent className="p-4 flex items-center justify-between">
                            <h4 className="text-sm font-semibold">{t('refunds.disputeStatusTitle', 'Dispute Status')}</h4>
                            {getDisputeStatusBadge(currentDisplayBooking.disputeTicket)}
                        </CardContent>
                    </Card>
                )}
    </div>
  );

    return (
        <>
        {isPaymentInProgress && !showPaymentPopup && (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-sm dark:bg-black/70">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )}
 <div data-dialog-drag-handle="true" onMouseDown={handleMouseDownOnTitle} className="flex cursor-move items-start justify-between gap-4 border-b p-4 pr-12 dark:border-border/50">
        <div className="flex flex-1 items-center gap-4">
          {titlePictureDisplayUrl && (
            <div role="button" aria-label={t('managesessions:enlargeTitlePicture')} tabIndex={0} onClick={() => openImageGallery(galleryImages.findIndex(img => img.url === titlePictureDisplayUrl))} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openImageGallery(galleryImages.findIndex(img => img.url === titlePictureDisplayUrl))} className="group relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
              <img src={titlePictureDisplayUrl} alt={t('managesessions:titlePicturePreview')} className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 text-white/0 transition-all group-hover:bg-black/40 group-hover:text-white/100"><PlusCircle size={18} /></div>
            </div>
          )}
          <h2 className="text-lg font-semibold text-foreground">{titleToDisplay}</h2>
        </div>
        {getStatusBadge(currentDisplayBooking.status)}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
       {showWebinarBookingInterface && (
  <div className="mb-6">
    {isAlreadyBooked ? (
      <div className="flex items-center space-x-2 rounded-md bg-green-100 p-2.5 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircle size={16} className="flex-shrink-0" />
        <span>{t('bookings:webinarYouAreBooked')}</span>
      </div>
    ) : isBookingClosed ? (
      <div className="flex items-center space-x-2 rounded-md bg-red-100 p-2.5 text-sm font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
        <AlertCircle size={16} className="flex-shrink-0" />
        <span>{t('bookings:webinarBookingClosed')}</span>
      </div>
    ) : isWebinarFull ? (
      <div className="flex items-center space-x-2 rounded-md bg-amber-100 p-2.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        <Users size={16} className="flex-shrink-0" />
        <span>{t('bookings:webinarFull')}</span>
      </div>
    ) : (
      <WebinarPricingInterface 
        booking={currentDisplayBooking} 
        onBook={handleBookWebinar} 
      />
    )}
  </div>
)}

        {showOtherTabs ? (
          <Tabs defaultValue="overview" onValueChange={setActiveTab} value={activeTab}>
            <TabsList className={`grid w-full ${showAdvancedTabForCoach ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="overview">{t('bookings:tabs.overview')}</TabsTrigger>
              <TabsTrigger value="basicInfo">{t('bookings:tabs.basicInfo')}</TabsTrigger>
              {showAdvancedTabForCoach && <TabsTrigger value="advancedOptions">{t('bookings:tabs.advancedOptions')}</TabsTrigger>}
            </TabsList>
            <TabsContent value="overview" className="pt-4">{renderSummary()}</TabsContent>
            <TabsContent value="basicInfo" className="pt-4">{internalFormData && <WebinarSessionForm formData={internalFormData} handleInputChange={shouldBeEditableInThisModal ? handleInternalFormInputChange : noOp} errors={internalFormErrors} currencySymbols={{ CHF: 'CHF', USD: '$', EUR: '€', GBP: '£' }} handleDateChange={shouldBeEditableInThisModal ? handleInternalDateChange : noOp} priceRelatedData={simplifiedPriceRelatedDataForDisplay} coachSettings={coachSettingsForForm || currentDisplayBooking.coach?.settings || {}} sessionTypeData={sessionTypeSpecificFields} handleAddWebinarSlot={shouldBeEditableInThisModal ? handleAddWebinarSlot : noOp} handleRemoveWebinarSlot={shouldBeEditableInThisModal ? handleInternalRemoveWebinarSlot : noOp} handleWebinarSlotChange={shouldBeEditableInThisModal ? handleInternalWebinarSlotChange : noOp} handleRemoveCourseMaterial={shouldBeEditableInThisModal ? handleInternalRemoveCourseMaterial : noOp} renderSection="basic" isDisplayMode={isDisplayModeForSpecificForm} />}</TabsContent>
            {showAdvancedTabForCoach && <TabsContent value="advancedOptions" className="pt-4">{internalFormData && <WebinarSessionForm formData={internalFormData} handleInputChange={shouldBeEditableInThisModal ? handleInternalFormInputChange : noOp} handleDateChange={shouldBeEditableInThisModal ? handleInternalDateChange : noOp} errors={internalFormErrors} currencySymbols={{ CHF: 'CHF' }} priceRelatedData={simplifiedPriceRelatedDataForDisplay} coachSettings={coachSettingsForForm || currentDisplayBooking.coach?.settings || {}} sessionTypeData={sessionTypeSpecificFields} handleAddWebinarSlot={shouldBeEditableInThisModal ? handleAddWebinarSlot : noOp} handleRemoveWebinarSlot={shouldBeEditableInThisModal ? handleInternalRemoveWebinarSlot : noOp} handleWebinarSlotChange={shouldBeEditableInThisModal ? handleInternalWebinarSlotChange : noOp} handleRemoveCourseMaterial={shouldBeEditableInThisModal ? handleInternalRemoveCourseMaterial : noOp} renderSection="advanced" isDisplayMode={isDisplayModeForSpecificForm} />}</TabsContent>}
          </Tabs>
        ) : (
          renderSummary()
        )}
      </div>

<div className="mt-auto space-y-2 border-t p-6 dark:border-border/50">
  {(shouldBeEditableInThisModal && activeTab !== 'overview') ? (
     <div className="flex w-full items-center space-x-2">
      <Button variant="outline" onClick={() => setActiveTab('overview')} className="flex-1">
        {t('common:cancel')}
      </Button>
      <Button onClick={handleInternalSave} disabled={isInternalSubmitting} className="flex-1">
        {isInternalSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {t('common:saveChanges')}
      </Button>
    </div>
  ) : (
    <>
      {(() => {
        const uniqueActions = [...new Set(availableBookingActions)];
        const clientPrimaryActions = uniqueActions.filter(a => ['cancel_by_client', 'client_reschedule_session'].includes(a));
        const otherBookingActions = uniqueActions.filter(a => !['cancel_by_client', 'client_reschedule_session'].includes(a));

        return (
          <>
            {clientPrimaryActions.length > 0 && !isCoachAuthoredAndNoClient && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {clientPrimaryActions.includes('cancel_by_client') && (
                  <Button variant="delete-outline" size="sm" onClick={handleOpenCancelModal}>
                    <X className="h-4 w-4" />
                    {t('bookings:cancelBookingButton', 'Cancel Booking')}
                  </Button>
                )}
                {clientPrimaryActions.includes('client_reschedule_session') && (
                  <Button variant="outline" size="sm" onClick={handleClientRescheduleInitiate}>
                    <Calendar className="h-4 w-4" />
                    {t('bookings:rescheduleSession', 'Reschedule Session')}
                  </Button>
                )}
              </div>
            )}
            {otherBookingActions.length > 0 && !isCoachAuthoredAndNoClient && (
              <BookingActions
                booking={currentDisplayBooking}
                onActionComplete={(actionType, actionIsLoading, result, actionError) => {
                  if (!actionError && !actionIsLoading) {
                    queryClient.invalidateQueries(['booking', actualApiBookingId]);
                    queryClient.invalidateQueries(['userSessions']);
                    queryClient.invalidateQueries(['userCalendar']);
                    queryClient.invalidateQueries(['coachSessions', currentDisplayBooking?.coach?._id]);
                    if (['accept', 'decline', 'cancel_by_client', 'cancel_by_coach'].includes(actionType)) {
                      onClose({ action: actionType, bookingId: actualApiBookingId });
                    }
                  }
                }}
                onCancelBookingInitiate={handleOpenCancelModal}
                onClientRescheduleInitiate={handleClientRescheduleInitiate}
                onSuggestReschedule={handleOpenSuggestAlternativeTimeModal}
                variant={source === 'notification' ? 'compact' : 'default'}
                className="w-full"
                availableActions={otherBookingActions}
              />
            )}
          </>
        );
      })()}

      {((isCoachAuthoredAndNoClient && isWebinarType && canCoachCancelThisBooking)) && (
        <div className="flex w-full items-center space-x-2">
          {isCoachAuthoredAndNoClient && isWebinarType && canCoachCancelThisBooking && (
            <Button onClick={handleOpenCancelModal} variant="destructive" className="flex-1" aria-label={t('bookings:cancelWebinarButton')}><Trash2 className="mr-2 h-4 w-4" />{t('bookings:cancelWebinarButton')}</Button>
          )}
        </div>
      )}
    </>
  )}
   {clientCanRequestRefund && (
                        <Button variant="outline" className="w-full" onClick={() => setShowRefundModal(true)}>
                            <Undo />
                            {t('refunds.requestRefundButton', 'Request a Refund')}
                        </Button>
                    )}
                    {coachCanRespondToRefundRequest && (
                    <Button variant="default" className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setShowRefundResponseModal(true)}>
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        {t('refunds.reviewRequestButton', 'Review Refund Request')}
                    </Button>
                )}

                 {coachCanProactivelyRefund && (
                    <Button variant="outline" className="w-full" onClick={() => setShowCoachRefundModal(true)}>
                        <Undo className="mr-2 h-4 w-4" />
                        {t('refunds.issueRefundButton', 'Issue Refund')}
                    </Button>
                )}
            </div>

      {showMessageInput && renderMessageInput()}
    </>
  );
};

  const clientCanRequestRefund = useMemo(() => {
        if (!currentDisplayBooking || !isClientOfBooking) return false;
        
        const isEffectivelyCompleted = currentDisplayBooking.status === 'completed' || (currentDisplayBooking.status === 'confirmed' && new Date(currentDisplayBooking.end) < new Date());
        const hasPayment = currentDisplayBooking.price?.final?.amount?.amount > 0 && currentDisplayBooking.payment?.status === 'completed';
        
        if (!isEffectivelyCompleted || !hasPayment) return false;

        const completedAt = new Date(currentDisplayBooking.end);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const isWithin7Days = completedAt > sevenDaysAgo;
        const noDisputeOpen = !currentDisplayBooking.disputeTicket;

        return isWithin7Days && noDisputeOpen;
    }, [currentDisplayBooking, isClientOfBooking]);

    const getDisputeStatusBadge = (disputeTicket) => {
        if (!disputeTicket || !disputeTicket.status) return null;
        const statusKey = disputeTicket.status;
        const statusText = t(`refunds.statuses.${statusKey}`, { defaultValue: statusKey.replace(/_/g, ' ') });
        
        let variant = 'secondary';
        if (statusKey === 'awaiting_coach_response') variant = 'warning';
        if (statusKey === 'escalated_to_admin') variant = 'destructive';
        if (statusKey === 'closed' || statusKey === 'resolved') variant = 'success';
        if (statusKey === 'resolved_by_coach') variant = 'info';

        return (
            <div className="flex items-center gap-2">
                <Badge variant={variant}>{statusText}</Badge>
                <Button variant="outline" size="sm" onClick={() => setShowRefundModal(true)}>
                    {t('refunds.viewRequestDetails', 'View Details')}
                </Button>
            </div>
        );
    };

     const paymentRecordForRefund = currentDisplayBooking?.payment?.paymentRecord;
    const maxRefundableForModal = paymentRecordForRefund?.amount ? paymentRecordForRefund.amount.total - (paymentRecordForRefund.amount.refunded || 0) : 0;

return (
  <>
    <Dialog
    open={true}
    onOpenChange={(isOpen) => {
      if (!isOpen && !isPaymentInProgress && !showPaymentPopup && !showCancelModal && !showSuggestAlternativeTimeModal) {
        handleCloseAttempt();
      }
    }}
    modal={!(showImageGallery || showCancelModal || showSuggestAlternativeTimeModal || showPaymentPopup)}
  >
    <DialogContent
        ref={modalRef}
        draggable
        className="p-0 sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%]"
      >
        <DialogHeader className="sr-only">
        <DialogTitle>{currentDisplayBooking?.title || t('bookings:bookingDetails')}</DialogTitle>
          <DialogDescription id="booking-details-modal-description">
            {currentDisplayBooking?.description || t('bookings:bookingDetailsDescription', 'View details and manage your booking.')}
          </DialogDescription>
        </DialogHeader>
        <ErrorBoundary>
          {renderContent()}
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
    
{showCancelModal && (
      <CancellationModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setCancellationDetails(null);
        }}
        booking={currentDisplayBooking}
        cancellationDetails={cancellationDetails}
        isCalculating={isCalculatingCancellation}
        isCancelling={isCancelling}
        onConfirm={handleConfirmCancellation}
        sessionTitleForCancellationPrompt={sessionTitleForCancellationPrompt}
        isCoachOfBooking={isCoachOfBooking}
        isWebinarType={isWebinarType}
      />
    )}

    {showSuggestAlternativeTimeModal && currentDisplayBooking && user && (
        <SuggestAlternativeTimeModal
          isOpen={showSuggestAlternativeTimeModal}
          onClose={() => setShowSuggestAlternativeTimeModal(false)}
          booking={currentDisplayBooking}
          currentUserRole={user.role}
          existingProposal={activeCoachProposalForClient}
          onSubmitProposal={(payload) => {
            if (payload.proposerRole === 'coach') {
              return handleCoachSubmitProposalCallback(payload.bookingId, payload.proposedSlots, payload.message);
            } else if (user.role === 'client' && payload.action === 'approve') {
              return handleClientRespondToProposalCallback(payload.bookingId, payload.requestId, 'approve', payload.selectedTime, payload.message);
            } else if (user.role === 'client' && payload.action === 'decline') {
              return handleClientRespondToProposalCallback(payload.bookingId, payload.requestId, 'decline', null, payload.message);
            } else if (user.role === 'client') {
               return handleConfirmReschedule(payload.proposedSlots, payload.message);
            }
          }}
          onCoachSubmitProposal={handleCoachSubmitProposalCallback}
          onClientRespond={handleClientRespondToProposalCallback}
          onClientProposeInitialReschedule={handleConfirmReschedule}
          bookingId={actualApiBookingId}
          initialEligibilityData={rescheduleEligibility}
          fetchCoachAvailabilityForReschedule={getCoachAvailabilityForReschedule}
        />
      )}

        {showRefundModal && (
                <RefundRequestModal
                    booking={currentDisplayBooking}
                    isOpen={showRefundModal}
                    onClose={() => setShowRefundModal(false)}
                />
            )}

             {showRefundResponseModal && (
                <RefundResponseModal
                    booking={currentDisplayBooking}
                    isOpen={showRefundResponseModal}
                    onClose={() => setShowRefundResponseModal(false)}
                />
            )}

            {showCoachRefundModal && paymentRecordForRefund && (
                <CoachRefundModal
                    payment={paymentRecordForRefund}
                    maxRefundable={maxRefundableForModal}
                    isOpen={showCoachRefundModal}
                    onClose={() => setShowCoachRefundModal(false)}
                />
            )}
  
    <AnimatePresence>
      {showPaymentPopup && (
        <PaymentPopup
          key={`payment-popup-${webinarPaymentConfig ? webinarPaymentConfig.bookingId : actualApiBookingId}`}
          isOpen={showPaymentPopup}
          onClose={() => {
              setShowPaymentPopup(false);
              const flowToCleanup = webinarPaymentConfig ? webinarPaymentConfig.paymentIntentId : actualApiBookingId;
              PaymentOrchestrator.handleCleanup(flowToCleanup, {
                  source: 'payment_popup_close',
                  reason: 'popup_closed_by_user_or_completion',
                  preserveState: false, 
              });
              setWebinarPaymentConfig(null); 
          }}
          onComplete={webinarPaymentConfig ? webinarPaymentConfig.onComplete : handlePaymentComplete}
          bookingId={webinarPaymentConfig ? webinarPaymentConfig.bookingId : actualApiBookingId}
          contextualBookingId={webinarPaymentConfig ? webinarPaymentConfig.contextualBookingId : undefined}
          amount={webinarPaymentConfig ? webinarPaymentConfig.amount : currentDisplayBooking?.price?.final?.amount?.amount}
          currency={webinarPaymentConfig ? webinarPaymentConfig.currency : (currentDisplayBooking?.price?.currency || 'CHF')}
          sessionStartTime={webinarPaymentConfig ? webinarPaymentConfig.sessionStartTime : new Date(currentDisplayBooking?.start || 0)}
          clientSecret={webinarPaymentConfig ? webinarPaymentConfig.clientSecret : (currentDisplayBooking?.payment?.stripe?.clientSecret || currentDisplayBooking?.payment?.paymentRecord?.stripe?.clientSecret)}
          priceDetails={webinarPaymentConfig ? webinarPaymentConfig.priceDetails : currentDisplayBooking?.price}
          stripePromise={stripePromise}
          paymentIntentId={webinarPaymentConfig ? webinarPaymentConfig.paymentIntentId : currentDisplayBooking?.payment?.stripe?.paymentIntentId}
        />
      )}
    </AnimatePresence>
    
    {showUnsavedChangesModal && (
        <Dialog open={showUnsavedChangesModal} onOpenChange={setShowUnsavedChangesModal}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('common:unsavedChangesTitle', "Unsaved Changes")}</DialogTitle>
                    <DialogDescription>
                        {t('common:unsavedChangesDescription', "You have unsaved changes. Are you sure you want to discard them and close?")}
                    </DialogDescription>
                </DialogHeader>
               <DialogFooter className="gap-2 sm:justify-end">
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={() => {
                            setShowUnsavedChangesModal(false);
                            onClose();
                        }}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('common:discardChanges', "Discard Changes")}
                    </Button>
                     <Button
                        type="button"
                        onClick={() => setShowUnsavedChangesModal(false)}
                    >
                        {t('common:keepEditing', "Keep Editing")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </>
  );
};

BookingDetailsModal.propTypes = {
  bookingId: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuggest: PropTypes.func.isRequired,
  existingBooking: PropTypes.object,
  isLoadingProp: PropTypes.bool,
  isInitialData: PropTypes.bool,
  source: PropTypes.string,
  onOpenEditModal: PropTypes.func,
  initialAction: PropTypes.string,
  onSave: PropTypes.func,
  sessionTypes: PropTypes.array,
};

BookingDetailsModal.defaultProps = {
  existingBooking: null,
  isLoadingProp: false,
  isInitialData: false,
  source: 'default',
  initialAction: null,
  onOpenEditModal: null,
  onSave: null,
  sessionTypes: [],
};

export default memo(BookingDetailsModal);