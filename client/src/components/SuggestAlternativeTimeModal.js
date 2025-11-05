// src/components/SuggestAlternativeTimeModal.js

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import * as Dialog from '@radix-ui/react-dialog';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { getCoachAvailability } from '../services/coachAPI'; 
import { checkRescheduleEligibility, submitCoachTimeProposal as submitCoachProposalAPI   } from '../services/bookingAPI';
import { useQueryClient } from 'react-query';
import { X, Calendar, Clock, PlusCircle, Trash2, Send, Check, AlertCircle, Loader2, CheckSquare, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
// Removed formatTime import, will use explicit local formatters
import { calculateDuration } from '../utils/dateUtils';
import { logger } from '../utils/logger';
import { registerLocale } from 'react-datepicker';
import { de, enUS, fr, es } from 'date-fns/locale'; 
import { useToast } from '../hooks/useToast';

registerLocale('de', de);
registerLocale('en', enUS); // enUS is a common mapping for 'en'
registerLocale('fr', fr);
registerLocale('es', es);

const MAX_PROPOSED_SLOTS = 3;
const PROPOSER_MESSAGE_TRUNCATE_LENGTH = 150;

const SuggestAlternativeTimeModal = ({
  isOpen,
  onClose,
  booking,
  currentUserRole,
  existingProposal,
  onSubmitProposal, 
  onCoachSubmitProposal,
  onClientProposeInitialReschedule,
  onCoachRespondToClientRequest,
  onClientRespondToCoachProposal,
  bookingId,
  initialEligibilityData, 
  fetchCoachAvailabilityForReschedule,
  modeOverride,
}) => {
  const { t, i18n } = useTranslation(['bookings', 'common']);
  const { showToast } = useToast();
  const [mode, setMode] = useState('propose');
  const [newProposedSlots, setNewProposedSlots] = useState([]);
  const [proposalMessage, setProposalMessage] = useState('');
  const [selectedSlotByClient, setSelectedSlotByClient] = useState(null);
  const [selectedSlotByCoach, setSelectedSlotByCoach] = useState(null); 
  const [clientResponseMessage, setClientResponseMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isProposerMessageExpanded, setIsProposerMessageExpanded] = useState(false);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 });
  const [isPositionManagedByJS, setIsPositionManagedByJS] = useState(false);
  const modalRef = useRef(null);

  const [rescheduleEligibility, setRescheduleEligibility] = useState(initialEligibilityData);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [coachAvailabilitySlots, setCoachAvailabilitySlots] = useState([]); 
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityCalendarMonth, setAvailabilityCalendarMonth] = useState(new Date());
  const [tempSelectedDateForClient, setTempSelectedDateForClient] = useState(null);
  const queryClient = useQueryClient();

  const [coachSelectedAction, setCoachSelectedAction] = useState('');
  const [coachSelectedClientSlotForApproval, setCoachSelectedClientSlotForApproval] = useState(null);
  const [coachResponseMessage, setCoachResponseMessage] = useState('');

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
    if (!isOpen) {
      setIsPositionManagedByJS(false); 
    }
  }, [isOpen]);

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

  const originalBookingDurationMinutes = useMemo(() => {
    if (booking?.originalStart && booking?.originalEnd) {
      return calculateDuration(booking.originalStart, booking.originalEnd, 'minutes');
    }
    let durationInMinutes = 60;
    if (booking?.start && booking?.end) {
        durationInMinutes = calculateDuration(booking.start, booking.end, 'minutes');
    } else if (booking?.duration) {
        durationInMinutes = booking.duration;
    }
    return durationInMinutes;
  }, [booking]);

   const formatDateForDisplay = useCallback((dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet');
    const date = new Date(dateStrOrObj);
    if (isNaN(date.getTime())) {
      logger.warn(`[SuggestAlternativeTimeModal] Invalid date passed to formatDateForDisplay: ${dateStrOrObj}`);
      return t('common:invalidDate');
    }
    return date.toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' });
  }, [i18n.language, t]);

  const formatTimeForDisplay = useCallback((dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet');
    const date = new Date(dateStrOrObj);
    if (isNaN(date.getTime())) {
      logger.warn(`[SuggestAlternativeTimeModal] Invalid date passed to formatTimeForDisplay: ${dateStrOrObj}`);
      return t('common:invalidTime', 'Invalid Time');
    }
    return date.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  }, [i18n.language, t]);

  const formatDateTimeForDisplay = useCallback((dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet');
    const date = new Date(dateStrOrObj);
    if (isNaN(date.getTime())) {
      logger.warn(`[SuggestAlternativeTimeModal] Invalid date passed to formatDateTimeForDisplay: ${dateStrOrObj}`);
      return t('common:invalidDate');
    }
    return date.toLocaleString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }, [i18n.language, t]);

  const formatEuropeanDateTime = useCallback((dateStrOrObj) => {
    if (!dateStrOrObj) return t('common:notSet', 'Not set');
    const date = new Date(dateStrOrObj);
    if (isNaN(date.getTime())) {
      logger.warn(`[SuggestAlternativeTimeModal] Invalid date passed to formatEuropeanDateTime: ${dateStrOrObj}`);
      return t('common:invalidDate', 'Invalid Date');
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }, [t]);

  const formatEuropeanTimeOnly = useCallback((dateStrOrObj) => {
    if (!dateStrOrObj) return '';
    const date = new Date(dateStrOrObj);
    if (isNaN(date.getTime())) {
      logger.warn(`[SuggestAlternativeTimeModal] Invalid date passed to formatEuropeanTimeOnly: ${dateStrOrObj}`);
      return '';
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }, []);

  const calculateDefaultProposedSlot = useCallback((baseTimeSource = 'booking') => {
    let proposedStartTimeCandidate;
    const now = new Date();

    if (baseTimeSource === 'booking' && booking?.start) {
      let originalBookingEndDate;
      if (booking.end) {
        originalBookingEndDate = new Date(booking.end);
      } else {
        originalBookingEndDate = new Date(new Date(booking.start).getTime() + originalBookingDurationMinutes * 60000);
      }
      proposedStartTimeCandidate = new Date(originalBookingEndDate.getTime());
    } else if (baseTimeSource instanceof Date) { // If a specific date object is passed
      proposedStartTimeCandidate = new Date(baseTimeSource.getTime());
    }
    else { // Fallback to now + buffer
      proposedStartTimeCandidate = new Date(now.getTime() + 15 * 60000); // Default to 15 mins from now
    }
    
    // Round to next 15-minute interval (or current if it's already on a 15-min mark and in future)
    // Ensure it's strictly after the base time if 'booking' or a specific time was the source
    if (baseTimeSource === 'booking' || baseTimeSource instanceof Date) {
         proposedStartTimeCandidate.setMinutes(proposedStartTimeCandidate.getMinutes() + 1); 
    }

    const remainder = proposedStartTimeCandidate.getMinutes() % 15;
    if (remainder !== 0) {
      proposedStartTimeCandidate.setMinutes(proposedStartTimeCandidate.getMinutes() + (15 - remainder));
    }
    proposedStartTimeCandidate.setSeconds(0);
    proposedStartTimeCandidate.setMilliseconds(0);

    // If the calculated slot is in the past, or too soon, adjust
    if (proposedStartTimeCandidate < now) {
      proposedStartTimeCandidate = new Date(now.getTime());
      proposedStartTimeCandidate.setMinutes(proposedStartTimeCandidate.getMinutes() + 1); // Ensure it's in the future
      const currentRemainder = proposedStartTimeCandidate.getMinutes() % 15;
      if (currentRemainder !== 0) {
        proposedStartTimeCandidate.setMinutes(proposedStartTimeCandidate.getMinutes() + (15 - currentRemainder));
      }
      proposedStartTimeCandidate.setSeconds(0);
      proposedStartTimeCandidate.setMilliseconds(0);
    }
    
    // If this results in a time too late today (e.g., after 10 PM), move to tomorrow 9 AM
    if (proposedStartTimeCandidate.getHours() >= 22) {
      proposedStartTimeCandidate.setDate(proposedStartTimeCandidate.getDate() + 1);
      proposedStartTimeCandidate.setHours(9, 0, 0, 0);
    }
    
    const slotDate = new Date(proposedStartTimeCandidate.getFullYear(), proposedStartTimeCandidate.getMonth(), proposedStartTimeCandidate.getDate());
    const slotStartTime = new Date(proposedStartTimeCandidate);
    const slotEndTime = new Date(slotStartTime.getTime() + originalBookingDurationMinutes * 60000);

    return { date: slotDate, startTime: slotStartTime, endTime: slotEndTime };

  }, [booking, originalBookingDurationMinutes]);

  const checkClientEligibilityAndFetchAvailability = async () => {
    if (!booking?._id) return;
    setIsCheckingEligibility(true);
    try {
        const eligibility = await checkRescheduleEligibility(booking._id);
        setRescheduleEligibility(eligibility);
        if (eligibility.canReschedule) {
            fetchCoachAvailabilityForClient(new Date(booking?.start || Date.now()));
            const initialClientSlot = calculateDefaultProposedSlot(booking?.start ? new Date(booking.start) : 'booking');
            setNewProposedSlots([initialClientSlot]);
        } else {
            setError(eligibility.reasonCode ? t(`bookings:rescheduleEligibility.${eligibility.reasonCode}`, eligibility.reasonCode) : t('bookings:errors.rescheduleNotAllowed'));
            showToast({ type: 'info', message: eligibility.reasonCode ? t(`bookings:rescheduleEligibility.${eligibility.reasonCode}`, eligibility.reasonCode) : t('bookings:errors.rescheduleNotAllowed') });
        }
    } catch (err) {
        logger.error('[SuggestAlternativeTimeModal] Error checking client eligibility:', err);
        setError(err.message || t('bookings:errors.rescheduleEligibilityCheckFailed'));
        showToast({ type: 'error', message: err.message || t('bookings:errors.rescheduleEligibilityCheckFailed') });
    } finally {
        setIsCheckingEligibility(false);
    }
};

const fetchCoachAvailabilityForClient = async (dateForMonth) => {
    if (!booking?.coach || !booking?._id || !booking?.start || !booking?.end) return;
    const coachIdToFetch = typeof booking.coach === 'object' ? booking.coach._id : booking.coach;
    
    setIsLoadingAvailability(true);
    setCoachAvailabilitySlots([]);
    try {
        const durationMinutes = calculateDuration(booking.start, booking.end, 'minutes');
        const availabilityData = await fetchCoachAvailabilityForReschedule( // Use the prop
            coachIdToFetch,
            new Date(dateForMonth).toISOString().split('T')[0], // Send just the date part
            booking._id, // excludeBookingId
            durationMinutes // targetDurationMinutes
        );
        setCoachAvailabilitySlots(availabilityData.availability || []); // Expects { availability: [] }
    } catch (err) {
        logger.error('[SuggestAlternativeTimeModal] Error fetching coach availability for client:', err);
        setError(err.message || t('bookings:errors.fetchAvailabilityFailed'));
        showToast({ type: 'error', message: t('bookings:errors.fetchAvailabilityFailed') });
    } finally {
        setIsLoadingAvailability(false);
    }
};

const handleClientAvailabilityMonthChange = (date) => {
    setAvailabilityCalendarMonth(date);
    fetchCoachAvailabilityForClient(date);
    setTempSelectedDateForClient(null);
    setNewProposedSlots([]); // Clear selected slots when month changes
};

const handleClientDateSelect = (date) => {
    setTempSelectedDateForClient(date);
    // Filter coachAvailabilitySlots for the selected date and pre-fill newProposedSlots
    // Or let user pick from filtered slots displayed below the calendar
    // For simplicity, let's clear newProposedSlots and let user pick time slots
    setNewProposedSlots([]); 
};

const handleClientTimeSlotSelect = (slot) => {
    // This function would be called when a client clicks on an available time slot for their proposal
    // For now, we use the DatePicker approach, so this might not be directly used for selection
    // but for populating newProposedSlots if they pick from a list.
    setNewProposedSlots(prev => {
        const isSelected = prev.some(s => new Date(s.startTime).getTime() === new Date(slot.start).getTime());
        if (isSelected) {
            return prev.filter(s => new Date(s.startTime).getTime() !== new Date(slot.start).getTime());
        } else {
            if (prev.length < MAX_PROPOSED_SLOTS) {
                return [...prev, { date: new Date(slot.start), startTime: new Date(slot.start), endTime: new Date(slot.end) }];
            }
            showToast({type: 'info', message: t('bookings:maxRescheduleSlotsReached')});
            return prev;
        }
    });
};

const renderCoachSelectFromClientProposalForm = () => {
    const clientProposedSlots = (existingProposal?.proposedSlots || []).map(s => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end)
    }));
    const isMessageLong = existingProposal?.proposerMessage?.length > PROPOSER_MESSAGE_TRUNCATE_LENGTH;

    return (
        <div className="suggest-alternative-modal__response-section">
            <h4>{t('bookings:clientProposedTimesLabel', "Client's Proposed Times")}</h4>
            {existingProposal?.proposerMessage && (
                <div className="suggest-alternative-modal__proposer-message mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="font-semibold text-blue-800 flex items-center">
                        <MessageSquare size={16} className="mr-2" />
                        {t('bookings:clientMessageLabel', "Client's Message")}:
                    </p>
                    <blockquote className={`proposer-message-content ${isMessageLong && !isProposerMessageExpanded ? 'truncated' : ''} ${isProposerMessageExpanded ? 'expanded' : ''}`}>
                        {existingProposal.proposerMessage}
                    </blockquote>
                    {isMessageLong && (
                        <button 
                            onClick={() => setIsProposerMessageExpanded(!isProposerMessageExpanded)} 
                            className="proposer-message-toggle-button"
                            aria-label={isProposerMessageExpanded ? t('bookings:showLess') : t('bookings:showMore')}
                        >
                            {isProposerMessageExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                    )}
                </div>
            )}
             <p className="text-sm text-gray-600 mb-2">{t('bookings:coachSelectOneToApproveOrCounter', "Select one of the client's proposed times to approve, or decline/propose new times.")}</p>
            <div className="suggest-alternative-modal__proposed-slots-list mb-4">
                {clientProposedSlots.map((slot, index) => (
                    <div
                        key={index}
                        className={`suggest-alternative-modal__proposed-slot-item ${selectedSlotByCoach && new Date(selectedSlotByCoach.start).getTime() === slot.start.getTime() ? 'selected' : ''}`}
                        onClick={() => setSelectedSlotByCoach(slot)}
                        role="radio"
                        aria-checked={selectedSlotByCoach && new Date(selectedSlotByCoach.start).getTime() === slot.start.getTime()}
                        tabIndex={0}
                        onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') setSelectedSlotByCoach(slot);}}
                    >
                        <input
                            type="radio"
                            id={`client-proposed-slot-${index}`}
                            name="clientProposedSlotForCoachApproval"
                            value={index.toString()}
                            checked={selectedSlotByCoach && new Date(selectedSlotByCoach.start).getTime() === slot.start.getTime()}
                            onChange={() => setSelectedSlotByCoach(slot)}
                            className="form-radio"
                        />
                        <label htmlFor={`client-proposed-slot-${index}`}>{formatDateForDisplay(slot.start)} {formatTimeForDisplay(slot.start)} - {formatTimeForDisplay(slot.end)}</label>
                    </div>
                ))}
            </div>
            
            <div className="mt-4">
                <label htmlFor="coachResponseMessage" className="suggest-alternative-modal__label block mb-1">{t('common:messageOptional')}</label>
                <textarea
                    id="coachResponseMessage"
                    value={coachResponseMessage}
                    onChange={(e) => setCoachResponseMessage(e.target.value)}
                    rows="3"
                    className="suggest-alternative-modal__textarea"
                    placeholder={t('bookings:rescheduleMessagePlaceholderCoach')}
                />
            </div>
        </div>
    );
};

 const handleSuggestNewTimeFromResponseMode = () => {
    logger.info(`[SuggestAlternativeTimeModal] handleSuggestNewTimeFromResponseMode called. Current mode: ${mode}`);
    if (mode === 'client_select_from_coach_proposal') {
      setMode('client_counter_propose');
    } else if (mode === 'coach_select_from_client_proposal') {
      setMode('coach_counter_propose');
    }
  };

