import React, { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { Video, Mic, Loader2, Volume2, StopCircle, Image as ImageIcon, Trash2, Upload, VideoOff, MicOff } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

import { logger } from '../../utils/logger';
import { createPlaceholderStream } from '../../utils/mediaUtils';

// Import UI Components from ShadCN
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog.tsx';
import { Slider } from '../ui/slider.tsx';
import { Badge } from '../ui/badge.tsx';

// Import from BackgroundEffectUtility
import {
  BACKGROUND_MODES,
  BACKGROUND_STATUS,
  DEFAULT_BLUR_LEVEL,
  MAX_FILE_SIZE_MB,
  SUPPORTED_IMAGE_TYPES,
  compressImage,
  setupBackgroundEffect,
} from '../../utils/BackgroundEffectUtility';

const NO_DEVICE_PLACEHOLDER = 'no-device-selected';

const mediaInitialState = {
  status: 'initializing',
  error: null,
  videoDevices: [],
  audioDevices: [],
  selectedVideoDevice: NO_DEVICE_PLACEHOLDER,
  selectedAudioDevice: NO_DEVICE_PLACEHOLDER,
  isVideoEnabled: true,
  isAudioEnabled: true,
  hasVideoDevice: false, // Start with false until proven true
};

function mediaReducer(state, action) {
  switch (action.type) {
    case 'INITIALIZE_START':
      return { ...state, status: 'initializing' };
    case 'DEVICES_PARTIAL_SUCCESS':
      const { videoDevices, audioDevices, hasVideo, error } = action.payload;
      const firstVideo = videoDevices[0]?.deviceId || NO_DEVICE_PLACEHOLDER;
      const firstAudio = audioDevices[0]?.deviceId || NO_DEVICE_PLACEHOLDER;
      return {
        ...state,
        videoDevices,
        audioDevices,
        selectedVideoDevice: state.selectedVideoDevice === NO_DEVICE_PLACEHOLDER ? firstVideo : state.selectedVideoDevice,
        selectedAudioDevice: state.selectedAudioDevice === NO_DEVICE_PLACEHOLDER ? firstAudio : state.selectedAudioDevice,
        hasVideoDevice: hasVideo,
        status: 'ready',
        error: error,
      };
    case 'INITIALIZATION_ERROR':
      return { ...state, status: 'error', error: action.payload.error, hasVideoDevice: false };
    case 'SELECT_DEVICE':
      return { ...state, [action.payload.type === 'video' ? 'selectedVideoDevice' : 'selectedAudioDevice']: action.payload.deviceId };
    case 'TOGGLE_VIDEO':
      return { ...state, isVideoEnabled: !state.isVideoEnabled };
    case 'TOGGLE_AUDIO':
      return { ...state, isAudioEnabled: !state.isAudioEnabled };
    default:
      return state;
  }
}

const MicLevelIndicator = ({ stream }) => {
  const { t } = useTranslation('liveSession');
  const [micLevel, setMicLevel] = useState(0);
  const audioContextRef = useRef(null);

  useEffect(() => {
    let animationFrameId;

    const setupAudioAnalysis = (mediaStream) => {
      if (!mediaStream || mediaStream.getAudioTracks().length === 0) {
        setMicLevel(0);
        return;
      }
      audioContextRef.current?.close().catch(() => { /* a no-op */ });
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      analyser.fftSize = 256;
      audioContextRef.current = audioContext;
      
      const updateMicLevel = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        setMicLevel(average / 255);
        animationFrameId = requestAnimationFrame(updateMicLevel);
      };
      updateMicLevel();
    };

    setupAudioAnalysis(stream);

    return () => {
      cancelAnimationFrame(animationFrameId);
      audioContextRef.current?.close().catch(() => { /* a no-op */ });
    };
  }, [stream]);

  return (
    <>
      <p className="text-sm font-medium text-foreground whitespace-nowrap">{t('deviceCheck.micLevel')}</p>
      <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
        <div className="bg-primary h-full rounded-full transition-all duration-100" style={{ width: `${Math.min(micLevel * 100, 100)}%` }} />
      </div>
    </>
  );
};

