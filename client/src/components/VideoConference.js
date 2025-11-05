// React & Core Libraries
import React, { useState, useEffect, useRef, useCallback } from 'react';

// External Libraries
import { AnimatePresence, motion } from 'framer-motion';
import axios from 'axios';
import Calendar from 'react-calendar';
import Draggable from 'react-draggable';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Stage, Layer, Line } from 'react-konva/lib/ReactKonvaCore';
import { 
  AlertCircle, BarChart, Calendar as CalendarIcon, Check, Clock, Copy, 
  Download, FileText, Hand, Home, Layout, Maximize, MessageSquare, 
  Mic, MicOff, Minimize, MoreVertical, Paperclip, PenTool, Phone, 
  Send, Settings, Share, SmilePlus, Users, Video as VideoIcon, VideoOff, X 
} from 'lucide-react';
import io from 'socket.io-client';
import { useStripe, useElements } from '@stripe/react-stripe-js';
import { toast } from 'react-toastify';
import { Tooltip } from 'react-tooltip';
import { create } from 'zustand';

// API & Services
import { getBooking } from '../services/bookingAPI';
import paymentAPI from '../services/paymentAPI';
import { 
  getSessionDetails, getBookingOvertimeSettings, getLatestOvertimeRequest,
  handleOvertime, handleOvertimeChoice, handlePaymentFailure, 
  continueSessionAfterFailure, monitorSession, setOvertimeChoiceDev,
  startSession as apiStartSession, terminateSessionForPayment, 
  simulateOvertimeUsageDev as apiSimulateOvertimeUsage, 
  simulateUserOvertimeAuthorizationDev as apiSimulateUserAuth,
} from '../services/sessionAPI';

// Contexts & State Management
import { useAuth } from '../contexts/AuthContext';
import { usePayment } from '../contexts/PaymentContext';
import { useVideoSocket } from '../contexts/SocketContext';

// Custom Hooks
import { calculateOvertimePrice, PriceCalculationError } from '../hooks/usePriceCalculation';
import useVideoConference from '../hooks/useVideoConference';

// UI Components (Shared / Design System)
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';

// Feature Components
import AgendaPanel from './AgendaPanel';
import AnalyticsPanel from './AnalyticsPanel';
import ChatPanel from './ChatPanel';
import CoachControlsPanel from './CoachControlPanel';
import ControlBar from './ControlBar';
import LayoutManager from './LayoutManager';
import NotesPanel from './NotesPanel';
import OvertimePromptModal from './OvertimePromptModal';
import OvertimeTimer from './OvertimeTimer';
import PaymentFailureModal from './PaymentFailureModal';
import PollPanel from './PollPanel';
import QAPanel from './QAPanel';
import ResourcePanel from './ResourcePanel';
import ScaConfirmationModal from './payment/ScaConfirmationModal';
import ScreenShare from './ScreenShare';
import VideoSettings from './VideoSettings';
import WaitingRoom from './WaitingRoom';

// Utilities
import { logger } from '../utils/logger';

// Styles
import 'react-calendar/dist/Calendar.css';


// Import background utilities
import {
  BACKGROUND_MODES,
  BACKGROUND_STATUS,
  DEFAULT_BLUR_LEVEL,
} from '../utils/BackgroundEffectUtility';

const videoStore = create((set) => ({
  isChatOpen: false,
  toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),
  isParticipantsOpen: false,
  toggleParticipants: () => set((state) => ({ isParticipantsOpen: !state.isParticipantsOpen })),
  isFullScreen: false,
  toggleFullScreen: () => set((state) => ({ isFullScreen: !state.isFullScreen })),

}));

const createStreamWithTracks = (originalStream) => {
  if (!originalStream) return null;
  
  try {
    // Create a MediaStream with the original stream's tracks
    const newStream = new MediaStream();
    
    originalStream.getTracks().forEach(track => {
      if (track.readyState === 'live') {
        // Important: Don't clone - just add the original track
        // Cloning can cause issues with some browsers
        newStream.addTrack(track);
        
        logger.info(`[VideoConference] Added ${track.kind} track to new stream`, {
          trackId: track.id,
          kind: track.kind,
          enabled: track.enabled,
          deviceId: track.getSettings()?.deviceId || 'unknown'
        });
      }
    });
    
    return newStream;
  } catch (err) {
    logger.error('[VideoConference] Error creating stream with tracks', { 
      error: err.message,
      streamId: originalStream?.id
    });
    return originalStream; // Fallback to original
  }
};

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const VideoConference = ({ userId, isCoach, sessionDuration, isLiveSession = false, bookingId, sessionId, token, waiting: initialIsWaiting = false, startTime: initialStartTime, onJoin, initialConfig, onSessionStarted }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const localVideoRef = useRef();
  const containerRef = useRef();
  const recorderRef = useRef();
  const chunksRef = useRef([]);

  const layoutManagerRef = useRef();
 
  logger.info('[VideoConference] Props check', { userId, isCoach, sessionId });
  
  const { 
    isChatOpen, toggleChat, 
    isParticipantsOpen, toggleParticipants, 
    isFullScreen, toggleFullScreen, 
   
  } = videoStore();

  const [layout, setLayout] = useState('grid');
  const [sessionTime, setSessionTime] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [currentPoll, setCurrentPoll] = useState(null);
  const [sharedResources, setSharedResources] = useState([]);
  const [mood, setMood] = useState(null);
  const [waiting, setWaiting] = useState(initialIsWaiting);
  const [sessionAgenda, setSessionAgenda] = useState('');
  
  const [isDeviceCheckComplete, setIsDeviceCheckComplete] = useState(false);
  const [sessionConfig, setSessionConfig] = useState({ video: true, audio: true });
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [activePanel, setActivePanel] = useState(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [processedStream, setProcessedStream] = useState(null);
  const [analytics, setAnalytics] = useState({ duration: 0, lateArrivals: [] });
  const [headerHeight, setHeaderHeight] = useState(0);
  const [controlBarHeight, setControlBarHeight] = useState(0);
  const hasStartedSession = useRef(false);
  const hasHandledStartSession = useRef(false);
  const [mediaState, setMediaState] = useState({ isAudioEnabled: true, isVideoEnabled: true });
  const [recordingError, setRecordingError] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isStoppingRecording, setIsStoppingRecording] = useState(false);
  const [indicatorPosition, setIndicatorPosition] = useState({ left: '45%' });
  const [panelPositions, setPanelPositions] = useState({ // State for panel positions
    notes: { x: window.innerWidth - 300 - 16, y: window.innerHeight - (/* controlBarHeight */ 70) - 300 - 10 }, // Provide default estimate
    qa: { x: window.innerWidth - 300 - 16 - 40, y: window.innerHeight - (/* controlBarHeight */ 70) - 300 - 10 + 40 },
    polls: { x: window.innerWidth - 300 - 16 - 80, y: window.innerHeight - (/* controlBarHeight */ 70) - 300 - 10 + 80 },
    resources: { x: window.innerWidth - 300 - 16 - 120, y: window.innerHeight - (/* controlBarHeight */ 70) - 300 - 10 + 120 },
  
    settings: { x: window.innerWidth - 300 - 16, y: window.innerHeight - (/* controlBarHeight */ 70) - 300 - 10 - 40 }, // Position for settings
    analytics: { x: window.innerWidth - 300 - 16, y: window.innerHeight - (/* controlBarHeight */ 70) - 300 - 10 - 80 }, // Position for analytics
  });
  
  const [pollPosition, setPollPosition] = useState({
    x: window.innerWidth - 300 - 16,
    y: window.innerHeight - controlBarHeight - 300 - 10,
  });
  const [qaPosition, setQAPosition] = useState({
    x: window.innerWidth - 300 - 16,
    y: window.innerHeight - controlBarHeight - 300 - 10,
  });
  const [notesPosition, setNotesPosition] = useState({
    x: window.innerWidth - 300 - 16,
    y: window.innerHeight - controlBarHeight - 300 - 10,
  });
  const [settingsPosition, setSettingsPosition] = useState({
    x: window.innerWidth - 300 - 16,
    y: window.innerHeight - controlBarHeight - 300 - 10,
  });
  const [analyticsPosition, setAnalyticsPosition] = useState({
    x: window.innerWidth - 300 - 16,
    y: window.innerHeight - controlBarHeight - 300 - 10,
  });
  const [agendaPosition, setAgendaPosition] = useState({
    x: window.innerWidth - 300 - 16,
    y: window.innerHeight - controlBarHeight - 300 - 10,
  });
  
  const [coachPosition, setCoachPosition] = useState({
    x: 16,
    y: window.innerHeight - controlBarHeight - 200,
  });
  const [resourcePosition, setResourcePosition] = useState({
    x: window.innerWidth - 300 - 16,
    y: window.innerHeight - controlBarHeight - 300 - 10,
  });
  
  const positionRef = useRef({ offsetX: 0, offsetY: 0, panel: null });
  const divRef = useRef(null);
  const draggableRef = useRef(null);
  
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [backgroundSettings, setBackgroundSettings] = useState(
    initialConfig?.backgroundSettings || { mode: 'none', customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL }
  );
  const nodeRef = useRef(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const socketRef = useRef(null);
  const [localStream, setLocalStream] = useState(initialConfig?.stream || null);
  const [currentBackgroundSettings, setCurrentBackgroundSettings] = useState(
    initialConfig?.backgroundSettings || { mode: 'none', customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL }
  );
  const [selectedVideoDevice, setSelectedVideoDevice] = useState(initialConfig?.videoDeviceId || null);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(initialConfig?.audioDeviceId || null);
  const [showSettings, setShowSettings] = useState(false);

  const { socket, isConnected: socketConnected, connectionError } = useVideoSocket();
  const [resourceCount, setResourceCount] = useState(0);
  const [isRaisedHandsModalOpen, setIsRaisedHandsModalOpen] = useState(false);
  const [screenStream, setScreenStream] = useState(null);
  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const navigate = useNavigate();
  const [redirectCountdown, setRedirectCountdown] = useState(10);
  const [isReturningToWaitingRoom, setIsReturningToWaitingRoom] = useState(false);
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false); 
  const [rating, setRating] = useState(null); 
  const [overtimePromptData, setOvertimePromptData] = useState(null);
  const [showOvertimePrompt, setShowOvertimePrompt] = useState(false);
  const [showPaymentFailurePrompt, setShowPaymentFailurePrompt] = useState(false);
  const simulatedTimeRef = useRef(null);

  const [bookingRateInfo, setBookingRateInfo] = useState(null); 
  const [bookingOvertimeSettings, setBookingOvertimeSettings] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [userPromptData, setUserPromptData] = useState(null); 
  const [isConfirmingOvertimePayment, setIsConfirmingOvertimePayment] = useState(false);

  const stripe = useStripe();
  const elements = useElements();


  const { stripePromise } = usePayment();
  const [bookingPrice, setBookingPrice] = useState(null);
  const [bookingDuration, setBookingDuration] = useState(null);

  const [bookingPriceInfo, setBookingPriceInfo] = useState(null);
  const [bookingDurationMinutes, setBookingDurationMinutes] = useState(null);
  const [isLoadingBookingData, setIsLoadingBookingData] = useState(true);
  const [bookingDataError, setBookingDataError] = useState(null);
  const [devCustomDuration, setDevCustomDuration] = useState('');
  const [devCustomPriceAmount, setDevCustomPriceAmount] = useState('');
  const [devCustomPriceCurrency, setDevCustomPriceCurrency] = useState('CHF');

  const [showScaModal, setShowScaModal] = useState(false);
  const [scaClientSecret, setScaClientSecret] = useState(null);
  const [scaPaymentIntentId, setScaPaymentIntentId] = useState(null); 

  const [actualSessionEndTime, setActualSessionEndTime] = useState(null); 
  const [isPaidOvertimeActive, setIsPaidOvertimeActive] = useState(false);
  const [devSimulatedOvertimeMinutes, setDevSimulatedOvertimeMinutes] = useState('');

  const getCurrentTime = useCallback(() => {
    logger.debug('[VideoConference] Getting current time', {
      simulatedTime: simulatedTimeRef.current,
      realTime: Date.now(),
      sessionId,
    });
    return simulatedTimeRef.current || Date.now();
  }, [sessionId]);

  useEffect(() => {
    if (isSessionEnded && redirectCountdown > 0 && !isReturningToWaitingRoom) {
      const timer = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            logger.info('[VideoConference] Auto-redirecting to home', { sessionId });
            navigate('/sessions'); // Auto-redirect to home
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer); // Cleanup on unmount or state change
    }
  }, [isSessionEnded, redirectCountdown, navigate, isReturningToWaitingRoom, sessionId]);

  useEffect(() => {
    return () => {
      logger.info('[VideoConference] Cleaning up isReturningToWaitingRoom state', { sessionId });
      setIsReturningToWaitingRoom(false); // Reset on unmount
    };
  }, [sessionId]);

  // Handler to toggle panels
  const togglePanel = (panelName) => {
    setActivePanel(prev => {
      if (prev !== panelName) {
        logger.info('[VideoConference] Panel toggled', { 
          sessionId, 
          panelName, 
          userId, 
          isCoach 
        });
        trackToolUsage(panelName);
      }
      return prev === panelName ? null : panelName;
    });
  };

  // Handler to update panel position state after dragging
  const handlePanelDragStop = (panelName, data) => {
    setPanelPositions(prev => ({
        ...prev,
        [panelName]: { x: data.x, y: data.y }
    }));
  };

  useEffect(() => {
    const fetchResourceCount = async () => {
      try {
        logger.info('[VideoConference] Fetching initial resource count', { sessionId, userId, isCoach });
        const response = await axios.get(`/api/sessions/${sessionId}/resources`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const count = response.data.resources?.length || 0;
        setResourceCount(count);
        logger.info('[VideoConference] Initial resource count fetched', { sessionId, count });
      } catch (error) {
        logger.error('[VideoConference] Fetch resource count error', { error: error.message, sessionId });
      }
    };
    if (sessionId) fetchResourceCount();
  }, [sessionId, token]);

  useEffect(() => {
    const fetchBookingData = async () => {
      if (!bookingId) {
        logger.warn('[VideoConference] Missing bookingId or token for fetching booking data.');
        setIsLoadingBookingData(false);
        setBookingDataError('Missing booking information.');
        return;
      }
      setIsLoadingBookingData(true);
      setBookingDataError(null);
      logger.info('[VideoConference] Fetching booking details for price calculation', { bookingId });
      try {
        // Use the existing getBooking function
        const bookingData = await getBooking(bookingId); // No token needed if api interceptor handles it

        logger.info('[VideoConference] Received booking data from API:', {
          bookingId,
          keys: bookingData ? Object.keys(bookingData) : 'null',
          hasPrice: !!bookingData?.price,
          priceDetails: bookingData?.price ? {
              finalAmount: bookingData.price.final?.amount?.amount,
              currency: bookingData.price.currency
          } : 'N/A',
          hasOvertime: !!bookingData?.overtime,
          overtimeDetails: bookingData?.overtime
        });
  
        if (!bookingData || !bookingData.start || !bookingData.end || !bookingData.price?.final?.amount?.amount) {
           logger.error('[VideoConference] Incomplete booking data received', { bookingId, dataKeys: bookingData ? Object.keys(bookingData) : null });
           throw new Error('Incomplete booking data received from server.');
        }
  
        const startMs = new Date(bookingData.start).getTime();
        const endMs = new Date(bookingData.end).getTime();
  
        if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
          logger.error('[VideoConference] Invalid start/end times in booking data', { bookingId, start: bookingData.start, end: bookingData.end });
          throw new Error('Invalid session start/end times in booking data.');
        }
  
        const durationMs = endMs - startMs;
        const durationMinutes = Math.round(durationMs / 60000);
  
        setBookingPriceInfo(bookingData.price); // Store the whole price object
        setBookingDurationMinutes(durationMinutes);
        setBookingOvertimeSettings(bookingData.overtime || { // Ensure overtime object exists
          allowOvertime: false,
          freeOvertimeDuration: 0,
          paidOvertimeDuration: 0,
          overtimeRate: 0 // Default to 0 rate if missing
        });
  
        logger.info('[VideoConference] Booking data fetched successfully', {
          bookingId,
          hasPrice: !!bookingData.price,
          finalAmount: bookingData.price?.final?.amount?.amount,
          currency: bookingData.price?.currency,
          durationMinutes,
          hasOvertime: !!bookingData.overtime
        });
  
      } catch (error) {
        logger.error('[VideoConference] Failed to fetch booking data', { bookingId, error: error.message });
        setBookingDataError(error.message || 'Failed to load booking data.');
        // Reset state on error
        setBookingPriceInfo(null);
        setBookingDurationMinutes(null);
        setBookingOvertimeSettings(null);
      } finally {
        setIsLoadingBookingData(false);
      }
    };
  
    fetchBookingData();
  }, [bookingId]);