useEffect(() => {
    if (!isOpen || !booking) return;
    setError(null);
    setProposalMessage('');
    setClientResponseMessage('');
    setNewProposedSlots([]);
    setSelectedSlotByClient(null);
    setSelectedSlotByCoach(null);
    setRescheduleEligibility(initialEligibilityData); 
    setAvailabilityCalendarMonth(new Date(booking?.start || Date.now()));
    setTempSelectedDateForClient(null);
    setCoachSelectedAction('approve');
    setCoachSelectedClientSlotForApproval(null);
    setCoachResponseMessage('');
    setIsProposerMessageExpanded(false);

    logger.info('[SuggestAlternativeTimeModal Effect] Determining mode and initializing.', { 
        currentUserRole, 
        hasExistingProposal: !!existingProposal, 
        existingProposalDetails: existingProposal,
        bookingStatus: booking?.status,
        initialEligibilityDataPassed: initialEligibilityData,
        modeOverridePassed: modeOverride,
    });

    if (modeOverride === 'coach_counter_propose' && currentUserRole === 'coach' && existingProposal && existingProposal.proposerRole === 'client') {
        setMode('coach_counter_propose');
        
        const initializeCoachCounterProposalSlot = async () => {
            setIsLoadingAvailability(true);
            let coachAvailability = [];
            try {
                if (fetchCoachAvailabilityForReschedule && booking?.coach && booking?._id) {
                    const coachIdToFetch = typeof booking.coach === 'object' ? booking.coach._id : booking.coach;
                    const availabilityData = await fetchCoachAvailabilityForReschedule(
                        coachIdToFetch,
                        new Date().toISOString().split('T')[0], 
                        booking._id, 
                        originalBookingDurationMinutes
                    );
                    coachAvailability = availabilityData.availability || [];
                }
            } catch (err) {
                logger.error('[SuggestAlternativeTimeModal Effect] Error fetching coach availability for counter-proposal:', err);
            } finally {
                setIsLoadingAvailability(false);
            }

            const clientProposedSlotsAsDates = (existingProposal?.proposedSlots || []).map(s => ({
                start: new Date(s.start),
                end: new Date(s.end)
            }));

            let bestInitialSlot = null;

            if (coachAvailability.length > 0) {
                const now = new Date();
                const originalBookingTimeForComparison = booking?.start ? new Date(booking.start) : now;


                const sortedAvailableCoachSlots = coachAvailability
                    .map(s => ({ start: new Date(s.start), end: new Date(s.end) }))
                    .filter(s => {
                        const slotStartTime = new Date(s.start);
                        // Ensure slot starts in the future and ideally after the original booking time.
                        // If original booking time is in the past, just ensure slot is in the future.
                        return slotStartTime > now && slotStartTime > originalBookingTimeForComparison;
                    })
                    .sort((a, b) => a.start - b.start);

                for (const coachSlot of sortedAvailableCoachSlots) {
                    const potentialStartTime = new Date(coachSlot.start);
                    const potentialEndTime = new Date(potentialStartTime.getTime() + originalBookingDurationMinutes * 60000);

                    if (potentialEndTime <= coachSlot.end) {
                        const isConflictingWithClientProposal = clientProposedSlotsAsDates.some(clientSlot =>
                            (potentialStartTime < clientSlot.end && potentialEndTime > clientSlot.start)
                        );

                        if (!isConflictingWithClientProposal) {
                            bestInitialSlot = {
                                date: new Date(potentialStartTime.getFullYear(), potentialStartTime.getMonth(), potentialStartTime.getDate()),
                                startTime: potentialStartTime,
                                endTime: potentialEndTime
                            };
                            break; 
                        }
                    }
                }
            }

            if (bestInitialSlot) {
                setNewProposedSlots([bestInitialSlot]);
            } else {
                let baseTimeForDefault = new Date(); 
                const originalBookingEndTime = booking?.end ? new Date(booking.end) : (booking?.start ? new Date(new Date(booking.start).getTime() + originalBookingDurationMinutes * 60000) : new Date(0));
                
                if (originalBookingEndTime > baseTimeForDefault) {
                    baseTimeForDefault = originalBookingEndTime;
                }

                if (clientProposedSlotsAsDates.length > 0) {
                    const lastClientSlotEnd = clientProposedSlotsAsDates.reduce((latest, slot) => slot.end > latest ? slot.end : latest, new Date(0));
                    if (lastClientSlotEnd > baseTimeForDefault) {
                        baseTimeForDefault = lastClientSlotEnd;
                    }
                }
                
                let defaultSlotCandidate = calculateDefaultProposedSlot(new Date(baseTimeForDefault.getTime())); 
                
                let attempts = 0;
                const MAX_ATTEMPTS = 10; 
                while (
                    clientProposedSlotsAsDates.some(clientSlot =>
                        (defaultSlotCandidate.startTime < clientSlot.end && defaultSlotCandidate.endTime > clientSlot.start)
                    ) && attempts < MAX_ATTEMPTS
                ) {
                    defaultSlotCandidate = calculateDefaultProposedSlot(new Date(defaultSlotCandidate.endTime.getTime() + 15 * 60000));
                    attempts++;
                }
                if (attempts === MAX_ATTEMPTS && clientProposedSlotsAsDates.some(clientSlot =>
                        (defaultSlotCandidate.startTime < clientSlot.end && defaultSlotCandidate.endTime > clientSlot.start))) {
                    logger.warn("[SuggestAlternativeTimeModal Effect] Could not find a non-conflicting default slot for coach counter-proposal after multiple attempts. Using last calculated candidate, which might conflict.");
                     showToast({ type: 'warning', message: t('bookings:errors.couldNotAutoSuggestNonConflictingTime')});
                }
                setNewProposedSlots([defaultSlotCandidate]);
            }
            setProposalMessage(''); 
        };

        initializeCoachCounterProposalSlot();
        logger.info('[SuggestAlternativeTimeModal Effect] Mode: coach_counter_propose. Existing client proposal will be displayed. Coach will propose new times.', { clientProposal: existingProposal });
        return; 
    }

    if (modeOverride === 'client_select_from_coach_proposal' && currentUserRole === 'client' && existingProposal?.proposerRole === 'coach') {
        setMode('client_select_from_coach_proposal');
        const coachProposedSlots = (existingProposal.proposedSlots || []).map(s => ({
            ...s,
            start: new Date(s.start),
            end: new Date(s.end)
        }));
        if (coachProposedSlots.length > 0) {
            setSelectedSlotByClient(coachProposedSlots[0]); // Pre-select first option
        }
        logger.info('[SuggestAlternativeTimeModal Effect] Mode: client_select_from_coach_proposal. Client will select from coach slots.');
        return;
    }

    if (modeOverride === 'client_counter_propose' && currentUserRole === 'client' && existingProposal?.proposerRole === 'coach') {
        setMode('client_counter_propose');
         const initializeClientCounterProposalSlot = async () => {
            setIsLoadingAvailability(true);
            let coachAvailability = [];
            try {
                if (fetchCoachAvailabilityForReschedule && booking?.coach && booking?._id) {
                    const coachIdToFetch = typeof booking.coach === 'object' ? booking.coach._id : booking.coach;
                    const availabilityData = await fetchCoachAvailabilityForReschedule(
                        coachIdToFetch,
                        new Date().toISOString().split('T')[0], 
                        booking._id, 
                        originalBookingDurationMinutes
                    );
                    coachAvailability = availabilityData.availability || [];
                }
            } catch (err) {
                logger.error('[SuggestAlternativeTimeModal Effect] Error fetching coach availability for client counter-proposal:', err);
            } finally {
                setIsLoadingAvailability(false);
            }

            const coachOriginalProposedSlotsAsDates = (existingProposal?.proposedSlots || []).map(s => ({
                start: new Date(s.start),
                end: new Date(s.end)
            }));

            let bestInitialSlot = null;

            if (coachAvailability.length > 0) {
                 const now = new Date();
                 const originalBookingTimeForComparison = booking?.start ? new Date(booking.start) : now;

                const sortedAvailableCoachSlots = coachAvailability
                    .map(s => ({ start: new Date(s.start), end: new Date(s.end) }))
                    .filter(s => s.start > now && s.start > originalBookingTimeForComparison)
                    .sort((a, b) => a.start - b.start);

                for (const coachSlot of sortedAvailableCoachSlots) {
                    const potentialStartTime = new Date(coachSlot.start);
                    const potentialEndTime = new Date(potentialStartTime.getTime() + originalBookingDurationMinutes * 60000);

                    if (potentialEndTime <= coachSlot.end) {
                         const isConflictingWithCoachOriginalProposal = coachOriginalProposedSlotsAsDates.some(coachOrigSlot =>
                            (potentialStartTime < coachOrigSlot.end && potentialEndTime > coachOrigSlot.start)
                        );
                        if (!isConflictingWithCoachOriginalProposal) {
                            bestInitialSlot = {
                                date: new Date(potentialStartTime.getFullYear(), potentialStartTime.getMonth(), potentialStartTime.getDate()),
                                startTime: potentialStartTime,
                                endTime: potentialEndTime
                            };
                            break; 
                        }
                    }
                }
            }
            
            if (bestInitialSlot) {
                setNewProposedSlots([bestInitialSlot]);
            } else {
                 let baseTimeForDefault = new Date(); 
                 const originalBookingEndTime = booking?.end ? new Date(booking.end) : (booking?.start ? new Date(new Date(booking.start).getTime() + originalBookingDurationMinutes * 60000) : new Date(0));
                
                if (originalBookingEndTime > baseTimeForDefault) {
                    baseTimeForDefault = originalBookingEndTime;
                }

                if (coachOriginalProposedSlotsAsDates.length > 0) {
                    const lastCoachSlotEnd = coachOriginalProposedSlotsAsDates.reduce((latest, slot) => slot.end > latest ? slot.end : latest, new Date(0));
                    if (lastCoachSlotEnd > baseTimeForDefault) {
                        baseTimeForDefault = lastCoachSlotEnd;
                    }
                }
                
                let defaultSlotCandidate = calculateDefaultProposedSlot(new Date(baseTimeForDefault.getTime())); 
                 let attempts = 0;
                const MAX_ATTEMPTS = 10; 
                while (
                    coachOriginalProposedSlotsAsDates.some(coachOrigSlot =>
                        (defaultSlotCandidate.startTime < coachOrigSlot.end && defaultSlotCandidate.endTime > coachOrigSlot.start)
                    ) && attempts < MAX_ATTEMPTS
                ) {
                    defaultSlotCandidate = calculateDefaultProposedSlot(new Date(defaultSlotCandidate.endTime.getTime() + 15 * 60000));
                    attempts++;
                }
                if (attempts === MAX_ATTEMPTS && coachOriginalProposedSlotsAsDates.some(coachOrigSlot =>
                        (defaultSlotCandidate.startTime < coachOrigSlot.end && defaultSlotCandidate.endTime > coachOrigSlot.start))) {
                    logger.warn("[SuggestAlternativeTimeModal Effect] Could not find a non-conflicting default slot for client counter-proposal after multiple attempts.");
                }
                setNewProposedSlots([defaultSlotCandidate]);
            }
            setProposalMessage(''); 
        };
        initializeClientCounterProposalSlot();
        logger.info('[SuggestAlternativeTimeModal Effect] Mode: client_counter_propose. Client will propose new times in response to coach.');
        return;
    }

if (modeOverride) {
        setMode(modeOverride);
        if (modeOverride === 'coach_select_from_client_proposal' && existingProposal?.proposedSlots?.length > 0) {
            const clientProposed = existingProposal.proposedSlots.map(s => ({
                ...s,
                start: new Date(s.start),
                end: new Date(s.end)
            }));
             if(clientProposed.length > 0 && !selectedSlotByCoach) setSelectedSlotByCoach(clientProposed[0]); 
            logger.info('[SuggestAlternativeTimeModal Effect] Mode overridden to: coach_select_from_client_proposal');
        }
        return; 
    }

    const initializeClientProposal = async () => {
        logger.info('[SuggestAlternativeTimeModal Effect] Mode: propose_client_initial. Fetching availability.');
        let fetchedAvailability = [];
        try {
            if (!booking?.coach || !booking?._id || !booking?.start || !booking?.end) {
                logger.warn('[SuggestAlternativeTimeModal Effect] Insufficient booking data for client proposal init.');
                return;
            }
            const coachIdToFetch = typeof booking.coach === 'object' ? booking.coach._id : booking.coach;
            const durationMinutes = originalBookingDurationMinutes;
            setIsLoadingAvailability(true);
            const availabilityData = await fetchCoachAvailabilityForReschedule(
                coachIdToFetch,
                new Date(booking?.start || Date.now()).toISOString().split('T')[0],
                booking._id,
                durationMinutes
            );
            fetchedAvailability = availabilityData.availability || [];
            setCoachAvailabilitySlots(fetchedAvailability);
            logger.info('[SuggestAlternativeTimeModal Effect] Coach availability fetched for client proposal.', { count: fetchedAvailability.length });
        } catch (err) {
            logger.error('[SuggestAlternativeTimeModal Effect] Error fetching coach availability for client proposal init:', err);
            setError(err.message || t('bookings:errors.fetchAvailabilityFailed'));
            showToast({ type: 'error', message: t('bookings:errors.fetchAvailabilityFailed') });
        } finally {
            setIsLoadingAvailability(false);
        }
        if (fetchedAvailability.length > 0) {
            const originalBookingEndTime = new Date(booking.end || (new Date(booking.start).getTime() + originalBookingDurationMinutes * 60000));
            const earliestAvailable = fetchedAvailability
                .map(slot => ({ ...slot, start: new Date(slot.start), end: new Date(slot.end) }))
                .filter(slot => slot.start > new Date() && slot.start > originalBookingEndTime) 
                .sort((a, b) => a.start - b.start)[0];
            if (earliestAvailable) {
                const proposedStartTime = new Date(earliestAvailable.start);
                const proposedEndTime = new Date(proposedStartTime.getTime() + originalBookingDurationMinutes * 60000);
                if (proposedEndTime <= earliestAvailable.end) {
                    setNewProposedSlots([{
                        date: new Date(proposedStartTime.getFullYear(), proposedStartTime.getMonth(), proposedStartTime.getDate()),
                        startTime: proposedStartTime,
                        endTime: proposedEndTime
                    }]);
                    logger.info('[SuggestAlternativeTimeModal Effect] Set initial proposed slot from earliest coach availability after original booking.', { slot: { start: proposedStartTime, end: proposedEndTime } });
                } else {
                    const defaultSlot = calculateDefaultProposedSlot(originalBookingEndTime);
                    setNewProposedSlots([defaultSlot]);
                    logger.info('[SuggestAlternativeTimeModal Effect] Earliest available slot after booking end is too short, using default calculated slot after original booking end.', { defaultSlot });
                }
            } else {
                const defaultSlot = calculateDefaultProposedSlot(originalBookingEndTime);
                setNewProposedSlots([defaultSlot]);
                logger.info('[SuggestAlternativeTimeModal Effect] No future coach availability found after original booking end, using default calculated slot after original booking end.', { defaultSlot });
            }
        } else {
            const originalBookingEndTimeForFallback = new Date(booking.end || (new Date(booking.start).getTime() + originalBookingDurationMinutes * 60000));
            const defaultSlot = calculateDefaultProposedSlot(originalBookingEndTimeForFallback);
            setNewProposedSlots([defaultSlot]);
            logger.info('[SuggestAlternativeTimeModal Effect] No coach availability returned, using default calculated slot after original booking end.');
        }
    };

    if (currentUserRole === 'client' && existingProposal && existingProposal.proposerRole === 'coach' && existingProposal.status === 'pending_client_action') {
        setMode('respond_client_to_coach');
        const coachProposed = existingProposal.proposedSlots.map(s => ({
            ...s,
            start: new Date(s.start),
            end: new Date(s.end)
        }));
        if (coachProposed.length > 0) {
            setSelectedSlotByClient(coachProposed[0]); 
        }
        setProposalMessage(existingProposal.proposerMessage || ''); 
        logger.info('[SuggestAlternativeTimeModal Effect] Mode: respond_client_to_coach');
    } else if (currentUserRole === 'coach' && existingProposal && existingProposal.proposerRole === 'client' && existingProposal.status === 'pending_coach_action') {
        setMode('respond_coach_to_client'); // This will now be overridden by modeOverride if present
        logger.info('[SuggestAlternativeTimeModal Effect] Mode: respond_coach_to_client (may be overridden)');
    } else if (currentUserRole === 'coach' && !existingProposal) {
        setMode('propose_coach_initial');
        const initialCoachSlot = calculateDefaultProposedSlot('booking');
        setNewProposedSlots([initialCoachSlot]);
        setProposalMessage(''); 
        logger.info('[SuggestAlternativeTimeModal Effect] Mode: propose_coach_initial');
    } else if (currentUserRole === 'client' && !existingProposal) {
        setMode('propose_client_initial');
        setCoachAvailabilitySlots([]); 
        if (initialEligibilityData?.canReschedule) {
            initializeClientProposal();
        } else if (!initialEligibilityData) {
            const performEligibilityCheck = async () => {
                if (!booking?._id) return;
                setIsCheckingEligibility(true);
                try {
                    const eligibility = await checkRescheduleEligibility(booking._id);
                    setRescheduleEligibility(eligibility);
                    if (eligibility.canReschedule) {
                        await initializeClientProposal();
                    } else {
                        setError(eligibility.reasonCode ? t(`bookings:rescheduleEligibility.${eligibility.reasonCode}`, eligibility.reasonCode) : t('bookings:errors.rescheduleNotAllowed'));
                        showToast({ type: 'info', message: eligibility.reasonCode ? t(`bookings:rescheduleEligibility.${eligibility.reasonCode}`, eligibility.reasonCode) : t('bookings:errors.rescheduleNotAllowed') });
                    }
                } catch (err) {
                    logger.error('[SuggestAlternativeTimeModal] Error checking client eligibility in effect:', err);
                    setError(err.message || t('bookings:errors.rescheduleEligibilityCheckFailed'));
                    showToast({ type: 'error', message: err.message || t('bookings:errors.rescheduleEligibilityCheckFailed') });
                     const defaultSlot = calculateDefaultProposedSlot('booking');
                     setNewProposedSlots([defaultSlot]);
                } finally {
                    setIsCheckingEligibility(false);
                }
            };
            performEligibilityCheck();
        }
    } else {
        logger.warn("[SuggestAlternativeTimeModal Effect] Fallback mode determination. Defaulting to propose_coach_initial.", { currentUserRole, existingProposal, bookingStatus: booking?.status });
        setMode('propose_coach_initial');
        const fallbackSlot = calculateDefaultProposedSlot('booking');
        setNewProposedSlots([fallbackSlot]);
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isOpen, bookingId, currentUserRole, existingProposal, initialEligibilityData, modeOverride]);

  const handleAddSlot = useCallback(() => {
    if (newProposedSlots.length < MAX_PROPOSED_SLOTS) {
      const lastSlot = newProposedSlots[newProposedSlots.length - 1];
      let baseTimeForNextSlot;

      if (lastSlot?.endTime) {
        baseTimeForNextSlot = new Date(lastSlot.endTime.getTime() + 15 * 60000); // 15 mins after last slot's end time
      } else if (lastSlot?.startTime) {
        baseTimeForNextSlot = new Date(lastSlot.startTime.getTime() + originalBookingDurationMinutes * 60000 + 15 * 60000);
      } else {
        baseTimeForNextSlot = 'now'; // Fallback to calculate from current time
      }
      
      const nextSlot = calculateDefaultProposedSlot(baseTimeForNextSlot === 'now' ? undefined : baseTimeForNextSlot);
      
      setNewProposedSlots(prevSlots => [
        ...prevSlots,
        nextSlot,
      ]);
    }
  }, [newProposedSlots, originalBookingDurationMinutes, calculateDefaultProposedSlot, MAX_PROPOSED_SLOTS]);

  const handleRemoveSlot = (index) => {
    if (newProposedSlots.length > 1) {
      const updatedSlots = newProposedSlots.filter((_, i) => i !== index);
      setNewProposedSlots(updatedSlots);
    }
  };

  const handleSlotDateTimeChange = useCallback((index, field, value) => {
    const updatedSlots = [...newProposedSlots];
    const currentSlot = { ...updatedSlots[index] }; // { date, startTime, endTime }

    if (field === 'date') { // value is a Date object from DatePicker (time part is usually 00:00:00 or noon)
        currentSlot.date = value; // The selected date
        if (currentSlot.startTime) {
            currentSlot.startTime = new Date(
                value.getFullYear(), value.getMonth(), value.getDate(),
                currentSlot.startTime.getHours(), currentSlot.startTime.getMinutes()
            );
        }
        // If startTime is set, endTime should adjust accordingly based on duration
        if (currentSlot.startTime) {
             currentSlot.endTime = new Date(currentSlot.startTime.getTime() + originalBookingDurationMinutes * 60000);
        } else if (currentSlot.endTime) { // If only endTime exists, update its date part
            currentSlot.endTime = new Date(
                value.getFullYear(), value.getMonth(), value.getDate(),
                currentSlot.endTime.getHours(), currentSlot.endTime.getMinutes()
            );
        }
    } else if (field === 'startTime') { // value is a Date object from TimePicker (date part might be today or picker's internal)
        if (!currentSlot.date && value) { // If date isn't set yet, use the date from the time picker value
            currentSlot.date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        
        if (value && currentSlot.date) { // Ensure value and date are present
            currentSlot.startTime = new Date(
                currentSlot.date.getFullYear(), currentSlot.date.getMonth(), currentSlot.date.getDate(),
                value.getHours(), value.getMinutes()
            );
            currentSlot.endTime = new Date(currentSlot.startTime.getTime() + originalBookingDurationMinutes * 60000);
        } else { // If value is null (cleared)
            currentSlot.startTime = null;
            currentSlot.endTime = null; // Or keep old end time? Clearing seems safer.
        }
    } else if (field === 'endTime') { // value is a Date object from TimePicker
        if (!currentSlot.date && value) { 
            currentSlot.date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
        }
        if (value && currentSlot.date) {
            currentSlot.endTime = new Date(
                currentSlot.date.getFullYear(), currentSlot.date.getMonth(), currentSlot.date.getDate(),
                value.getHours(), value.getMinutes()
            );
            // Note: This allows duration to change if endTime is manually set.
            // If startTime exists, user is effectively changing the duration by picking a new endTime.
        } else {
            currentSlot.endTime = null;
        }
    }
    
    updatedSlots[index] = currentSlot;
    setNewProposedSlots(updatedSlots);
  }, [newProposedSlots, originalBookingDurationMinutes]);

const handleCoachCounterProposeSubmit = async () => {
    if (!validateProposedSlots()) return;
    setIsLoading(true);
    setError(null);

    try {
        const coachProposedTimes = newProposedSlots.map(s => ({
            start: s.startTime.toISOString(),
            end: s.endTime.toISOString(),
        }));

        const clientRequestId = existingProposal?.requestId;
        if (!clientRequestId) {
            logger.error("[SuggestAlternativeTimeModal] Missing clientRequestId for counter-proposal.", { existingProposal });
            setError(t('bookings:errors.missingClientRequestId', 'Client request ID is missing. Cannot proceed.'));
            setIsLoading(false);
            return;
        }

        logger.info('[SuggestAlternativeTimeModal] Coach submitting counter-proposal:', {
            bookingId: bookingId,
            requestId: clientRequestId, 
            action: 'counter_propose',
            coachProposedTimes,
            coachMessage: proposalMessage, 
        });

        if (!onCoachRespondToClientRequest) {
            logger.error("[SuggestAlternativeTimeModal] onCoachRespondToClientRequest prop is not defined for counter-proposal.");
            setError(t('common:errors.actionFailed', 'Action failed due to a configuration issue.'));
            setIsLoading(false);
            return;
        }
        
        await onCoachRespondToClientRequest(
            bookingId,
            clientRequestId,
            'counter_propose',
            null, 
            proposalMessage, 
            coachProposedTimes 
        );
        showToast({type: 'success', message: t('bookings:counterProposalSentToast', 'New proposal sent to client successfully.')});
        onClose();
    } catch (err) {
        const errorMessage = err.message || t('common:errors.actionFailed');
        setError(errorMessage);
        showToast({type: 'error', message: errorMessage});
        logger.error("[SuggestAlternativeTimeModal] Error submitting coach counter-proposal:", err);
    } finally {
        setIsLoading(false);
    }
};

  const validateProposedSlots = () => {
    for (const slot of newProposedSlots) {
      if (!slot.date || !slot.startTime || !slot.endTime) {
        setError(t('bookings:errors.allSlotsMustBeFilled'));
        return false;
      }
      if (slot.startTime >= slot.endTime) {
        setError(t('bookings:errors.slotEndAfterStart'));
        return false;
      }
      if (slot.startTime < new Date()) {
        setError(t('bookings:errors.slotInPast'));
        return false;
      }
    }
    setError(null);
    return true;
  };

const handleProposeSubmit = async () => {
    if (!validateProposedSlots()) return;
    setIsLoading(true);
    setError(null);
    try {
        const slotsToSubmit = newProposedSlots.map(slot => ({
            start: slot.startTime.toISOString(),
            end: slot.endTime.toISOString(),
        }));

       if (mode === 'propose_coach_initial' || mode === 'propose_coach') {
            logger.info('[SuggestAlternativeTimeModal] Submitting alternative times (Coach):', {
                bookingId: bookingId,
                suggestedTimes: slotsToSubmit,
                message: proposalMessage
            });
            // Ensure onCoachSubmitProposal is designed for both initial and subsequent proposals
            // The API call in bookingAPI might need to distinguish if it's an initial proposal vs. response
            // For now, assuming onCoachSubmitProposal is general enough.
            await onCoachSubmitProposal(bookingId, slotsToSubmit, proposalMessage);
        } else if (mode === 'propose_client_initial' || mode === 'propose_client') {
            logger.info('[SuggestAlternativeTimeModal] Submitting initial reschedule proposal (Client):', {
                bookingId: bookingId,
                proposedSlots: slotsToSubmit,
                requestMessage: proposalMessage
            });
            if (onClientProposeInitialReschedule) {
                // This prop should map to requestRescheduleByClient or similar
                await onClientProposeInitialReschedule(slotsToSubmit, proposalMessage);
            } else {
                // Fallback to generic onSubmitProposal if the specific one isn't there
                // This might indicate a configuration issue in the parent component
                logger.warn("[SuggestAlternativeTimeModal] onClientProposeInitialReschedule not provided, falling back to generic onSubmitProposal for client proposal.");
                await onSubmitProposal({
                    action: 'propose', // Or a more specific action like 'propose_client_initial'
                    bookingId: bookingId,
                    proposedSlots: slotsToSubmit,
                    message: proposalMessage,
                    proposerRole: 'client'
                });
            }
        }
        onClose();
    } catch (err) {
        setError(err.message || t('common:errors.actionFailed'));
        logger.error("Error submitting proposal:", err);
    } finally {
        setIsLoading(false);
    }
};

const handleCoachRespondToClientRequestSubmit = async (action) => {
    if (action === 'approve' && !selectedSlotByCoach) {
        setError(t('bookings:errors.selectSlotToApproveReschedule', 'Please select a slot to approve.'));
        showToast({type: 'error', message: t('bookings:errors.selectSlotToApproveReschedule', 'Please select a slot to approve.')});
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
        const clientRequestId = existingProposal?.requestId;
        if (!clientRequestId && existingProposal) { // Allow if existingProposal is null (e.g. coach initiated, though this handler is for response)
            logger.error("[SuggestAlternativeTimeModal] Missing clientRequestId from existingProposal.", { existingProposal });
            setError(t('bookings:errors.missingClientRequestId', 'Client request ID is missing. Cannot proceed.'));
            showToast({type: 'error', message: t('bookings:errors.missingClientRequestId', 'Client request ID is missing. Cannot proceed.')});
            setIsLoading(false);
            return;
        }
        
        logger.info('[SuggestAlternativeTimeModal] Coach responding to client reschedule request:', {
            bookingId: bookingId,
            requestId: clientRequestId,
            action,
            selectedSlot: action === 'approve' ? selectedSlotByCoach : null,
            message: coachResponseMessage
        });

        if (!onCoachRespondToClientRequest) {
            logger.error("[SuggestAlternativeTimeModal] onCoachRespondToClientRequest prop is not defined.");
            setError(t('common:errors.actionFailed', 'Action failed due to a configuration issue.'));
            showToast({type: 'error', message: t('common:errors.actionFailed', 'Action failed due to a configuration issue.')});
            setIsLoading(false);
            return;
        }
        
        await onCoachRespondToClientRequest(
            bookingId,
            clientRequestId,
            action,
            action === 'approve' ? selectedSlotByCoach : null,
            coachResponseMessage,
            null 
        );
       showToast({type: 'success', message: action === 'approve' ? t('bookings:rescheduleApprovedByCoachToast', 'Reschedule approved successfully.') : t('bookings:rescheduleDeclinedByCoachToast', 'Reschedule request declined.') });
        onClose({ action });
    } catch (err) {
        const errorMessage = err.message || t('common:errors.actionFailed');
        setError(errorMessage);
        showToast({type: 'error', message: errorMessage});
        logger.error("[SuggestAlternativeTimeModal] Error responding to client request by coach:", err);
    } finally {
        setIsLoading(false);
    }
};

const renderCoachCounterProposalForm = () => {
    const clientOriginalProposedSlots = (existingProposal?.proposedSlots || []).map(s => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end)
    }));

    return (
        <div className="suggest-alternative-modal__counter-proposal-section">
            <div className="suggest-alternative-modal__client-original-proposal mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
                <h4 className="text-base font-semibold text-slate-800 mb-3 border-b pb-2 flex items-center">
                    <CheckSquare size={18} className="mr-2 text-blue-600" />
                    {t('bookings:clientOriginalRequestTitle', "Client's Original Request Details")}
                </h4>
                {existingProposal?.proposerMessage && (
                    <div className="mb-3">
                        <p className="font-medium text-sm text-slate-700">{t('bookings:clientMessageLabel', "Client's Message")}:</p>
                        <p className="text-sm text-slate-600 bg-white p-2 border rounded whitespace-pre-wrap">{existingProposal.proposerMessage}</p>
                    </div>
                )}
                <p className="font-medium text-sm text-slate-700 mb-1">{t('bookings:clientProposedTimesLabel', "Client's Proposed Times")}:</p>
                {clientOriginalProposedSlots.length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 pl-1">
                        {clientOriginalProposedSlots.map((slot, index) => (
                            <li key={`client-orig-slot-${index}`}>
                                {formatDateForDisplay(slot.start)} {formatTimeForDisplay(slot.start)} - {formatTimeForDisplay(slot.end)}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-500">{t('bookings:noSlotsProposedByClient', 'Client did not propose specific new times.')}</p>
                )}
            </div>

            <div className="suggest-alternative-modal__coach-new-proposal">
                <h4 className="text-base font-semibold text-slate-800 mb-3 border-b pb-2 flex items-center">
                     <PlusCircle size={18} className="mr-2 text-green-600" />
                    {t('bookings:yourNewProposalTitleCoach', "Your New Proposal to Client")}
                </h4>
                {renderProposalForm()}
            </div>
        </div>
    );
};

const renderClientSelectFromCoachProposalForm = () => {
    const coachProposedSlots = (existingProposal?.proposedSlots || []).map(s => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end)
    }));
    const isMessageLong = existingProposal?.proposerMessage?.length > PROPOSER_MESSAGE_TRUNCATE_LENGTH;

    return (
        <div className="suggest-alternative-modal__response-section">
            <h4 className="text-lg font-medium mb-3">{t('bookings:coachProposedNewTimes', "Coach's Proposed Times")}</h4>
            {existingProposal?.proposerMessage && (
                <div className="suggest-alternative-modal__proposer-message mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="font-semibold text-blue-800 flex items-center">
                        <MessageSquare size={16} className="mr-2" />
                        {t('bookings:messageFromCoach', { name: booking.coach?.firstName || 'Coach' })}:
                    </p>
                    <blockquote className={`proposer-message-content ${isMessageLong && !isProposerMessageExpanded ? 'truncated' : ''} ${isProposerMessageExpanded ? 'expanded' : ''}`}>
                        {existingProposal.proposerMessage}
                    </blockquote>
                    {isMessageLong && (
                         <button 
                            onClick={() => setIsProposerMessageExpanded(!isProposerMessageExpanded)} 
                            className="proposer-message-toggle-button"
                            aria-label={isProposerMessageExpanded ? t('bookings:showLess') : t('bookings:showMore')}
                        >
                            {isProposerMessageExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                    )}
                </div>
            )}
             <p className="text-sm text-gray-600 mb-2">{t('bookings:clientSelectOneToAcceptOrDeclineCoach', "Please select one of the coach's proposed times to accept, or decline all times.")}</p>
            <div className="suggest-alternative-modal__proposed-slots-list mb-4">
                {coachProposedSlots.map((slot, index) => (
                    <div
                        key={index}
                        className={`suggest-alternative-modal__proposed-slot-item ${selectedSlotByClient && new Date(selectedSlotByClient.start).getTime() === slot.start.getTime() ? 'selected' : ''}`}
                        onClick={() => setSelectedSlotByClient(slot)}
                        role="radio"
                        aria-checked={selectedSlotByClient && new Date(selectedSlotByClient.start).getTime() === slot.start.getTime()}
                        tabIndex={0}
                        onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') setSelectedSlotByClient(slot);}}
                    >
                        <input
                            type="radio"
                            id={`coach-proposed-slot-${index}`}
                            name="coachProposedSlotForClientSelection"
                            value={index.toString()}
                            checked={selectedSlotByClient && new Date(selectedSlotByClient.start).getTime() === slot.start.getTime()}
                            onChange={() => setSelectedSlotByClient(slot)}
                            className="form-radio"
                        />
                        <label htmlFor={`coach-proposed-slot-${index}`}>{formatDateForDisplay(slot.start)} {formatTimeForDisplay(slot.start)} - {formatTimeForDisplay(slot.end)}</label>
                    </div>
                ))}
            </div>
            
            <div className="mt-4">
                <label htmlFor="clientResponseMessageSelection" className="suggest-alternative-modal__label block mb-1">{t('common:messageOptional')}</label>
                <textarea
                    id="clientResponseMessageSelection"
                    value={clientResponseMessage}
                    onChange={(e) => setClientResponseMessage(e.target.value)}
                    rows="3"
                    className="suggest-alternative-modal__textarea"
                    placeholder={t('bookings:rescheduleMessagePlaceholderClient')}
                />
            </div>
        </div>
    );
};