const LiveSessionDeviceCheck = ({ onReady }) => {
  const { t } = useTranslation('liveSession');
  const componentId = useRef(`LSDC-${Math.random().toString(36).substr(2, 5)}`).current;
  const [mediaState, dispatch] = useReducer(mediaReducer, mediaInitialState);

  const videoRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const backgroundProcessorRef = useRef(null);
  const speakerAudioRef = useRef(null);

  const [originalStream, setOriginalStream] = useState(null);
  const [processedStream, setProcessedStream] = useState(null);
  const [isSpeakerTestPlaying, setIsSpeakerTestPlaying] = useState(false);
  const [backgroundSettings, setBackgroundSettings] = useState({ mode: BACKGROUND_MODES.NONE, customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL });
  const [backgroundState, setBackgroundState] = useState({ status: BACKGROUND_STATUS.IDLE, error: null });
  const [savedBackgrounds, setSavedBackgrounds] = useState([]);
  const [isBackgroundModalOpen, setIsBackgroundModalOpen] = useState(false);
  const [areCanvasesReady, setAreCanvasesReady] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const isLoading = mediaState.status === 'initializing';

const cleanupResources = useCallback(() => {
      logger.info(`[${componentId}] Cleaning up all media resources.`);
      if (backgroundProcessorRef.current) {
        backgroundProcessorRef.current.cleanup();
        backgroundProcessorRef.current = null;
      }
      if (speakerAudioRef.current) {
        speakerAudioRef.current.pause();
        speakerAudioRef.current = null;
      }
      originalStream?.getTracks().forEach(track => track.stop());
      processedStream?.getTracks().forEach(track => track.stop());
  }, [componentId, originalStream, processedStream]);

  const updateStream = useCallback(async (videoDeviceId, audioDeviceId) => {
    logger.info(`[${componentId}] Updating stream for devices`, { videoDeviceId, audioDeviceId });
    
    setIsVideoReady(false);

    const useVideo = videoDeviceId && videoDeviceId !== NO_DEVICE_PLACEHOLDER;
    const useAudio = audioDeviceId && audioDeviceId !== NO_DEVICE_PLACEHOLDER;

    const constraints = {
      video: useVideo ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      audio: useAudio ? { deviceId: { exact: audioDeviceId } } : false,
    };

    const cleanupAndSetStream = (newStream) => {
      setOriginalStream(oldStream => {
        oldStream?.getTracks().forEach(track => track.stop());
        return newStream;
      });
      setProcessedStream(oldStream => {
        oldStream?.getTracks().forEach(track => track.stop());
        return null;
      });
    };

    if (!constraints.video && !constraints.audio) {
      logger.warn(`[${componentId}] No devices selected, stopping streams.`);
      cleanupAndSetStream(null);
      return;
    }
    
    try {
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      logger.info(`[${componentId}] Successfully acquired new media stream`, { streamId: newStream.id });
      cleanupAndSetStream(newStream);
    } catch (err) {
      logger.error(`[${componentId}] Failed to get media devices`, { error: err.message });
      if (process.env.NODE_ENV === 'development') {
          logger.warn(`[${componentId}] DEV: Real device access failed (${err.name}). Using placeholder.`);
          toast.info('DEV: Using placeholder stream.');
          const newStream = createPlaceholderStream();
          cleanupAndSetStream(newStream);
      } else {
          toast.error(t('deviceCheck.error', { message: err.message }));
          dispatch({ type: 'INITIALIZATION_ERROR', payload: { error: err.message } });
      }
    }
  }, [t, componentId]);

  // Main effect for initialization, runs only once.
    useEffect(() => {
    logger.info(`[${componentId}] Component mounted. Initializing devices.`);
    const initializeDevices = async () => {
      dispatch({ type: 'INITIALIZE_START' });
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then(stream => stream.getTracks().forEach(track => track.stop()));
      } catch (err) {
        logger.warn(`[${componentId}] Initial permission prompt failed or was denied. Will proceed with enumeration.`, { error: err.message });
      }
       const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput' && d.deviceId);
      const audioDevices = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
      dispatch({ type: 'DEVICES_PARTIAL_SUCCESS', payload: { videoDevices, audioDevices, hasVideo: videoDevices.length > 0, error: null } });
    };

    initializeDevices();
  }, []);

  // Effect to update stream when user changes device selection.