// Inside the resource event useEffect
useEffect(() => {
  if (!socket || !socketConnected) {
    logger.warn('[VideoConference] Socket not ready for resource listeners', { sessionId, socketConnected, connectionError });
    return;
  }
  logger.info('[VideoConference] Setting up resource event listeners', { sessionId, socketId: socket.id });
  const handleResourceUploaded = (resource) => {
    logger.info('[VideoConference] Resource uploaded event received', { resourceId: resource._id, sessionId });
    setResourceCount((prev) => {
      const newCount = prev + 1;
      logger.info('[VideoConference] Resource count incremented', { sessionId, newCount });
      return newCount;
    });
  };
  const handleResourceDeleted = () => {
    logger.info('[VideoConference] Resource deleted event received', { sessionId });
    setResourceCount((prev) => {
      const newCount = Math.max(0, prev - 1);
      logger.info('[VideoConference] Resource count decremented', { sessionId, newCount });
      return newCount;
    });
  };
  socket.on('resource-uploaded', handleResourceUploaded);
  socket.on('resource-deleted', handleResourceDeleted);
  return () => {
    socket.off('resource-uploaded', handleResourceUploaded);
    socket.off('resource-deleted', handleResourceDeleted);
    logger.info('[VideoConference] Cleaned up resource event listeners', { sessionId });
  };
}, [socket, socketConnected, sessionId, connectionError]);

const handleOvertimePromptEvent = useCallback(async (data) => {
  // Log the raw data received
  logger.info('[VideoConference] Handling overtime-prompt event', { data: JSON.stringify(data), isCoach, isLoadingBookingData, hasBookingPrice: !!bookingPriceInfo });

  if (!data || !data.metadata) {
    logger.error('[VideoConference] Invalid overtime prompt data received', { data });
    toast.error(t('session.invalidPromptData'));
    return;
  }

  let processedData = { ...data }; // Copy incoming data
  let priceForModal = null;
  let calculationErrorForModal = null;

  // Clear previous user-specific prompt state
  setUserPromptData(null);

  const isUserAuthorizePrompt = !isCoach && data.metadata?.requestedDuration && data.metadata?.overtimeOptions?.some(o => o.type === 'authorize');

  if (isUserAuthorizePrompt) {
    // --- User Prompt Logic: Use price from event data ---
    const requestedDuration = data.metadata.requestedDuration;
    const providedMaxPrice = data.metadata.calculatedMaxPrice;

    logger.debug('[VideoConference] Processing user prompt. Using price from event data.', { requestedDuration, providedMaxPrice });

    if (providedMaxPrice && typeof providedMaxPrice.amount === 'number' && typeof providedMaxPrice.currency === 'string') {
        // Price directly provided in the event payload (most likely from backend segment)
        priceForModal = {
             amount: parseFloat(providedMaxPrice.amount.toFixed(2)), // Ensure 2 decimal places
             currency: providedMaxPrice.currency.toUpperCase()
        };
        logger.info('[VideoConference] Using provided max price for user prompt', { price: priceForModal });
        setUserPromptData({ requestedDuration, calculatedMaxPrice: priceForModal }); // Update user prompt state
    } else {
        // If backend *didn't* provide the price in the event for some reason (fallback/error case)
        logger.error('[VideoConference] Missing or invalid calculatedMaxPrice in user prompt event data.', { providedMaxPrice });
        calculationErrorForModal = t('session.missingPriceDataError');
        setUserPromptData({ requestedDuration, calculationError: calculationErrorForModal });
    }

    // Add the determined price/error to the data passed to the modal
    if (priceForModal) {
        processedData.metadata.calculatedMaxPrice = priceForModal;
    }
    if (calculationErrorForModal) {
         processedData.metadata.calculationError = calculationErrorForModal;
    }
    // --- End User Prompt Logic ---

  } else if (isCoach) {
      // Coach logic doesn't need price calculation here, just displays options.
      logger.debug('[VideoConference] Processing coach prompt.');
  } else {
       logger.warn('[VideoConference] Overtime prompt received, but not applicable for current user role/state.', { isCoach, metadata: data.metadata });
       return; // Don't show the prompt if it's not relevant
  }


  // Set state to show the modal
  setOvertimePromptData(processedData); // Use the processed data containing the correct price/error
  setShowOvertimePrompt(true);
  logger.info('[VideoConference] Setting state to show OvertimePromptModal', { isCoach, hasPriceForModal: !!priceForModal, hasErrorForModal: !!calculationErrorForModal });

}, [
    isCoach, t, // Remove calculation-related dependencies like isLoadingBookingData, bookingPriceInfo etc.
    // We rely solely on the event data for the user prompt price now.
]);

const handlePaymentFailureEvent = useCallback((data) => {
  logger.info('[VideoConference] Handling payment-failure event', {
    sessionId,
    bookingId: data?.metadata?.bookingId,
    timestamp: new Date().toISOString(),
  });
  setShowPaymentFailurePrompt(true);
}, [sessionId]);

const handleSessionContinuedEvent = useCallback((data) => {
  const newEndTime = data?.newEndTime;
  logger.info('[VideoConference] Handling session-continued event', {
    sessionId,
    newEndTime,
    timestamp: new Date().toISOString(),
  });

  let isLikelyFromPaid = false; // Flag to track if this continuation was likely due to paid OT

  // Update session end time state
  if (newEndTime) {
    setActualSessionEndTime(newEndTime); // Update state used by the timer
    logger.debug('[VideoConference] Updated actual session end time state from event', { sessionId, newEndTime });

     // Determine if this new end time signifies *paid* overtime is active
     // Needs logic based on booking details (original end, free OT duration)
     if (bookingOvertimeSettings && bookingId) { // Ensure necessary data is loaded
         const originalEndTimeMs = new Date(bookingOvertimeSettings?.originalEndTime || 0).getTime(); // Need original end from settings/booking
         const freeDurationMs = (bookingOvertimeSettings.freeOvertimeDuration || 0) * 60000;
         const graceMs = 5 * 60000;
         const endOfFreeTimeMs = originalEndTimeMs + freeDurationMs + graceMs;
         const newEndTimeMs = new Date(newEndTime).getTime();

         if (!isNaN(endOfFreeTimeMs) && !isNaN(newEndTimeMs) && newEndTimeMs > endOfFreeTimeMs + 1000) { // Check if new end time is significantly after free time ends (allow 1s buffer)
             setIsPaidOvertimeActive(true);
             isLikelyFromPaid = true; // Set flag
             logger.info('[VideoConference] Determined paid overtime is now active based on newEndTime', { sessionId, newEndTime: new Date(newEndTime).toISOString(), endOfFreeTimeMs: new Date(endOfFreeTimeMs).toISOString() });
         } else {
             setIsPaidOvertimeActive(false);
             logger.debug('[VideoConference] Paid overtime determined inactive based on newEndTime', { sessionId, newEndTime: new Date(newEndTime).toISOString(), endOfFreeTimeMs: new Date(endOfFreeTimeMs).toISOString() });
         }
     } else {
          logger.warn('[VideoConference] Cannot determine paid overtime status: Missing bookingOvertimeSettings or bookingId', { sessionId });
     }

  }

  // Close any open prompt
  setShowOvertimePrompt(false);
  setOvertimePromptData(null);
  setUserPromptData(null);

  // Add Coach/User Feedback Toasts (as added previously)
  if (isCoach && isLikelyFromPaid) {
      toast.info(t('session.userPaidOvertime', { defaultValue: 'User has authorized paid overtime.' }), { autoClose: 3000 });
  } else if (!isCoach && isLikelyFromPaid) {
      // User already gets success toast from handleScaSuccess or similar flows.
  } else {
      // General session continued toast (e.g., for free overtime)
      // Only show if it wasn't a paid OT trigger to avoid double toasts
      if (!isLikelyFromPaid) {
          toast.info(t('session.continued', 'Session extended.'), { autoClose: 3000 });
      }
  }

}, [sessionId, t, isCoach, bookingId, bookingOvertimeSettings, setShowOvertimePrompt, setOvertimePromptData, setUserPromptData]);

const handleOvertimeResponseEvent = useCallback((data) => {
  logger.info('[VideoConference] Handling overtime-response event', {
    sessionId,
    choice: data?.choice,
    actualEndTime: data?.actualEndTime,
    timestamp: new Date().toISOString(),
  });
  setShowOvertimePrompt(false);
  setOvertimePromptData(null);
  toast.info(t('session.overtimeResponseReceived', { choice: data?.choice }));
}, [sessionId, t]);

const handleSessionEndedWithReason = useCallback((data) => {
  logger.info('[VideoConference] Handling session-ended event', {
    sessionId,
    reason: data?.reason,
    timestamp: new Date().toISOString(),
  });
  setIsSessionEnded(true);
  setShowOvertimePrompt(false);
  setShowPaymentFailurePrompt(false);
  setOvertimePromptData(null);
  setIsPaidOvertimeActive(false); // Reset paid OT status on session end
  setActualSessionEndTime(null); // Clear end time
  toast.info(t('session.endedWithReason', { reason: data?.reason || 'Unknown' }));
  setShowFeedbackPrompt(true);
}, [sessionId, t]);

const handleScaSuccess = useCallback(async (confirmedPaymentIntentId) => {
  const logContext = { sessionId, bookingId, paymentIntentId: confirmedPaymentIntentId };
  logger.info('[VideoConference] SCA Confirmation Success callback received.', logContext);
  setShowScaModal(false); // Close SCA modal
  setScaClientSecret(null);
  setScaPaymentIntentId(null);
  // Keep setIsConfirmingOvertimePayment true until backend confirms

  try {
    // Call backend to finalize authorization state and extend session
    await handleOvertimeChoice(sessionId, 'confirm_authorize', null, { paymentIntentId: confirmedPaymentIntentId });
    logger.info('[VideoConference] Backend confirmation successful after SCA.', logContext);

    // ---> ADD USER FEEDBACK HERE <---
    toast.success(t('session.overtimePaymentConfirmed', 'Payment confirmed successfully! Session extended.'));
    // Rely on 'session-continued' socket event for UI updates like timer

  } catch (error) {
     const errorMsg = error.response?.data?.message || error.message;
     logger.error('[VideoConference] Backend confirmation failed after successful SCA', { ...logContext, error: errorMsg });
     toast.error(t('session.backendConfirmationFailed', { message: errorMsg }));
     // Handle this critical state (payment authorized but session not extended?)
  } finally {
     setIsConfirmingOvertimePayment(false); // Reset loading state here
  }
}, [sessionId, bookingId, t, handleOvertimeChoice, setShowScaModal, setScaClientSecret, setScaPaymentIntentId, setIsConfirmingOvertimePayment]); 

const handleScaFailure = useCallback(async (scaError, failedPaymentIntentId) => {
  const logContext = { sessionId, bookingId, paymentIntentId: failedPaymentIntentId, scaError: scaError?.message };
  logger.warn('[VideoConference] SCA Confirmation Failure/Cancel callback received.', logContext);
  setShowScaModal(false); // Close SCA modal
  setScaClientSecret(null);
  setIsConfirmingOvertimePayment(false); // Reset loading state

  toast.error(t('payments:error.scaConfirmationFailed', { message: scaError?.message || 'Authorization cancelled or failed' }));

  // Notify backend that client-side authorization failed
  if (failedPaymentIntentId) { // Only notify if we have the ID
      try {
          await handleOvertimeChoice(sessionId, 'authorization_failed', null, { paymentIntentId: failedPaymentIntentId });
          logger.info('[VideoConference] Successfully notified backend of SCA failure.', logContext);
      } catch (backendNotifyError) {
          logger.error('[VideoConference] Failed to notify backend of client-side auth failure', { ...logContext, backendNotifyError: backendNotifyError.message });
      }
  } else {
      logger.warn('[VideoConference] Cannot notify backend of SCA failure - PaymentIntent ID missing.', logContext);
  }

  setScaPaymentIntentId(null); // Clear stored PI ID
}, [sessionId, bookingId, t, handleOvertimeChoice]);

