import React, { useState, useEffect, useCallback, useMemo, useReducer, useContext, useRef } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { X, Calendar, Clock, CreditCard, Info, AlertTriangle, Tag, Timer, Loader2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import moment from 'moment';
import { toast } from 'react-hot-toast';

// ShadCN/UI Components
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent } from './ui/card.tsx';
import { Input } from './ui/input.tsx';
import { Badge } from './ui/badge.tsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible.jsx';
import { cn } from "../lib/utils"

// Hooks and Contexts
import { useConnectionCheck } from '../hooks/useConnectionCheck';
import { AuthContext } from '../contexts/AuthContext';
import { usePayment } from '../contexts/PaymentContext';
import { usePaymentSocket } from '../hooks/usePaymentSocket';

// Services and Utils
import { logger } from '../utils/logger';
import { calculateSessionPrice } from '../services/priceAPI';
import { PaymentOrchestrator } from '../services/PaymentOrchestratorService';
import PaymentDataService from '../services/PaymentDataService';
import { cancelBookingDuringPayment } from '../services/bookingAPI';

// Constants and Components
import { PAYMENT_STATES, PAYMENT_STEPS, PAYMENT_TIMING } from '../constants/paymentConstants';
import PaymentPopup from './payment/PaymentPopup';
import PolicyDisplay from './PolicyDisplay';

const DURATIONS = [30, 45, 60, 90, 120];
const ONE_ON_ONE_SESSION_TYPE_ID = '66ec4ea477bec414bf2b8859';

const MODAL_STATES = {
  BOOKING: 'booking',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_ACTIVE: 'payment_active',
  PAYMENT_COMPLETE: 'payment_complete',
  PAYMENT_FAILED: 'payment_failed'
};

// Reducer for managing complex pricing and discount state
const initialPricingState = {
  priceDetails: null,
  isCalculating: false,
  discountCode: '',
  appliedDiscount: null,
  validationError: '',
  isApplying: false,
};

const INITIAL_TIME_SLOT_LIMIT = 10;

const getDiscountDisplayName = (discount, t) => {
  if (!discount) return '';

  if (discount.source === 'manual_code') {
    return t('bookings:discountCodeApplied', { code: discount.code });
  }

  if (discount.isTimeBased) {
    const daysOfWeekMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const translatedDays = discount.dayOfWeek.map(d => t(`common:${daysOfWeekMap[d]}`)).join(', ');
    return t('bookings:timeBasedRateName', {
      days: translatedDays,
      start: discount.timeRange.start,
      end: discount.timeRange.end
    });
  }

  return discount.name || t('bookings:promoApplied', 'Promotion Applied');
};

function useWhyDidYouUpdate(name, props) {
  const previousProps = useRef();

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      if (previousProps.current) {
        const allKeys = Object.keys({ ...previousProps.current, ...props });
        const changesObj = {};
        allKeys.forEach(key => {
          if (previousProps.current[key] !== props[key]) {
            changesObj[key] = {
              from: previousProps.current[key],
              to: props[key],
            };
          }
        });

        if (Object.keys(changesObj).length) {
          logger.info('[why-did-you-update]', name, changesObj);
        }
      }
      previousProps.current = props;
    }
  });
}

function pricingReducer(state, action) {
  switch (action.type) {
    case 'CALCULATION_START':
      return { ...state, isCalculating: true, validationError: '' };
    case 'SET_PRICE_DETAILS': {
      const winningDiscount = action.payload?._calculationDetails?.winningDiscount || null;
      return { ...state, isCalculating: false, isApplying: false, priceDetails: action.payload, appliedDiscount: winningDiscount };
    }
    case 'CALCULATION_ERROR':
      return { ...state, isCalculating: false, isApplying: false, priceDetails: null };
    case 'UPDATE_CODE_INPUT':
      return { ...state, discountCode: action.payload, validationError: '' };
    case 'APPLY_DISCOUNT_START':
      return { ...state, isApplying: true, validationError: '' };
    case 'APPLY_DISCOUNT_FAILURE':
      const automaticDiscount = state.priceDetails?._calculationDetails?.winningDiscount?.source === 'automatic_rule' ? state.priceDetails._calculationDetails.winningDiscount : null;
      return { ...state, isApplying: false, validationError: action.payload, appliedDiscount: automaticDiscount, discountCode: '' };
     case 'RESET':
      return initialPricingState;
    default:
      return state;
  }
}

