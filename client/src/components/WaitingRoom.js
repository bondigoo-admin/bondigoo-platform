import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Clock, AlertCircle, Video, VideoOff, Mic, MicOff, Volume2, Copy, 
  Image as ImageIcon, StopCircle, Trash2, Upload, Loader2 
} from 'lucide-react';
import { toast } from 'react-toastify';
import { logger } from '../utils/logger';
import { createPlaceholderStream } from '../utils/mediaUtils';
import axios from 'axios';

// Import ShadCN/UI Components
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Input } from './ui/input.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Slider } from './ui/slider.tsx';
import { Badge } from './ui/badge.tsx';

// Import from our BackgroundEffectUtility
import {
  BACKGROUND_MODES,
  BACKGROUND_STATUS,
  DEFAULT_BLUR_LEVEL,
  MAX_FILE_SIZE_MB,
  SUPPORTED_IMAGE_TYPES,
  compressImage,
  setupBackgroundEffect,
  checkVideoReady
} from '../utils/BackgroundEffectUtility';

// Reduce logging in production
if (process.env.NODE_ENV === 'production') {
  // Keep these logs at a minimum in production
  const originalInfo = logger.info;
  logger.info = (message, ...args) => {
    // Only log critical info messages
    if (message.includes('error') || 
        message.includes('failed') || 
        message.includes('initialized') || 
        message.includes('loaded')) {
      originalInfo(message, ...args);
    }
  };
}

const mediaInitialState = {
  status: 'initializing',
  error: null,
  videoDevices: [],
  audioDevices: [],
  selectedVideoDevice: '',
  selectedAudioDevice: '',
  isVideoEnabled: true,
  isAudioEnabled: true,
  hasVideoDevice: true,
};

function mediaReducer(state, action) {
  switch (action.type) {
    case 'INITIALIZE_START':
      return { ...state, status: 'initializing' };
    case 'DEVICES_LOADED':
      const { videoDevices, audioDevices } = action.payload;
      const firstVideo = videoDevices[0]?.deviceId || '';
      const firstAudio = audioDevices[0]?.deviceId || '';
      return {
        ...state,
        videoDevices,
        audioDevices,
        selectedVideoDevice: state.selectedVideoDevice || firstVideo,
        selectedAudioDevice: state.selectedAudioDevice || firstAudio,
        hasVideoDevice: videoDevices.length > 0,
        status: 'ready',
      };
    case 'SELECT_DEVICE':
      if (action.payload.type === 'video') {
        return { ...state, selectedVideoDevice: action.payload.deviceId };
      }
      return { ...state, selectedAudioDevice: action.payload.deviceId };
     case 'DEVICES_PARTIAL_SUCCESS':
      const { videoDevices: vDevs, audioDevices: aDevs, hasVideo, error } = action.payload;
      const firstVid = vDevs[0]?.deviceId || '';
      const firstAud = aDevs[0]?.deviceId || '';
      return {
        ...state,
        videoDevices: vDevs,
        audioDevices: aDevs,
        selectedVideoDevice: state.selectedVideoDevice || firstVid,
        selectedAudioDevice: state.selectedAudioDevice || firstAud,
        hasVideoDevice: hasVideo,
        status: 'ready',
        error: error,
      };
    case 'INITIALIZATION_ERROR':
      return { ...state, status: 'error', error: action.payload.error };
    case 'TOGGLE_VIDEO':
      return { ...state, isVideoEnabled: !state.isVideoEnabled };
    case 'TOGGLE_AUDIO':
      return { ...state, isAudioEnabled: !state.isAudioEnabled };
    default:
      return state;
  }
}