const handleOvertimeAction = useCallback(async (choiceType, duration = null, price = null) => {
  const logContext = { choiceType, duration, price: price ? { amount: price.amount, currency: price.currency } : null, bookingId, sessionId };
  logger.info('[VideoConference] Handling overtime modal action', logContext);
  setIsSubmitting(true);
  setIsConfirmingOvertimePayment(choiceType === 'prepare_authorize');

  try {
    // --- COACH ACTIONS or USER DECLINE/END/FREE ---
    if (isCoach || ['decline', 'end', 'free'].includes(choiceType)) {
        const response = await handleOvertimeChoice(sessionId, choiceType, duration, price);
        logger.info('[VideoConference] Overtime API call successful (Coach/Simple)', { ...logContext, responseData: response });
        setShowOvertimePrompt(false);
        setOvertimePromptData(null);
        setUserPromptData(null);
        if (choiceType === 'request_paid') {
             toast.info(t('session.overtimeRequestedInfo', {defaultValue: "Overtime requested. Waiting for user..."}));
        }
    // --- USER AUTHORIZATION PREPARATION ---
    } else if (choiceType === 'prepare_authorize') {
        // 1. Call backend to prepare PaymentIntent
        const prepareResponse = await handleOvertimeChoice(sessionId, 'prepare_authorize', duration, price);
        logger.info('[VideoConference] Overtime payment preparation successful', { ...logContext, responseData: prepareResponse });

        const { clientSecret, paymentIntentId } = prepareResponse;

        // Close the prompt modal
        setShowOvertimePrompt(false);
        setOvertimePromptData(null);
        setUserPromptData(null);

        if (!clientSecret) {
            // Non-SCA flow (Shouldn't happen with manual capture intent, but handle defensively)
            logger.warn('[VideoConference] No clientSecret received after prepare_authorize. Assuming non-SCA success.', { ...logContext, paymentIntentId });
            try {
                await handleOvertimeChoice(sessionId, 'confirm_authorize', null, { paymentIntentId });
                toast.success(t('session.overtimePaymentConfirmed'));
            } catch (confirmError) {
                const errorMsg = confirmError.response?.data?.message || confirmError.message;
                logger.error('[VideoConference] Backend confirmation failed (non-SCA flow)', { ...logContext, paymentIntentId, error: errorMsg });
                toast.error(t('session.backendConfirmationFailed', { message: errorMsg }));
                handleScaFailure(new Error(errorMsg || 'Backend confirmation failed'), paymentIntentId); // Trigger failure flow
            }
        } else {
            // SCA potentially required. Show the dedicated SCA modal.
            logger.info('[VideoConference] ClientSecret received. Showing SCA modal.', { ...logContext, paymentIntentId });
            setScaPaymentIntentId(paymentIntentId);
            setScaClientSecret(clientSecret);
            setShowScaModal(true);
            // Loading state (isConfirmingOvertimePayment) remains true until modal calls callbacks
            return; // Exit this handler; modal callbacks take over
        }
    } else {
        logger.warn('[VideoConference] Unhandled overtime action type in user logic', { choiceType });
        throw new Error(`Invalid action: ${choiceType}`);
    }

  } catch (error) {
    // Catch errors from initial API calls (request_paid, prepare_authorize etc.)
    const errorMsg = error.response?.data?.message || error.message || t('session.submitError');
    logger.error('[VideoConference] Overtime action API call failed', { ...logContext, error: errorMsg, stack: error.stack });
    toast.error(errorMsg);
    // Close modals on error
    setShowOvertimePrompt(false);
    setOvertimePromptData(null);
    setUserPromptData(null);
    setShowScaModal(false); // Ensure SCA modal closes too
    setScaClientSecret(null);
    setScaPaymentIntentId(null);
  } finally {
    setIsSubmitting(false);
    // Only reset isConfirming if SCA modal wasn't triggered or if an error occurred before showing it
    if (!showScaModal || error) {
       setIsConfirmingOvertimePayment(false);
    }
     // Note: isConfirmingOvertimePayment will be reset within handleScaSuccess/handleScaFailure
     // if the SCA modal path was taken.
  }
}, [
    sessionId, bookingId, isCoach, user?.id, t, // Added user?.id
    setShowOvertimePrompt, setOvertimePromptData, setUserPromptData,
    handleOvertimeChoice, stripe, // stripe is needed for confirmCardPayment if that path were re-enabled
    handleScaSuccess, handleScaFailure, // Callbacks passed to modal
    setShowScaModal, setScaClientSecret, setScaPaymentIntentId // State setters for SCA modal
]);

const handleAuthorizationConfirmedEvent = useCallback((data) => {
  logger.info('[VideoConference] Handling authorization_confirmed event', {
    sessionId,
    paymentIntentId: data?.paymentIntentId,
    timestamp: new Date().toISOString(),
  });
  // This event confirms the backend successfully processed the authorization.
  // The session should be extended by backend logic emitting 'session-continued'.
  // We might already have optimistically closed the modal after client-side SCA success.
  // If the modal is still open (e.g., non-SCA flow), close it now.
  if (showOvertimePrompt) {
     logger.info('[VideoConference] Closing overtime prompt modal on authorization_confirmed event', { sessionId });
     setShowOvertimePrompt(false);
     setOvertimePromptData(null);
     setUserPromptData(null);
  }
  // Optionally show a brief confirmation toast if not already shown after client-side success
  // toast.success(t('session.paymentAuthorizedConfirmed'));
}, [sessionId, showOvertimePrompt, t]);

