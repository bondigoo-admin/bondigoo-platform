import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Settings, ScreenShare as ScreenShareIcon } from 'lucide-react';
import useLiveSessionCall from '../../hooks/useLiveSessionCall';
import { logger } from '../../utils/logger';
import { Button } from '../ui/button.tsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, AlertDialogFooter } from '../ui/alert-dialog.tsx';
import VideoSettings from '../VideoSettings';

const VideoTile = ({ stream, isLocal, displayName }) => {
  const ref = useRef();
  useEffect(() => {
    if (stream && ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <video ref={ref} autoPlay playsInline muted={isLocal} className="w-full h-full object-cover" />
      <div className="absolute bottom-2 left-2 bg-black/50 text-white text-sm px-2 py-1 rounded">
        {displayName} {isLocal && '(You)'}
      </div>
    </div>
  );
};

const LiveSessionCallUI = ({ socket, sessionId, token, initialConfig, stream, sessionData, onEndSession, onStreamUpdate }) => {
  const { t } = useTranslation(['liveSession', 'common']);
  const { user, isCoach } = sessionData;
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentBackgroundSettings, setCurrentBackgroundSettings] = useState(initialConfig.backgroundSettings);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState(initialConfig.videoDeviceId);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(initialConfig.audioDeviceId);

  const {
    localStream,
    participants,
    error,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    isScreenSharing,
    toggleScreenShare,
    updateLocalStream,
  } = useLiveSessionCall(socket, sessionId, token, {
    stream: stream, 
    userId: user._id,
    displayName: `${user.firstName} ${user.lastName}`,
    isCoach,
  });

  const localStreamRef = useRef(localStream);

  useEffect(() => {
      if (stream && stream.id !== localStream?.id) {
          updateLocalStream(stream);
      }
  }, [stream, localStream, updateLocalStream]);

  useEffect(() => {
    if (error) {
      logger.error('[LiveSessionCallUI] Received error from hook', { error });
    }
  }, [error]);

  const handleSettingsChange = (newSettings) => {
    logger.info('[LiveSessionCallUI] Applying new settings from modal.', { newSettings });
    
    if (newSettings.stream) {
      onStreamUpdate(newSettings.stream);
    }
    
    setCurrentBackgroundSettings(newSettings.backgroundSettings);
    setSelectedVideoDevice(newSettings.videoDeviceId);
    setSelectedAudioDevice(newSettings.audioDeviceId);
  };

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const remoteParticipant = participants.length > 0 ? participants[0] : null;

  return (
    <div className="absolute inset-0 bg-slate-900 text-white">

      <div className="relative w-full h-full max-w-7xl mx-auto">
        <div className="grid grid-cols-1 grid-rows-1 gap-4 w-full h-full p-2 md:p-4">
          {remoteParticipant ? (
            <VideoTile stream={remoteParticipant.stream} isLocal={false} displayName={remoteParticipant.displayName} />
          ) : (
            <div className="w-full h-full bg-black rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground">{t('waitingForParticipant', 'Waiting for the other person to join...')}</p>
            </div>
          )}
        </div>

        <div className="absolute top-2 right-2 md:top-4 md:right-4 w-32 h-24 md:w-48 md:h-36 rounded-lg overflow-hidden border-2 border-white/50 z-10">
          {localStream && <VideoTile stream={localStream} isLocal={true} displayName="You" />}
        </div>
      </div>

       <div className="fixed bottom-4 md:bottom-6 left-0 right-0 flex justify-center z-20 pointer-events-none">
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, type: 'spring' }}
          className="flex items-center gap-2 md:gap-3 bg-slate-800/80 backdrop-blur-md text-white p-2 md:p-3 rounded-full shadow-lg pointer-events-auto"
        >
          <Button onClick={toggleAudio} variant="outline" size="icon" className={`rounded-full md:w-12 md:h-12 border-none transition-colors ${audioEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-700'}`}>
            {audioEnabled ? <Mic size={24} className="text-white" /> : <MicOff size={24} className="text-white" />}
          </Button>
          <Button onClick={toggleVideo} variant="outline" size="icon" className={`rounded-full md:w-12 md:h-12 border-none transition-colors ${videoEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-red-600 hover:bg-red-700'}`}>
            {videoEnabled ? <Video size={24} className="text-white" /> : <VideoOff size={24} className="text-white" />}
          </Button>
          <Button onClick={toggleScreenShare} variant="outline" size="icon" className="rounded-full md:w-12 md:h-12 bg-white/10 border-none hover:bg-white/20">
            <ScreenShareIcon size={24} className={`transition-colors ${isScreenSharing ? 'text-green-400' : 'text-white'}`} />
          </Button>
          <Button onClick={() => setIsSettingsOpen(true)} variant="outline" size="icon" className="rounded-full md:w-12 md:h-12 bg-white/10 border-none hover:bg-white/20">
            <Settings size={24} className="text-white" />
          </Button>
         <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-full md:h-12 md:w-12 border-none bg-red-600 hover:bg-red-700">
                <PhoneOff size={24} className="text-white" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('endSessionConfirmationTitle', 'Are you sure you want to end the session?')}</AlertDialogTitle>
                <AlertDialogDescription>{t('endSessionConfirmationDescription', 'This action cannot be undone and will finalize billing.')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common:cancel', 'Cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={onEndSession}>{t('endSession', 'End Session')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>
      </div>


      <div className={`absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm ${isSettingsOpen ? '' : 'invisible opacity-0 pointer-events-none'}`}>
          <VideoSettings
            localStream={localStream}
            onClose={() => setIsSettingsOpen(false)}
            onSettingsChange={handleSettingsChange}
            videoDevices={initialConfig.videoDevices}
            audioDevices={initialConfig.audioDevices}
            selectedVideoDevice={selectedVideoDevice}
            setSelectedVideoDevice={setSelectedVideoDevice}
            selectedAudioDevice={selectedAudioDevice}
            setSelectedAudioDevice={setSelectedAudioDevice}
            currentBackgroundSettings={currentBackgroundSettings}
          />
      </div>
    </div>
  );
};

export default LiveSessionCallUI;