const WaitingRoom = ({ sessionStartTime, sessionDetails, onJoin, onStartSession, sessionUrl, isJoinEnabled, isCoach, isLiveSession }) => {
  const { t } = useTranslation();
  const [mediaState, dispatch] = useReducer(mediaReducer, mediaInitialState);

  const videoRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const backgroundProcessorRef = useRef(null);
  
  const [timeLeft, setTimeLeft] = useState('');
  const [stream, setStream] = useState(null);
  const [originalStream, setOriginalStream] = useState(null);
  const [micLevel, setMicLevel] = useState(0);
  const [isAudioTestActive, setIsAudioTestActive] = useState(false);
  const [isSpeakerTestPlaying, setIsSpeakerTestPlaying] = useState(false);
  const [backgroundSettings, setBackgroundSettings] = useState({ 
    mode: BACKGROUND_MODES.NONE, 
    customBackground: null, 
    blurLevel: DEFAULT_BLUR_LEVEL 
  });
  const [backgroundState, setBackgroundState] = useState({ 
    status: BACKGROUND_STATUS.IDLE, 
    error: null 
  });
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [savedBackgrounds, setSavedBackgrounds] = useState([]);
  const [isBackgroundModalOpen, setIsBackgroundModalOpen] = useState(false);
  const [areCanvasesReady, setAreCanvasesReady] = useState(false);
  
  const isLoading = mediaState.status === 'initializing';
  
  // Audio references for device management
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const speakerAudioRef = useRef(null);

  const stableBackgroundSettings = useMemo(() => ({
    mode: backgroundSettings.mode,
    customBackground: backgroundSettings.customBackground,
    blurLevel: backgroundSettings.blurLevel,
  }), [backgroundSettings.mode, backgroundSettings.customBackground, backgroundSettings.blurLevel]);

// Initialize canvas contexts on mount
useEffect(() => {
  const initializeCanvases = () => {
    const hiddenCanvas = hiddenCanvasRef.current;
    const outputCanvas = outputCanvasRef.current;
    if (hiddenCanvas && outputCanvas) {
      try {
        const hiddenContext = hiddenCanvas.getContext('2d', { willReadFrequently: true });
        const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true });
        if (hiddenContext && outputContext) {
          // Use fallback dimensions initially
          const width = 1280; // Default fallback
          const height = 720; // Default fallback
          hiddenCanvas.width = width;
          hiddenCanvas.height = height;
          outputCanvas.width = width;
          outputCanvas.height = height;
          hiddenContext.clearRect(0, 0, width, height);
          outputContext.clearRect(0, 0, width, height);
          setAreCanvasesReady(true);
          logger.info('[WaitingRoom] Canvas contexts initialized', { width, height });
        } else {
          throw new Error('Failed to get canvas contexts');
        }
      } catch (error) {
        logger.error('[WaitingRoom] Failed to initialize canvas contexts', { error: error.message });
        setAreCanvasesReady(false);
      }
    } else {
      logger.warn('[WaitingRoom] Canvas refs not ready during initialization', {
        hiddenCanvas: !!hiddenCanvas,
        outputCanvas: !!outputCanvas,
      });
      setAreCanvasesReady(false);
    }
  };

  initializeCanvases();
}, []);

  // Fetch user's saved backgrounds
  useEffect(() => {
    const fetchSavedBackgrounds = async () => {
      try {
        const response = await axios.get('/api/users/backgrounds', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        });
        setSavedBackgrounds(response.data.backgrounds || []);
      } catch (error) {
        logger.error('[WaitingRoom] Failed to fetch saved backgrounds', { error: error.message });
        if (error.response?.status === 404) {
          logger.info('[WaitingRoom] No user found, initializing empty backgrounds');
          setSavedBackgrounds([]);
        } else {
          toast.error(t('background.fetchError'));
        }
      }
    };
    fetchSavedBackgrounds();
  }, [t]);

  // Monitor video readiness
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !originalStream || !hiddenCanvasRef.current || !outputCanvasRef.current) {
      logger.warn('[WaitingRoom] Required elements not ready for video monitoring', {
        videoRef: !!videoElement,
        originalStream: !!originalStream,
        hiddenCanvas: !!hiddenCanvasRef.current,
        outputCanvas: !!outputCanvasRef.current,
      });
      return;
    }
  
    videoElement.srcObject = originalStream;
  
    const handleLoadedMetadata = () => {
      if (!videoRef.current) {
        logger.warn('[WaitingRoom] videoRef.current is null in onloadedmetadata handler');
        return;
      }
      const width = videoRef.current.videoWidth || 1280;
      const height = videoRef.current.videoHeight || 720;
      if (hiddenCanvasRef.current && outputCanvasRef.current) {
        hiddenCanvasRef.current.width = width;
        hiddenCanvasRef.current.height = height;
        outputCanvasRef.current.width = width;
        outputCanvasRef.current.height = height;
        logger.info('[WaitingRoom] Canvas dimensions synchronized with video', { width, height });
      }
      videoRef.current.play().catch((err) => logger.error('[WaitingRoom] Video play error:', { error: err.message }));
    };
  
    videoElement.onloadedmetadata = handleLoadedMetadata;
  
    videoElement.play().catch((err) => logger.error('[WaitingRoom] Initial video play error:', { error: err.message }));
  
    return () => {
      if (videoElement) {
        videoElement.onloadedmetadata = null;
        logger.info('[WaitingRoom] Cleaned up onloadedmetadata handler');
      }
    };
  }, [originalStream]);

  useEffect(() => {
    if (backgroundProcessorRef.current && isVideoReady) {
      backgroundProcessorRef.current.updateSettings(backgroundSettings).catch((err) => {
        logger.error('[WaitingRoom] Failed to update background settings', {
          error: err.message,
        });
      });
    }
  }, [backgroundSettings, isVideoReady]);

