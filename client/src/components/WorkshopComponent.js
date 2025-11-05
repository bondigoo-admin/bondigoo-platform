import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import Draggable from 'react-draggable';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Presentation,
  MicOff,
  UserCircle,
  ChevronDown,
  X,
  Timer,
  List,
  Lock,
  Hand,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  ArrowLeft,
  Trash2,
  CheckCircle // Make sure CheckCircle is imported
} from 'lucide-react';
import { Tooltip } from 'react-tooltip';
import { toast } from 'react-hot-toast'; // Import toast for error feedback
import { logger } from '../utils/logger';
import useSocket from '../hooks/useSocket';

const WorkshopComponent = ({
  sessionId, // sessionLink.sessionId string
  isCoach,
  participants,
  onClose,
  userId,
  localStream,
  toggleAudio,
  toggleVideo,
  bookingId: propBookingId, // MongoDB ObjectId, potentially null initially
}) => {
  const { t } = useTranslation();
  const token = localStorage.getItem('token') || '';
  // useSocket hook should provide the socket instance for the /video namespace connected with sessionId
  const { socket } = useSocket(userId, sessionId, token);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isScreenSharingLocked, setIsScreenSharingLocked] = useState(false);
  const [isMutedAll, setIsMutedAll] = useState(false);
  const [agendaItems, setAgendaItems] = useState([]);
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [isHandRaisingEnabled, setIsHandRaisingEnabled] = useState(false);
  const [raisedHands, setRaisedHands] = useState([]);
  const [newAgendaItem, setNewAgendaItem] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackList, setFeedbackList] = useState([]);
  const nodeRef = useRef(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  // Use ref for actual booking ID, can be updated from initial fetch or prop
  const actualBookingIdRef = useRef(propBookingId);

  // Fetch initial agenda data - Uses sessionId (link ID)
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!sessionId) {
        logger.warn('[WorkshopComponent] Cannot fetch initial data: sessionId prop is missing.');
        return;
      }
      try {
        logger.info('[WorkshopComponent] Fetching initial data', { sessionId, userId });
        const response = await axios.get(`/api/sessions/${sessionId}/notes-agenda`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAgendaItems(response.data.agenda || []);
        // Store the actual MongoDB bookingId if returned by the API
        if (response.data.bookingId) {
          actualBookingIdRef.current = response.data.bookingId;
          logger.info('[WorkshopComponent] Stored actual bookingId from API', { bookingId: response.data.bookingId });
        } else if (propBookingId) {
          actualBookingIdRef.current = propBookingId;
          logger.info('[WorkshopComponent] Using prop bookingId', { bookingId: propBookingId });
        } else {
          logger.warn('[WorkshopComponent] No bookingId available from API or props', { sessionId });
        }
      } catch (error) {
        logger.error('[WorkshopComponent] Failed to fetch initial data', { error: error.message, sessionId });
      }
    };
    fetchInitialData();
  }, [sessionId, token, userId, propBookingId]); // Keep dependencies

  // Timer synchronization (keep as is)
  useEffect(() => {
    let interval;
    if (isTimerRunning && startTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = timer - elapsed;
        if (remaining <= 0) {
          setTimer(0);
          setIsTimerRunning(false);
          clearInterval(interval);
          if (isCoach && socket) socket.emit('timerEnded', { sessionId }); // Check socket existence
          alert(t('workshops:timerEnded'));
        } else {
          setTimer(remaining);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, startTime, timer, sessionId, isCoach, socket, t]); // Added socket dependency

  // Socket event listeners
  useEffect(() => {
    if (!socket) {
      logger.warn('[WorkshopComponent] Socket not available for event listeners.');
      return; // Exit if socket isn't ready
    }

    logger.info('[WorkshopComponent] Setting up socket listeners', { socketId: socket.id, sessionId });

    const handlers = {
      presentationModeToggled: ({ enabled }) => setIsPresentationMode(enabled),
      slideChanged: ({ slide }) => setCurrentSlide(slide),
      screenSharingLocked: ({ locked }) => setIsScreenSharingLocked(locked),
      muteAll: () => setIsMutedAll(true), // Consider if local mute state needs update
      unmuteAll: () => setIsMutedAll(false), // Consider if local mute state needs update
      handRaisingToggled: ({ enabled }) => setIsHandRaisingEnabled(enabled),
      timerStarted: ({ duration, startTime: serverStartTime }) => {
        setStartTime(serverStartTime); // Use server start time for sync
        setTimer(duration);
        setIsTimerRunning(true);
      },
      timerPaused: () => setIsTimerRunning(false),
      timerReset: () => {
        setTimer(0);
        setIsTimerRunning(false);
        setStartTime(null);
      },
      timerEnded: () => {
        setIsTimerRunning(false);
        alert(t('workshops:timerEnded'));
      },
      handRaised: ({ participantId }) => setRaisedHands((prev) => [...new Set([...prev, participantId])]),
      handLowered: ({ participantId }) => setRaisedHands((prev) => prev.filter((id) => id !== participantId)),
      // *** Agenda Update Handler ***
      agendaUpdated: ( updatedAgenda ) => { // Expecting the full updated agenda array
        logger.info('[WorkshopComponent] Received agendaUpdated event', { sessionId, updatedAgenda });
        // Directly update the state with the received data from the server
        setAgendaItems(updatedAgenda);
      },
      feedbackReceived: ({ feedback, userId: senderId, timestamp }) => {
        if (isCoach) {
          // Ensure timestamp is a Date object
          const receivedTimestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
          setFeedbackList((prev) => [...prev, { feedback, senderId, timestamp: receivedTimestamp }]);
          logger.info('[WorkshopComponent] Feedback received', { sessionId, feedback, senderId, timestamp: receivedTimestamp.toISOString() });
        }
      },
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      logger.debug(`[WorkshopComponent] Attaching listener for event: ${event}`);
      socket.on(event, handler);
    });

    // Cleanup function
    return () => {
      if (socket) { // Check if socket exists before cleaning up
        logger.info('[WorkshopComponent] Cleaning up socket listeners', { socketId: socket.id, sessionId });
        Object.keys(handlers).forEach((event) => {
          logger.debug(`[WorkshopComponent] Detaching listener for event: ${event}`);
          socket.off(event);
        });
      }
    };
  }, [socket, sessionId, isCoach, t]); // Dependencies: socket, sessionId, isCoach, t


  // --- Presentation Controls ---
  const handleTogglePresentationMode = () => {
    if (!isCoach || !socket) return;
    const newMode = !isPresentationMode;
    setIsPresentationMode(newMode);
    socket.emit('togglePresentationMode', { sessionId, enabled: newMode });
  };

  const handleNextSlide = () => {
    if (!isCoach || !socket) return;
    const nextSlideNum = currentSlide + 1;
    setCurrentSlide(nextSlideNum); // Optimistic update
    socket.emit('nextSlide', { sessionId, slide: nextSlideNum });
  };

  const handlePrevSlide = () => {
    if (!isCoach || currentSlide === 0 || !socket) return;
    const prevSlideNum = currentSlide - 1;
    setCurrentSlide(prevSlideNum); // Optimistic update
    socket.emit('prevSlide', { sessionId, slide: prevSlideNum });
  };

  const handleLockScreenSharing = () => {
    if (!isCoach || !socket) return;
    const newLockState = !isScreenSharingLocked;
    setIsScreenSharingLocked(newLockState); // Optimistic update
    socket.emit('lockScreenSharing', { sessionId, locked: newLockState });
  };

  // --- Participant Management ---
  const handleMuteAll = () => {
    if (!isCoach || !socket) return;
    if (!window.confirm(t('workshops:confirmMuteAll'))) return;

    // Note: This only emits the event. Actual muting depends on client-side handling
    // of the 'muteAll' event. We don't directly control other participants' streams here.
    const newMuteState = !isMutedAll; // Toggling local state representation
    setIsMutedAll(newMuteState); // Update button appearance

    const event = newMuteState ? 'muteAll' : 'unmuteAll'; // Consider if an unmuteAll event is needed/handled
    socket.emit(event, { sessionId });
    logger.info('[WorkshopComponent] Mute/Unmute all event emitted', { sessionId, event });

    // Optionally, toggle own audio if the coach should also be muted/unmuted
    // toggleAudio(); // Uncomment if coach should also mute/unmute
  };

  const handleSpotlightParticipant = (participantId) => {
    if (!isCoach || !socket) return;
    socket.emit('spotlightParticipant', { sessionId, participantId });
  };

   // --- Engagement Tools ---
  const handleToggleHandRaising = () => {
    if (!isCoach || !socket) return;
    const newState = !isHandRaisingEnabled;
    setIsHandRaisingEnabled(newState); // Optimistic UI update
    socket.emit('toggleHandRaising', { sessionId, enabled: newState });
  };

  const handleRaiseHand = () => {
    if (!socket || isCoach) return; // Only participants can raise hand
    const isRaised = raisedHands.includes(userId);
    if (isRaised) {
      socket.emit('lowerHand', { sessionId, participantId: userId });
      // Optimistic update handled by socket listener
    } else {
      socket.emit('raiseHand', { sessionId, participantId: userId });
       // Optimistic update handled by socket listener
    }
  };

   // --- Session Tools ---
  const handleSetTimer = (minutes) => {
    if (!isCoach || !socket) return;
    const duration = minutes * 60;
    const now = Date.now();
    // Optimistic update handled by socket listener
    socket.emit('startTimer', { sessionId, duration, startTime: now });
  };

  const handlePauseTimer = () => {
    if (!isCoach || !isTimerRunning || !socket) return;
    // Optimistic update handled by socket listener
    socket.emit('pauseTimer', { sessionId });
  };

  const handleResetTimer = () => {
    if (!isCoach || !socket) return;
    // Optimistic update handled by socket listener
    socket.emit('resetTimer', { sessionId });
  };


  // --- Agenda Handlers with Optimistic Update ---

  const handleToggleAgendaItem = async (index) => {
    if (!isCoach || !sessionId) {
      logger.warn('[WorkshopComponent] Cannot toggle agenda item', { isCoach, hasSessionId: !!sessionId });
      return;
    }
    // --- Optimistic Update ---
    const originalAgenda = [...agendaItems];
    const updatedAgenda = originalAgenda.map((item, i) =>
      i === index ? { ...item, completed: !item.completed } : item
    );
    setAgendaItems(updatedAgenda); // Update UI immediately
    // --- End Optimistic Update ---

    try {
      logger.info('[WorkshopComponent] Toggling agenda item completion (API Call)', { sessionId, index });
      // Send the update to the backend
      await axios.put(
        `/api/sessions/${sessionId}/notes-agenda`,
        { agenda: updatedAgenda }, // Send the optimistically updated state
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Backend will save and emit 'agendaUpdated', which will be caught by the listener
      logger.info('[WorkshopComponent] Agenda item toggle request sent successfully', { sessionId });
    } catch (error) {
      logger.error('[WorkshopComponent] Failed to toggle agenda item', { error: error.message, sessionId });
      // --- Rollback on error ---
      setAgendaItems(originalAgenda); // Revert UI to original state
      toast.error(t('workshops:agendaUpdateFailed'));
      // --- End Rollback ---
    }
  };

  const handleAddAgendaItem = async () => {
    if (!isCoach || !newAgendaItem.trim() || !sessionId) {
      logger.warn('[WorkshopComponent] Cannot add agenda item', { isCoach, hasText: !!newAgendaItem.trim(), hasSessionId: !!sessionId });
      return;
    }
    const newItem = { text: newAgendaItem, timestamp: new Date().toISOString(), completed: false };
    // --- Optimistic Update ---
    const originalAgenda = [...agendaItems];
    const updatedAgenda = [...originalAgenda, newItem];
    setAgendaItems(updatedAgenda); // Update UI
    setNewAgendaItem(''); // Clear input
    // --- End Optimistic Update ---

    try {
      logger.info('[WorkshopComponent] Adding agenda item (API Call)', { sessionId, newItem: newAgendaItem });
      // Send the update to the backend
      await axios.put(
        `/api/sessions/${sessionId}/notes-agenda`,
        { agenda: updatedAgenda }, // Send the optimistically updated state
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Backend will save and emit 'agendaUpdated'
      logger.info('[WorkshopComponent] Add agenda item request sent successfully', { sessionId });
    } catch (error) {
      logger.error('[WorkshopComponent] Failed to add agenda item', { error: error.message, sessionId });
      // --- Rollback on error ---
      setAgendaItems(originalAgenda); // Revert UI
      // Optionally put text back: setNewAgendaItem(newItem.text);
      toast.error(t('workshops:agendaUpdateFailed'));
      // --- End Rollback ---
    }
  };

  const handleRemoveAgendaItem = async (index) => {
    if (!isCoach || !sessionId) {
      logger.warn('[WorkshopComponent] Cannot remove agenda item', { isCoach, hasSessionId: !!sessionId });
      return;
    }
    // --- Optimistic Update ---
    const originalAgenda = [...agendaItems];
    const updatedAgenda = originalAgenda.filter((_, i) => i !== index);
    setAgendaItems(updatedAgenda); // Update UI
    // --- End Optimistic Update ---

    try {
      logger.info('[WorkshopComponent] Removing agenda item (API Call)', { sessionId, index });
       // Send the update to the backend
      await axios.put(
        `/api/sessions/${sessionId}/notes-agenda`,
        { agenda: updatedAgenda }, // Send the optimistically updated state
        { headers: { Authorization: `Bearer ${token}` } }
      );
       // Backend will save and emit 'agendaUpdated'
      logger.info('[WorkshopComponent] Remove agenda item request sent successfully', { sessionId });
    } catch (error) {
      logger.error('[WorkshopComponent] Failed to remove agenda item', { error: error.message, sessionId });
      // --- Rollback on error ---
      setAgendaItems(originalAgenda); // Revert UI
      toast.error(t('workshops:agendaUpdateFailed'));
      // --- End Rollback ---
    }
  };

  // --- Feedback Handler ---
  const handleSubmitFeedback = () => {
    // Use sessionId (link ID) for the socket event, assuming backend routes based on it
    if (!feedback.trim() || !sessionId || !socket) {
      logger.warn('[WorkshopComponent] Cannot submit feedback', { hasText: !!feedback.trim(), hasSessionId: !!sessionId, hasSocket: !!socket });
      return;
    }
    const feedbackData = { sessionId, feedback, userId, timestamp: new Date().toISOString() };
    socket.emit('submitFeedback', feedbackData); // Emit via socket
    setFeedback(''); // Clear input optimistically
    setFeedbackSubmitted(true);
    logger.info('[WorkshopComponent] Feedback submitted via socket', { sessionId, feedback: feedbackData.feedback, userId });
    setTimeout(() => setFeedbackSubmitted(false), 3000);
    // Note: No API call here, relies purely on socket for feedback submission/reception
  };


  // --- JSX Rendering ---
  return (
    <div>
      {isMinimized ? (
         <Draggable handle=".drag-handle" nodeRef={nodeRef}>
           {/* Minimized view JSX */}
           <div
             ref={nodeRef}
             className="w-64 bg-gray-800 text-white rounded-lg shadow-lg p-2 fixed bottom-4 left-4 z-[1000] pointer-events-auto overflow-hidden h-10 flex items-center justify-between"
           >
             <div className="drag-handle flex items-center cursor-move">
               <Presentation size={16} className="mr-2" />
               <h3 className="text-sm font-semibold">{t('workshops:title')}</h3>
             </div>
             <div className="flex gap-1">
               <motion.button
                 whileTap={{ scale: 0.95 }}
                 onClick={() => setIsMinimized(false)}
                 aria-label={t('maximize')}
                 className="p-1 hover:bg-gray-700 rounded"
               >
                 <ChevronDown size={16} className="rotate-180" />
               </motion.button>
               <motion.button
                 whileTap={{ scale: 0.95 }}
                 onClick={onClose}
                 aria-label={t('close')}
                 className="p-1 hover:bg-gray-700 rounded"
               >
                 <X size={16} />
               </motion.button>
             </div>
           </div>
         </Draggable>
      ) : (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 pointer-events-none"> {/* Make overlay non-interactive */}
          <Draggable handle=".drag-handle" bounds="parent" defaultPosition={{ x: 0, y: 0 }} nodeRef={nodeRef}>
            <div
              ref={nodeRef}
              className="w-72 bg-gray-800 text-white rounded-lg shadow-lg p-4 z-[1000] pointer-events-auto overflow-x-hidden overflow-y-auto h-auto max-h-[80vh]" // Enable internal scrolling
            >
              {/* Header */}
              <div className="drag-handle flex justify-between items-center mb-4 cursor-move">
                 <h3 className="text-lg font-semibold flex items-center gap-2">
                   <Presentation size={20} /> {t('workshops:title')}
                 </h3>
                 <div className="flex gap-2">
                    <motion.button
                       whileTap={{ scale: 0.95 }}
                       onClick={() => setIsMinimized(true)}
                       aria-label={t('minimize')}
                       className="p-1 hover:bg-gray-700 rounded"
                    >
                       <ChevronDown size={20} />
                    </motion.button>
                    <motion.button
                       whileTap={{ scale: 0.95 }}
                       onClick={onClose}
                       aria-label={t('close')}
                       className="p-1 hover:bg-gray-700 rounded"
                    >
                       <X size={20} />
                    </motion.button>
                 </div>
              </div>

              {/* Main Controls */}
              <div className="space-y-4">
                {/* Presentation Controls (Coach Only) */}
                {isCoach && isPresentationMode && (
                  <div className="space-y-2 p-2 bg-gray-700 rounded-md">
                    <h4 className="text-md font-semibold">{t('workshops:presentationControls')}</h4>
                    <div className="flex justify-between items-center">
                       <button
                         onClick={handlePrevSlide}
                         className={`p-2 bg-gray-600 rounded-lg hover:bg-gray-500 ${currentSlide === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                         disabled={currentSlide === 0}
                       >
                         <ChevronLeft size={16} />
                       </button>
                       <span>{t('workshops:slide')} {currentSlide + 1}</span>
                       <button onClick={handleNextSlide} className="p-2 bg-gray-600 rounded-lg hover:bg-gray-500">
                         <ChevronRight size={16} />
                       </button>
                    </div>
                  </div>
                )}

                 {/* Coach Primary Controls */}
                {isCoach && (
                  <div className="space-y-2">
                    <button
                      onClick={handleTogglePresentationMode}
                      className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${isPresentationMode ? 'text-red-400 border-red-500' : ''}`}
                    >
                      <Presentation size={16} />
                      {isPresentationMode ? t('workshops:exitPresentation') : t('workshops:enterPresentation')}
                    </button>
                    <button
                      onClick={handleLockScreenSharing}
                      className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${isScreenSharingLocked ? 'text-red-400 border-red-500' : ''}`}
                    >
                      <Lock size={16} />
                      {isScreenSharingLocked ? t('workshops:unlockSharing') : t('workshops:lockSharing')}
                    </button>
                    <button
                      onClick={handleMuteAll}
                      className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${isMutedAll ? 'text-red-400 border-red-500' : ''}`}
                    >
                      <MicOff size={16} />
                      {isMutedAll ? t('workshops:unmuteAll') : t('workshops:muteAll')}
                    </button>
                    <button
                      onClick={() => setActiveSection(activeSection === 'participants' ? null : 'participants')}
                      className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${activeSection === 'participants' ? 'bg-gray-600' : ''}`}
                    >
                      <UserCircle size={16} />
                      {t('workshops:participants')}
                    </button>
                  </div>
                )}

                 {/* Engagement Tools */}
                <div className="space-y-2">
                  {isCoach && (
                    <button
                      onClick={handleToggleHandRaising}
                      className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${isHandRaisingEnabled ? 'text-blue-400 border-blue-500' : ''}`}
                    >
                      <Hand size={16} />
                      {isHandRaisingEnabled ? t('workshops:disableHandRaising') : t('workshops:enableHandRaising')}
                    </button>
                  )}
                  {!isCoach && isHandRaisingEnabled && (
                    <button
                      onClick={handleRaiseHand}
                      className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${raisedHands.includes(userId) ? 'text-yellow-400 border-yellow-500' : ''}`}
                    >
                      <Hand size={16} />
                      {raisedHands.includes(userId) ? t('workshops:lowerHand') : t('workshops:raiseHand')}
                    </button>
                  )}
                 </div>

                 {/* Session Tools */}
                <div className="space-y-2">
                  <button
                    onClick={() => setActiveSection(activeSection === 'timer' ? null : 'timer')}
                    className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${activeSection === 'timer' ? 'bg-gray-600' : ''}`}
                  >
                    <Timer size={16} />
                    {t('workshops:timer')} {(isTimerRunning || timer > 0) ? `(${Math.floor(timer / 60)}:${(timer % 60).toString().padStart(2, '0')})` : ''}
                  </button>
                  <button
                    onClick={() => setActiveSection(activeSection === 'agenda' ? null : 'agenda')}
                    className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${activeSection === 'agenda' ? 'bg-gray-600' : ''}`}
                  >
                    <List size={16} />
                    {t('workshops:agenda')}
                  </button>
                  <button
                    onClick={() => setActiveSection(activeSection === 'feedback' ? null : 'feedback')}
                    className={`w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-gray-600 shadow-sm ${activeSection === 'feedback' ? 'bg-gray-600' : ''}`}
                  >
                    <HelpCircle size={16} />
                    {t('workshops:feedback')}
                  </button>
                 </div>
              </div>

              {/* --- Secondary Modal Sections --- */}
              <AnimatePresence>
                {activeSection && (
                  <motion.div
                    key={activeSection} // Add key for animation presence
                    initial={{ opacity: 0, x: 50 }} // Animate from the right
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50, position: 'absolute' }} // Animate out to the left
                    transition={{ duration: 0.3 }}
                    className="absolute top-0 left-0 w-full h-full bg-gray-800 p-4 rounded-lg shadow-lg overflow-y-auto z-10" // Ensure it's above main controls
                  >
                     {/* Back Button */}
                    <button onClick={() => setActiveSection(null)} className="absolute top-4 left-4 p-2 hover:bg-gray-700 rounded z-20">
                       <ArrowLeft size={20} />
                    </button>

                    {/* --- Participants Section --- */}
                    {activeSection === 'participants' && (
                      <div>
                        <h4 className="text-lg font-semibold text-center mb-4 pt-8">{t('workshops:participants')}</h4>
                        <ul className="space-y-2">
                          {participants.map((p) => (
                            <li key={p.peerId} className="flex justify-between items-center p-2 bg-gray-700 rounded-lg">
                              <span className="flex items-center gap-2 text-sm">
                                {p.displayName || p.peerId.substring(0, 6)}
                                {raisedHands.includes(p.peerId) && <Hand size={14} className="text-yellow-500" />}
                              </span>
                              {isCoach && ( // Only coach can spotlight
                                <button onClick={() => handleSpotlightParticipant(p.peerId)} className="p-1 text-blue-400 hover:text-blue-600" title={t('workshops:spotlight')}>
                                  <UserCircle size={16} />
                                </button>
                              )}
                            </li>
                          ))}
                           {participants.length === 0 && <p className="text-sm text-gray-400 italic text-center">{t('workshops:noParticipants')}</p>}
                        </ul>
                      </div>
                    )}

                    {/* --- Agenda Section --- */}
                    {activeSection === 'agenda' && (
                      <div>
                         <h4 className="text-lg font-semibold text-center mb-4 pt-8">{t('workshops:agenda')}</h4>
                        <ul className="space-y-3 max-h-60 overflow-y-auto mb-4 pr-2"> {/* Added padding-right for scrollbar */}
                          {agendaItems.length > 0 ? (
                            agendaItems.map((item, idx) => (
                              <li
                                key={idx} // Using index, consider a more stable key if possible
                                className="flex items-center gap-2 p-3 bg-gray-700 rounded-lg shadow-sm hover:bg-gray-600 transition-colors"
                              >
                                <button
                                  onClick={() => handleToggleAgendaItem(idx)}
                                  className={`p-1 rounded-full ${item.completed ? 'bg-green-500' : 'bg-gray-500'} hover:bg-opacity-80 flex-shrink-0`}
                                  disabled={!isCoach} // Disable button for non-coaches
                                  title={isCoach ? (item.completed ? t('workshops:markIncomplete') : t('workshops:markComplete')) : ''}
                                >
                                  <CheckCircle size={16} className="text-white" />
                                </button>
                                <span className={`text-sm flex-1 break-words ${item.completed ? 'line-through text-gray-400' : ''}`}>
                                  {item.text}
                                </span>
                                {isCoach && (
                                  <button
                                    onClick={() => handleRemoveAgendaItem(idx)}
                                    className="p-1 text-red-400 hover:text-red-600 flex-shrink-0"
                                    title={t('workshops:remove')}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </li>
                            ))
                          ) : (
                            <p className="text-sm text-gray-400 italic text-center">{t('workshops:noAgendaItems')}</p>
                          )}
                        </ul>
                        {isCoach && (
                          <div className="mt-4 space-y-2 border-t border-gray-700 pt-4">
                            <input
                              type="text"
                              value={newAgendaItem}
                              onChange={(e) => setNewAgendaItem(e.target.value)}
                              placeholder={t('workshops:addAgendaItem')}
                              className="w-full p-2 bg-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onKeyPress={(e) => e.key === 'Enter' && handleAddAgendaItem()} // Add item on Enter
                            />
                            <button
                              onClick={handleAddAgendaItem}
                              className="w-full p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
                              disabled={!newAgendaItem.trim()}
                            >
                              {t('workshops:add')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* --- Feedback Section --- */}
                    {activeSection === 'feedback' && (
                       <div>
                         <h4 className="text-lg font-semibold text-center mb-4 pt-8">{t('workshops:feedback')}</h4>
                        {/* Coach view: list received feedback */}
                        {isCoach && (
                           <div className="mb-4 max-h-60 overflow-y-auto space-y-3 pr-2">
                            {feedbackList.length > 0 ? (
                               feedbackList.map((item, idx) => (
                                 <div key={idx} className="p-3 bg-gray-700 rounded-lg shadow-sm">
                                   <p className="text-sm text-gray-300 break-words">{item.feedback}</p>
                                   <p className="text-xs text-gray-500 mt-1 text-right">
                                      {/* Find participant name - requires participants prop to have userId */}
                                      {/* {participants.find(p => p.userId === item.senderId)?.name || t('workshops:anonymous')} - */}
                                      {item.timestamp?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}
                                   </p>
                                 </div>
                               ))
                             ) : (
                               <p className="text-sm text-gray-400 italic text-center">{t('workshops:noFeedbackYet')}</p>
                             )}
                          </div>
                         )}
                         {/* Participant view: submit feedback */}
                         {!isCoach && (
                           <div className="space-y-2">
                             <p className="text-sm text-gray-400 italic mb-2">
                               {t('workshops:submitYourFeedback')}
                             </p>
                             <textarea
                               value={feedback}
                               onChange={(e) => setFeedback(e.target.value)}
                               placeholder={t('workshops:feedbackPlaceholder')}
                               className="w-full p-2 bg-gray-700 rounded-lg text-white h-32 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                               maxLength={500} // Add a max length
                             />
                             <button
                               onClick={handleSubmitFeedback}
                               className="w-full p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
                               disabled={!feedback.trim() || feedbackSubmitted} // Disable after submitting
                             >
                               {feedbackSubmitted ? (
                                 <span className="flex items-center justify-center gap-2">
                                   <CheckCircle size={16} /> {t('workshops:submitted')}
                                 </span>
                               ) : (
                                 t('workshops:submitFeedback')
                               )}
                             </button>
                           </div>
                         )}
                       </div>
                     )}

                     {/* --- Timer Section --- */}
                    {activeSection === 'timer' && (
                      <div>
                        <h4 className="text-lg font-semibold text-center mb-4 pt-8">{t('workshops:timer')}</h4>
                        <div className="text-4xl font-bold text-center mb-6 tabular-nums">
                          {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                        </div>
                        {isCoach && (
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            <button onClick={() => handleSetTimer(5)} className="p-2 bg-gray-700 rounded-lg text-white text-sm hover:bg-gray-600">5 Min</button>
                            <button onClick={() => handleSetTimer(10)} className="p-2 bg-gray-700 rounded-lg text-white text-sm hover:bg-gray-600">10 Min</button>
                            <button onClick={() => handleSetTimer(15)} className="p-2 bg-gray-700 rounded-lg text-white text-sm hover:bg-gray-600">15 Min</button>
                          </div>
                         )}
                         {isCoach && (
                          <div className="flex justify-center gap-4">
                            <button
                              onClick={isTimerRunning ? handlePauseTimer : () => handleSetTimer(Math.floor(timer / 60) + (timer % 60 > 0 ? 1: 0))} // Resume functionality
                              className={`p-2 bg-gray-700 rounded-lg text-white hover:bg-gray-600 ${timer <= 0 && !isTimerRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                              disabled={timer <= 0 && !isTimerRunning}
                            >
                              {isTimerRunning ? t('workshops:pause') : t('workshops:resume')}
                            </button>
                            <button
                              onClick={handleResetTimer}
                              className={`p-2 bg-gray-700 rounded-lg text-white hover:bg-gray-600 ${(timer <= 0 && !isTimerRunning) ? 'opacity-50 cursor-not-allowed' : ''}`}
                              disabled={timer <= 0 && !isTimerRunning}
                            >
                              {t('workshops:reset')}
                            </button>
                          </div>
                        )}
                         {!isCoach && timer <= 0 && <p className="text-sm text-gray-400 italic text-center mt-4">{t('workshops:noTimerSet')}</p>}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {/* End Secondary Modal Sections */}

              <Tooltip id="presentation-tooltip" /> {/* Ensure Tooltip component is used */}
              {/* Add tooltips for other buttons if needed */}
            </div>
          </Draggable>
        </div>
      )}
    </div>
  );
};

export default WorkshopComponent;