const UserBookingModal = ({
  isOpen: initialIsOpen,
  onClose,
  onConfirm,
  bookingData: initialBookingData,
  coachSettings,
  userId,
  coachId,
  dateAvailability,
  availableDates,
  coachName,
}) => {
   useWhyDidYouUpdate('UserBookingModal', { isOpen: initialIsOpen, onClose, onConfirm, bookingData: initialBookingData, coachSettings, userId, coachId, dateAvailability, availableDates, coachName });
  const { t } = useTranslation(['common', 'bookings', 'notifications', 'payments']);
  const { user } = useContext(AuthContext);
  const { stripePromise } = usePayment();

  // Core Booking State
  const [bookingData, setBookingData] = useState(initialBookingData);
  const [selectedDate, setSelectedDate] = useState(initialBookingData?.start ? moment(initialBookingData.start).startOf('day').toDate() : null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [bookingType, setBookingType] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // UI & Interaction State
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(initialIsOpen);
  const [bufferTimes, setBufferTimes] = useState({ before: 0, after: 0 });
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [showAllTimeSlots, setShowAllTimeSlots] = useState(false);
  const dateScrollContainerRef = useRef(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  // Payment Orchestration State
  const [orchestratorState, setOrchestratorState] = useState(null);
  const [isPaymentSectionVisible, setIsPaymentSectionVisible] = useState(false);
  const [shouldKeepModalOpen, setShouldKeepModalOpen] = useState(false);

  // Pricing and Discount State Management using a Reducer
  const [pricingState, dispatchPricing] = useReducer(pricingReducer, initialPricingState);

  const { isConnected } = useConnectionCheck(userId, coachId);

  usePaymentSocket(bookingData?._id);

   const handleDateScroll = useCallback(() => {
    const el = dateScrollContainerRef.current;
    if (el) {
      const atStart = el.scrollLeft < 5;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 5;
      setCanScrollPrev(!atStart);
      setCanScrollNext(!atEnd);
    }
  }, []);

    useEffect(() => {
    const el = dateScrollContainerRef.current;
    if (!el) return;

    const checkScrollability = () => {
      const hasOverflow = el.scrollWidth > el.clientWidth;
      if (!hasOverflow) {
        setCanScrollPrev(false);
        setCanScrollNext(false);
      } else {
        handleDateScroll();
      }
    };
    
    checkScrollability();
    
    el.addEventListener('scroll', handleDateScroll, { passive: true });
    
    const resizeObserver = new ResizeObserver(checkScrollability);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', handleDateScroll);
      resizeObserver.unobserve(el);
    };
  }, [availableDates, handleDateScroll]);

  const scrollDates = (direction) => {
    const el = dateScrollContainerRef.current;
    if (el) {
      const scrollAmount = el.clientWidth * 0.8;
      el.scrollBy({
        left: direction === 'next' ? scrollAmount : -scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    if (!bookingData?._id) return;
    const unsubscribe = PaymentOrchestrator.subscribeToState(bookingData?._id, (state) => {
      if (!state) return;
      setOrchestratorState(state);
      const shouldShowPayment = state.metadata?.modalState === MODAL_STATES.PAYMENT_ACTIVE || state.metadata?.modalState === MODAL_STATES.PAYMENT_PENDING;
      setIsPaymentSectionVisible(shouldShowPayment);
      if (state.status === PAYMENT_STATES.SUCCEEDED) {
        toast.success(t('payments:paymentSuccessful'));
        onClose();
      } else if (state.status === PAYMENT_STATES.FAILED) {
        toast.error(t('payments:paymentFailed'));
        setErrorMessage(state.metadata?.error || t('payments:paymentFailed'));
      }
    });
    return unsubscribe;
  }, [bookingData?._id, onClose, t]);

  const applicableCancellationPolicy = useMemo(() => {
    if (coachSettings?.cancellationPolicy?.oneOnOne) {
      return coachSettings.cancellationPolicy.oneOnOne;
    }
    return null;
  }, [coachSettings]);

  const getPolicySummary = useCallback(() => {
    if (!applicableCancellationPolicy || !applicableCancellationPolicy.tiers || applicableCancellationPolicy.tiers.length === 0) {
      return t('bookings:noPolicySetForSession');
    }
    const sortedTiers = [...applicableCancellationPolicy.tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
    const bestRefundTier = sortedTiers[0];
    if (bestRefundTier) {
      if (bestRefundTier.refundPercentage === 100) {
        return t('bookings:policySummaryFullRefund', { hours: bestRefundTier.hoursBefore });
      } else if (bestRefundTier.refundPercentage > 0) {
        return t('bookings:policySummaryPartialRefund', { percentage: bestRefundTier.refundPercentage, hours: bestRefundTier.hoursBefore });
      }
    }
    const worstTier = sortedTiers[sortedTiers.length - 1];
    if (worstTier && worstTier.refundPercentage === 0) {
      return t('bookings:policySummaryNoRefund', { hours: worstTier.hoursBefore });
    }
    return t('bookings:viewCancellationPolicy');
  }, [applicableCancellationPolicy, t]);

useEffect(() => {
    const checkFirmBookingEligibility = () => {
      const logDetails = {
        selectedTime: selectedTime ? moment(selectedTime).format() : 'Not selected',
        'coachSettings.allowFirmBooking': coachSettings?.allowFirmBooking,
        'bookingData.availableForInstantBooking': bookingData?.availableForInstantBooking,
        'coachSettings.firmBookingThreshold (hours)': coachSettings?.firmBookingThreshold || 'default (24)',
        'coachSettings.requireApprovalNonConnected': coachSettings?.requireApprovalNonConnected,
        isConnected: isConnected,
      };

      logger.info('[Firm Booking Eligibility Check] Evaluating conditions...', logDetails);

      if (!bookingData) {
        logger.warn('[Firm Booking Eligibility Check] Result: REQUEST. Reason: bookingData is missing.');
        return 'REQUEST';
      }
      if (!coachSettings?.allowFirmBooking) {
        logger.warn('[Firm Booking Eligibility Check] Result: REQUEST. Reason: Coach has disabled firm bookings (`allowFirmBooking` is false).');
        return 'REQUEST';
      }
      // This is a very common point of failure. Ensure the availability slot data from the backend includes this flag.
      if (!bookingData?.availableForInstantBooking) {
        logger.warn('[Firm Booking Eligibility Check] Result: REQUEST. Reason: The selected availability slot is not marked for instant booking (`availableForInstantBooking` is false or undefined).');
        return 'REQUEST';
      }

      const startTime = moment(selectedTime);
      const thresholdHours = coachSettings?.firmBookingThreshold || 24;
      const thresholdTime = moment().add(thresholdHours, 'hours');

      if (startTime.isBefore(thresholdTime)) {
        logger.warn('[Firm Booking Eligibility Check] Result: REQUEST. Reason: Selected time is within the firm booking threshold.', {
          selected: startTime.format(),
          threshold: thresholdTime.format(),
        });
        return 'REQUEST';
      }

      if (coachSettings?.requireApprovalNonConnected && !isConnected) {
        logger.warn('[Firm Booking Eligibility Check] Result: REQUEST. Reason: Coach requires approval for non-connected users, and this user is not connected.');
        return 'REQUEST';
      }

      logger.info('[Firm Booking Eligibility Check] Result: FIRM. All conditions passed.');
      return 'FIRM';
    };

    if (bookingData && coachSettings && selectedTime) {
      setBookingType(checkFirmBookingEligibility());
    }
}, [selectedTime, coachSettings, isConnected, bookingData]);

useEffect(() => {
    const calculatePrice = async () => {
      if (!selectedTime || !selectedDuration) {
        dispatchPricing({ type: 'RESET' });
        return;
      }
      dispatchPricing({ type: 'CALCULATION_START' });
      try {
        const endTime = moment(selectedTime).add(selectedDuration, 'minutes').toDate();
        
        const userLocation = user?.billingDetails?.address
          ? {
              country: user.billingDetails.address.country,
              postalCode: user.billingDetails.address.postalCode,
            }
          : null;

        const priceParams = {
          userId: coachId, sessionTypeId: ONE_ON_ONE_SESSION_TYPE_ID, start: selectedTime, end: endTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          customerLocation: userLocation
        };

        const calculated = await calculateSessionPrice(priceParams);
        dispatchPricing({ type: 'SET_PRICE_DETAILS', payload: calculated });

        const automaticDiscount = calculated?._calculationDetails?.winningDiscount;
        if (automaticDiscount && automaticDiscount.source === 'automatic_rule') {
            const dealName = getDiscountDisplayName(automaticDiscount, t);
            //toast.success(t('bookings:hasBeenAppliedToast', { dealName }));
        }
      } catch (error) {
        logger.error('[UserBookingModal] Price calculation error:', { error: error.message, coachId });
        toast.error(t('bookings:priceCalculationError'));
        dispatchPricing({ type: 'CALCULATION_ERROR' });
      }
    };
    calculatePrice();
  }, [selectedTime, selectedDuration, coachId, t, user]);

const wasPaymentVisibleRef = useRef(isPaymentSectionVisible);

useEffect(() => {
    // Only reset the form state if transitioning from the payment section back to the booking form.
    // This preserves user selections during parent component re-renders.
    if (wasPaymentVisibleRef.current && !isPaymentSectionVisible) {
        setBookingData(initialBookingData);
        if (initialBookingData?.start) {
            setSelectedDate(moment(initialBookingData.start).startOf('day').toDate());
        } else {
            setSelectedDate(null);
        }
        setSelectedTime(null);
        setSelectedDuration(null);
        dispatchPricing({ type: 'RESET' });
    }

    // Update the ref to track the current visibility state for the next render.
    wasPaymentVisibleRef.current = isPaymentSectionVisible;
}, [isPaymentSectionVisible, initialBookingData, dispatchPricing]);

 const availableTimeSlots = useMemo(() => {
    if (!selectedDate) return [];
    const slots = [];
    const availabilityForDay = dateAvailability.get(moment(selectedDate).format('YYYY-MM-DD')) || [];
    if (availabilityForDay.length === 0) return [];
    const bufferTime = coachSettings?.bufferTimeBetweenSessions || 15;
    const now = moment();
    const minDuration = selectedDuration || DURATIONS[0] || 30;
    availabilityForDay.forEach(availabilitySlot => {
      let baseStartTime = moment(availabilitySlot.start);
      const baseEndTime = moment(availabilitySlot.end);
      if (baseStartTime.isSame(now, 'day') && baseStartTime.isBefore(now.clone().add(bufferTime, 'minutes'))) {
        baseStartTime = now.clone().add(bufferTime, 'minutes');
        if (baseStartTime.minutes() % 15 !== 0) {
            baseStartTime.add(15 - (baseStartTime.minutes() % 15), 'minutes');
        }
      }
      let currentTime = baseStartTime.clone();
      const latestPossibleStartTime = baseEndTime.clone().subtract(minDuration, 'minutes');

      while (currentTime.isSameOrBefore(latestPossibleStartTime)) {
        if (currentTime.minutes() % 15 === 0) {
            slots.push({ time: currentTime.toDate(), label: currentTime.format('HH:mm'), isSelectable: true });
        }
        currentTime.add(15, 'minutes');
      }
    });
    return slots;
  }, [selectedDate, selectedDuration, dateAvailability, coachSettings?.bufferTimeBetweenSessions]);
  
  const handleDateSelection = (date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setSelectedDuration(coachSettings?.sessionManagement?.durationRules?.defaultDuration || 60);
    setBookingData(prev => ({ ...prev, start: date, end: moment(date).endOf('day').toDate() }));
  };

 const handleTimeSelection = useCallback((time) => {
    const timeAsISOString = moment(time).toISOString();
    setSelectedTime(timeAsISOString);
    setBookingData(prev => ({
        ...prev,
        start: time,
        end: selectedDuration ? moment(time).add(selectedDuration, 'minutes').toDate() : prev.end,
        sessionType: { _id: ONE_ON_ONE_SESSION_TYPE_ID, name: t('bookings:oneOnOneSession') }
    }));
  }, [selectedDuration, t]);

  const handleDurationSelection = useCallback((duration) => {
    if (!selectedTime) {
      toast.error(t('bookings:selectTimeFirst'));
      return;
    }
    setSelectedDuration(duration);
    setBookingData(prev => ({ ...prev, end: moment(selectedTime).add(duration, 'minutes').toDate() }));
  }, [selectedTime, t]);

const handleApplyDiscount = useCallback(async () => {
    if (!pricingState.discountCode || !selectedTime || !selectedDuration) return;
    dispatchPricing({ type: 'APPLY_DISCOUNT_START' });
    try {
      const endTime = moment(selectedTime).add(selectedDuration, 'minutes').toDate();
      const userLocation = user?.billingDetails?.address
        ? { country: user.billingDetails.address.country, postalCode: user.billingDetails.address.postalCode }
        : null;
      
      const result = await calculateSessionPrice({
          userId: coachId,
          sessionTypeId: ONE_ON_ONE_SESSION_TYPE_ID,
          start: selectedTime,
          end: endTime,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          discountCode: pricingState.discountCode,
          customerLocation: userLocation,
      });

      const winningDiscount = result?._calculationDetails?.winningDiscount;

      if (winningDiscount && winningDiscount.source === 'manual_code') {
        dispatchPricing({ type: 'SET_PRICE_DETAILS', payload: result });
        //toast.success(t('bookings:discountAppliedSuccessfully'));
      } else if (winningDiscount && winningDiscount.source === 'automatic_rule') {
        dispatchPricing({ type: 'SET_PRICE_DETAILS', payload: result });
        const dealName = winningDiscount.name || t('bookings:timeBasedDiscountDefaultName', 'Time-Based Discount');
        toast.info(t('bookings:betterDealKept', { dealName }));
      } else {
        const message = t('bookings:errors.codeNotApplicable', "This code isn't valid for the selected session.");
        dispatchPricing({ type: 'APPLY_DISCOUNT_FAILURE', payload: message });
      }

    } catch (error) {
        const errorData = error.response?.data;
        let message = errorData?.message || t('bookings:errors.invalidOrExpiredCode');
        
        if (errorData?.code === 'DISCOUNTS_NOT_ALLOWED') {
            message = t('bookings:errors.discountsNotAllowedForSlot');
        } else if (errorData?.code) {
          const i18nKey = `bookings:errors.${errorData.code.toLowerCase()}`;
          message = t(i18nKey, { ns: 'bookings', defaultValue: message });
        }
        
        dispatchPricing({ type: 'APPLY_DISCOUNT_FAILURE', payload: message });
    }
  }, [coachId, selectedTime, selectedDuration, pricingState.discountCode, t, user, pricingState.priceDetails]);
  
  const buildBookingPayload = useCallback((orchestratorFlow) => ({
  ...bookingData,
  start: selectedTime,
  end: moment(selectedTime).add(selectedDuration, 'minutes').toDate(),
  coach: coachId,
  userId,
  type: bookingType,
  status: bookingType === 'FIRM' ? 'pending_payment' : 'requested',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  sessionType: {
    _id: ONE_ON_ONE_SESSION_TYPE_ID,
    name: t('bookings:oneOnOneSession'),
    price: coachSettings?.rates?.find(r => r.sessionType === 'oneOnOne')?.amount || 0
  },
  payment: orchestratorFlow ? { flowId: orchestratorFlow.id, required: true, status: 'pending' } : null,
  discountCode: (pricingState.appliedDiscount?.source === 'manual_code') ? pricingState.appliedDiscount.code : undefined,
}), [bookingData, selectedTime, selectedDuration, coachId, userId, bookingType, t, coachSettings, pricingState.appliedDiscount]);

  const initializePaymentFlow = useCallback(async () => {
      if ((bookingType !== 'FIRM' && !coachSettings?.requireImmediatePayment) || !pricingState.priceDetails || pricingState.priceDetails.final.amount.amount <= 0) return null;
    const flowId = uuidv4();
    const formattedPrice = PaymentDataService.formatPriceForPayment(pricingState.priceDetails);
    return await PaymentOrchestrator.initializePayment({
        flowId, amount: formattedPrice.amount, currency: formattedPrice.currency, timing: PAYMENT_TIMING.IMMEDIATE,
        metadata: { bookingType, sessionType: ONE_ON_ONE_SESSION_TYPE_ID, duration: selectedDuration,
            priceStructure: formattedPrice.metadata.priceStructure, confirmationId: flowId, preserveOnUnmount: true,
            flowState: 'pre_booking', isPreBooking: true, modalState: MODAL_STATES.BOOKING, paymentStep: PAYMENT_STEPS.SESSION,
        },
    });
  }, [bookingType, coachSettings, pricingState.priceDetails, selectedDuration]);

  const processBookingResponse = useCallback(async (createdBooking, orchestratorFlow) => {
        logger.info('[UserBookingModal] Processing booking response', {
      createdBooking,
      orchestratorFlowId: orchestratorFlow?.id
    });
    setBookingData(prev => ({...prev, ...createdBooking}));
    if (!orchestratorFlow) {
        toast.success(t('bookings:bookingRequested'));
        onClose();
        return;
    }
    await PaymentOrchestrator.updateFlow(orchestratorFlow.id, { bookingId: createdBooking._id });
    const clientSecret = createdBooking.paymentIntentClientSecret;
     logger.info('[UserBookingModal] Extracted clientSecret', {
      clientSecret: clientSecret ? 'Exists' : 'MISSING',
      bookingId: createdBooking._id
    });
    if (!clientSecret) throw new Error('Payment intent client secret missing');
    const updatedFlow = await PaymentOrchestrator.updateFlow(createdBooking._id, {
        status: 'payment_pending', clientSecret,
        metadata: { modalState: MODAL_STATES.PAYMENT_ACTIVE, paymentStep: PAYMENT_STEPS.METHOD },
    });
    setOrchestratorState(updatedFlow);
    setIsPaymentSectionVisible(true);
    setShouldKeepModalOpen(true);
  }, [onClose, t]);

const handleConfirm = useCallback(async () => {
    if (!selectedTime || !selectedDuration) {
      toast.error(t('bookings:noTimeSelected'));
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const orchestratorFlow = await initializePaymentFlow();
      const bookingPayload = buildBookingPayload(orchestratorFlow);
      logger.info('[UserBookingModal.handleConfirm] Built booking payload to be sent:', bookingPayload);
      const createdBooking = await onConfirm(bookingPayload);
      if (!createdBooking?._id) throw new Error('Invalid booking response');
      await processBookingResponse(createdBooking, orchestratorFlow);
    } catch (error) {
      logger.error('[UserBookingModal] Booking confirmation error', { 
        errorMessage: error.message, 
        responseData: error.response?.data,
        status: error.response?.status,
        fullError: error 
      });

      const errorData = error.response?.data;
      let displayMessage;

      if (errorData?.code === 'TOO_MANY_UNPAID_BOOKINGS') {
        displayMessage = t('bookings:errors.tooManyUnpaidBookings');
      } 
      else if (errorData?.message) {
        displayMessage = errorData.message;
      }
      else {
        displayMessage = t('bookings:errorCreatingBooking');
      }

      setErrorMessage(displayMessage);
      toast.error(displayMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedTime, selectedDuration, initializePaymentFlow, buildBookingPayload, onConfirm, processBookingResponse, t]);
  
  const handleModalClose = useCallback(() => {
    if (isPaymentSectionVisible && bookingData?._id) {
        logger.info('[UserBookingModal] Preventing modal close during active payment flow', { bookingId: bookingData?._id });
        return;
    }
    PaymentOrchestrator.handleCleanup(bookingData?._id, { source: 'modal', reason: 'user_closed' });
    onClose();
  }, [isPaymentSectionVisible, bookingData?._id, onClose]);

const handlePaymentCancel = useCallback(async () => {
    const currentBookingId = bookingData?._id;
    if (!currentBookingId || isCancelling) {
        return;
    }

    setIsCancelling(true);
    const toastId = toast.loading(t('bookings:cancellingBooking'));

    try {
        await cancelBookingDuringPayment(currentBookingId);
        
        await PaymentOrchestrator.handleCleanup(currentBookingId, { 
            source: 'user_cancelled_payment', 
            reason: 'user_cancelled',
            force: true
        });

        setIsPaymentSectionVisible(false);
        setShouldKeepModalOpen(false);
        onClose({ 
              action: 'cancelled', 
              bookingId: currentBookingId
          });

    } catch (error) {
        toast.error(t('bookings:errorCancellingBooking'), { id: toastId });
        logger.error('[UserBookingModal] Failed to cancel booking via API.', {
            bookingId: currentBookingId,
            error: error.message
        });
    } finally {
        setIsCancelling(false);
    }
}, [bookingData, isCancelling, onClose, t]);
  
  const shouldRenderModal = useMemo(() => isModalOpen || shouldKeepModalOpen || isPaymentSectionVisible, [isModalOpen, shouldKeepModalOpen, isPaymentSectionVisible]);

  if (!bookingData) return null;

  return (
    <>
      <Dialog open={shouldRenderModal} onOpenChange={(open) => !open && handleModalClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col" onPointerDownOutside={(e) => {
          if (isPaymentSectionVisible) e.preventDefault();
        }}>
          <DialogHeader>
            <DialogTitle className="text-xl">{t('bookings:bookOneOnOne')}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-6">
            {errorMessage && (
              <div className="bg-red-100 dark:bg-red-900/20 border-l-4 border-red-500 dark:border-red-400 text-red-700 dark:text-red-300 p-4 rounded-md flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-red-500 dark:text-red-400" />
                <span className="text-sm font-medium">{errorMessage}</span>
              </div>
            )}

            {/* --- Date Selection --- */}
             <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground">{t('bookings:selectDate')}</h3>
              </div>
              <div className="relative">
                <div 
                  ref={dateScrollContainerRef} 
                  className="overflow-x-auto pb-2 -mb-2 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    <div className="flex w-max space-x-2 px-1">
                    {availableDates.map((date) => {
                        const dateStr = moment(date).format('YYYY-MM-DD');
                        const hasAvailability = dateAvailability.get(dateStr)?.length > 0;
                        return (
                            <Button key={dateStr}
                                variant={moment(date).isSame(selectedDate, 'day') ? 'default' : 'outline'}
                                disabled={isProcessing || !hasAvailability}
                                onClick={() => hasAvailability && handleDateSelection(date)}
                                className={cn("flex flex-col items-center justify-between h-24 w-16 p-2 relative shrink-0", !hasAvailability && "text-muted-foreground/50")}>
                                <span className="text-xs uppercase font-medium">{t(`common:${moment(date).format('dddd').toLowerCase()}`).slice(0, 3)}</span>
                                <span className="text-2xl font-bold">{moment(date).format('D')}</span>
                                <span className="text-xs uppercase font-medium">{t(`common:${moment(date).format('MMMM').toLowerCase()}`).slice(0, 3)}</span>
                                {hasAvailability && <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-green-500" />}
                            </Button>
                        );
                    })}
                    </div>
                </div>
                
                <AnimatePresence>
                  {canScrollPrev && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-1/2 -translate-y-1/2 left-0 hidden md:block"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted"
                        onClick={() => scrollDates('prev')}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <AnimatePresence>
                  {canScrollNext && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-1/2 -translate-y-1/2 right-0 hidden md:block"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full bg-background/80 backdrop-blur-sm hover:bg-muted"
                        onClick={() => scrollDates('next')}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
                
                <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent md:hidden" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden" />
              </div>
            </div>

            {/* --- Time Selection --- */}
            <AnimatePresence>
            {selectedDate && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">{t('bookings:selectStartTime')}</h3>
                </div>
                {availableTimeSlots.length > 0 ? (
                  (() => {
                    const visibleSlots = availableTimeSlots.slice(0, INITIAL_TIME_SLOT_LIMIT);
                    const hiddenSlots = availableTimeSlots.slice(INITIAL_TIME_SLOT_LIMIT);
                    
                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                          {visibleSlots.map((slot, index) => (
                              <Button key={index}
                              variant={selectedTime && moment(selectedTime).isSame(slot.time) ? 'default' : 'outline'}
                              onClick={() => handleTimeSelection(slot.time)}
                              disabled={!slot.isSelectable || isProcessing}>
                          {slot.label}
                      </Button>
                          ))}
                        </div>
                        
                        <AnimatePresence>
                          {showAllTimeSlots && hiddenSlots.length > 0 && (
                            <motion.div
                              key="hidden-slots"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 pt-2">
                                {hiddenSlots.map((slot, index) => (
                                  <Button key={index + visibleSlots.length}
                                      variant={selectedTime && moment(selectedTime).isSame(slot.time) ? 'default' : 'outline'}
                                      onClick={() => handleTimeSelection(slot.time)}
                                      disabled={!slot.isSelectable || isProcessing}>
                                  {slot.label}
                              </Button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {hiddenSlots.length > 0 && (
                          <div className="pt-1 flex justify-center">
                            <Button variant="ghost" className="text-sm h-8 text-primary hover:text-primary hover:bg-primary/10" onClick={() => setShowAllTimeSlots(prev => !prev)}>
                              {showAllTimeSlots 
                                ? t('common:showLess') 
                                : t('common:showMoreCount', { count: hiddenSlots.length })
                              }
                              {showAllTimeSlots 
                                ? <ChevronUp className="ml-2 h-4 w-4" /> 
                                : <ChevronDown className="ml-2 h-4 w-4" />
                              }
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">{t('bookings:noAvailableSlots')}</div>}
              </motion.div>
            )}
            </AnimatePresence>

            {/* --- Duration Selection --- */}
            <AnimatePresence>
            {selectedTime && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">{t('bookings:selectDuration')}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                    {DURATIONS.map(duration => (
                        <Button key={duration} 
                                variant={selectedDuration === duration ? 'default' : 'outline'}
                                onClick={() => handleDurationSelection(duration)} 
                                disabled={isProcessing}>
                            {duration} {t('common:min')}
                        </Button>
                    ))}
                </div>
              </motion.div>
            )}
            </AnimatePresence>

            {/* --- Price & Summary --- */}
            <AnimatePresence>
            {pricingState.priceDetails && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                 <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-medium">
                            <CreditCard className="h-5 w-5 text-muted-foreground" />
                            <span>{t('bookings:price')}</span>
                        </div>
                        <div className="flex items-center">
                            <AnimatePresence>
                                {pricingState.isCalculating && (
                                    <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden">
                                        <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <Button variant="ghost" size="sm" onClick={() => setShowPriceBreakdown(p => !p)} className="h-auto px-2 py-1 text-base" disabled={pricingState.isCalculating}>
                               {pricingState.appliedDiscount && (
                                  <span className={cn("font-semibold text-muted-foreground line-through mr-2 transition-opacity", pricingState.isCalculating && "opacity-50")}>
                                      {pricingState.priceDetails.base?.amount?.amount?.toFixed(2)}
                                  </span>
                              )}
                               <span className={cn("font-semibold transition-opacity", pricingState.isCalculating && "opacity-50")}>
                                {pricingState.priceDetails?.final?.amount?.amount?.toFixed(2)} {pricingState.priceDetails?.currency}
                               </span>
                                <Info size={14} className="ml-2 text-muted-foreground" />
                            </Button>
                        </div>
                    </div>

                  <Collapsible open={showPriceBreakdown} onOpenChange={setShowPriceBreakdown}>

                  <CollapsibleContent className={cn("space-y-3 pt-3 border-t transition-opacity", pricingState.isCalculating && "opacity-50 pointer-events-none")}>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{t('bookings:listPrice', 'List Price')}</span>
                        <span>{pricingState.priceDetails.base?.amount?.amount?.toFixed(2)} {pricingState.priceDetails.currency}</span>
                      </div>

                      {pricingState.appliedDiscount && (
                        <div className="flex items-center justify-between text-green-600 dark:text-green-500">
                          <span className="font-medium">
                            {getDiscountDisplayName(pricingState.appliedDiscount, t)}
                          </span>
                          <span className="font-medium">- {pricingState.appliedDiscount.amountDeducted?.toFixed(2)} {pricingState.priceDetails.currency}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t pt-2 mt-2">
                        <span className="text-muted-foreground">{t('common:subtotal')}</span>
                        <span className="font-semibold">{pricingState.priceDetails.final?.amount?.amount?.toFixed(2)} {pricingState.priceDetails.currency}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                         <span className="text-muted-foreground pl-4">{t('payments:vatIncluded')} ({Number(pricingState.priceDetails.vat?.rate).toFixed(1)}%)</span>
                         <span className="text-muted-foreground">{pricingState.priceDetails.vat?.amount?.toFixed(2)} {pricingState.priceDetails.currency}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-3 mt-3">
                      <span className="font-semibold text-foreground text-base">{t('bookings:total')}</span>
                      <span className="font-semibold text-foreground text-base">{pricingState.priceDetails.final?.amount?.amount?.toFixed(2)} {pricingState.priceDetails.currency}</span>
                    </div>
                  </CollapsibleContent>
                    </Collapsible>
                    
                     <div className="pt-4 border-t space-y-2">
                        <div className="flex gap-2">
                         <Input type="text" placeholder={t('bookings:discountCodePlaceholder', 'Rabattcode')}
                                className="uppercase font-mono"
                                value={pricingState.discountCode}
                                onChange={(e) => dispatchPricing({ type: 'UPDATE_CODE_INPUT', payload: e.target.value.toUpperCase() })}
                                disabled={pricingState.isApplying || (pricingState.appliedDiscount?.source === 'manual_code') || pricingState.isCalculating} />
                            <Button onClick={handleApplyDiscount} variant="secondary"
                                disabled={pricingState.isApplying || !pricingState.discountCode || (pricingState.appliedDiscount?.source === 'manual_code') || pricingState.isCalculating}>
                                {pricingState.isApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common:apply')}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground px-1">{t('bookings:bestPriceInfo', 'Only the best price applies. Promotions and discount codes cannot be combined.')}</p>
                        {pricingState.validationError && <p className="text-xs text-destructive">{pricingState.validationError}</p>}
                        
                     {pricingState.appliedDiscount && (
                            <div className={cn("flex items-center justify-between p-2 rounded-md text-sm",
                                pricingState.appliedDiscount.source === 'manual_code' ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                            )}>
                                <div className="flex items-center gap-2 font-medium">
                                    <Tag size={16} />
                                    <span>
                                        {getDiscountDisplayName(pricingState.appliedDiscount, t)}
                                    </span>
                                </div>
                                <span className="font-medium">- {pricingState.appliedDiscount.amountDeducted?.toFixed(2)} {pricingState.priceDetails.currency}</span>
                            </div>
                        )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
            </AnimatePresence>

            {(bufferTimes.before > 0 || bufferTimes.after > 0) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                    <Info size={16} className="flex-shrink-0" />
                    <span>
                        {t('bookings:bufferTimeNotice', {
                        before: bufferTimes.before,
                        after: bufferTimes.after
                        })}
                    </span>
                </div>
            )}

            {/* --- Timezone & Policy --- */}
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                <Info size={14} />
                <span>{t('bookings:yourTimezone')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
              </div>

              {applicableCancellationPolicy && (
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between rounded-md border p-3 text-sm text-left transition-colors hover:bg-muted/50 data-[state=open]:bg-muted/50">
                      <div className="flex items-start gap-3">
                        <Info size={16} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{getPolicySummary()}</span>
                      </div>
                      <ChevronDown size={18} className="text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                     <div className="p-4 border rounded-md bg-muted/20">
                        <PolicyDisplay
                            policy={applicableCancellationPolicy}
                            policyType="oneOnOne"
                            lastUpdated={coachSettings?.cancellationPolicy?.lastUpdated}
                            condensed={true}
                            showTitle={false}
                        />
                     </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

          </div>

          {!isPaymentSectionVisible && (
            <DialogFooter className="pt-4">
              <Button variant="outline" onClick={handleModalClose} disabled={isProcessing}>{t('common:cancel')}</Button>
              <Button onClick={handleConfirm} disabled={isProcessing || !selectedTime || !selectedDuration || pricingState.isCalculating}>
                  {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t(`bookings:${bookingType === 'FIRM' ? 'confirmBooking' : 'requestBooking'}`)}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Payment Popup */}
   {isPaymentSectionVisible && bookingData?._id && orchestratorState && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm" onClick={(e) => e.stopPropagation()}>
          <PaymentPopup
            isOpen={isPaymentSectionVisible}
            onClose={handleModalClose}
            onCancel={handlePaymentCancel}
            bookingId={bookingData._id}
            amount={orchestratorState.amount ?? pricingState.priceDetails?.final?.amount?.amount}
            currency={orchestratorState.currency ?? pricingState.priceDetails?.currency}
            sessionStartTime={selectedTime ? new Date(selectedTime) : new Date()}
            clientSecret={orchestratorState.clientSecret}
            priceDetails={orchestratorState.metadata?.priceDetails || pricingState.priceDetails}
            stripePromise={stripePromise}
          />
        </div>
      )}
    </>
  );
};

UserBookingModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  bookingData: PropTypes.shape({
    start: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]), // Allow null for initial button click
    end: PropTypes.oneOfType([PropTypes.instanceOf(Date), PropTypes.string]), // Allow null for initial button click
    coachName: PropTypes.string,
    sessionTypeName: PropTypes.string,
    price: PropTypes.any,
    sessionType: PropTypes.shape({
      _id: PropTypes.string,
      name: PropTypes.string,
      price: PropTypes.number
    })
  }),
  coachSettings: PropTypes.shape({
    allowFirmBooking: PropTypes.bool,
    firmBookingThreshold: PropTypes.number,
    requireApprovalNonConnected: PropTypes.bool,
    sessionManagement: PropTypes.shape({
      durationRules: PropTypes.shape({
        defaultDuration: PropTypes.number,
      }),
    }),
    rates: PropTypes.arrayOf(PropTypes.shape({
      sessionType: PropTypes.string,
      amount: PropTypes.number,
    })),
    bufferTimeBetweenSessions: PropTypes.number,
    cancellationPolicy: PropTypes.object 
  }).isRequired,
  userId: PropTypes.string.isRequired,
  coachId: PropTypes.string.isRequired,
  dateAvailability: PropTypes.instanceOf(Map).isRequired,
  availableDates: PropTypes.array.isRequired,
  coachName: PropTypes.string.isRequired
};

export default UserBookingModal;