useEffect(() => {
    if (mediaState.status === 'ready' && (mediaState.selectedVideoDevice || mediaState.selectedAudioDevice)) {
        updateStream(mediaState.selectedVideoDevice, mediaState.selectedAudioDevice);
    }
  }, [mediaState.selectedVideoDevice, mediaState.selectedAudioDevice, mediaState.status, updateStream]);

  // Correctly assign stream to video elements using refs
useEffect(() => {
    if (originalStream && videoRef.current) {
        videoRef.current.srcObject = originalStream;
    }
  }, [originalStream]);
  

  
  useEffect(() => {
    const hiddenCanvas = hiddenCanvasRef.current;
    const outputCanvas = outputCanvasRef.current;
    if (hiddenCanvas && outputCanvas) {
      hiddenCanvas.width = 1280; hiddenCanvas.height = 720;
      outputCanvas.width = 1280; outputCanvas.height = 720;
      setAreCanvasesReady(true);
      logger.info(`[${componentId}] Canvases initialized.`);
    }
  }, []);

  // Fetch saved backgrounds
  useEffect(() => {
    axios.get('/api/users/backgrounds', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } })
      .then(res => setSavedBackgrounds(res.data.backgrounds || []))
      .catch(err => {
        logger.error(`[${componentId}] Failed to fetch saved backgrounds`, { error: err.message });
        toast.error(t('deviceCheck.fetchError'));
      });
  }, [t, componentId]);

