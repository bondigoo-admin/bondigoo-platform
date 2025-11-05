import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Phone, Layout, Presentation, Settings, Share, X, FileText, CalendarIcon, Notebook, Hand, UserCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import axios from 'axios';
import { logger } from '../utils/logger';
import VideoSettings from './VideoSettings';
import Draggable from 'react-draggable';
import WorkshopComponent from './WorkshopComponent';

const ControlBar = ({
  isAudioEnabled,
  isVideoEnabled,
  toggleAudio,
  toggleVideo,
  endSession,
  sessionId,
  bookingId,
  layout,
  setLayout,
  isCoach,
  shareScreen,
  children,
  localStream,
  videoDevices,
  audioDevices,
  selectedVideoDevice,
  setSelectedVideoDevice,
  selectedAudioDevice,
  setSelectedAudioDevice,
  currentBackgroundSettings,
  onBackgroundChange,
  onMediaStateChange = (state) => logger.info('[ControlBar] Media state change not handled', { state }),
  isRecording,
  startRecording,
  stopRecording,
  recordingError,
  isConnected,
  isStoppingRecording,
  participants,
  userId,
  resourceCount,
  togglePanel,
  activePanel,
  raisedHands,  
  leaveSession,          
  onOpenRaisedHandsModal, 
}) => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWorkshopOpen, setIsWorkshopOpen] = useState(false);

  logger.info('[ControlBar] Received props', { resourceCount, sessionId });

  useEffect(() => {
    logger.info('[ControlBar] Audio enabled state changed', { isAudioEnabled, sessionId });
  }, [isAudioEnabled, sessionId]);

  useEffect(() => {
    logger.info('[ControlBar] Video enabled state changed', { isVideoEnabled, sessionId });
  }, [isVideoEnabled, sessionId]);

  const handleToggleAudio = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      logger.info('[ControlBar] Audio toggle initiated', { sessionId, currentState: isAudioEnabled, trackCount: audioTracks.length, tracks: audioTracks.map(t => ({ enabled: t.enabled })) });
      audioTracks.forEach((track) => { track.enabled = !track.enabled; });
      const newAudioState = !isAudioEnabled;
      toggleAudio();
      onMediaStateChange({ isAudioEnabled: newAudioState, isVideoEnabled });
      logger.info('[ControlBar] Audio toggled via stream', { newState: newAudioState, sessionId, tracks: audioTracks.map((t) => ({ enabled: t.enabled })) });
    } else {
      logger.warn('[ControlBar] Attempted to toggle audio with no local stream', { sessionId });
    }
  };
  
  const handleToggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      logger.info('[ControlBar] Video toggle initiated', { sessionId, currentState: isVideoEnabled, trackCount: videoTracks.length, tracks: videoTracks.map(t => ({ enabled: t.enabled })) });
      videoTracks.forEach((track) => { track.enabled = !track.enabled; });
      const newVideoState = !isVideoEnabled;
      toggleVideo();
      onMediaStateChange({ isAudioEnabled, isVideoEnabled: newVideoState });
      logger.info('[ControlBar] Video toggled via stream', { newState: newVideoState, sessionId, tracks: videoTracks.map((t) => ({ enabled: t.enabled })) });
    } else {
      logger.warn('[ControlBar] Attempted to toggle video with no local stream', { sessionId });
    }
  };

  const handleLayoutToggle = () => {
    const newLayout = layout === 'grid' ? 'speaker' : 'grid';
    setLayout(newLayout);
    logger.info('[ControlBar] Layout toggled', { newLayout, sessionId });
  };

  const handleScreenShare = async () => {
    const success = await shareScreen();
    logger.info('[ControlBar] Screen sharing toggled', { sessionId, success });
  };

  const handleRecordingToggle = () => {
    if (isRecording) stopRecording();
    else setIsModalOpen(true);
    logger.info('[ControlBar] Recording toggle initiated', { sessionId, isRecording });
  };

  const handleToggleWorkshopPanel = () => {
    setIsWorkshopOpen((prev) => !prev);
    logger.info('[ControlBar] Workshop panel toggled', { sessionId, isOpen: !isWorkshopOpen });
  };

  const handleEndOrLeaveSession = () => {
    const logContext = { event: isCoach ? 'end_session_client_v1' : 'leave_session_client_v1', sessionId, isCoach, timestamp: new Date().toISOString() };
    if (isCoach) {
      logger.info('[ControlBar] Coach clicking End Session button', logContext);
      if (window.confirm(t('controlBar.confirmEndSessionCoach'))) {
        endSession();
      }
    } else {
      logger.info('[ControlBar] User clicking Leave Session button', logContext);
      if (window.confirm(t('controlBar.confirmLeaveSessionUser'))) {
        leaveSession();
      }
    }
  };

  const enhancedChildren = React.Children.map(children, (child) => {
    if (!child || !isCoach || !React.isValidElement(child)) {
      logger.info('[ControlBar] Skipping child', { childType: child?.type?.name || 'Unknown', isCoach });
      return child;
    }
    
    const isResourceButton = child.props['data-tooltip-id'] === 'resources-tooltip';
    
    logger.info('[ControlBar] Processing child button', { sessionId, isResourceButton, resourceCount, childType: child.type?.name || 'Unknown', tooltipId: child.props['data-tooltip-id'] || 'N/A' });
    
    if (isResourceButton && resourceCount > 0) {
      logger.info('[ControlBar] Rendering badge for resource button', { sessionId, resourceCount });
      return (
        <div className="relative inline-block">
          {React.cloneElement(child)}
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {resourceCount}
          </span>
        </div>
      );
    }
    return child;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex justify-center items-center flex-wrap gap-2 md:gap-3 p-2 bg-card/80 dark:bg-card/60 backdrop-blur-sm border border-border rounded-full shadow-lg"
    >
      <button
        onClick={handleToggleAudio}
        className={`flex items-center justify-center h-10 w-10 rounded-full transition-colors text-white ${isAudioEnabled ? 'bg-primary hover:bg-primary/90' : 'bg-destructive opacity-70'}`}
        data-tooltip-id="audio-tooltip"
        data-tooltip-content={isAudioEnabled ? t('controlBar.mute') : t('controlBar.unmute')}
        aria-label={isAudioEnabled ? t('controlBar.mute') : t('controlBar.unmute')}
      >
        {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
      </button>

      <button
        onClick={handleToggleVideo}
        className={`flex items-center justify-center h-10 w-10 rounded-full transition-colors text-white ${isVideoEnabled ? 'bg-primary hover:bg-primary/90' : 'bg-destructive opacity-70'}`}
        data-tooltip-id="video-tooltip"
        data-tooltip-content={isVideoEnabled ? t('controlBar.videoOff') : t('controlBar.videoOn')}
        aria-label={isVideoEnabled ? t('controlBar.videoOff') : t('controlBar.videoOn')}
      >
        {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
      </button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogTrigger asChild>
        <button
          onClick={handleRecordingToggle}
          className={`flex items-center justify-center h-10 w-10 rounded-full transition-colors ${isRecording ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'} ${isStoppingRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-tooltip-id="recording-tooltip"
          data-tooltip-content={isRecording ? t('controlBar.stopRecording') : t('controlBar.startRecording')}
          aria-label={isRecording ? t('controlBar.stopRecording') : t('controlBar.startRecording')}
          disabled={isStoppingRecording}
        >
          <Video size={20} />
        </button>
        </DialogTrigger>
        {!isRecording && (
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-card-foreground text-lg font-semibold">{t('controlBar.confirmRecording')}</DialogTitle>
            </DialogHeader>
            <p id="recording-consent-description" className="text-muted-foreground">{t('controlBar.recordingWarning')}</p>
            {recordingError && <p className="text-destructive mt-2">{recordingError}</p>}
            <DialogFooter className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t('common:cancel')}</Button>
              <Button onClick={startRecording}>{t('controlBar.start')}</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <button
        onClick={handleLayoutToggle}
        className={`flex items-center justify-center h-10 w-10 rounded-full transition-colors ${layout === 'grid' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
        data-tooltip-id="layout-tooltip"
        data-tooltip-content={layout === 'grid' ? t('controlBar.speakerView') : t('controlBar.gridView')}
        aria-label={layout === 'grid' ? t('controlBar.speakerView') : t('controlBar.gridView')}
      >
        {layout === 'grid' ? <UserCircle size={20} /> : <Layout size={20} />}
      </button>

      {isCoach && (
        <button
          onClick={handleToggleWorkshopPanel}
          className={`flex items-center justify-center h-10 w-10 rounded-full transition-colors ${isWorkshopOpen ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
          data-tooltip-id="workshop-panel-tooltip"
          data-tooltip-content={isWorkshopOpen ? t('controlBar.closeWorkshopPanel') : t('controlBar.openWorkshopPanel')}
          aria-label={isWorkshopOpen ? t('controlBar.closeWorkshopPanel') : t('controlBar.openWorkshopPanel')}
        >
          <Presentation size={20} />
        </button>
      )}

      {isCoach && (
        <div className="relative inline-block">
          <button
            onClick={() => onOpenRaisedHandsModal()}
            className="flex items-center justify-center h-10 w-10 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            data-tooltip-id="raised-hands-tooltip"
            data-tooltip-content={t('session.raisedHands')}
            aria-label={t('session.raisedHands')}
          >
            <Hand size={20} />
          </button>
          {raisedHands.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {raisedHands.length}
            </span>
          )}
          <Tooltip id="raised-hands-tooltip" place="top" />
        </div>
      )}

      {isWorkshopOpen && isCoach && (
        <WorkshopComponent sessionId={sessionId} isCoach={isCoach} participants={participants} onClose={() => { setIsWorkshopOpen(false); logger.info('[ControlBar] WorkshopComponent closed', { sessionId }); }} userId={userId} localStream={localStream} toggleAudio={toggleAudio} toggleVideo={toggleVideo} bookingId={bookingId} />
      )}

      <div className="relative inline-block">
        <button
          onClick={() => togglePanel('resources')}
          className={`flex items-center justify-center h-10 w-10 rounded-full transition-colors ${activePanel === 'resources' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
          data-tooltip-id="resources-tooltip"
          data-tooltip-content={t('session.resources')}
          aria-label={t('session.resources')}
        >
          <FileText size={20} />
        </button>
        {resourceCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {resourceCount}
          </span>
        )}
      </div>

      <button
        onClick={() => togglePanel('notes')}
        className={`flex items-center justify-center h-10 w-10 rounded-full transition-colors ${activePanel === 'notes' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
        data-tooltip-id="notes-tooltip"
        data-tooltip-content={t('session.privateNotes')}
        aria-label={t('session.privateNotes')}
      >
        <Notebook size={20} />
      </button>

      <button
        onClick={() => togglePanel('agenda')}
        className={`flex items-center justify-center h-10 w-10 rounded-full transition-colors ${activePanel === 'agenda' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
        data-tooltip-id="agenda-tooltip"
        data-tooltip-content={t('session.agenda')}
        aria-label={t('session.agenda')}
      >
        <CalendarIcon size={20} />
      </button>

      {enhancedChildren}

      <button
        onClick={handleEndOrLeaveSession}
        className={`flex items-center justify-center h-10 w-10 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
        data-tooltip-id="end-leave-tooltip"
        data-tooltip-content={isCoach ? t('session.endSession') : t('session.leaveSession')}
        aria-label={isCoach ? t('session.endSession') : t('session.leaveSession')}
        disabled={!isConnected}
      >
        <Phone size={20} />
      </button>

      <button
        onClick={handleScreenShare}
        className="flex items-center justify-center h-10 w-10 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        data-tooltip-id="screenshare-tooltip"
        data-tooltip-content={t('controlBar.startScreenShare')}
        aria-label={t('controlBar.startScreenShare')}
      >
        <Share size={20} />
      </button>

      <Tooltip id="audio-tooltip" place="top" />
      <Tooltip id="video-tooltip" place="top" />
      <Tooltip id="recording-tooltip" place="top" />
      <Tooltip id="layout-tooltip" place="top" />
      <Tooltip id="workshop-panel-tooltip" place="top" />
      <Tooltip id="end-tooltip" place="top" />
      <Tooltip id="end-leave-tooltip" place="top" />
      <Tooltip id="screenshare-tooltip" place="top" />
      <Tooltip id="resources-tooltip" place="top" />
      <Tooltip id="notes-tooltip" place="top" />
      <Tooltip id="agenda-tooltip" place="top" />
    </motion.div>
  );
};

ControlBar.defaultProps = {
  togglePanel: () => logger.warn('[ControlBar] togglePanel not provided'),
  activePanel: null,
};

export default ControlBar;