const getCoachDisplayName = useCallback(() => {
    return sessionDetails?.coach?.name || t('session.loading');
  }, [sessionDetails, t]);

    const updateStream = useCallback(async (videoDeviceId, audioDeviceId) => {
    try {
      if (backgroundProcessorRef.current) {
        backgroundProcessorRef.current.cleanup();
        backgroundProcessorRef.current = null;
      }
      
      stream?.getTracks().forEach(track => track.stop());
      originalStream?.getTracks().forEach(track => track.stop());
      
      setStream(null);
      setOriginalStream(null);
      setIsVideoReady(false);
      setBackgroundState({ status: BACKGROUND_STATUS.IDLE, error: null });
      
      const constraints = {
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : false,
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      };
      
      if (!constraints.audio && !constraints.video) return;

      let newStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
        logger.info('[WaitingRoom] Stream initialized', { streamId: newStream.id });
      } catch (err) {
        if (process.env.NODE_ENV === 'development' && (err.name === 'NotAllowedError' || err.name === 'NotFoundError' || err.name === 'NotReadableError')) {
            logger.warn(`[WaitingRoom DEV] Real device access failed or denied (${err.name}). Providing placeholder stream.`);
            toast.info('DEV: Using placeholder stream.');
            newStream = createPlaceholderStream();
        } else {
            logger.error('[WaitingRoom] Stream update error', { error: err.message });
            toast.error(t('deviceCheck.error', { message: err.message }));
            dispatch({ type: 'INITIALIZATION_ERROR', payload: { error: err.message } });
            return;
        }
      }

      setOriginalStream(newStream);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(err => logger.error('[WaitingRoom] Video play failed', { error: err.message }));
      }
      if (backgroundSettings.mode === BACKGROUND_MODES.NONE) {
        setStream(newStream);
      }
      setupAudioAnalysis(newStream);
      } catch (err) {
        logger.error('[WaitingRoom] Unhandled error during stream update process', { error: err.message });
        toast.error(t('deviceCheck.error', { message: err.message }));
        dispatch({ type: 'INITIALIZATION_ERROR', payload: { error: err.message } });
      }
      }, [backgroundSettings.mode, t]);