useEffect(() => {
    if (!areCanvasesReady || !isVideoReady || !originalStream) {
      return;
    }
    
    let effect;
    const initialize = async () => {
      logger.info(`[${componentId}] Initializing background effect processor.`);
      try {
        effect = await setupBackgroundEffect({
          videoElement: videoRef.current,
          hiddenCanvas: hiddenCanvasRef.current,
          outputCanvas: outputCanvasRef.current,
          stream: originalStream,
          backgroundSettings,
          onStatusChange: setBackgroundState,
          onStreamChange: setProcessedStream,
        });
        backgroundProcessorRef.current = effect.processor;
      } catch (error) {
        logger.error(`[${componentId}] Failed to initialize background processor`, { error: error.message });
        setBackgroundState({ status: BACKGROUND_STATUS.ERROR, error: t('deviceCheck.errorInitializing') });
      }
    };
    initialize();
    
    return () => {
        logger.info(`[${componentId}] Cleaning up background effect in useEffect.`);
        effect?.cleanup();
    };
  }, [areCanvasesReady, isVideoReady, originalStream, backgroundSettings, t, componentId]);

  // Toggle video/audio tracks
  useEffect(() => {
    const stream = backgroundSettings.mode === BACKGROUND_MODES.NONE ? originalStream : processedStream;
    if(stream) {
      stream.getVideoTracks().forEach(track => (track.enabled = mediaState.isVideoEnabled));
    }
  }, [mediaState.isVideoEnabled, originalStream, processedStream, backgroundSettings.mode]);

  useEffect(() => {
    const stream = backgroundSettings.mode === BACKGROUND_MODES.NONE ? originalStream : processedStream;
    if(stream) {
        stream.getAudioTracks().forEach(track => (track.enabled = mediaState.isAudioEnabled));
    }
  }, [mediaState.isAudioEnabled, originalStream, processedStream, backgroundSettings.mode]);

  const handleDeviceChange = (type, deviceId) => dispatch({ type: 'SELECT_DEVICE', payload: { type, deviceId } });
  const toggleVideo = () => dispatch({ type: 'TOGGLE_VIDEO' });
  const toggleAudio = () => dispatch({ type: 'TOGGLE_AUDIO' });
    const handleBackgroundChange = (mode) => {
    if (mode === backgroundSettings.mode) return;
    if (mode === BACKGROUND_MODES.CUSTOM) setIsBackgroundModalOpen(true);
    else {
      setBackgroundSettings({ mode, customBackground: null, blurLevel: mode === BACKGROUND_MODES.BLUR ? backgroundSettings.blurLevel : DEFAULT_BLUR_LEVEL });
      setIsBackgroundModalOpen(false);
    }
  };
  const handleSelectCustomBackground = (backgroundUrl) => {
    setBackgroundSettings({ mode: BACKGROUND_MODES.CUSTOM, customBackground: backgroundUrl, blurLevel: DEFAULT_BLUR_LEVEL });
    setBackgroundState({ status: BACKGROUND_STATUS.LOADING, error: null });
    setIsBackgroundModalOpen(false);
  };
  
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) return toast.error(t('deviceCheck.invalidFileType'));
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return toast.error(t('deviceCheck.fileTooLarge', { maxSize: MAX_FILE_SIZE_MB }));
    setBackgroundState({ status: BACKGROUND_STATUS.LOADING, error: null });
    try {
      const compressedImage = await compressImage(file);
      const blob = await (await fetch(compressedImage)).blob();
      const formData = new FormData();
      formData.append('file', blob, file.name);
      const { data } = await axios.post('/api/users/background', formData, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'multipart/form-data' },
      });
      setSavedBackgrounds(prev => [...prev, data.background]);
      handleSelectCustomBackground(data.background.url);
      toast.success(t('deviceCheck.uploadSuccess'));
    } catch (error) {
      logger.error(`[${componentId}] Failed to upload background`, { error: error.message });
      toast.error(t('deviceCheck.uploadError'));
    } finally { e.target.value = ''; }
  };
 const handleDeleteBackground = async (publicId) => {
    try {
      await axios.delete('/api/users/background', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }, data: { publicId } });
      setSavedBackgrounds(prev => prev.filter(bg => bg.publicId !== publicId));
      if (backgroundSettings.customBackground === savedBackgrounds.find(bg => bg.publicId === publicId)?.url) {
        setBackgroundSettings({ mode: BACKGROUND_MODES.NONE, customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL });
      }
      toast.success(t('deviceCheck.deleteSuccess'));
    } catch (error) {
      logger.error(`[${componentId}] Failed to delete background`, { error: error.message });
      toast.error(t('deviceCheck.deleteError'));
    }
  };

  const testSpeaker = () => {
    if (isSpeakerTestPlaying) {
      speakerAudioRef.current?.pause();
      setIsSpeakerTestPlaying(false);
      return;
    }
    const audio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3');
    speakerAudioRef.current = audio;
    setIsSpeakerTestPlaying(true);
    audio.play().catch(err => {
      logger.error(`[${componentId}] Speaker test error`, { error: err.message });
      toast.error(t('deviceCheck.speakerError', { message: err.message }));
      setIsSpeakerTestPlaying(false);
    });
    audio.onended = () => setIsSpeakerTestPlaying(false);
  };
  