const handlePaymentFailureAction = useCallback(async (action) => {
  logger.info('[VideoConference] Handling payment failure action', {
    sessionId,
    action,
    timestamp: new Date().toISOString(),
  });
  try {
    await handlePaymentFailure(sessionId, action, localStorage.getItem('token'), socketRef.current);
    logger.info('[VideoConference] Payment failure action handled successfully', { sessionId, action });
    setShowPaymentFailurePrompt(false);
    toast.success(t(`session.${action === 'terminate' ? 'terminated' : 'continued'}`));
  } catch (error) {
    logger.error('[VideoConference] Failed to handle payment failure action', {
      sessionId,
      action,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    toast.error(t('session.paymentFailureActionFailed', { message: error.message }));
  }
}, [sessionId, t]);

const handleSimulateOvertimeUsage = async () => {
  if (process.env.NODE_ENV !== 'development') return;
  if (!sessionId) {
    toast.error("DEV: Session ID is missing.");
    return;
  }
  const minutesUsed = parseInt(devSimulatedOvertimeMinutes, 10);
  if (isNaN(minutesUsed) || minutesUsed < 0) {
    toast.error("DEV: Please enter a valid non-negative number of minutes.");
    return;
  }

  logger.info('[VideoConference DEV] Simulating overtime usage via API call.', { sessionId, minutesUsed });
  try {
    // Call the new API function
    const response = await apiSimulateOvertimeUsage(sessionId, minutesUsed);
    toast.success(`DEV: Simulated OT Usage (Used: ${minutesUsed} min). Status: ${response.captureStatus || 'N/A'}. Captured: ${response.capturedAmount !== undefined ? `${response.capturedAmount} ${response.currency}` : 'N/A'}`);
    logger.info('[VideoConference DEV] Overtime Usage Simulation API call successful', { sessionId, responseData: response });
    // You might want to refresh session data or rely on socket events if the backend emits them after this.
    // For now, this will finalize the segment on the backend.
  } catch (err) {
    const errorMsg = err.message || (err.response?.data?.message) || "OT Usage Sim DEV Error";
    toast.error(`DEV OT Usage Sim Error: ${errorMsg}`);
    logger.error('[VideoConference DEV] Failed to simulate overtime usage', { sessionId, error: errorMsg });
  }
};

const {
  participants,
  isConnected,
  startSession,
  endSession,
  toggleAudio: hookToggleAudio,
  toggleVideo: hookToggleVideo,
  shareScreen,
  error,
  activeSpeaker,
  raiseHand,
  lowerHand,
  raisedHands,
  createBreakoutRooms,
  endBreakoutRooms,
  breakoutRoom,
  audioEnabled: hookAudioEnabled,
  videoEnabled: hookVideoEnabled,
  trackEngagement,
  trackToolUsage,
  confirmHand,
  leaveSession,
} = useVideoConference(sessionId, token, {
  video: initialConfig?.video ?? true,
  audio: initialConfig?.audio ?? true,
  videoDeviceId: initialConfig?.videoDeviceId,
  audioDeviceId: initialConfig?.audioDeviceId,
  displayName: isCoach ? sessionDetails?.coach?.name : sessionDetails?.participant?.name || 'Participant',
  isCoach,
  userId,
  stream: initialConfig?.stream,
}, socket, {
  onOvertimePrompt: handleOvertimePromptEvent,
  onPaymentFailure: handlePaymentFailureEvent,
  onSessionContinued: handleSessionContinuedEvent,
  onOvertimeResponse: handleOvertimeResponseEvent,
  onSessionEndedWithReason: handleSessionEndedWithReason,
  onAuthorizationConfirmed: handleAuthorizationConfirmedEvent,
});

useEffect(() => {
  if (socket) {
    window.socket = socket;
    logger.info('[VideoConference] Socket exposed to window', { socketId: socket.id, sessionId });
  }
  return () => {
    delete window.socket;
    logger.info('[VideoConference] Socket removed from window', { sessionId });
  };
}, [socket, sessionId]);

useEffect(() => {
  if (socket) {
    const handleSessionEnded = ({ isCompleted }) => {
      logger.info('[VideoConference] Session ended event received:', { sessionId, isCompleted });
      setIsSessionEnded(true); // Mark session as ended
      endSession(); // Explicitly end the session using the hook
      if (isCompleted) {
        logger.info('[VideoConference] Session completed, prompting feedback', { sessionId });
        setShowFeedbackPrompt(true); // Show feedback prompt
      }
    };
    socket.on('SESSION_ENDED', handleSessionEnded);
    return () => {
      socket.off('SESSION_ENDED', handleSessionEnded);
      logger.info('[VideoConference] Cleaned up SESSION_ENDED listener', { sessionId });
    };
  }
}, [socket, sessionId, setIsSessionEnded, endSession]);

useEffect(() => {
  if (socket) {
    logger.info('[VideoConference] Socket ID check', { socketId: socket.id, sessionId });
  }
}, [socket, sessionId]);

  useEffect(() => {
    if (socket && !isCoach) {
      const handleSessionStarted = () => {
        logger.info('[VideoConference] Received session-started event', { sessionId });
        if (typeof onSessionStarted === 'function') {
          onSessionStarted();
        }
      };
      socket.on('session-started', handleSessionStarted);
      return () => {
        socket.off('session-started', handleSessionStarted);
        logger.info('[VideoConference] Cleaned up session-started listener', { sessionId });
      };
    }
  }, [socket, isCoach, onSessionStarted, sessionId]);

  useEffect(() => {
    logger.info('[VideoConference] Initialized with WaitingRoom settings', {
      streamId: localStream?.id,
      videoDeviceId: selectedVideoDevice,
      audioDeviceId: selectedAudioDevice,
      backgroundSettings: currentBackgroundSettings,
    });
  }, []);

  useEffect(() => {
    const initializeDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoList = devices.filter((d) => d.kind === 'videoinput');
        const audioList = devices.filter((d) => d.kind === 'audioinput');
        setVideoDevices(videoList);
        setAudioDevices(audioList);
        setSelectedVideoDevice(videoList[0]?.deviceId || '');
        setSelectedAudioDevice(audioList[0]?.deviceId || '');
      } catch (error) {
        logger.error('[VideoConference] Device initialization failed', { error });
        toast.error('Failed to initialize devices');
      }
    };
    initializeDevices();
  }, []);

  useEffect(() => {
    // Set up socket for video status monitoring
    if (!sessionId || !token) {
      logger.warn('[VideoConference] Missing sessionId or token for socket connection');
      return;
    }
    
    const connectionUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/video`;
    
    // CRITICAL FIX: Ensure token is included and properly formatted in query parameters
socketRef.current = io.connect(connectionUrl, {
  query: { 
    sessionId, 
    token, 
    t: new Date().getTime()
  },
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 15000,
  forceNew: true,
  auth: { token: localStorage.getItem('token') || '' }
});
  
    const handleSocketConnect = () => {
      setSocketStatus('connected');
      logger.info('[VideoConference] Status socket connected', { 
        sessionId,
        socketId: socketRef.current?.id,
        transport: socketRef.current?.io?.engine?.transport?.name || 'unknown'
      });
      
      // IMPORTANT: Send explicit join_video_namespace event to ensure connection
      socketRef.current.emit('join_video_namespace', {
        sessionId,
        token,
        timestamp: new Date().toISOString()
      });
    };
    
    const handleSocketError = (error) => {
      setSocketStatus('error');
      logger.error('[VideoConference] Status socket error', { 
        error: typeof error === 'object' ? error.message : error,
        sessionId,
        socketId: socketRef.current?.id
      });
      
      // Try to recover by reconnecting
      setTimeout(() => {
        if (socketRef.current) {
          logger.info('[VideoConference] Attempting to reconnect socket after error');
          socketRef.current.connect();
        }
      }, 2000);
    };
    
    const handleSocketDisconnect = (reason) => {
      setSocketStatus('disconnected');
      logger.warn('[VideoConference] Status socket disconnected', { 
        reason, 
        sessionId,
        socketId: socketRef.current?.id 
      });
    };
    
    const handleSocketReconnect = (attempt) => {
      setSocketStatus('reconnecting');
      logger.info('[VideoConference] Status socket reconnecting', { 
        attempt, 
        sessionId,
        socketId: socketRef.current?.id
      });
    };
    
    // Track successful join
    const handleRoomJoined = (data) => {
      logger.info('[VideoConference] Video namespace joined confirmation', {
        success: data.success,
        roomId: data.roomId,
        timestamp: data.timestamp
      });
    };
    
    socketRef.current.on('connect', handleSocketConnect);
    socketRef.current.on('error', handleSocketError);
    socketRef.current.on('disconnect', handleSocketDisconnect);
    socketRef.current.on('reconnect_attempt', handleSocketReconnect);
    socketRef.current.on('video_namespace_joined', handleRoomJoined);
    
    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('ping', { timestamp: new Date().toISOString() });
      }
    }, 30000);
    
    return () => {
      clearInterval(pingInterval);
      
      if (socketRef.current) {
        logger.info('[VideoConference] Cleaning up status socket');
        socketRef.current.off('connect', handleSocketConnect);
        socketRef.current.off('error', handleSocketError);
        socketRef.current.off('disconnect', handleSocketDisconnect);
        socketRef.current.off('reconnect_attempt', handleSocketReconnect);
        socketRef.current.off('video_namespace_joined', handleRoomJoined);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [sessionId, token]);
  
  useEffect(() => {
    positionRef.current = {
      x: window.innerWidth - 300 - 16,
      y: window.innerHeight - controlBarHeight - 300 - 10,
    };
    if (divRef.current) {
      divRef.current.style.transform = `translate(${positionRef.current.x}px, ${positionRef.current.y}px)`;
    }
  }, [controlBarHeight, window.innerWidth, window.innerHeight]);
  
  useEffect(() => {
    console.log('[PollPanel] Updated Position:', pollPosition);
  }, [pollPosition]);

  useEffect(() => {
    const initializeAndStartSessionIfNeeded = async () => {
      if (
        sessionId &&
        token && // This 'token' is the sessionLink.token
        (isDeviceCheckComplete || processedStream) &&
        !hasStartedSession.current &&
        !isSessionEnded &&
        sessionDetails?.canJoinImmediately
      ) {
        logger.info('[VideoConference] Conditions met for API startSession call.', { sessionId });
        hasStartedSession.current = true;
  
        try {
          const jwtAuthToken = localStorage.getItem('token'); // Or get from AuthContext
          if (!jwtAuthToken) {
              throw new Error("Authentication token not found for starting session.");
          }
          // Call the backend /api/sessions/start/:sessionId
          // This ensures Session.state becomes 'active' and Session.actualStartTime is set.
          const startApiResponse = await apiStartSession(
            sessionId,      // path param
            jwtAuthToken,   // for Authorization header
            token,          // THIS IS THE sessionLink.token for the request body
            {               // bodyPayload
                displayName: isCoach ? sessionDetails?.coach?.name : sessionDetails?.participant?.name || 'Participant',
                isCoach: isCoach,
            }
        );
          logger.info('[VideoConference] API /api/sessions/start call successful', { 
              sessionId, 
              stateChanged: startApiResponse.stateChanged, 
              actualStartTime: startApiResponse.actualStartTime 
          });
  
          // If the backend call was successful, then proceed with the hook's startSession
          // which handles WebRTC and socket setup for media.
          await startSession(); // This is the startSession from useVideoConference hook
          
          setWaiting(false); // No longer waiting if we've started
          if (typeof onSessionStarted === 'function') {
            onSessionStarted(); // Notify parent if applicable
          }
          logger.info('[VideoConference] useVideoConference.startSession (media setup) completed.', { sessionId });
  
        } catch (err) {
          const errorMsg = err.response?.data?.message || err.message;
          logger.error('[VideoConference] Error during initializeAndStartSessionIfNeeded (API start or hook start)', {
            sessionId,
            error: errorMsg,
            stack: err.stack
          });
          toast.error(t('session.startFailed', { message: errorMsg }));
          hasStartedSession.current = false; // Allow retry if applicable
        }
      } else {
        // Log why it was skipped
        let reason = "";
        if (!sessionId || !token) reason = "Missing sessionId or token.";
        else if (!isDeviceCheckComplete && !processedStream) reason = "Device check incomplete and no stream.";
        else if (hasStartedSession.current) reason = "Start process already initiated by this client.";
        else if (isSessionEnded) reason = "Session has already ended.";
        else if (!sessionDetails?.canJoinImmediately) reason = "Session details indicate cannot join immediately.";
        else if (!sessionDetails) reason = "Session details not yet loaded.";
        logger.info('[VideoConference] Skipping API startSession call.', { reason, sessionId, isDeviceCheckComplete, hasStream: !!processedStream, isSessionEnded, sessionDetailsLoaded: !!sessionDetails, canJoin: sessionDetails?.canJoinImmediately });
      }
    };
  
    // Trigger this effect when sessionDetails are loaded and other conditions might change
    if (sessionDetails) {
      initializeAndStartSessionIfNeeded();
    }
  
    // Dependencies: Ensure all variables used in the condition and logic are listed.
  }, [sessionId, token, isDeviceCheckComplete, processedStream, isSessionEnded, sessionDetails, isCoach, startSession, t, onSessionStarted]);

  useEffect(() => {
    const updateHeights = () => {
      const header = document.querySelector('.modern-header');
      const controlBar = document.querySelector('.control-bar');
      let newHeaderHeight = 0;
      let newControlBarHeight = 0;
  
      if (header) {
        newHeaderHeight = header.offsetHeight;
        setHeaderHeight(newHeaderHeight);
        logger.info('[VideoConference] Header height updated', { height: newHeaderHeight, sessionId });
      }
      if (controlBar) {
        newControlBarHeight = controlBar.offsetHeight;
        setControlBarHeight(newControlBarHeight);
        logger.info('[VideoConference] Control bar height updated', { 
          height: newControlBarHeight, 
          computedStyle: window.getComputedStyle(controlBar).height,
          sessionId 
        });
      } else {
        logger.warn('[VideoConference] Control bar not found during height update', { sessionId });
      }
  
      // Log container dimensions after update
      if (containerRef.current) {
        logger.info('[VideoConference] Container dimensions after height update', {
          height: containerRef.current.clientHeight,
          controlBarHeight: newControlBarHeight,
          sessionId
        });
      }
    };
  
    // Initial synchronous call to set heights before render
    updateHeights();
  
    // Add resize and observer listeners
    window.addEventListener('resize', updateHeights);
    const resizeObserver = new ResizeObserver(updateHeights);
    const header = document.querySelector('.modern-header');
    const controlBar = document.querySelector('.control-bar');
    if (header) resizeObserver.observe(header);
    if (controlBar) resizeObserver.observe(controlBar);
  
    return () => {
      window.removeEventListener('resize', updateHeights);
      resizeObserver.disconnect();
      logger.info('[VideoConference] Cleaned up height observers', { sessionId });
    };
  }, [sessionId]);

  useEffect(() => {
    if (initialConfig?.stream && !processedStream) {
      setProcessedStream(initialConfig.stream);
      logger.info('[VideoConference] Initialized with stream from WaitingRoom', { streamId: initialConfig.stream.id });
    }
  }, [initialConfig?.stream, processedStream]);

  useEffect(() => {
    if (typeof hookAudioEnabled !== 'undefined') {
      setAudioEnabled(hookAudioEnabled);
    }
    if (typeof hookVideoEnabled !== 'undefined') {
      setVideoEnabled(hookVideoEnabled);
    }
  }, [hookAudioEnabled, hookVideoEnabled]);

  const updateStream = useCallback(async (videoDeviceId, audioDeviceId) => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : false,
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : false,
      });
      setLocalStream(newStream);
      setProcessedStream(newStream);
      logger.info('[VideoConference] Stream updated with new devices', {
        streamId: newStream.id,
        videoDeviceId,
        audioDeviceId,
      });
      return newStream;
    } catch (error) {
      logger.error('[VideoConference] Failed to update stream', { error: error.message });
      throw error;
    }
  }, []);

  // This is the key function that receives settings from VideoSettings
  const handleApplySettings = useCallback((newSettings) => {
    logger.info('[VideoConference] Applying new settings', { 
      newSettings,
      streamId: newSettings.stream?.id,
      backgroundMode: newSettings.backgroundSettings?.mode
    });
    
    // Update state with the new settings
    setCurrentBackgroundSettings(newSettings.backgroundSettings);
    setSelectedVideoDevice(newSettings.videoDeviceId);
    setSelectedAudioDevice(newSettings.audioDeviceId);
    
    if (newSettings.stream) {
      // Update streams - VideoSession handles the rendering now
      setLocalStream(newSettings.stream);
      setProcessedStream(newSettings.stream);
      
      // Dispatch event to notify other components
      window.dispatchEvent(new CustomEvent('stream-changed', {
        detail: {
          stream: newSettings.stream,
          backgroundSettings: newSettings.backgroundSettings
        }
      }));
    }
  }, []);

  const handleSessionError = (error) => {
    logger.error('[VideoConference] Session error event received:', {
      error: typeof error === 'string' ? error : error.message,
      sessionId,
      timestamp: new Date().toISOString()
    });
    toast.error(error.message || 'Connection error. Please try refreshing the page.');
  };

  useEffect(() => {
    const fetchSessionDetails = async () => {
      logger.info('[VideoConference] Fetching session details', { sessionId, token });
      setIsLoadingSession(true);
      try {
        const details = await getSessionDetails(sessionId, token);
        logger.info('[VideoConference] Session details fetched', { details });
        setSessionDetails(details || {});
        setSessionError(null);
        setStartTime(details.start);
        // Only allow immediate join for coaches when canJoinImmediately is true
        if (isCoach && details.canJoinImmediately) {
          logger.info('[VideoConference] Coach can join immediately, setting waiting to false', { sessionId });
          setWaiting(false);
        } else {
          // Ensure waiting is true if session is not live
          const isLive = details.isLiveSession || (details.start && new Date() >= new Date(details.start));
          setWaiting(!isLive);
          logger.info('[VideoConference] Session live status checked', { sessionId, isLive, isCoach });
        }
      } catch (err) {
        logger.error('[VideoConference] Session fetch error:', { error: err.response?.data || err.message, sessionId });
        setSessionError(err.response?.data || { message: err.message });
        if (err.response?.data?.message === 'Session has not yet started') {
          setStartTime(new Date(err.response.data.sessionStart));
          // Explicitly set waiting to true for non-coaches or when session hasn't started
          if (!isCoach || !err.response?.data?.canJoinImmediately) {
            setWaiting(true);
            logger.info('[VideoConference] Session not started, setting waiting to true', { sessionId, isCoach });
          }
        }
        setSessionDetails({});
      } finally {
        setIsLoadingSession(false);
      }
    };
  
    const debouncedFetch = debounce(fetchSessionDetails, 2000); // 2-second delay
  
    if (sessionId && token) debouncedFetch();
  }, [sessionId, token, isCoach]);

  useEffect(() => {
    logger.info('[VideoConference] Session start useEffect triggered', {
      isLiveSession,
      isDeviceCheckComplete,
      isCoach,
      sessionDetails: sessionDetails ? JSON.stringify(sessionDetails) : 'null',
      isConnected,
      hasStartedSession: hasStartedSession.current,
      isSessionEnded, // Add this to logs
      timestamp: new Date().toISOString()
    });
  
    const shouldStartSession = !hasStartedSession.current && 
                             !isConnected &&
                             !isSessionEnded && // Prevent restart if session was ended
                             (isDeviceCheckComplete || processedStream) &&
                             (
                               isLiveSession || 
                               (sessionDetails?.isLiveSession) || 
                               (isCoach && sessionDetails?.canJoinImmediately) ||
                               (waiting && startTime && Date.now() - new Date(startTime).getTime() > 10000)
                             );
  
    if (shouldStartSession) {
      logger.info('[VideoConference] Conditions met, starting session', { 
        sessionId,
        isDeviceCheckComplete,
        hasProcessedStream: !!processedStream
      });
      
      hasStartedSession.current = true;
      
      startSession()
        .then(() => {
          setWaiting(false);
          logger.info('[VideoConference] Session started successfully', { sessionId });
        })
        .catch(err => {
          logger.error('[VideoConference] Session start failed', { 
            error: err.message, 
            sessionId 
          });
          // ... recovery logic
        });
    } else {
      const skipReason = hasStartedSession.current 
        ? 'Already started' 
        : isConnected 
          ? 'Already connected' 
          : isSessionEnded
            ? 'Session intentionally ended' // New reason
            : !isDeviceCheckComplete && !processedStream
              ? 'Device check incomplete and no stream available'
              : 'Required conditions not met';
              
      logger.warn('[VideoConference] Session start skipped', {
        reason: skipReason,
        isConnected,
        isDeviceCheckComplete,
        hasProcessedStream: !!processedStream,
        waiting,
        isSessionEnded, // Log this
        timestamp: new Date().toISOString()
      });
    }

    window.addEventListener('session-error', handleSessionError);

    return () => {
      logger.info('[VideoConference] Cleaning up session start useEffect', { sessionId, isConnected });
      window.removeEventListener('session-error', handleSessionError);
      
      if (!isConnected) {
        logger.info('[VideoConference] Skipping endSession as session not connected', { sessionId });
      } else if (window.location.pathname !== `/video-conference/${sessionId}`) {
        logger.info('[VideoConference] Ending session due to navigation away', { sessionId });
        endSession();
      }
    };
  }, [isLiveSession, isDeviceCheckComplete, isCoach, sessionDetails, startSession, endSession, isConnected, sessionId, waiting, processedStream, startTime]);


  useEffect(() => {
    if (error) toast.error(error);
    if (isConnected) {
      toast.success(t('session.connected'));
      if (isCoach) setWaiting(false);
    }
  }, [error, isConnected, t, isCoach]);

  useEffect(() => {
    if (sessionDuration) {
      const timer = setInterval(() => {
        setSessionTime((prev) => {
          if (prev >= sessionDuration * 60 - 300) {
            toast.warn(t('session.endingSoon'));
          }
          if (prev >= sessionDuration * 60) {
            endSession();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [sessionDuration, endSession, t]);

  useEffect(() => {
    if (isRecording && localStream && !recorderRef.current) {
      const recorder = new MediaRecorder(localStream);
      recorderRef.current = recorder;
      recorder.start();
    }
  }, [isRecording, localStream]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await axios.get(`/api/sessions/${sessionId}/analytics`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        setAnalytics(response.data.analytics);
        logger.info('[VideoConference] Analytics fetched', { sessionId });
      } catch (error) {
        logger.error('[VideoConference] Fetch analytics error', { error: error.message });
      }
    };
    if (isCoach) fetchAnalytics();
  }, [sessionId, isCoach]);

  useEffect(() => {
    if (localStream) {
      setProcessedStream(localStream);
      logger.info('[VideoConference] Processed stream initialized with localStream', { sessionId });
    }
  }, [localStream, sessionId]);

  useEffect(() => {
    if (localStream) {
      setIsDeviceCheckComplete(true);
    }
  }, [localStream]);
  
  useEffect(() => {
    // Track current stream ID to detect changes
    let currentStreamId = localStream?.id || processedStream?.id;
    
    // Listen for stream changes to update state
    const handleStreamChanged = (event) => {
      const newStream = event.detail?.stream;
      if (!newStream || newStream.id === currentStreamId) return;
      
      // Update current ID we're tracking
      currentStreamId = newStream.id;
      
      logger.info('[VideoConference] Stream changed via event', {
        newStreamId: newStream.id,
        trackCount: newStream.getTracks().length
      });
      
      // Only update processed stream when already in the call
      // This ensures we don't trigger waiting room skipping
      if (!waiting && isDeviceCheckComplete) {
        // Update local state
        setProcessedStream(newStream);
        
        // Update audio/video enabled state based on track state
        const audioTrack = newStream.getAudioTracks()[0];
        const videoTrack = newStream.getVideoTracks()[0];
        
        if (audioTrack) {
          setAudioEnabled(audioTrack.enabled);
        }
        
        if (videoTrack) {
          setVideoEnabled(videoTrack.enabled);
        }
      }
    };
    
    window.addEventListener('stream-changed', handleStreamChanged);
    
    return () => {
      window.removeEventListener('stream-changed', handleStreamChanged);
    };
  }, [localStream, processedStream, waiting, isDeviceCheckComplete]);

  useEffect(() => {
    if (isConnected && isDeviceCheckComplete && !waiting) {
      logger.info('[VideoConference] All conditions met, ensuring UI update', {
        sessionId,
        isConnected,
        isDeviceCheckComplete,
        waiting,
        timestamp: new Date().toISOString()
      });
      // Force a re-render if needed (optional, can remove if logging confirms update)
      containerRef.current?.focus();
    }
  }, [isConnected, isDeviceCheckComplete, waiting, sessionId]);

  useEffect(() => {
    logger.info('[VideoConference] Component mounted', { sessionId });
    return () => {
      logger.info('[VideoConference] Component unmounted', { sessionId });
      // Do NOT call endSession here unless navigating away
    };
  }, [sessionId]);

  useEffect(() => {
    logger.info('[VideoConference] isConnected state changed', {
      isConnected,
      sessionId,
      timestamp: new Date().toISOString()
    });
  }, [isConnected, sessionId]);

  useEffect(() => {
    let timer;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  // Reset recording time when recording stops
  useEffect(() => {
    if (!isRecording) {
      setRecordingTime(0);
    }
  }, [isRecording]);

  // Format time as MM:SS
  const formatRecordingTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const updateIndicatorPosition = () => {
      if (layoutManagerRef.current && isRecording) {
        const layoutManager = layoutManagerRef.current;
        const rect = layoutManager.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const layoutWidth = rect.width;
        const layoutLeft = rect.left - containerRect.left;
        const centerPosition = layoutLeft + layoutWidth / 2;
        setIndicatorPosition({ left: `${centerPosition}px` });
      }
    };

    updateIndicatorPosition();
    window.addEventListener('resize', updateIndicatorPosition);
    return () => window.removeEventListener('resize', updateIndicatorPosition);
  }, [isRecording]);

  useEffect(() => {
    const interval = setInterval(() => {
      logger.info('[VideoConference] Socket connection status', {
        sessionId,
        connected: socket.connected,
        socketId: socket.id,
        rooms: socket.rooms ? Array.from(socket.rooms) : [],
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [socket, sessionId]);

  const getParticipantDisplayName = useCallback((handUserId, handPeerId, handDisplayName) => {
    // 1. Try finding by userId in participants state
    const participantById = participants.find(p => p.userId === handUserId); // Assuming participants have userId
    if (participantById && participantById.displayName) {
      return participantById.displayName;
    }
    // 2. Try finding by peerId in participants state
    const participantByPeerId = participants.find(p => p.peerId === handPeerId);
    if (participantByPeerId && participantByPeerId.displayName) {
      return participantByPeerId.displayName;
    }
    // 3. Fallback to displayName from the hand object itself (sent by backend)
    if (handDisplayName) {
      return handDisplayName;
    }
    // 4. Final fallback
    logger.warn('[VideoConference] Could not find display name for raised hand', { handUserId, handPeerId, handDisplayName, participantsAvailable: participants.length });
    return t('session.unknownUser'); // Use translation key
  }, [participants, t]);

  const handleDeviceCheckComplete = useCallback((config) => {
    logger.info('[VideoConference] handleDeviceCheckComplete called', { config, sessionId });
    logger.info('[VideoConference] Applying config to state', { config, sessionId });
    setSessionConfig({ video: config.video, audio: config.audio });
    setSelectedVideoDevice(config.videoDeviceId || '');
    setSelectedAudioDevice(config.audioDeviceId || '');
    setCurrentBackgroundSettings(config.backgroundSettings || { mode: 'none', customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL });
    updateStream(config.videoDeviceId || '', config.audioDeviceId || '')
      .then(() => {
        console.log('[VideoConference] Stream updated with devices:', {
          videoDeviceId: config.videoDeviceId,
          audioDeviceId: config.audioDeviceId,
        });
        logger.info('[VideoConference] Stream update successful', { videoDeviceId: config.videoDeviceId, audioDeviceId: config.audioDeviceId, sessionId });
      })
      .catch((error) => {
        logger.error('[VideoConference] Stream update failed in device check', { error, sessionId });
      });
    setIsDeviceCheckComplete(true);
    if (isCoach || isLiveSession) startSession();
  }, [isLiveSession, isCoach, startSession, updateStream, sessionId]);

  const handleConsent = async (accepted) => {
    setShowConsentModal(false);
    if (!accepted) {
      toast.info(t('session.recordingConsentDenied'));
      return;
    }

    try {
      const bookingIdVal = bookingId || sessionDetails?.bookingId;
      if (!bookingIdVal || !sessionId) throw new Error('Missing session details');
      logger.info('[VideoConference] Starting recording with payload', { bookingId: bookingIdVal, sessionId });
      const response = await axios.post(
        '/api/recordings/start',
        { bookingId: bookingIdVal, sessionId, consent: true },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (!response.data.success) throw new Error(response.data.message || 'Failed to start recording');
      setRecordingId(response.data.recordingId);
      setIsRecording(true);
      logger.info('[VideoConference] Recording started with consent', { bookingId: bookingIdVal, recordingId: response.data.recordingId });
      toast.success(t('session.recordingStarted'));
    } catch (error) {
      logger.error('[VideoConference] Start recording error', { error: error.message });
      toast.error(`Failed to start recording: ${error.message}`);
    }
  };

  const toggleRecording = useCallback(async () => {
    if (!isRecording) {
      if (!isCoach) {
        toast.error(t('session.onlyCoachCanRecord'));
        return;
      }
      setShowConsentModal(true);
    } else {
      try {
        const bookingIdVal = bookingId || sessionDetails?.bookingId;
        const recorder = recorderRef.current;
        if (!recorder || !bookingIdVal || !recordingId) throw new Error('Recording not initialized');
        recorder.stop();
        const blob = await new Promise((resolve) => {
          const chunks = [];
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
        });
        const formData = new FormData();
        formData.append('video', blob, 'session-recording.webm');
        formData.append('bookingId', bookingIdVal);
        formData.append('recordingId', recordingId);
        const response = await axios.post('/api/recordings/stop', formData, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data',
          },
        });
        if (!response.data.success) throw new Error(response.data.message || 'Failed to stop recording');
        setIsRecording(false);
        setRecordingId(null);
        recorderRef.current = null;
        logger.info('[VideoConference] Recording stopped', { bookingId: bookingIdVal, recordingId });
        toast.success(t('session.recordingStopped'));
      } catch (error) {
        logger.error('[VideoConference] Stop recording error', { error: error.message });
        toast.error(`Failed to stop recording: ${error.message}`);
      }
    }
  }, [isRecording, isCoach, sessionId, sessionDetails, bookingId, t, recordingId]);

  useEffect(() => {
    if (socket && sessionId) {
      socket.emit('join', `session:${sessionId}`, () => {
        console.log('[VideoConference] Joined room:', `session:${sessionId}`);
      });
    }
  }, [socket, sessionId]);

  useEffect(() => {
    let cleanupMonitor;
    if (isConnected && sessionId && token && socketRef.current) {
      logger.info('[VideoConference] Starting session monitoring', { sessionId });
      monitorSession(sessionId, token, socketRef.current, getCurrentTime)
        .then((cleanup) => {
          cleanupMonitor = cleanup;
          logger.debug('[VideoConference] Monitor session cleanup assigned', { sessionId });
        })
        .catch((error) => {
          logger.error('[VideoConference] Failed to start session monitoring', {
            sessionId,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
          });
          toast.error(t('session.monitoringFailed', { message: error.message }));
        });
    }
    return () => {
      if (cleanupMonitor) {
        cleanupMonitor();
        logger.info('[VideoConference] Stopped session monitoring', { sessionId });
      }
    };
  }, [isConnected, sessionId, token, socketRef, t]);

  useEffect(() => {
    const fetchOvertimeSettings = async () => {
        if (!bookingId) return;
        try {
            const settings = await getBookingOvertimeSettings(bookingId);
             // Store original end time for later calculation if available in booking data
             const bookingData = await getBooking(bookingId); // Fetch full booking if needed
             settings.originalEndTime = bookingData?.end; // Add original end time
            setBookingOvertimeSettings(settings || {});
            logger.info('[VideoConference] Fetched Booking Overtime Settings', { bookingId, settings });
             // Set initial end time if available from booking
             if (bookingData?.end) {
                 setActualSessionEndTime(bookingData.end);
                 logger.debug('[VideoConference] Set initial actualSessionEndTime from booking data', { bookingId, endTime: bookingData.end });
             }

        } catch (error) {
            logger.error('[VideoConference] Failed to fetch booking overtime settings', { bookingId, error: error.message });
            // Handle error appropriately, maybe set default settings
            setBookingOvertimeSettings({});
        }
    };
    fetchOvertimeSettings();
}, [bookingId]);


  const sendChatMessage = useCallback(() => {
    if (currentMessage.trim()) {
      const newMessage = { text: currentMessage, sender: userId, timestamp: new Date().toISOString() };
      setChatMessages((prev) => [...prev, newMessage]);
      setCurrentMessage('');
      trackEngagement('chat');
      logger.info('[VideoConference] Chat message sent and tracked as engagement', { sessionId, userId });
    }
  }, [currentMessage, userId, trackEngagement]);

  const createPoll = useCallback((question, options) => {
    const newPoll = { question, options: options.map(opt => ({ text: opt, votes: 0 })), voters: [] };
    setCurrentPoll(newPoll);
  }, []);

  const votePoll = useCallback((optionIndex) => {
    if (currentPoll && !currentPoll.voters.includes(userId)) {
      const updatedPoll = { ...currentPoll };
      updatedPoll.options[optionIndex].votes += 1;
      updatedPoll.voters.push(userId);
      setCurrentPoll(updatedPoll);
    }
  }, [currentPoll, userId]);

  const shareResource = useCallback((resource) => {
    setSharedResources((prev) => [...prev, resource]);
  }, []);

  

  const handleStartSession = async () => {
    if (hasHandledStartSession.current) {
      logger.warn('[VideoConference] handleStartSession already invoked, skipping', { sessionId });
      return;
    }
  
    logger.info('[VideoConference] handleStartSession invoked', { sessionId, timestamp: new Date().toISOString() });
    hasHandledStartSession.current = true;
  
    try {
      const response = await axios.post(
        `/api/sessions/start/${sessionId}`,
        { token, displayName: 'Coach', isCoach: true },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (response.data.success) {
        setWaiting(false);
        startSession();
        logger.info('[VideoConference] Coach started session successfully', { sessionId });
        toast.success(t('session.started'));
        // Notify wrapper of join (for consistency with WaitingRoom)
        if (typeof onJoin === 'function') {
          onJoin({ video: true, audio: true });
        }
      }
    } catch (error) {
      logger.error('[VideoConference] Failed to start session', { error: error.message, sessionId });
      toast.error(t('session.startFailed', { message: error.message }));
    }
  };

  const handleEndSession = useCallback(async () => {
    const logContext = { 
      event: 'end_session_client_v1',
      sessionId, 
      userId, 
      isCoach, 
      timestamp: new Date().toISOString() 
    };
    logger.info('[VideoConference] handleEndSession invoked', logContext);
  
    try {
      await endSession();
      setIsSessionEnded(true);
      logger.info('[VideoConference] Session ended successfully', logContext);
    } catch (error) {
      logger.error('[VideoConference] Failed to end session', { 
        ...logContext, 
        error: error.message, 
        stack: error.stack 
      });
      toast.error(t('session.endFailed', { message: error.message }));
    }
  }, [sessionId, userId, isCoach, endSession, t]);
  
  const handleLeaveSession = useCallback(async () => {
    const logContext = { 
      event: 'leave_session_client_v1',
      sessionId, 
      userId, 
      isCoach, 
      timestamp: new Date().toISOString() 
    };
    logger.info('[VideoConference] handleLeaveSession invoked', logContext);
  
    try {
      await leaveSession();
      setIsSessionEnded(true);
      logger.info('[VideoConference] Left session successfully', logContext);
    } catch (error) {
      logger.error('[VideoConference] Failed to leave session', { 
        ...logContext, 
        error: error.message, 
        stack: error.stack 
      });
      toast.error(t('session.leaveFailed', { message: error.message }));
    }
  }, [sessionId, userId, isCoach, leaveSession, t]);

  //DEVELOPMENT ONLY!
  const simulateSessionEnd = async () => {
    if (window.confirm('Are you sure you want to simulate ending the session after 5 minutes?')) {
      try {
        const response = await axios.post(
          `/api/sessions/${sessionId}/end`,
          { simulate: true },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (response.data.success) {
          toast.success('Session end simulated successfully');
          setIsSessionEnded(true); // Update local state to reflect session end
          // Note: The 'SESSION_ENDED' event from the backend will handle the feedback prompt
        } else {
          throw new Error(response.data.message || 'Simulation failed');
        }
      } catch (error) {
        logger.error('[VideoConference] Failed to simulate session end:', error);
        toast.error(`Failed to simulate session end: ${error.message}`);
      }
    }
  };

  const triggerSessionEndTimer = useCallback(async () => {
    logger.info('[VideoConference] Triggering session end timer simulation', { sessionId });
    try {
      const sessionDetails = await getSessionDetails(sessionId, token);
      const { end, bookingId } = sessionDetails;
      if (!end || !bookingId) {
        logger.error('[VideoConference] Invalid session details for simulation', { sessionId, end, bookingId });
        toast.error(t('session.simulationFailed', { message: 'Invalid session details' }));
        return;
      }

      const endTime = new Date(end).getTime();
      simulatedTimeRef.current = endTime;
      logger.info('[VideoConference] Set simulated time to session end', {
        sessionId,
        endTime: new Date(endTime).toISOString(),
        bookingId,
      });

      // Trigger immediate check in monitorSession
      if (socketRef.current && socketRef.current.connected) {
        logger.debug('[VideoConference] Emitting simulate-time-update to trigger immediate check', { sessionId });
        socketRef.current.emit('simulate-time-update', { sessionId, simulatedTime: endTime });
      } else {
        logger.warn('[VideoConference] Socket disconnected during simulation', { sessionId });
      }

      toast.success(t('session.simulationEndTimerTriggered', { defaultValue: 'Session end timer triggered' }));

      // Reset after 10 seconds
      setTimeout(() => {
        simulatedTimeRef.current = null;
        logger.info('[VideoConference] Reset simulated time', { sessionId });
      }, 10000);
    } catch (error) {
      logger.error('[VideoConference] Failed to trigger session end timer', {
        sessionId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
      toast.error(t('session.simulationFailed', { message: error.message }));
    }
  }, [sessionId, token, t]);

  // Simulate overtime prompt
  const triggerOvertimePrompt = useCallback(async () => {
    logger.info('[VideoConference] Triggering overtime prompt simulation', { sessionId });
    try {
      const sessionDetails = await getSessionDetails(sessionId, token);
      const { end, bookingId } = sessionDetails;
      if (!end || !bookingId) {
        logger.error('[VideoConference] Invalid session details for simulation', { sessionId, end, bookingId });
        toast.error(t('session.simulationFailed', { message: 'Invalid session details' }));
        return;
      }
  
      const overtimeSettings = await getBookingOvertimeSettings(bookingId);
      if (!overtimeSettings.allowOvertime) {
        logger.warn('[VideoConference] Overtime not allowed, cannot simulate prompt', { sessionId, bookingId });
        toast.error(t('session.simulationOvertimeNotAllowed', { defaultValue: 'Overtime not allowed' }));
        return;
      }
  
      if (!isCoach) {
        logger.warn('[VideoConference] Overtime prompt simulation restricted to coaches', { sessionId });
        toast.error(t('session.simulationCoachOnly', { defaultValue: 'Simulation restricted to coaches' }));
        return;
      }
  
      const promptData = {
        metadata: {
          sessionId,
          bookingId,
          overtimeOptions: [
            { type: 'end', duration: 0, cost: 0 },
            ...(overtimeSettings.freeOvertimeDuration > 0
              ? [{ type: 'free', duration: overtimeSettings.freeOvertimeDuration, cost: 0 }]
              : []),
            ...(overtimeSettings.paidOvertimeDuration > 0
              ? [{
                  type: 'paid',
                  duration: overtimeSettings.paidOvertimeDuration,
                  cost: overtimeSettings.overtimeRate * (overtimeSettings.paidOvertimeDuration / 60),
                }]
              : []),
          ],
        },
      };
  
      if (socketRef.current && socketRef.current.connected) {
        logger.info('[VideoConference] Emitting simulated overtime prompt', { sessionId, bookingId });
        socketRef.current.emit('overtime-prompt', promptData);
        logger.debug('[VideoConference] Locally triggering handleOvertimePromptEvent for coach', { sessionId });
        handleOvertimePromptEvent(promptData); // Use defined callback
      } else {
        logger.warn('[VideoConference] Socket disconnected, locally triggering handleOvertimePromptEvent', { sessionId });
        handleOvertimePromptEvent(promptData); // Fallback to local trigger
      }
  
      toast.success(t('session.simulationOvertimeTriggered', { defaultValue: 'Overtime prompt triggered' }));
    } catch (error) {
      logger.error('[VideoConference] Failed to simulate overtime prompt', {
        sessionId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
      toast.error(t('session.simulationFailed', { message: error.message }));
    }
  }, [sessionId, token, isCoach, handleOvertimePromptEvent, t]);

  const simulatePaidOvertime = useCallback(async () => {
    logger.info('[VideoConference] Simulating paid overtime', { sessionId });
    try {
      const sessionDetails = await getSessionDetails(sessionId, token);
      const { bookingId } = sessionDetails;
      if (!bookingId) {
        logger.error('[VideoConference] Invalid session details for simulation', { sessionId, bookingId });
        toast.error(t('session.simulationFailed', { message: 'Invalid session details' }));
        return;
      }
  
      const overtimeSettings = await getBookingOvertimeSettings(bookingId);
      if (!overtimeSettings.allowOvertime || overtimeSettings.paidOvertimeDuration <= 0) {
        logger.warn('[VideoConference] Paid overtime not configured', { sessionId, bookingId });
        toast.error(t('session.simulationPaidOvertimeNotAllowed', { defaultValue: 'Paid overtime not allowed' }));
        return;
      }
  
      if (!isCoach) {
        logger.warn('[VideoConference] Paid overtime simulation restricted to coaches', { sessionId });
        toast.error(t('session.simulationCoachOnly', { defaultValue: 'Simulation restricted to coaches' }));
        return;
      }
  
      // Simulate coach selecting 'paid'
      await handleOvertimeAction('paid');
  
      // Simulate user payment process (configurable for testing)
      const paymentSuccess = Math.random() > 0.3; // 70% chance of success for testing; adjust as needed
      if (paymentSuccess) {
        logger.info('[VideoConference] Simulating successful payment', { sessionId });
        socketRef.current.emit('payment-success', { sessionId, bookingId });
        toast.success(t('session.paymentSimulationSuccess', { defaultValue: 'Payment simulation: Success' }));
      } else {
        logger.info('[VideoConference] Simulating payment failure', { sessionId });
        socketRef.current.emit('payment-failure', { sessionId, bookingId });
        toast.warn(t('session.paymentSimulationFailed', { defaultValue: 'Payment simulation: Failed' }));
      }
  
      toast.success(t('session.simulationPaidOvertimeTriggered', { defaultValue: 'Paid overtime simulation triggered' }));
    } catch (error) {
      logger.error('[VideoConference] Failed to simulate paid overtime', {
        sessionId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
      toast.error(t('session.simulationFailed', { message: error.message }));
    }
  }, [sessionId, token, isCoach, handleOvertimeAction, t]);

  const simulateUserAuthorizationHandler = async () => {
    if (process.env.NODE_ENV !== 'development') return;
    
    if (!sessionId) {
        toast.error("DEV: Session ID is missing for user auth simulation.");
        logger.error('[VideoConference DEV] Session ID missing for simulateUserAuthorizationHandler');
        return;
    }
    logger.info('[VideoConference DEV] Simulating User Overtime Authorization via API call.', { sessionId });
    try {
      // Ensure this calls the NEW API function
      const response = await apiSimulateUserAuth(sessionId); 
      toast.success(`DEV: User OT Auth Simulated: ${response.message || 'Success'}`);
      logger.info('[VideoConference DEV] User OT Auth Simulation API call successful', { sessionId, responseData: response });
    } catch (err) {
      const errorMsg = err.message || (err.response?.data?.message) || "User Auth Sim DEV Error";
      toast.error(`DEV User Auth Sim Error: ${errorMsg}`);
      logger.error('[VideoConference DEV] Failed to simulate user OT Auth', { sessionId, error: errorMsg });
    }
  };

  const setOvertimeChoiceDevHandler = async () => {
    if (process.env.NODE_ENV !== 'development') return;

    const duration = devCustomDuration ? parseInt(devCustomDuration, 10) : bookingOvertimeSettings?.paidOvertimeDuration;
    let price = null;

    // --- Updated Price Calculation Block ---
    if (devCustomPriceAmount) {
        const amount = parseFloat(devCustomPriceAmount);
        if (!isNaN(amount) && amount >= 0) {
            price = { amount, currency: devCustomPriceCurrency || 'CHF' };
        } else {
            toast.error("DEV: Invalid price amount entered.");
            return;
        }
    }
    // Use the main calculateOvertimePrice function if no manual price
    else if (bookingPriceInfo && bookingDurationMinutes && bookingOvertimeSettings && duration > 0) {
        try {
             price = calculateOvertimePrice(
                 bookingPriceInfo,
                 bookingDurationMinutes,
                 bookingOvertimeSettings.overtimeRate,
                 duration
             );
             logger.info(`[VideoConference DEV] Calculated price for duration ${duration}: ${price.amount} ${price.currency}`);
        } catch(e) {
            const errorMessage = e instanceof PriceCalculationError ? e.message : (e.message || 'Could not calculate price.');
            toast.error(`DEV: Could not calculate price: ${errorMessage}`);
            logger.error(`[VideoConference DEV] Price calculation error: ${errorMessage}`, { rawError: e });
            return; // Stop if calculation fails
        }
    }
    // --- End Updated Price Calculation Block ---

    if (!duration || duration <= 0) {
         toast.error("DEV: Valid duration required (either standard or custom).");
         return;
    }
     if (!price) { // Check if price calculation succeeded or manual price was invalid
          toast.error("DEV: Valid price required (either calculated or custom). Could not determine price.");
          return;
     }

    try {
      // MODIFIED: Pass the calculated 'price' object to the API function
      await setOvertimeChoiceDev(sessionId, 'paid', duration, price);
      toast.success(`DEV: Set session state to 'paid' (Duration: ${duration}, Max Price: ${price.amount} ${price.currency}). Now trigger user prompt.`);
      logger.info(`[VideoConference] DEV: Set session state to 'paid'`, { sessionId, duration, price });
    } catch (err) {
       toast.error(`DEV Error setting state: ${err.message}`);
       logger.error(`[VideoConference] DEV: Failed to set session state`, { sessionId, error: err.message });
    }
};

const simulateCoachPaidOvertime = useCallback(async () => {
  logger.info('[VideoConference] Simulating USER receiving overtime prompt via DEV button', { sessionId, userId, isCoach });
  if (isCoach) {
      toast.error(t('session.simulationUserOnly', { defaultValue: 'This simulation triggers the user prompt' }));
      return;
  }

  try {
      // 1. Fetch the latest request details from backend
      logger.debug('[VideoConference DEV Sim] Fetching latest overtime request details', { sessionId });
      const latestRequest = await getLatestOvertimeRequest(sessionId); // Use the new API function

      if (!latestRequest || !latestRequest.success) {
           throw new Error(latestRequest.message || 'Could not fetch latest overtime request details.');
      }

      const { requestedDuration, calculatedMaxPrice } = latestRequest;

      if (!requestedDuration || !calculatedMaxPrice) {
           throw new Error('Fetched request details are incomplete.');
      }

      // 2. Trigger the user prompt locally using fetched data
      const userPromptDataPayload = {
          metadata: {
              sessionId,
              bookingId: bookingId, // Ensure bookingId is available in scope
              overtimeOptions: [ { type: 'authorize' }, { type: 'decline' } ],
              requestedDuration: requestedDuration,
              calculatedMaxPrice: calculatedMaxPrice // Use fetched price
          },
      };

      logger.info('[VideoConference DEV Sim] Triggering user overtime prompt locally with fetched data', { sessionId, payload: userPromptDataPayload });
      handleOvertimePromptEvent(userPromptDataPayload); // Trigger the handler

      toast.success(t('session.simulationUserPromptTriggered', { defaultValue: 'User prompt triggered with latest request data.' }));

  } catch (error) {
      logger.error('[VideoConference DEV Sim] Failed during user prompt simulation trigger', {
          sessionId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString(),
      });
      toast.error(t('session.simulationFailed', { message: error.message }));
  }
}, [sessionId, userId, isCoach, token, bookingId, handleOvertimePromptEvent, t]);

  const handleFeedbackSubmit = async () => {
    if (rating) {
      try {
        await axios.post(
          '/api/sessions/rate',
          { sessionId, rating },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Thank you for your feedback!');
      } catch (error) {
        logger.error('[VideoConference] Feedback submission failed', { error: error.message, sessionId });
        toast.error('Failed to submit feedback');
      }
    }
    setShowFeedbackPrompt(false);
  };

  // Handle feedback prompt close without rating
  const handleFeedbackClose = () => {
    if (!rating) {
      logger.info('[VideoConference] User closed feedback prompt without rating', { sessionId });
      socket.emit('no-feedback-provided', { sessionId, userId }); // Emit event for server to handle notification
    }
    setShowFeedbackPrompt(false);
  };

  const handleJoinFromWaitingRoom = useCallback((config) => {
    logger.info('[VideoConference] onJoin called from WaitingRoom', { 
      config, 
      sessionId,
      streamId: config.stream?.id,
      backgroundSettings: config.backgroundSettings,
    });
  
    // Store configuration from WaitingRoom
    setSessionConfig({ video: config.video, audio: config.audio });
    setSelectedVideoDevice(config.videoDeviceId || '');
    setSelectedAudioDevice(config.audioDeviceId || '');
    
    const bgSettings = config.backgroundSettings || { 
      mode: 'none', 
      customBackground: null, 
      blurLevel: DEFAULT_BLUR_LEVEL 
    };
    setCurrentBackgroundSettings(bgSettings);
  
    if (config.stream) {
      setLocalStream(config.stream);
      setProcessedStream(config.stream);
      
      const videoTrack = config.stream.getVideoTracks()[0];
      const audioTrack = config.stream.getAudioTracks()[0];
      if (videoTrack) setVideoEnabled(videoTrack.enabled);
      if (audioTrack) setAudioEnabled(audioTrack.enabled);
    }
  
    setIsDeviceCheckComplete(true);
  
    startSession({
      ...config,
      stream: config.stream,
    }).then(() => {
      setWaiting(false);
      // Trigger a resize event to force layout recalculation
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        logger.info('[VideoConference] Triggered resize event after join', { sessionId });
      }, 100); // Small delay to ensure DOM updates
    }).catch((err) => {
      logger.error('[VideoConference] Session start failed from WaitingRoom', { 
        error: err.message, 
        sessionId 
      });
      toast.error(t('session.startFailed', { message: err.message }));
      setWaiting(false);
    });
  }, [startSession, t, sessionId]);

  const handleMediaStateChange = useCallback((newState) => {
    if (typeof newState.isAudioEnabled !== 'undefined') {
      setAudioEnabled(newState.isAudioEnabled);
      if (localStream) {
        localStream.getAudioTracks().forEach(track => track.enabled = newState.isAudioEnabled);
      }
    }
    if (typeof newState.isVideoEnabled !== 'undefined') {
      setVideoEnabled(newState.isVideoEnabled);
      if (localStream) {
        localStream.getVideoTracks().forEach(track => track.enabled = newState.isVideoEnabled);
      }
    }
    window.dispatchEvent(new CustomEvent('media-state-changed', { 
      detail: newState 
    }));
    logger.info('[VideoConference] Media state changed', { 
      newState, 
      streamId: localStream?.id, 
      sessionId 
    });
  }, [localStream, sessionId]);

  const handleScreenShare = async () => {
    logger.info('[VideoConference] Starting screen share attempt', { sessionId });
    const screenStreamResult = await shareScreen((isSharing) => {
      setIsScreenSharing(isSharing);
      if (!isSharing) {
        setScreenStream(null);
        logger.info('[VideoConference] Screen sharing stopped, cleared screenStream', { sessionId });
      }
    });
    if (screenStreamResult) {
      setScreenStream(screenStreamResult);
      setIsScreenSharing(true);
      trackToolUsage('screen-share');
      logger.info('[VideoConference] Screen share started successfully', { sessionId, streamId: screenStreamResult.id });
    } else {
      logger.warn('[VideoConference] Screen share failed', { sessionId });
    }
  };

  // Start Recording
  const startRecording = useCallback(async () => {
    try {
      const bookingIdVal = bookingId || sessionDetails?.bookingId;
      if (!bookingIdVal || !sessionId) throw new Error('Missing session details');
      console.log('[VideoConference] Starting recording with payload', { bookingId: bookingIdVal, sessionId, consent: true });
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/recordings/start`,
        { bookingId: bookingIdVal, sessionId, consent: true },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      console.log('[VideoConference] Start recording response', { response: response.data });
      if (!response.data.success) throw new Error(response.data.message || 'Failed to start recording');
  
      setRecordingId(response.data.recordingId);
      setIsRecording(true);
      setRecordingError(null);
  
      if (processedStream) { // Assuming processedStream is your media stream
        chunksRef.current = []; // Reset chunks
        recorderRef.current = new MediaRecorder(processedStream);
        
        // Collect chunks as they become available
        recorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };
  
        recorderRef.current.start();
        console.log('[VideoConference] MediaRecorder started', { sessionId, recordingId: response.data.recordingId });
      }
  
      toast.success('Recording started!');
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      setRecordingError(`Recording error: ${errorMsg}`);
      console.error('[VideoConference] Start recording error', { error: errorMsg });
      toast.error(`Failed to start recording: ${errorMsg}`);
    }
  }, [bookingId, sessionDetails, sessionId, processedStream]);

  // Stop Recording
  const stopRecording = useCallback(async () => {
    try {
      setIsStoppingRecording(true); // Show stopping indication
      const bookingIdVal = bookingId || sessionDetails?.bookingId;
      if (!recorderRef.current || !bookingIdVal || !recordingId) throw new Error('Recording not initialized');
  
      // Stop the recorder and create the blob
      const blob = await new Promise((resolve) => {
        recorderRef.current.onstop = () => {
          const recordedBlob = new Blob(chunksRef.current, { type: 'video/webm' });
          resolve(recordedBlob);
        };
        recorderRef.current.stop();
      });
  
      console.log('[VideoConference] Blob created', { type: blob.type, size: blob.size });
  
      // Prepare FormData
      const formData = new FormData();
      formData.append('video', blob, 'session-recording.webm');
      formData.append('bookingId', bookingIdVal);
      formData.append('recordingId', recordingId);
  
      // Send the request
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/recordings/stop`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
  
      if (!response.data.success) throw new Error(response.data.message || 'Failed to stop recording');
  
      // Reset state
      setIsRecording(false);
      setRecordingId(null);
      setRecordingError(null);
      recorderRef.current = null;
      chunksRef.current = [];
      console.log('[VideoConference] Recording stopped successfully', { bookingId: bookingIdVal, recordingId });
      toast.success('Recording stopped!');
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      setRecordingError(`Recording error: ${errorMsg}`);
      console.error('[VideoConference] Stop recording error', { error: errorMsg, stack: error.stack });
      toast.error(`Failed to stop recording: ${errorMsg}`);
    } finally {
      setIsStoppingRecording(false); // Hide stopping indication
    }
  }, [bookingId, sessionDetails, recordingId]);

  logger.info('[VideoConference] Evaluating render conditions', {
    isConnected,
    isDeviceCheckComplete,
    waiting,
    hasProcessedStream: !!processedStream,
    sessionId,
    timestamp: new Date().toISOString(),
  });

if (sessionError?.message === 'Session has not yet started' || waiting || !isDeviceCheckComplete) {
    logger.info('[VideoConference] Rendering WaitingRoom due to session not started or waiting state', { sessionId, sessionError, waiting });
    
    const now = new Date();
    const start = startTime ? new Date(startTime) : new Date();
    const timeLeftMinutes = startTime ? (start - now) / 1000 / 60 : 0;
    const isJoinEnabled = isCoach || timeLeftMinutes <= 15;
    const sessionUrl = `${process.env.REACT_APP_FRONTEND_URL}/session/${sessionId}/${token}`;

    return (
      <div className="flex items-center justify-center h-screen w-screen bg-slate-900 dark:bg-slate-900 p-4">
        <WaitingRoom
          sessionStartTime={startTime || new Date()}
          sessionDetails={sessionDetails}
          onJoin={handleJoinFromWaitingRoom}
          onStartSession={handleStartSession}
          sessionUrl={sessionUrl}
          isJoinEnabled={isJoinEnabled}
          isCoach={isCoach}
        />
      </div>
    );
  }

if (isSessionEnded) {
    logger.info('[VideoConference] Rendering session ended state', { sessionId });
    const baseUrl = process.env.REACT_APP_FRONTEND_URL || 'http://localhost:3000';
    if (!process.env.REACT_APP_FRONTEND_URL) {
      logger.error('[VideoConference] REACT_APP_FRONTEND_URL not defined; using fallback', {
        sessionId,
        fallbackUrl: baseUrl,
        timestamp: new Date().toISOString(),
      });
    }
    const waitingRoomUrl = `${baseUrl}/video-conference/${sessionId}?token=${token}`;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-center h-screen bg-background text-foreground"
      >
        <div className="bg-card text-card-foreground rounded-lg shadow-xl p-6 md:p-8 max-w-md w-full mx-4 border">
          <h2 className="text-3xl font-bold mb-4 text-center">{t('session.ended')}</h2>
          <p className="text-muted-foreground text-center mb-6">
            {t('session.duration', {
              minutes: Math.floor(sessionTime / 60),
              seconds: (sessionTime % 60).toString().padStart(2, '0'),
            })}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={() => navigate('/sessions')}
              aria-label={t('session.returnToHome')}
              className="gap-2"
            >
              <Home size={20} />
              {t('session.returnToHome')}
            </Button>
          </div>
          {redirectCountdown > 0 && (
            <p className="text-muted-foreground text-sm mt-6 text-center">
              {t('session.redirectingIn', { seconds: redirectCountdown })}
              <Button
                variant="link"
                onClick={() => setRedirectCountdown(0)}
                className="ml-2"
                aria-label={t('session.cancelRedirect')}
              >
                {t('cancel')}
              </Button>
            </p>
          )}
        </div>
      </motion.div>
    );
  }

if (!isConnected || !processedStream) {
    logger.warn('[VideoConference] Rendering loading state', {
      isConnected,
      hasProcessedStream: !!processedStream,
      sessionId,
    });
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        {t('session.loading')}
      </div>
    );
  }

  logger.info('[VideoConference] Rendering VideoConference UI', {
    isConnected,
    isDeviceCheckComplete,
    waiting,
    streamId: processedStream.id,
    sessionId,
    timestamp: new Date().toISOString(),
  });

  logger.debug('[VideoConference Render] Checking timer props', {
    actualSessionEndTime,
    isPaidOvertimeActive,
    sessionId
  });

return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex flex-col bg-background text-foreground overflow-hidden"
    >
      {/* Video Container */}
      <div 
        className="relative flex-grow overflow-hidden"
        style={{ 
          height: `calc(100% - ${controlBarHeight}px)`,
          maxHeight: `calc(100% - ${controlBarHeight}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {/* Recording Indicator */}
        {isRecording && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="absolute top-[3%] transform -translate-x-1/2 bg-black bg-opacity-20 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 z-50"
            style={{ left: indicatorPosition.left }}
          >
            <span className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
            <span className="text-sm font-medium">
              {isStoppingRecording ? t('session.stoppingRecording') : `${t('session.recording')} ${formatRecordingTime(recordingTime)}`}
            </span>
          </motion.div>
        )}

         {/* --->  OVERTIME TIMER <--- */}
         <OvertimeTimer
            actualEndTime={actualSessionEndTime}
            isPaidOvertimeActive={isPaidOvertimeActive}
            sessionId={sessionId}
        />

<LayoutManager
  ref={layoutManagerRef}
  localStream={processedStream}
  participants={participants}
  screenStream={screenStream}
  activeSpeaker={participants.find((p) => p.peerId === activeSpeaker)?.peerId}
  layout={layout} // Controlled by VideoConference
  sessionId={sessionId}
  backgroundSettings={currentBackgroundSettings}
  className="max-w-full max-h-full rounded-lg shadow-lg"
/>

        {/* Side Panel (Collapsible) */}
        <div className="w-80 bg-card border-l border-border overflow-y-auto transition-all duration-300 ease-in-out" style={{ width: isParticipantsOpen || isChatOpen ? '20rem' : '0' }}>
          {isChatOpen && <ChatPanel sessionId={sessionId} onClose={toggleChat} />}
          {isParticipantsOpen && (
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-4">{t('session.participants')}</h3>
              <ul className="space-y-2">
                {participants.map((p) => (
                  <li key={p.peerId} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                    <span>{p.displayName} {breakoutRoom && p.roomId === breakoutRoom ? '(Current Room)' : ''}</span>
                    {breakoutRoom && p.roomId === breakoutRoom && <span className="text-primary text-sm">✓</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

     {/* Control Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full bg-card p-2 border-t border-border z-20 control-bar"
        style={{ position: 'absolute', bottom: 0, left: 0, width: '100%' }}
      >

<ControlBar
  isAudioEnabled={audioEnabled}
  isVideoEnabled={videoEnabled}
  toggleAudio={hookToggleAudio}
  toggleVideo={hookToggleVideo}
  sessionId={sessionId}
  bookingId={bookingId || sessionDetails?.bookingId || ''}
  layout={layout}
  setLayout={setLayout}
  isCoach={isCoach}
  participants={participants}
  shareScreen={handleScreenShare}
  localStream={localStream}
  videoDevices={videoDevices}
  audioDevices={audioDevices}
  selectedVideoDevice={selectedVideoDevice}
  setSelectedVideoDevice={setSelectedVideoDevice}
  selectedAudioDevice={selectedAudioDevice}
  setSelectedAudioDevice={setSelectedAudioDevice}
  setLocalStream={setLocalStream}
  currentBackgroundSettings={currentBackgroundSettings}
  onBackgroundChange={setCurrentBackgroundSettings}
  onMediaStateChange={handleMediaStateChange}
  isRecording={isRecording}
  startRecording={startRecording}
  stopRecording={stopRecording}
  recordingError={recordingError}
  isConnected={isConnected}
  isStoppingRecording={isStoppingRecording}
  resourceCount={resourceCount}
  togglePanel={togglePanel}
  activePanel={activePanel}
  confirmHand={confirmHand}
  raisedHands={raisedHands}
  onOpenRaisedHandsModal={() => setIsRaisedHandsModalOpen(true)}
  endSession={handleEndSession}
  leaveSession={handleLeaveSession}
>
{!isCoach && (
  <button
    onClick={() => {
      const userHand = raisedHands.find(hand => hand.userId === userId);
      if (userHand) {
        logger.info('[VideoConference] Lowering hand', { userId, sessionId });
        lowerHand();
      } else {
        logger.info('[VideoConference] Raising hand', { userId, sessionId });
        raiseHand();
      }
    }}
    className={`p-2 rounded-full ${raisedHands.some(hand => hand.userId === userId) ? 'bg-[var(--warning-color)]' : 'bg-[var(--background-hover)]'} text-[var(--text-primary)] hover:bg-[var(--primary-hover)] transition-colors`}
    data-tooltip-id="hand-tooltip"
    data-tooltip-content={raisedHands.some(hand => hand.userId === userId) ? t('session.lowerHand') : t('session.raiseHand')}
    aria-label={raisedHands.some(hand => hand.userId === userId) ? t('session.lowerHand') : t('session.raiseHand')}
  >
    <Hand size={20} />
  </button>
)}

<button
        onClick={() => togglePanel('settings')}
        className={`p-2 rounded-full ${activePanel === 'settings' ? 'bg-[var(--primary-color)]' : 'bg-[var(--background-hover)]'} text-[${activePanel === 'settings' ? 'white' : 'var(--text-primary)'}] hover:bg-[var(--primary-hover)] transition-colors`}
        data-tooltip-id="settings-tooltip"
        data-tooltip-content={t('session.videoSettings')}
        aria-label={t('session.videoSettings')}
      >
        <Settings size={20} />
      </button>
 
 
 {isCoach && (
    <>
      <button
        onClick={() => togglePanel('polls')}
        className={`p-2 rounded-full ${activePanel === 'polls' ? 'bg-[var(--primary-color)]' : 'bg-[var(--background-hover)]'} text-[${activePanel === 'polls' ? 'white' : 'var(--text-primary)'}] hover:bg-[var(--primary-hover)] transition-colors`}
        data-tooltip-id="polls-tooltip"
        data-tooltip-content={t('session.polls')}
        aria-label={t('session.polls')}
      >
        <BarChart size={20} />
      </button>
      <button
        onClick={() => togglePanel('qa')}
        className={`p-2 rounded-full ${activePanel === 'qa' ? 'bg-[var(--primary-color)]' : 'bg-[var(--background-hover)]'} text-[${activePanel === 'qa' ? 'white' : 'var(--text-primary)'}] hover:bg-[var(--primary-hover)] transition-colors`}
        data-tooltip-id="qa-tooltip"
        data-tooltip-content={t('session.qa')}
        aria-label={t('session.qa')}
      >
        <MessageSquare size={20} />
      </button>
      
      <button
        onClick={() => togglePanel('analytics')}
        className={`p-2 rounded-full ${activePanel === 'analytics' ? 'bg-[var(--primary-color)]' : 'bg-[var(--background-hover)]'} text-[${activePanel === 'analytics' ? 'white' : 'var(--text-primary)'}] hover:bg-[var(--primary-hover)] transition-colors`}
        data-tooltip-id="analytics-tooltip"
        data-tooltip-content={t('session.analytics')}
        aria-label={t('session.analytics')}
      >
        <Users size={20} />
      </button>
      
    </>
  )}
  <Tooltip id="hand-tooltip" place="top" />
  <Tooltip id="polls-tooltip" place="top" />
  <Tooltip id="qa-tooltip" place="top" />
  <Tooltip id="settings-tooltip" place="top" />
  <Tooltip id="analytics-tooltip" place="top" />
 
</ControlBar>
      </motion.div>

  {/* Add Simulation Button in Development Mode */}
  {process.env.NODE_ENV === 'development' && (
    <div className="absolute top-4 left-4 z-50 flex flex-col space-y-1 items-start bg-card/80 backdrop-blur-sm p-2 rounded-lg border shadow-lg max-w-xs">
         <span className="text-xs font-semibold text-yellow-500 dark:text-yellow-400 self-center mb-1">DEV Controls</span>
         {/* Simulate Session End Buttons */}
         <Button onClick={simulateSessionEnd} variant="outline" size="sm" className="w-full justify-start text-xs h-auto py-1">Simulate End (5min)</Button>
         <Button onClick={triggerSessionEndTimer} variant="outline" size="sm" className="w-full justify-start text-xs h-auto py-1">Set Timer to End</Button>

        {/* Coach Overtime Simulation */}
        {isCoach && (
             <Button onClick={triggerOvertimePrompt} variant="outline" size="sm" className="w-full justify-start text-xs h-auto py-1">Trigger OT Prompt (Coach)</Button>
        )}

         {/* Set Backend State */}
         <div className="flex flex-col space-y-1 w-full pt-2 mt-1 border-t border-border">
              <span className="text-xs text-muted-foreground">Set Backend State for User Prompt:</span>
              <div className="flex gap-1">
                 <Input type="number" placeholder="Duration" value={devCustomDuration} onChange={(e) => setDevCustomDuration(e.target.value)} className="h-6 w-1/3 text-xs" title="Duration in minutes (uses standard if blank)" />
                 <Input type="number" placeholder="Max Price" value={devCustomPriceAmount} onChange={(e) => setDevCustomPriceAmount(e.target.value)} className="h-6 w-1/3 text-xs" title="Max Price Amount (calculates if blank)" />
                  <select value={devCustomPriceCurrency} onChange={(e) => setDevCustomPriceCurrency(e.target.value)} className="w-1/3 h-6 rounded-md border border-input bg-transparent px-2 py-1 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" title="Currency">
                     <option value="CHF">CHF</option>
                     <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                 </select>
              </div>
              <Button onClick={setOvertimeChoiceDevHandler} variant="outline" size="sm" className="w-full justify-start text-xs h-auto py-1" title="Set backend to 'paid' state with above values (uses standard/calculated if blank)">Set State: Paid Request</Button>
         </div>

          {/* This button can be clicked by anyone in DEV mode to advance the state */}
          <Button
            onClick={simulateUserAuthorizationHandler}
            variant="outline" size="sm" className="w-full justify-start text-xs h-auto py-1"
            title="Find latest 'requested' OT segment and simulate full user authorization for it."
         >
            DEV: Simulate User Auth
         </Button>

          {/* NEW SIMULATE OVERTIME USAGE CONTROLS */}
          <div className="flex flex-col space-y-1 w-full pt-2 mt-1 border-t border-border">
            <span className="text-xs text-muted-foreground">Simulate OT Usage (after Auth):</span>
            <Input
                type="number"
                placeholder="Minutes Used in OT"
                value={devSimulatedOvertimeMinutes}
                onChange={(e) => setDevSimulatedOvertimeMinutes(e.target.value)}
                className="h-6 text-xs"
                title="Enter minutes of paid overtime used for the latest authorized segment."
            />
            <Button
                onClick={handleSimulateOvertimeUsage}
                variant="destructive" size="sm" className="w-full justify-start text-xs h-auto py-1"
                title="Simulate specified minutes of OT used. THIS WILL FINALIZE THE SEGMENT."
            >
                Simulate OT Usage & Finalize
            </Button>
         </div>
         {/* END NEW SIMULATE OVERTIME USAGE CONTROLS */}

         {/* Reset State Button */}
         <Button
           onClick={async () => {
              try {
                await setOvertimeChoiceDev(sessionId, 'reset');
                toast.success(`DEV: Reset session overtime state.`);
                logger.info(`[VideoConference] DEV: Reset session overtime state`, { sessionId });
              } catch (err) {
                toast.error(`DEV Error: ${err.message}`);
                logger.error(`[VideoConference] DEV: Failed to reset session state`, { sessionId, error: err.message });
              }
           }}
           variant="secondary" size="sm" className="w-full justify-start text-xs h-auto py-1"
           title="Reset coach overtime choice on backend"
         >
           Reset OT State
         </Button>

         {/* Trigger User Prompt Button (for non-coach) */}
         {!isCoach && (
           <Button
             onClick={simulateCoachPaidOvertime}
             variant="default" size="sm" className="w-full justify-start text-xs h-auto py-1"
             title="Fetch latest request data & trigger User 'Authorize/Decline' prompt locally"
           >
             Trigger User OT Prompt
           </Button>
         )}
    </div>
)}

{/* Feedback Prompt Modal */}
{showFeedbackPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card text-card-foreground p-6 rounded-lg shadow-lg max-w-sm w-full m-4 border">
            <h2 className="text-xl font-bold mb-4">Rate Your Session</h2>
            <p className="mb-4 text-muted-foreground">Please provide a rating for this session (1-5 stars):</p>
            <div className="flex justify-center mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className={`text-3xl mx-1 transition-colors duration-200 ${rating >= star ? 'text-yellow-400' : 'text-slate-300 dark:text-slate-600 hover:text-yellow-300'} focus:outline-none`}
                  aria-label={`Rate ${star} stars`}
                >
                  ★
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleFeedbackClose}>
                Close
              </Button>
              <Button
                onClick={handleFeedbackSubmit}
                disabled={!rating}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resource Panel */}
      {activePanel === 'resources' && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[1001]">
    <Draggable
      handle=".drag-handle"
      bounds="parent"
      defaultPosition={{ x: 0, y: 0 }}
      nodeRef={nodeRef}
    >
      <div ref={nodeRef}>
        <ResourcePanel
          sessionId={sessionId}
          onClose={() => togglePanel('resources')}
          isCoach={isCoach}
          userId={userId}
        />
      </div>
    </Draggable>
  </div>
)}

      {/* Poll Panel */}
      {activePanel === 'polls' && (
  <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1001]">
    <Draggable
      handle=".drag-handle"
      bounds="parent"
      defaultPosition={{ x: 0, y: 0 }}
      nodeRef={nodeRef}
    >
      <div ref={nodeRef}>
        <PollPanel
          sessionId={sessionId}
          onClose={() => togglePanel('polls')}
          isCoach={isCoach}
          userId={userId}
        />
      </div>
    </Draggable>
  </div>
)}

{/* Notes Panel */}
{activePanel === 'notes' && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1001]">
          <Draggable
            handle=".drag-handle"
            bounds="parent"
            defaultPosition={{ x: 0, y: 0 }}
            nodeRef={nodeRef}
          >
            <div ref={nodeRef}>
              <NotesPanel
                sessionId={sessionId}
                onClose={() => togglePanel('notes')}
                isCoach={isCoach}
                userId={userId}
              />
            </div>
          </Draggable>
        </div>
      )}

      {/* Agenda Panel */}
      {activePanel === 'agenda' && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1001]">
          <Draggable
            handle=".drag-handle"
            bounds="parent"
            defaultPosition={{ x: 0, y: 0 }}
            nodeRef={nodeRef}
          >
            <div ref={nodeRef}>
              <AgendaPanel
                sessionId={sessionId}
                onClose={() => togglePanel('agenda')}
                isCoach={isCoach}
                userId={userId}
              />
            </div>
          </Draggable>
        </div>
      )}

      {/* Q&A Panel */}
      {activePanel === 'qa' && (
  <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1001]">
    <Draggable
      handle=".drag-handle"
      bounds="parent"
      defaultPosition={{ x: 0, y: 0 }}
      nodeRef={nodeRef}
    >
      <div ref={nodeRef}>
        <QAPanel
          sessionId={sessionId}
          onClose={() => togglePanel('qa')}
          isCoach={isCoach}
          userId={userId}
        />
      </div>
    </Draggable>
  </div>
)}

      
       {/* Video Settings Panel */}
       {activePanel === 'settings' && (
  <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
    <Draggable
      handle=".drag-handle"
      bounds="parent"
      defaultPosition={{ 
        x: 0, 
        y: (window.innerHeight - 2000) / 4  
      }}
      nodeRef={nodeRef}
    >
      <div ref={nodeRef}>
        <VideoSettings
          localStream={localStream}
          onClose={() => setActivePanel(null)}
          videoDevices={videoDevices}
          audioDevices={audioDevices}
          selectedVideoDevice={selectedVideoDevice}
          setSelectedVideoDevice={setSelectedVideoDevice}
          selectedAudioDevice={selectedAudioDevice}
          setSelectedAudioDevice={setSelectedAudioDevice}
          setLocalStream={setLocalStream}
          currentBackgroundSettings={currentBackgroundSettings}
          onSettingsChange={handleApplySettings}
          onMediaStateChange={handleMediaStateChange} 
        />
      </div>
    </Draggable>
  </div>
)}

      {/* Analytics Panel */}
      {activePanel === 'analytics' && isCoach && (
  <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1001]">
    <Draggable
      handle=".drag-handle"
      bounds="parent"
      defaultPosition={{ x: 0, y: 0 }}
      nodeRef={nodeRef}
    >
      <div ref={nodeRef}>
        <AnalyticsPanel
          sessionId={sessionId}
          analytics={analytics}
          onClose={() => setActivePanel(null)}
        />
      </div>
    </Draggable>
  </div>
)}

      {/* Poll Display */}
       {currentPoll && (
        <div className="absolute right-4 w-72 bg-card border p-4 rounded-lg shadow-md" style={{ bottom: `${controlBarHeight + 10}px` }}>
          <h3 className="text-lg font-semibold mb-2">{currentPoll.question}</h3>
          <ul className="space-y-2">
            {currentPoll.options.map((opt, i) => (
              <li key={i} className="flex justify-between items-center p-2 bg-muted rounded-lg">
                <Button variant="link" size="sm" onClick={() => votePoll(i)} className="p-0 h-auto">
                  {opt.text}
                </Button>
                <span className="text-white">{opt.votes}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

     {/* Recording Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card text-card-foreground rounded-lg p-6 shadow-lg max-w-md w-full m-4 border">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertCircle size={20} /> {t('session.recordingConsentTitle')}
            </h3>
            <p className="text-muted-foreground mb-6">{t('session.recordingConsentMessage')}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => handleConsent(false)} className="gap-2">
                <X size={16} /> {t('deny')}
              </Button>
              <Button onClick={() => handleConsent(true)} className="gap-2">
                <Check size={16} /> {t('accept')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Resources */}
       {sharedResources.length > 0 && (
        <div className="absolute top-4 left-4 w-72 bg-card border p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">{t('session.resources')}</h3>
          <ul className="space-y-2">
            {sharedResources.map((res, i) => (
             <li key={i} className="p-2 bg-muted rounded-lg">
                <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors">
                  {res.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isCoach && sessionAgenda && (
        <div className="absolute top-20 right-4 w-72 bg-gray-800 p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">{t('session.agenda')}</h3>
          <p className="text-[var(--text-secondary)]">{sessionAgenda}</p>
        </div>
      )}

      {/* Breakout Rooms */}
      {isCoach && participants.length > 2 && !breakoutRoom && (
        <div className="absolute right-4 w-72 bg-card border p-4 rounded-lg shadow-md" style={{ bottom: `${controlBarHeight + 10}px` }}>
          <h3 className="text-lg font-semibold mb-2">{t('session.breakoutRooms')}</h3>
          <Button
            onClick={() => {
              const roomAssignments = [
                participants.slice(0, Math.ceil(participants.length / 2)).map((p) => p.userId),
                participants.slice(Math.ceil(participants.length / 2)).map((p) => p.userId),
              ];
              createBreakoutRooms(roomAssignments);
            }}
             className="w-full"
          >
            {t('session.createBreakoutRooms')}
          </Button>
        </div>
      )}
      {isCoach && breakoutRoom && (
        <div className="absolute right-4 w-72 bg-card border p-4 rounded-lg shadow-md" style={{ bottom: `${controlBarHeight + 10}px` }}>
          <h3 className="text-lg font-semibold mb-2">{t('session.breakoutRoomsActive')}</h3>
          <Button
            onClick={endBreakoutRooms}
            variant="destructive"
            className="w-full"
          >
            {t('session.endBreakoutRooms')}
          </Button>
        </div>
      )}

      {/* Raised Hands */}
     {isCoach && isRaisedHandsModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[1001]">
    <Draggable
      handle=".drag-handle"
      bounds="parent"
      defaultPosition={{ x: 0, y: 0 }}
      nodeRef={nodeRef}
    >
       <div ref={nodeRef} className="bg-card text-card-foreground border p-4 rounded-lg shadow-md w-72">
              <div className="drag-handle flex justify-between items-center mb-2 cursor-move">
                <h3 className="text-lg font-semibold">{t('session.raisedHands')}</h3>
                <button onClick={() => setIsRaisedHandsModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={20} />
                </button>
              </div>
              {raisedHands.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t('session.noHandsRaised')}</p>
              ) : (
                <ul className="space-y-2 max-h-60 overflow-y-auto">
                  {raisedHands.map((hand) => {
              // Resolve display name from sessionDetails
              const participant = sessionDetails?.participant?.id === hand.userId 
                ? sessionDetails.participant 
                : sessionDetails?.coach?.id === hand.userId 
                ? sessionDetails.coach 
                : null;
              const displayName = participant?.name || hand.displayName || t('session.unknownUser');
              const raisedTime = new Date(hand.raisedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              logger.info('[VideoConference] Rendering raised hand in modal', {
                sessionId,
                userId: hand.userId,
                peerId: hand.peerId,
                displayName,
                raisedAt: hand.raisedAt
              });
             return (
                      <li key={hand.userId} className="p-2 bg-muted rounded-lg flex justify-between items-center">
                        <span className="text-sm">
                          {displayName} <span className="text-xs text-muted-foreground">({raisedTime})</span>
                        </span>
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={() => {
                            logger.info('[VideoConference] Confirm hand button clicked', { sessionId, userIdToConfirm: hand.userId });
                            confirmHand(hand.userId);
                          }}
                          aria-label={t('session.confirmHand')}
                          data-tooltip-id={`confirm-hand-${hand.userId}`}
                          data-tooltip-content={t('session.confirmHandTooltip', { name: displayName })}
                          className="h-7 w-7"
                        >
                          <Check size={16} />
                        </Button>
                        <Tooltip id={`confirm-hand-${hand.userId}`} place="top" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
    </Draggable>
  </div>
)}

    {/* Overlay for Modals */}
<AnimatePresence>
  {(showOvertimePrompt || showPaymentFailurePrompt) && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.5 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bg-black z-[1001] pointer-events-auto"
      onClick={() => {
        if (showOvertimePrompt) {
          logger.info('[VideoConference] Closing overtime prompt modal via overlay', { sessionId });
          setShowOvertimePrompt(false);
          setOvertimePromptData(null);
        }
        if (showPaymentFailurePrompt) {
          logger.info('[VideoConference] Closing payment failure modal via overlay', { sessionId });
          setShowPaymentFailurePrompt(false);
        }
      }}
    />
  )}
</AnimatePresence>

{/* Modals Container */}
<div className="fixed inset-0 flex items-center justify-center z-[1002] pointer-events-none">
  {/* Overtime Prompt Modal */}
  <AnimatePresence>
  {showOvertimePrompt && overtimePromptData && (
      <OvertimePromptModal
          key={`overtime-prompt-${bookingId || sessionId}-modal`} // Unique key
          data={ isCoach
                  ? overtimePromptData // Coach gets raw event data
                  : { ...overtimePromptData, // User gets event data + calculated price/error
                      metadata: {
                        ...overtimePromptData.metadata,
                        ...(userPromptData || {}) // Merge calculated data/error
                      }
                    }
          }
          onAction={handleOvertimeAction}
          onClose={() => {
            logger.info('[VideoConference] Closing overtime prompt modal explicitly', { sessionId });
            setShowOvertimePrompt(false);
            setOvertimePromptData(null);
            setUserPromptData(null);
          }}
          sessionId={sessionId}
          bookingId={bookingId}
          isCoach={isCoach}
          isConfirmingOvertimePayment={isConfirmingOvertimePayment}
          // --- Pass the fetched booking data as props ---
          bookingPriceInfo={bookingPriceInfo}
          bookingDurationMinutes={bookingDurationMinutes}
          bookingOvertimeSettings={bookingOvertimeSettings}
          // --- Pass loading/error state ---
          isLoadingBookingData={isLoadingBookingData}
          bookingDataError={bookingDataError}
    />
  )}
</AnimatePresence>

   {/* SCA Confirmation Modal */}
    {/* Ensure stripePromise is available, e.g., from usePayment context */}
    {showScaModal && scaClientSecret && stripePromise && (
        <ScaConfirmationModal // Use the wrapper directly now
            key={`sca-modal-${scaPaymentIntentId || 'new'}`} // Add key
            stripePromise={stripePromise} // Pass the promise from context
            clientSecret={scaClientSecret}
            onSuccess={handleScaSuccess}
            onFailure={handleScaFailure}
            onClose={() => { // Handle manual close (usually treated as failure/cancel)
                logger.info('[VideoConference] SCA Modal closed manually.', { sessionId, paymentIntentId: scaPaymentIntentId });
                handleScaFailure(new Error(t('payments:sca.modalClosedError', 'Modal closed by user')), scaPaymentIntentId);
            }}
            sessionId={sessionId}
        />
    )}

  {/* Payment Failure Modal */}
  <AnimatePresence>
    {showPaymentFailurePrompt && (
      <PaymentFailureModal
        onAction={handlePaymentFailureAction}
        onClose={() => {
          logger.info('[VideoConference] Closing payment failure modal', { sessionId });
          setShowPaymentFailurePrompt(false);
        }}
        sessionId={sessionId} // Pass sessionId
      />
    )}
  </AnimatePresence>
</div>

      {/* Breakout Room Indicator */}
      {breakoutRoom && (
        <div className="absolute top-4 left-80 w-72 bg-gray-800 p-2 rounded-lg shadow-md">
          <span className="text-[var(--text-secondary)]">{t('session.inBreakoutRoom', { room: breakoutRoom })}</span>
        </div>
      )}

      {/* Session Time */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-lg shadow-md">
        <span className="text-white">{t('session.time', { minutes: Math.floor(sessionTime / 60), seconds: (sessionTime % 60).toString().padStart(2, '0') })}</span>
      </div>
    </div>
  );
};

export default VideoConference;