useEffect(() => {
    const initializeDevices = async () => {
      dispatch({ type: 'INITIALIZE_START' });
      let videoStream;
      let audioStream;
      let finalVideoStreamTracks = [];
      let finalAudioStreamTracks = [];
      let initializationError = null;
      let permissionDenied = false;

      try {
        logger.info('[WaitingRoom] Attempting to acquire video stream.');
        videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        finalVideoStreamTracks = videoStream.getTracks();
        logger.info('[WaitingRoom] Video stream acquired successfully.');
      } catch (err) {
        logger.warn('[WaitingRoom] Could not acquire video stream.', { error: err.message, name: err.name });
        if (err.name === 'NotAllowedError') permissionDenied = true;
        initializationError = "Video device unavailable or in use. You can proceed with audio only.";
        toast.warn(t('deviceCheck.videoError', 'Video device unavailable.'));
      }

      try {
        logger.info('[WaitingRoom] Attempting to acquire audio stream.');
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        finalAudioStreamTracks = audioStream.getTracks();
        logger.info('[WaitingRoom] Audio stream acquired successfully.');
      } catch (err) {
        logger.warn('[WaitingRoom] Could not acquire audio stream.', { error: err.message, name: err.name });
        if (err.name === 'NotAllowedError') permissionDenied = true;
        if (!initializationError) {
            initializationError = "Audio device unavailable or in use. You may need to join without a microphone.";
        }
        toast.warn(t('deviceCheck.audioError', 'Audio device unavailable.'));
      }
      
      finalVideoStreamTracks.forEach(track => track.stop());
      finalAudioStreamTracks.forEach(track => track.stop());

      if (finalVideoStreamTracks.length === 0 && finalAudioStreamTracks.length === 0) {
        if (process.env.NODE_ENV === 'development' && permissionDenied) {
            logger.warn('[WaitingRoom DEV] Permission denied by user. Creating a placeholder stream to continue.');
            toast.info('DEV: Using placeholder stream.');
            const placeholder = createPlaceholderStream();
            setOriginalStream(placeholder);
            setStream(placeholder);
            dispatch({
                type: 'DEVICES_LOADED',
                payload: { videoDevices: [], audioDevices: [] }
            });
            return;
        }

        const finalError = "Could not access any camera or microphone. Please check permissions and ensure devices are not in use by another app.";
        logger.error('[WaitingRoom] Device setup failed completely.', { error: finalError });
        toast.error(t('deviceCheck.noDevices', finalError));
        dispatch({ type: 'INITIALIZATION_ERROR', payload: { error: finalError } });
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      const audioDevices = devices.filter(d => d.kind === 'audioinput');

      dispatch({ 
          type: 'DEVICES_PARTIAL_SUCCESS', 
          payload: { 
              videoDevices, 
              audioDevices,
              hasVideo: finalVideoStreamTracks.length > 0,
              error: initializationError
          } 
      });
    };
    initializeDevices();
    
    return () => {
      cleanupResources();
    };
  }, []);

  useEffect(() => {
    let interval = null;
    if (isLiveSession) {
      setTimeLeft(t('session.readyToStart', 'Ready to Start'));
    } else if (sessionStartTime) {
      const updateTimer = () => {
        const now = new Date();
        const start = new Date(sessionStartTime);
        const diff = start - now;
        if (diff > 0) {
          const minutes = Math.floor(diff / 60000);
          const seconds = Math.floor((diff % 60000) / 1000);
          setTimeLeft(`${t('session.startsIn')} ${minutes}:${seconds.toString().padStart(2, '0')}`);
        } else if (diff > -300000) {
          setTimeLeft(t('session.startedRecently'));
        } else {
          setTimeLeft(t('session.startedLate'));
        }
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionStartTime, isLiveSession, t]);

  useEffect(() => {
    if (mediaState.status === 'ready' && (mediaState.selectedVideoDevice || mediaState.selectedAudioDevice)) {
        updateStream(mediaState.selectedVideoDevice, mediaState.selectedAudioDevice);
    }
  }, [mediaState.selectedVideoDevice, mediaState.selectedAudioDevice, mediaState.status, updateStream]);

  useEffect(() => {
    const currentStream = backgroundSettings.mode === BACKGROUND_MODES.NONE ? originalStream : stream;
    if (currentStream) {
        currentStream.getVideoTracks().forEach(track => (track.enabled = mediaState.isVideoEnabled));
    }
  }, [mediaState.isVideoEnabled, stream, originalStream, backgroundSettings.mode]);

  useEffect(() => {
    const currentStream = backgroundSettings.mode === BACKGROUND_MODES.NONE ? originalStream : stream;
    if (currentStream) {
        currentStream.getAudioTracks().forEach(track => (track.enabled = mediaState.isAudioEnabled));
    }
  }, [mediaState.isAudioEnabled, stream, originalStream, backgroundSettings.mode]);

  // Clean up resources when component unmounts
  const cleanupResources = useCallback(() => {
    // Clean up background processor
    if (backgroundProcessorRef.current) {
      backgroundProcessorRef.current.cleanup();
      backgroundProcessorRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Stop speaker test
    if (speakerAudioRef.current) {
      speakerAudioRef.current.pause();
      speakerAudioRef.current.src = ''; 
      speakerAudioRef.current = null;
    }
  }, []);

  // Initialize background effect once resources are ready
  useEffect(() => {
    const initializeBackgroundEffect = async () => {
      if (
        !areCanvasesReady ||
        !isVideoReady ||
        !originalStream ||
        !videoRef.current ||
        !hiddenCanvasRef.current ||
        !outputCanvasRef.current
      ) {
        return;
      }
  
      try {
        const backgroundEffect = await setupBackgroundEffect({
          videoElement: videoRef.current,
          hiddenCanvas: hiddenCanvasRef.current,
          outputCanvas: outputCanvasRef.current,
          stream: originalStream,
          backgroundSettings,
          onStatusChange: (status) => setBackgroundState(status),
          onStreamChange: (newStream) => setStream(newStream),
        });
        backgroundProcessorRef.current = backgroundEffect.processor;
        logger.info('[WaitingRoom] Background processor initialized', {
          mode: backgroundSettings.mode,
        });
  
        // Clean up on unmount or dependency change
        return () => {
          if (backgroundProcessorRef.current) {
            backgroundProcessorRef.current.dispose(); // Terminate the worker
            backgroundProcessorRef.current = null;
            logger.info('[WaitingRoom] Background processor disposed');
          }
        };
      } catch (error) {
        logger.error('[WaitingRoom] Failed to initialize background processor', {
          error: error.message,
        });
        setBackgroundState({
          status: BACKGROUND_STATUS.ERROR,
          error: t('background.errorInitializing'),
        });
      }
    };
  
    initializeBackgroundEffect();
  }, [areCanvasesReady, isVideoReady, originalStream, t]);

  // Set up audio analysis for microphone level meter
  const setupAudioAnalysis = (mediaStream) => {
    // Close any existing audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    
    // Create new audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // Connect source to analyser
    source.connect(analyser);
    
    // Configure analyser
    analyser.fftSize = 256;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    setIsAudioTestActive(true);
    
    // Start animation for mic level visualization
    let animationFrameId = null;
    let lastUpdateTime = 0;
    
    const updateMicLevel = () => {
      if (!mediaStream.active) return;
      
      // Throttle updates for performance
      const now = performance.now();
      if (now - lastUpdateTime < 100) { // Update ~10 times per second
        animationFrameId = requestAnimationFrame(updateMicLevel);
        return;
      }
      
      lastUpdateTime = now;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume level
      const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
      setMicLevel(average / 255);
      
      animationFrameId = requestAnimationFrame(updateMicLevel);
    };
    
    updateMicLevel();
    
    // Return cleanup function
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  };

  // Handle background mode change
  const handleBackgroundChange = (mode) => {
    if (mode === backgroundSettings.mode) return;
  
    if (mode === BACKGROUND_MODES.CUSTOM) {
      setIsBackgroundModalOpen(true);
    } else {
      const newSettings = { 
        mode, 
        customBackground: null, 
        blurLevel: mode === BACKGROUND_MODES.BLUR ? backgroundSettings.blurLevel : DEFAULT_BLUR_LEVEL 
      };
      setBackgroundSettings(newSettings);
      
      setIsBackgroundModalOpen(false);
    }
  };

  // Handle custom background selection
  const handleSelectCustomBackground = (backgroundUrl) => {
    const newSettings = {
      mode: BACKGROUND_MODES.CUSTOM,
      customBackground: backgroundUrl,
      blurLevel: DEFAULT_BLUR_LEVEL,
    };
    
    setBackgroundSettings(newSettings);
    setBackgroundState({ status: BACKGROUND_STATUS.LOADING, error: null });
    setIsBackgroundModalOpen(false);
  };

  // Handle file upload for custom background
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast.error(t('background.invalidFileType'));
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(t('background.fileTooLarge', { maxSize: MAX_FILE_SIZE_MB }));
      return;
    }
  
    setBackgroundState({ status: BACKGROUND_STATUS.LOADING, error: null });
  
    try {
      const compressedImage = await compressImage(file);
      const blob = await (await fetch(compressedImage)).blob();
      const formData = new FormData();
      formData.append('file', blob, file.name);
      const response = await axios.post('/api/users/background', formData, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data',
        },
      });
  
      const { background } = response.data;
      setSavedBackgrounds(prev => [...prev, background]);
      handleSelectCustomBackground(background.url);
      toast.success(t('background.uploadSuccess'));
    } catch (error) {
      logger.error('[WaitingRoom] Failed to upload background', { error: error.message });
      toast.error(t('background.uploadError'));
    } finally {
        e.target.value = ''; // Reset file input
    }
  };

  // Delete a saved background
  const handleDeleteBackground = async (publicId) => {
    try {
      await axios.delete('/api/users/background', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        data: { publicId },
      });
      
      setSavedBackgrounds(prev => prev.filter(bg => bg.publicId !== publicId));
      
      if (backgroundSettings.customBackground === savedBackgrounds.find(bg => bg.publicId === publicId)?.url) {
        setBackgroundSettings({ mode: BACKGROUND_MODES.NONE, customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL });
      }
      
      toast.success(t('background.deleteSuccess'));
    } catch (error) {
      logger.error('[WaitingRoom] Failed to delete background', { error: error.message });
      toast.error(t('background.deleteError'));
    }
  };

  // Handle join session
  const handleJoin = () => {
    logger.info('[WaitingRoom] handleJoin clicked.');

    if (!isJoinEnabled) {
      toast.error(t('deviceCheck.joinDisabled'));
      logger.warn('[WaitingRoom] Join attempt aborted: Join button is not enabled.', { isJoinEnabled });
      return;
    }
    
    logger.info('[WaitingRoom] Join is enabled. Proceeding with stream validation.');
  
    let streamToUse = stream;
    logger.info('[WaitingRoom] Initially selecting processed stream for joining.', {
      streamId: streamToUse?.id,
      streamActive: streamToUse?.active,
      liveTracks: streamToUse?.getTracks().filter(t => t.readyState === 'live').length,
    });
    
    const isStreamInvalid = !streamToUse || !streamToUse.getTracks().some(track => track.readyState === 'live');
    if (isStreamInvalid) {
      logger.warn('[WaitingRoom] Processed stream is invalid or has no live tracks. Attempting to fall back to original stream.', {
        processedStreamExists: !!stream,
        processedStreamId: stream?.id,
        processedStreamTracks: stream?.getTracks().map(t => ({ id: t.id, kind: t.kind, readyState: t.readyState, enabled: t.enabled })),
      });
      
      const isOriginalStreamValid = originalStream && originalStream.getTracks().some(track => track.readyState === 'live');
      if (isOriginalStreamValid) {
        streamToUse = originalStream;
        logger.info('[WaitingRoom] Fallback successful. Using original stream.', {
            streamId: originalStream.id,
            streamActive: originalStream.active,
            liveTracks: originalStream.getTracks().filter(t => t.readyState === 'live').length,
            tracks: originalStream.getTracks().map(t => ({ id: t.id, kind: t.kind, readyState: t.readyState, enabled: t.enabled }))
        });
      } else {
        logger.error('[WaitingRoom] Fallback failed. No valid stream available for joining session.', {
            originalStreamExists: !!originalStream,
            originalStreamId: originalStream?.id,
            originalStreamTracks: originalStream?.getTracks().map(t => ({ id: t.id, kind: t.kind, readyState: t.readyState, enabled: t.enabled })),
        });
        toast.error(t('deviceCheck.noValidStream', 'No valid media stream available'));
        return;
      }
    } else {
        logger.info('[WaitingRoom] Processed stream is valid and will be used.', {
            streamId: streamToUse.id,
            tracks: streamToUse.getTracks().map(t => ({ id: t.id, kind: t.kind, readyState: t.readyState, enabled: t.enabled }))
        });
    }
    
    const config = { 
      video: mediaState.hasVideoDevice && mediaState.isVideoEnabled, 
      audio: mediaState.isAudioEnabled,
      videoDeviceId: mediaState.selectedVideoDevice,
      audioDeviceId: mediaState.selectedAudioDevice,
      backgroundSettings,
      stream: streamToUse,
    };
  
    logger.info('[WaitingRoom] Final configuration before joining.', {
        config: {
          video: config.video,
          audio: config.audio,
          videoDeviceId: config.videoDeviceId,
          audioDeviceId: config.audioDeviceId,
          backgroundMode: config.backgroundSettings.mode,
          streamId: config.stream?.id,
          streamVideoTracks: config.stream?.getVideoTracks().length,
          streamAudioTracks: config.stream?.getAudioTracks().length
        }
    });

    try {
        logger.info('[WaitingRoom] Calling onJoin callback.');
        onJoin(config);
        logger.info('[WaitingRoom] onJoin callback executed successfully.');
    } catch (error) {
        logger.error('[WaitingRoom] An error occurred during the onJoin callback execution.', {
            error: error.message,
            stack: error.stack,
        });
        toast.error(t('deviceCheck.joinError', 'An unexpected error occurred while joining.'));
    }
  };

  const toggleVideo = useCallback(() => dispatch({ type: 'TOGGLE_VIDEO' }), []);
  const toggleAudio = useCallback(() => dispatch({ type: 'TOGGLE_AUDIO' }), []);

  // Test speaker
  const testSpeaker = () => {
    const audio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3');
    speakerAudioRef.current = audio;
    setIsSpeakerTestPlaying(true);
    
    audio.play().catch(err => {
      logger.error('[WaitingRoom] Speaker test error', { error: err.message });
      toast.error(t('deviceCheck.speakerError', { message: err.message }));
      setIsSpeakerTestPlaying(false);
    });
  };

  const stopSpeakerTest = () => {
    if (speakerAudioRef.current) {
      speakerAudioRef.current.pause();
      speakerAudioRef.current = null;
      setIsSpeakerTestPlaying(false);
      toast.success(t('deviceCheck.speakerTestStopped'));
    }
  };

  const handleBlurLevelChange = (value) => {
    setBackgroundSettings(prev => ({ ...prev, blurLevel: value[0] }));
  };

  const getBackgroundStatusText = () => {
    switch (backgroundState.status) {
      case BACKGROUND_STATUS.LOADING: return t('background.loading', 'Loading...');
      case BACKGROUND_STATUS.APPLYING: return t('background.applying', 'Applying...');
      case BACKGROUND_STATUS.ERROR: return backgroundState.error || t('background.error', 'Error');
      default: return null;
    }
  };

 const getTranslatedText = (key, fallback) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const formatDeviceLabel = (label = '') => {
    return label.replace(/\s*\([\da-f]{4}:[\da-f]{4}\)\s*$/, '').trim();
  };

  return (
    <Card className="max-w-xl w-full" role="dialog" aria-label={t('session.waitingRoom')}>
      <CardHeader>
        <div className="flex justify-between items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Clock size={24} aria-hidden="true" />
            {t('session.waitingRoom')}
          </CardTitle>
          <span className="text-sm text-muted-foreground text-right">{timeLeft}</span>
        </div>
        {timeLeft.includes('late') && (
          <CardDescription className="text-destructive flex items-center gap-2 pt-2">
            <AlertCircle size={16} aria-hidden="true" /> {t('session.joinLateWarning')}
          </CardDescription>
        )}
      </CardHeader>
      
 <CardContent className="p-4 sm:p-6 space-y-4">
        {!isLiveSession && (
          <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
            <p><span className="font-semibold">{t('deviceCheck.coach', { name: '' })}</span> {getCoachDisplayName()}</p>
            <p><span className="font-semibold">{t('common:date')}:</span> {sessionStartTime ? new Date(sessionStartTime).toLocaleString() : t('session.loading')}</p>
          </div>
        )}
      
        <div className="space-y-4">
          <div className="relative aspect-video w-full bg-black rounded-lg overflow-hidden group">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              aria-label={t('deviceCheck.videoPreview')}
              onLoadedMetadata={() => videoRef.current?.play().catch(err => logger.error('[WaitingRoom] Video play error:', err.message))}
              onCanPlay={() => setIsVideoReady(true)}
            />
            
            <canvas ref={hiddenCanvasRef} className="hidden" />
            <canvas
              ref={outputCanvasRef}
              className={backgroundSettings.mode !== BACKGROUND_MODES.NONE ? "absolute inset-0 w-full h-full object-cover" : "hidden"}
            />
                      
            {(backgroundState.status === BACKGROUND_STATUS.LOADING || backgroundState.status === BACKGROUND_STATUS.APPLYING) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-lg backdrop-blur-sm">
                <Loader2 className="animate-spin h-8 w-8 text-white mb-2" />
                <p className="text-white text-xs">{getBackgroundStatusText()}</p>
              </div>
            )}
            
            {backgroundState.status === BACKGROUND_STATUS.ERROR && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/80 rounded-lg text-destructive-foreground p-2 text-center">
                <p className="text-sm mb-2">{backgroundState.error || getTranslatedText('background.error', 'Error')}</p>
                <Button
                  onClick={() => setBackgroundSettings({ mode: BACKGROUND_MODES.NONE, customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL })}
                  variant="secondary"
                  size="sm"
                >
                  {getTranslatedText('background.tryAgain', 'Try Again')}
                </Button>
              </div>
            )}
            
            <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
              <Button
                onClick={toggleVideo}
                variant="secondary"
                size="icon"
                className="bg-black/50 hover:bg-black/70 text-white rounded-full h-9 w-9"
                disabled={!mediaState.hasVideoDevice}
                aria-label={mediaState.isVideoEnabled ? t('deviceCheck.disableVideo') : t('deviceCheck.enableVideo')}
              >
                {mediaState.isVideoEnabled ? <Video size={18} /> : <VideoOff size={18} />}
              </Button>
              <Button
                onClick={toggleAudio}
                variant="secondary"
                size="icon"
                className="bg-black/50 hover:bg-black/70 text-white rounded-full h-9 w-9"
                aria-label={mediaState.isAudioEnabled ? t('deviceCheck.muteAudio') : t('deviceCheck.unmuteAudio')}
              >
                {mediaState.isAudioEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </Button>
            </div>
          </div>
        
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                   
                    <Select value={mediaState.selectedVideoDevice} onValueChange={(value) => dispatch({ type: 'SELECT_DEVICE', payload: { type: 'video', deviceId: value }})} disabled={!mediaState.hasVideoDevice}>
                      <SelectTrigger className="w-full" aria-label={t('deviceCheck.selectVideoDevice')}>
                          <div className="flex items-center gap-2 truncate">
                              <Video size={16} className="flex-shrink-0" /> 
                              <span className="truncate">{mediaState.videoDevices.find(d => d.deviceId === mediaState.selectedVideoDevice)?.label ? formatDeviceLabel(mediaState.videoDevices.find(d => d.deviceId === mediaState.selectedVideoDevice).label) : t('deviceCheck.noVideoDevices')}</span>
                          </div>
                      </SelectTrigger>
                      <SelectContent>
                        {mediaState.videoDevices.map(device => <SelectItem key={device.deviceId} value={device.deviceId}><span className="truncate">{formatDeviceLabel(device.label) || `Camera ${device.deviceId.slice(0, 5)}`}</span></SelectItem>)}
                      </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    
                    <Select value={mediaState.selectedAudioDevice} onValueChange={(value) => dispatch({ type: 'SELECT_DEVICE', payload: { type: 'audio', deviceId: value }})}>
                      <SelectTrigger className="w-full" aria-label={t('deviceCheck.selectAudioDevice')}>
                          <div className="flex items-center gap-2 truncate">
                            <Mic size={16} className="flex-shrink-0" />
                            <span className="truncate">{mediaState.audioDevices.find(d => d.deviceId === mediaState.selectedAudioDevice)?.label ? formatDeviceLabel(mediaState.audioDevices.find(d => d.deviceId === mediaState.selectedAudioDevice).label) : t('deviceCheck.noAudioDevices')}</span>
                          </div>
                      </SelectTrigger>
                      <SelectContent>
                        {mediaState.audioDevices.map(device => <SelectItem key={device.deviceId} value={device.deviceId}><span className="truncate">{formatDeviceLabel(device.label) || `Mic ${device.deviceId.slice(0, 5)}`}</span></SelectItem>)}
                      </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    
                    <Select value={backgroundSettings.mode} onValueChange={handleBackgroundChange} disabled={backgroundState.status === BACKGROUND_STATUS.LOADING || backgroundState.status === BACKGROUND_STATUS.APPLYING}>
                      <SelectTrigger className="w-full" aria-label={getTranslatedText('deviceCheck.backgroundSettings', 'Background Settings')}>
                          <div className="flex items-center gap-2">
                              <ImageIcon size={16} className="flex-shrink-0" /> 
                              <SelectValue placeholder={getTranslatedText('deviceCheck.backgroundSettings', 'Background')} />
                          </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BACKGROUND_MODES.NONE}>{getTranslatedText('session.noBackground', 'None')}</SelectItem>
                        <SelectItem value={BACKGROUND_MODES.BLUR}>{getTranslatedText('session.blur', 'Blur')}</SelectItem>
                        <SelectItem value={BACKGROUND_MODES.CUSTOM}>{getTranslatedText('session.customBackground', 'Custom')}</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
            </div>
            
            {backgroundSettings.mode === BACKGROUND_MODES.BLUR && (
              <div className="flex items-center gap-3 pt-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">{getTranslatedText('background.blurLevel', 'Blur')}</label>
                <Slider defaultValue={[backgroundSettings.blurLevel]} max={20} min={5} step={1} onValueChange={handleBlurLevelChange} className="w-full" />
              </div>
            )}

            <div className="flex items-center gap-4 pt-2">
              <div className="flex-1 bg-muted h-1.5 rounded-full overflow-hidden" title={t('deviceCheck.micLevel')}>
                <div className="bg-primary h-full rounded-full transition-all duration-100" style={{ width: `${Math.min(micLevel * 100, 100)}%` }} />
              </div>
              {!isSpeakerTestPlaying ? (
                <Button onClick={testSpeaker} variant="outline" size="sm" aria-label={t('deviceCheck.testSpeaker')}>
                  <Volume2 size={14} className="mr-1.5" /> {t('deviceCheck.test')}
                </Button>
              ) : (
                <Button onClick={stopSpeakerTest} variant="destructive" size="sm" aria-label={t('deviceCheck.stopSpeakerTest')}>
                  <StopCircle size={14} className="mr-1.5" /> {t('common:stop')}
                </Button>
              )}
            </div>

            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          </div>
        </div>
      
        <Dialog open={isBackgroundModalOpen} onOpenChange={setIsBackgroundModalOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ImageIcon size={20} /> {getTranslatedText('background.manageBackgrounds', 'Manage Backgrounds')}</DialogTitle>
              <DialogDescription>{getTranslatedText('background.manageDescription', 'Select a background or upload a new one.')}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto p-1 -mx-1">
              {savedBackgrounds.map((bg) => (
                <div key={bg.publicId} className="relative group aspect-video">
                  <img src={bg.url} alt={getTranslatedText('background.preview', 'Background preview')} className="w-full h-full object-cover rounded cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => handleSelectCustomBackground(bg.url)} onError={(e) => { e.target.src = '/placeholder-image.jpg'; logger.warn('[WaitingRoom] Background image failed to load', { url: bg.url }); }} />
                  <Button onClick={() => handleDeleteBackground(bg.publicId)} variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" aria-label={getTranslatedText('background.delete', 'Delete')}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
              <button onClick={() => fileInputRef.current.click()} disabled={backgroundState.status === BACKGROUND_STATUS.LOADING} className="w-full aspect-video bg-muted rounded flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/80 transition-colors focus:ring-2 ring-primary">
                {backgroundState.status === BACKGROUND_STATUS.LOADING ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload size={24} />}
                <span className="text-xs mt-1 font-medium">{getTranslatedText('background.uploadNew', 'Upload New')}</span>
              </button>
            </div>
            <DialogFooter>
              <Button onClick={() => setIsBackgroundModalOpen(false)} variant="outline">{getTranslatedText('common:close', 'Close')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      
        <div className="pt-4 border-t space-y-4">
            <Button onClick={handleJoin} disabled={!isJoinEnabled || isLoading} size="lg" className="w-full text-base py-6">
              {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Video className="mr-2 h-5 w-5" />}
              {t('deviceCheck.joinSession')}
            </Button>
          
            <div className="flex items-center gap-2">
              <Input type="text" value={sessionUrl} readOnly aria-label={t('session.sessionLink')} className="text-xs" />
              <Button onClick={() => { navigator.clipboard.writeText(sessionUrl); toast.success(t('session.linkCopied')); }} aria-label={t('session.copyLink')} variant="outline" size="icon">
                <Copy size={16} />
              </Button>
            </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default React.memo(WaitingRoom);