const handleJoin = () => {
      const streamToUse = (backgroundSettings.mode !== BACKGROUND_MODES.NONE && processedStream) ? processedStream : originalStream;
      
      if (!streamToUse && !originalStream) {
        toast.error(t('deviceCheck.noValidStream'));
        return;
      }

      const config = { 
        stream: streamToUse || originalStream,
        videoDeviceId: mediaState.selectedVideoDevice, 
        audioDeviceId: mediaState.selectedAudioDevice, 
        backgroundSettings,
        videoDevices: mediaState.videoDevices,
        audioDevices: mediaState.audioDevices,
      };
      
      onReady(config);
  };
  
  const getBackgroundStatusText = () => {
    switch (backgroundState.status) {
      case BACKGROUND_STATUS.LOADING: return t('deviceCheck.loading');
      case BACKGROUND_STATUS.APPLYING: return t('deviceCheck.applying');
      case BACKGROUND_STATUS.ERROR: return backgroundState.error || t('deviceCheck.errorStatus');
      default: return null;
    }
  };

const handleUsePlaceholder = () => {
    if (process.env.NODE_ENV !== 'development') return;

    logger.info(`[${componentId}] DEV: Manually creating placeholder stream.`);
    toast.info('DEV: Using placeholder stream.');

    originalStream?.getTracks().forEach(track => track.stop());
    processedStream?.getTracks().forEach(track => track.stop());

    const placeholder = createPlaceholderStream();
    setOriginalStream(placeholder);
    setProcessedStream(null);

    dispatch({
      type: 'DEVICES_PARTIAL_SUCCESS',
      payload: {
        videoDevices: [],
        audioDevices: [],
        hasVideo: true,
        error: null
      }
    });
  };

  return (
    // The JSX from the previous step is correct, no changes needed there.
    // I am including it here for completeness.
    <>
      <Card className="max-w-xl w-full">
        <CardHeader>
          <CardTitle>{t('deviceCheck.title')}</CardTitle>
          <CardDescription>{t('deviceCheck.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="relative aspect-video w-full bg-black rounded-lg flex items-center justify-center text-muted-foreground">
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className={`w-full h-full object-cover rounded-lg ${!mediaState.isVideoEnabled && 'hidden'}`} 
              onCanPlay={() => setIsVideoReady(true)} 
            />
            <canvas ref={hiddenCanvasRef} className="hidden" />
            <canvas 
              ref={outputCanvasRef} 
              className={backgroundSettings.mode !== BACKGROUND_MODES.NONE ? "absolute inset-0 w-full h-full object-cover rounded-lg" : "hidden"} 
            />
            
            {!mediaState.isVideoEnabled && <div className="absolute inset-0 flex items-center justify-center"><VideoOff className="w-16 h-16 text-muted-foreground/50"/></div>}

            {(isLoading || backgroundState.status === BACKGROUND_STATUS.LOADING) && <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg"><Loader2 className="w-8 h-8 animate-spin text-white" /></div>}
            {mediaState.error && <p className="absolute inset-0 flex items-center justify-center text-destructive p-4 text-center bg-black/50 rounded-lg">{mediaState.error}</p>}
            
            {getBackgroundStatusText() && (
              <Badge variant="secondary" className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white">
                {getBackgroundStatusText()}
              </Badge>
            )}

            <div className="absolute top-2 right-2 flex gap-2">
                <Button onClick={toggleVideo} variant={mediaState.isVideoEnabled ? 'default' : 'secondary'} size="icon" disabled={!mediaState.hasVideoDevice} aria-label={mediaState.isVideoEnabled ? t('deviceCheck.disableVideo') : t('deviceCheck.enableVideo')}>
                  {mediaState.isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </Button>
                <Button onClick={toggleAudio} variant={mediaState.isAudioEnabled ? 'default' : 'secondary'} size="icon" aria-label={mediaState.isAudioEnabled ? t('deviceCheck.muteAudio') : t('deviceCheck.unmuteAudio')}>
                  {mediaState.isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select value={mediaState.selectedVideoDevice} onValueChange={(id) => handleDeviceChange('video', id)} disabled={isLoading || !mediaState.hasVideoDevice}>
              <SelectTrigger aria-label={t('deviceCheck.selectVideoDevice')}><Video size={16} className="mr-2" />{t('deviceCheck.camera')}</SelectTrigger>
              <SelectContent>
                {mediaState.videoDevices.length === 0 ? <SelectItem value="none" disabled>{t('deviceCheck.noVideoDevices')}</SelectItem> : mediaState.videoDevices.map(d => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 8)}`}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={mediaState.selectedAudioDevice} onValueChange={(id) => handleDeviceChange('audio', id)} disabled={isLoading}>
              <SelectTrigger aria-label={t('deviceCheck.selectAudioDevice')}><Mic size={16} className="mr-2" />{t('deviceCheck.microphone')}</SelectTrigger>
              <SelectContent>
                {mediaState.audioDevices.length === 0 ? <SelectItem value="none" disabled>{t('deviceCheck.noAudioDevices')}</SelectItem> : mediaState.audioDevices.map(d => <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 8)}`}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={backgroundSettings.mode} onValueChange={handleBackgroundChange} disabled={!mediaState.hasVideoDevice || backgroundState.status === BACKGROUND_STATUS.LOADING}>
              <SelectTrigger aria-label={t('deviceCheck.backgroundSettings')}><ImageIcon size={16} className="mr-2"/>Hintergrund</SelectTrigger>
              <SelectContent>
                  <SelectItem value={BACKGROUND_MODES.NONE}>{t('deviceCheck.noBackground')}</SelectItem>
                  <SelectItem value={BACKGROUND_MODES.BLUR}>{t('deviceCheck.blur')}</SelectItem>
                  <SelectItem value={BACKGROUND_MODES.CUSTOM}>{t('deviceCheck.customBackground')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {backgroundSettings.mode === BACKGROUND_MODES.BLUR && (
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">{t('deviceCheck.blurLevel')}</label>
              <Slider defaultValue={[backgroundSettings.blurLevel]} max={20} min={5} step={1} onValueChange={(value) => setBackgroundSettings(prev => ({ ...prev, blurLevel: value[0] }))} />
            </div>
          )}

          <div className="flex items-center gap-4">
            <MicLevelIndicator stream={originalStream} />
            <Button onClick={testSpeaker} variant="outline" size="sm" aria-label={t('deviceCheck.testSpeaker')}>
              {isSpeakerTestPlaying ? <StopCircle size={14} className="mr-1.5" /> : <Volume2 size={14} className="mr-1.5" />}
              {isSpeakerTestPlaying ? t('deviceCheck.stopTest') : t('deviceCheck.test')}
            </Button>
          </div>

           {process.env.NODE_ENV === 'development' && (
            <Button onClick={handleUsePlaceholder} variant="outline" className="w-full">
              Use Placeholder Stream (DEV)
            </Button>
          )}

          <Button onClick={handleJoin} disabled={isLoading || !!mediaState.error} size="lg" className="w-full">
            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {t('deviceCheck.joinSession')}
          </Button>
        </CardContent>
      </Card>
      
      <Dialog open={isBackgroundModalOpen} onOpenChange={setIsBackgroundModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{t('deviceCheck.manageBackgrounds')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-64 overflow-y-auto p-1">
            {savedBackgrounds.map((bg) => (
              <div key={bg.publicId} className="relative group">
                <img src={bg.url} alt={t('deviceCheck.backgroundPreview')} className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80" onClick={() => handleSelectCustomBackground(bg.url)} />
                <Button onClick={() => handleDeleteBackground(bg.publicId)} variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100" aria-label={t('deviceCheck.delete')}>
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter className="sm:justify-between gap-2">
            <Button onClick={() => fileInputRef.current.click()} disabled={backgroundState.status === BACKGROUND_STATUS.LOADING}>
              <Upload size={16} className="mr-2" /> {t('deviceCheck.uploadNew')}
            </Button>
            <Button onClick={() => setIsBackgroundModalOpen(false)} variant="secondary">{t('deviceCheck.close')}</Button>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LiveSessionDeviceCheck;