const renderClientCounterProposalForm = () => {
    const coachOriginalProposedSlots = (existingProposal?.proposedSlots || []).map(s => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end)
    }));

    return (
        <div className="suggest-alternative-modal__counter-proposal-section">
            <div className="suggest-alternative-modal__coach-original-proposal mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
                <h4 className="text-base font-semibold text-slate-800 mb-3 border-b pb-2 flex items-center">
                    <CheckSquare size={18} className="mr-2 text-indigo-600" />
                    {t('bookings:coachOriginalProposalTitle', "Coach's Current Proposal Details")}
                </h4>
                {existingProposal?.proposerMessage && (
                    <div className="mb-3">
                        <p className="font-medium text-sm text-slate-700">{t('bookings:messageFromCoach', { name: booking.coach?.firstName || 'Coach' })}:</p>
                        <p className="text-sm text-slate-600 bg-white p-2 border rounded whitespace-pre-wrap">{existingProposal.proposerMessage}</p>
                    </div>
                )}
              
                {coachOriginalProposedSlots.length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 pl-1">
                        {coachOriginalProposedSlots.map((slot, index) => (
                            <li key={`coach-orig-slot-${index}`}>
                                {formatDateForDisplay(slot.start)} {formatTimeForDisplay(slot.start)} - {formatTimeForDisplay(slot.end)}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-500">{t('bookings:noSlotsProposedByCoach', 'Coach did not propose specific new times in this round.')}</p>
                )}
            </div>

            <div className="suggest-alternative-modal__client-new-proposal">
                
                {renderProposalForm()} {/* Reuses the generic proposal form */}
            </div>
        </div>
    );
};

const handleClientSelectFromCoachProposalSubmit = async (action) => {
    if (action === 'approve' && !selectedSlotByClient) {
      setError(t('bookings:errors.selectSlotToAcceptCoachProposal', 'Please select one of the coach\'s proposed times to accept.'));
      showToast({type: 'error', message: t('bookings:errors.selectSlotToAcceptCoachProposal', 'Please select one of the coach\'s proposed times to accept.')});
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const coachRequestId = existingProposal?.requestId;
      if (!coachRequestId) {
        logger.error("[SuggestAlternativeTimeModal] Missing coachRequestId for client responding to coach proposal.", { existingProposal });
        setError(t('bookings:errors.missingCoachRequestId', 'Coach request ID is missing. Cannot proceed.'));
        showToast({type: 'error', message: t('bookings:errors.missingCoachRequestId', 'Coach request ID is missing. Cannot proceed.')});
        setIsLoading(false);
        return;
      }
      
      logger.info('[SuggestAlternativeTimeModal] Client responding to coach proposal (select/decline):', {
        bookingId: bookingId,
        requestId: coachRequestId,
        action,
        selectedSlot: action === 'approve' ? selectedSlotByClient : null,
        message: clientResponseMessage
      });

      if (!onClientRespondToCoachProposal) {
          logger.error("[SuggestAlternativeTimeModal] onClientRespondToCoachProposal prop is not defined.");
          setError(t('common:errors.actionFailedConfiguration', 'Action failed due to a configuration issue.'));
          setIsLoading(false);
          return;
      }
      
      await onClientRespondToCoachProposal(
          bookingId, 
          coachRequestId, 
          action, 
          action === 'approve' ? selectedSlotByClient : null, 
          clientResponseMessage,
          null // No new slots proposed in this action
        );
      showToast({type: 'success', message: action === 'approve' ? t('bookings:coachProposalAcceptedToast', 'Coach\'s proposal accepted successfully.') : t('bookings:coachProposalDeclinedToast', 'Coach\'s proposal declined.') });
      onClose({ action });
    } catch (err) {
      const errorMessage = err.message || t('common:errors.actionFailed');
      setError(errorMessage);
      showToast({type: 'error', message: errorMessage});
      logger.error("[SuggestAlternativeTimeModal] Error responding to coach proposal by client (select/decline):", err);
    } finally {
      setIsLoading(false);
    }
};

const handleClientCounterProposalSubmit = async () => {
    if (!validateProposedSlots()) return; // validateProposedSlots checks newProposedSlots
    setIsLoading(true);
    setError(null);
    try {
        const coachRequestId = existingProposal?.requestId; // ID of the coach's proposal we are countering
        if (!coachRequestId) {
            logger.error("[SuggestAlternativeTimeModal] Missing coachRequestId for client counter-proposal.", { existingProposal });
            setError(t('bookings:errors.missingCoachRequestIdCounter', 'Original coach request ID is missing. Cannot send counter-proposal.'));
            showToast({type: 'error', message: t('bookings:errors.missingCoachRequestIdCounter', 'Original coach request ID is missing. Cannot send counter-proposal.')});
            setIsLoading(false);
            return;
        }

        const clientProposedCounterSlots = newProposedSlots.map(s => ({
            start: s.startTime.toISOString(),
            end: s.endTime.toISOString(),
        }));

        logger.info('[SuggestAlternativeTimeModal] Client submitting counter-proposal to coach:', {
            bookingId: bookingId,
            originalCoachRequestId: coachRequestId,
            action: 'counter_propose', // This action type needs to be handled by the API
            proposedNewSlots: clientProposedCounterSlots,
            message: proposalMessage, // Message from the proposal form
        });
        
        if (!onClientRespondToCoachProposal) {
             logger.error("[SuggestAlternativeTimeModal] onClientRespondToCoachProposal prop is not defined for client counter-proposal.");
             setError(t('common:errors.actionFailedConfiguration', 'Action failed due to a configuration issue.'));
             setIsLoading(false);
             return;
        }

        await onClientRespondToCoachProposal(
            bookingId,
            coachRequestId,
            'counter_propose',
            null, // No single selected time when counter-proposing
            proposalMessage,
            clientProposedCounterSlots
        );
        showToast({type: 'success', message: t('bookings:clientCounterProposalSentToast', 'Your new proposal has been sent to the coach.')});
        onClose();
    } catch (err) {
        const errorMessage = err.message || t('common:errors.actionFailed');
        setError(errorMessage);
        showToast({type: 'error', message: errorMessage});
        logger.error("[SuggestAlternativeTimeModal] Error submitting client counter-proposal:", err);
    } finally {
        setIsLoading(false);
    }
};

const handleRespondSubmit = async (action) => {
    if (action === 'accept' && !selectedSlotByClient) {
      setError(t('bookings:errors.selectSlotToAccept'));
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const coachRequestId = existingProposal?.requestId;
      logger.info('[SuggestAlternativeTimeModal] Responding to proposal (Client):', {
        bookingId: bookingId,
        requestId: coachRequestId,
        action,
        selectedSlot: action === 'accept' ? selectedSlotByClient : null,
        message: clientResponseMessage
      });
           await onClientRespondToCoachProposal(bookingId, coachRequestId, action, action === 'accept' ? selectedSlotByClient : null, clientResponseMessage, null); // Added null for proposedNewSlots
      onClose();
    } catch (err) {
      setError(err.message || t('common:errors.actionFailed'));
      logger.error("Error responding to proposal:", err);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isOpen || !booking) return null;

 const renderProposalForm = () => (
  <div className="suggest-alternative-modal__proposal-section">
    <h4>
      {mode === 'propose_coach' ? t('bookings:proposeNewTimesTitle') : t('bookings:proposeNewTimesClientTitle')}
    </h4>
    <div className="suggest-alternative-modal__slots-list">
      {newProposedSlots.map((slot, index) => (
        <div key={index} className="suggest-alternative-modal__slot-entry">
          <div className="suggest-alternative-modal__slot-field">
            <label htmlFor={`slot-date-${index}`} className="suggest-alternative-modal__label">{t('common:date')}</label>
            <DatePicker
              id={`slot-date-${index}`}
              selected={slot.date}
              onChange={(date) => handleSlotDateTimeChange(index, 'date', date)}
              dateFormat={i18n.language === 'de' ? "dd.MM.yyyy" : "MM/dd/yyyy"}
              locale={i18n.language}
              className="suggest-alternative-modal__input"
              wrapperClassName="suggest-alternative-modal__datepicker-wrapper w-full"
              minDate={new Date()}
              placeholderText={t('common:selectDate')}
            />
          </div>
          <div className="suggest-alternative-modal__slot-field">
            <label htmlFor={`slot-start-${index}`} className="suggest-alternative-modal__label">{t('common:startTime')}</label>
            <DatePicker
              id={`slot-start-${index}`}
              selected={slot.startTime}
              onChange={(date) => handleSlotDateTimeChange(index, 'startTime', date)}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption={t('common:time')}
              dateFormat="HH:mm" 
              timeFormat="HH:mm" 
               locale={i18n.language}
              className="suggest-alternative-modal__input"
              wrapperClassName="suggest-alternative-modal__datepicker-wrapper w-full"
              disabled={!slot.date}
              placeholderText={t('common:selectTime')}
            />
          </div>
          <div className="suggest-alternative-modal__slot-field">
            <label htmlFor={`slot-end-${index}`} className="suggest-alternative-modal__label">{t('common:endTime')}</label>
            <DatePicker
              id={`slot-end-${index}`}
              selected={slot.endTime}
              onChange={(date) => handleSlotDateTimeChange(index, 'endTime', date)}
              showTimeSelect
              showTimeSelectOnly
              timeIntervals={15}
              timeCaption={t('common:time')}
              dateFormat="HH:mm" 
              timeFormat="HH:mm" 
              locale={i18n.language}
              className="suggest-alternative-modal__input"
              wrapperClassName="suggest-alternative-modal__datepicker-wrapper w-full"
              disabled={!slot.startTime} 
              minTime={slot.startTime ? new Date(slot.startTime.getTime() + 15 * 60000) : null} 
              placeholderText={t('common:selectTime')}
            />
          </div>
          <div className="suggest-alternative-modal__slot-actions">
            {newProposedSlots.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveSlot(index)}
                className="suggest-alternative-modal__slot-remove-button"
                aria-label={t('common:removeSlot')}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
    {newProposedSlots.length < MAX_PROPOSED_SLOTS && (
      <button
        type="button"
        onClick={handleAddSlot}
        className="suggest-alternative-modal__add-slot-button"
      >
        <PlusCircle size={16} /> {t('bookings:addAnotherTime')}
      </button>
    )}
   <div className="mt-4">
  <label htmlFor="proposalMessage" className="suggest-alternative-modal__label block mb-1">
      {mode === 'propose_coach' ? t('common:messageOptional') : t('bookings:rescheduleReasonLabelOptional')}
  </label>
  <textarea
    id="proposalMessage"
    value={proposalMessage}
    onChange={(e) => setProposalMessage(e.target.value)}
    rows="3"
    className="suggest-alternative-modal__textarea"
    placeholder={mode === 'propose_coach' ? t('bookings:rescheduleMessagePlaceholderCoach') : t('bookings:rescheduleReasonPlaceholder')}
  />
</div>
    </div>
  );

  const renderClientResponseForm = () => {
      const clientDisplaySlots = (existingProposal?.proposedSlots || []).map(s => ({
        ...s,
        start: new Date(s.start),
        end: new Date(s.end)
      }));

      return (
        <div className="suggest-alternative-modal__response-section">
        <h4>{t('bookings:coachProposedNewTimes')}</h4>
        {proposalMessage && (
            <div className="suggest-alternative-modal__coach-message">
            <p><strong>{t('bookings:messageFromCoach', { name: booking.coach?.firstName || 'Coach' })}:</strong></p>
            <p>{proposalMessage}</p>
            </div>
        )}
        <p className="text-sm text-gray-600 mb-2">{t('bookings:pleaseSelectOneOption')}</p>
        <div className="suggest-alternative-modal__proposed-slots-list">
            {clientDisplaySlots.map((slot, index) => (
            <div
                key={index}
                className={`suggest-alternative-modal__proposed-slot-item ${selectedSlotByClient && new Date(selectedSlotByClient.start).getTime() === slot.start.getTime() ? 'selected' : ''}`}
                onClick={() => setSelectedSlotByClient(slot)}
                role="radio"
                aria-checked={selectedSlotByClient && new Date(selectedSlotByClient.start).getTime() === slot.start.getTime()}
                tabIndex={0}
                onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') setSelectedSlotByClient(slot);}}
            >
                <input
                type="radio"
                id={`proposed-slot-${index}`}
                name="proposedSlot"
                value={index.toString()}
                checked={selectedSlotByClient && new Date(selectedSlotByClient.start).getTime() === slot.start.getTime()}
                onChange={() => setSelectedSlotByClient(slot)}
                className="form-radio"
                />
                {/* Use the new explicit formatters */}
                <label htmlFor={`proposed-slot-${index}`}>{formatDateForDisplay(slot.start)} {formatTimeForDisplay(slot.start)} - {formatTimeForDisplay(slot.end)}</label>
            </div>
            ))}
        </div>
        <div className="mt-4">
            <label htmlFor="clientResponseMessage" className="suggest-alternative-modal__label block mb-1">{t('common:messageOptional')}</label>
            <textarea
            id="clientResponseMessage"
            value={clientResponseMessage}
            onChange={(e) => setClientResponseMessage(e.target.value)}
            rows="3"
            className="suggest-alternative-modal__textarea"
            placeholder={t('bookings:rescheduleMessagePlaceholderClient')}
            />
        </div>
        </div>
    );
  };

return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="suggest-alternative-modal-overlay" />
        <Dialog.Content
          ref={modalRef}
          className="suggest-alternative-modal-content"
          onPointerDownOutside={(e) => e.preventDefault()} 
          onInteractOutside={(e) => e.preventDefault()} 
        >
          <div className="suggest-alternative-modal__header">
         <Dialog.Title className="suggest-alternative-modal__title" onMouseDown={handleMouseDownOnTitle}>
              {(mode === 'propose_coach_initial' || mode === 'propose_coach') && t('bookings:suggestAlternativeTimeTitle')}
              {(mode === 'propose_client_initial' || mode === 'propose_client') && t('bookings:rescheduleSessionTitle')}
              {mode === 'respond_client_to_coach' && t('bookings:respondToProposalTitle')}
              {mode === 'respond_coach_to_client' && t('bookings:coachRespondToClientRescheduleTitle', 'Respond to Client\'s Reschedule Request')}
              {mode === 'coach_counter_propose' && t('bookings:coachCounterProposeTitle', "Propose New Times to Client")}
          </Dialog.Title>
            <Dialog.Close asChild>
              <button onClick={onClose} className="suggest-alternative-modal__close-button" aria-label={t('common:close')}>
                <X size={24} />
              </button>
            </Dialog.Close>
          </div>

          <div className="suggest-alternative-modal__body">
          <div className="suggest-alternative-modal__original-booking-info">
              <h4>{t('bookings:originalSessionDetails')}</h4>
              <div className="suggest-alternative-modal__info-item">
              </div>
              <div className="suggest-alternative-modal__info-item">
                <span className="suggest-alternative-modal__info-label">{t('common:with')}:</span>
                <span className="suggest-alternative-modal__info-value">
                  {currentUserRole === 'coach' ? `${booking.user?.firstName || ''} ${booking.user?.lastName || ''}` : `${booking.coach?.firstName || ''} ${booking.coach?.lastName || ''}`}
                </span>
              </div>
              <div className="suggest-alternative-modal__info-item">
                <span className="suggest-alternative-modal__info-label">{t('common:date')}:</span>
                <span className="suggest-alternative-modal__info-value">{formatDateTimeForDisplay(booking.start)}</span>
              </div>
              <div className="suggest-alternative-modal__info-item">
                <span className="suggest-alternative-modal__info-label">{t('common:duration')}:</span>
                <span className="suggest-alternative-modal__info-value">{originalBookingDurationMinutes} {t('bookings:minutes')}</span>
              </div>
            </div>

            {/* Conditional rendering based on mode */}
            {mode === 'propose_coach_initial' && renderProposalForm()}
            {mode === 'propose_client_initial' && renderProposalForm()}
            
            {mode === 'client_select_from_coach_proposal' && renderClientSelectFromCoachProposalForm()}
            {mode === 'client_counter_propose' && renderClientCounterProposalForm()}

            {mode === 'coach_select_from_client_proposal' && renderCoachSelectFromClientProposalForm()}
            {mode === 'coach_counter_propose' && renderCoachCounterProposalForm()}
            
            {!['propose_coach_initial', 'propose_client_initial', 'client_select_from_coach_proposal', 'client_counter_propose', 'coach_select_from_client_proposal', 'coach_counter_propose'].includes(mode) &&
              (currentUserRole === 'coach' ? renderProposalForm() : <p>{t('common:loading')}...</p>) 
            }
            
            {error && (
              <div className="suggest-alternative-modal__error-text">
                <AlertCircle size={16} className="inline mr-1" /> {error}
              </div>
            )}
          </div>

  <div className="suggest-alternative-modal__footer">
            
            {(mode === 'propose_coach_initial' || mode === 'propose_client_initial') && (
                <button
                    onClick={handleProposeSubmit} 
                    className="suggest-alternative-modal__button suggest-alternative-modal__button--primary"
                    disabled={isLoading || newProposedSlots.some(s => !s.startTime || !s.endTime)}
                >
                    {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Send size={18} className="mr-2" />}
                    {mode === 'propose_coach_initial' ? t('common:sendProposal') : t('bookings:submitRescheduleRequestButton')}
                </button>
            )}

            {mode === 'client_select_from_coach_proposal' && (
              <>
                               <button
                  onClick={handleSuggestNewTimeFromResponseMode}
                  className="suggest-alternative-modal__button suggest-alternative-modal__button--secondary"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Clock size={18} className="mr-2" />}
                  {t('bookings:actions.suggestNewTime', 'Suggest New Time')}
                </button>
                <button
                  onClick={() => handleClientSelectFromCoachProposalSubmit('decline')}
                  className="suggest-alternative-modal__button suggest-alternative-modal__button--secondary"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <X size={18} className="mr-2" />}
                    {t('common:declineRequest', 'Decline Request')}
                </button>

                <button
                  onClick={() => handleClientSelectFromCoachProposalSubmit('approve')}
                  className="suggest-alternative-modal__button suggest-alternative-modal__button--primary"
                  disabled={isLoading || !selectedSlotByClient}
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Check size={18} className="mr-2" />}
                  {t('common:approveSelectedTime')}
                </button>
              </>
            )}

            {mode === 'client_counter_propose' && (
                 <button
                    onClick={handleClientCounterProposalSubmit}
                    className="suggest-alternative-modal__button suggest-alternative-modal__button--primary"
                    disabled={isLoading || newProposedSlots.some(s => !s.startTime || !s.endTime)}
                >
                    {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Send size={18} className="mr-2" />}
                    {t('bookings:sendNewProposalToCoachButton', "Send Your Proposal")}
                </button>
            )}
            
            {(mode === 'coach_select_from_client_proposal') && (
            <>
             <button
                  onClick={handleSuggestNewTimeFromResponseMode}
                 className="suggest-alternative-modal__button suggest-alternative-modal__button--secondary"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Clock size={18} className="mr-2" />}
                  {t('bookings:actions.suggestNewTime', 'Suggest New Time')}
                </button>
                <button
                  onClick={() => handleCoachRespondToClientRequestSubmit('decline')}
                  className="suggest-alternative-modal__button suggest-alternative-modal__button--secondary"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <X size={18} className="mr-2" />}
                  {t('common:declineRequest', 'Decline Request')}
                </button>
               
                <button
                  onClick={() => handleCoachRespondToClientRequestSubmit('approve')}
                  className="suggest-alternative-modal__button suggest-alternative-modal__button--primary"
                  disabled={isLoading || !selectedSlotByCoach}
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Check size={18} className="mr-2" />}
                  {t('common:approveSelectedTime', 'Approve Selected Time')}
                </button>
            </>
           )}

           {mode === 'coach_counter_propose' && (
                <button
                    onClick={handleCoachCounterProposeSubmit}
                    className="suggest-alternative-modal__button suggest-alternative-modal__button--primary"
                    disabled={isLoading || newProposedSlots.some(s => !s.startTime || !s.endTime)}
                >
                    {isLoading ? <Loader2 size={18} className="animate-spin mr-2" /> : <Send size={18} className="mr-2" />}
                    {t('bookings:sendCounterProposalButton', "Send New Proposal")}
                </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

SuggestAlternativeTimeModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  booking: PropTypes.shape({
    _id: PropTypes.string,
    title: PropTypes.string,
    start: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    end: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    originalStart: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    originalEnd: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    duration: PropTypes.number,
    coach: PropTypes.shape({ _id: PropTypes.string, firstName: PropTypes.string, lastName: PropTypes.string }), 
    user: PropTypes.shape({ _id: PropTypes.string, firstName: PropTypes.string, lastName: PropTypes.string }), 
  }).isRequired,
  currentUserRole: PropTypes.oneOf(['coach', 'client']).isRequired,
   existingProposal: PropTypes.shape({
    proposedBy: PropTypes.string, // ID of who made the proposal
    proposerRole: PropTypes.oneOf(['coach', 'client']),
    proposedSlots: PropTypes.arrayOf(PropTypes.shape({
      start: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
      end: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]).isRequired,
       _id: PropTypes.string,
    })),
    proposerMessage: PropTypes.string,
    requestId: PropTypes.string, 
     status: PropTypes.string,
  }),
  onCoachSubmitProposal: PropTypes.func, 
  onClientRespondToCoachProposal: PropTypes.func, 
  onClientProposeInitialReschedule: PropTypes.func, 
  onSubmitProposal: PropTypes.func, // Kept for potential generic fallback, but specific handlers preferred.
  bookingId: PropTypes.string.isRequired,
  initialEligibilityData: PropTypes.object, 
  fetchCoachAvailabilityForReschedule: PropTypes.func, 
   modeOverride: PropTypes.string,
  onCoachRespondToClientRequest: PropTypes.func,
};

SuggestAlternativeTimeModal.defaultProps = {
  existingProposal: null,
  onClientProposeInitialReschedule: null, 
  onClientRespondToCoachProposal: null,
  initialEligibilityData: null,
  fetchCoachAvailabilityForReschedule: getCoachAvailability,
  onCoachRespondToClientRequest: null,
  onSubmitProposal: () => { logger.warn('Generic onSubmitProposal called, but specific handlers like onCoachSubmitProposal or onClientRespondToCoachProposal are preferred.'); },
};

export default SuggestAlternativeTimeModal;