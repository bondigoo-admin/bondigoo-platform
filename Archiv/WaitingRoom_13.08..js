import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Clock, AlertCircle, Video, VideoOff, Mic, MicOff, Volume2, Copy, 
  Image as ImageIcon, StopCircle, ChevronDown, Trash2, Upload 
} from 'lucide-react';
import { toast } from 'react-toastify';
import { logger } from '../utils/logger';
import axios from 'axios';

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

const WaitingRoom = ({ sessionStartTime, sessionDetails, onJoin, onStartSession, sessionUrl, isJoinEnabled, isCoach }) => {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const hiddenCanvasRef = useRef(null); // Canvas for background processing
  const outputCanvasRef = useRef(null); // Canvas for displaying processed video
  const fileInputRef = useRef(null);
  const backgroundProcessorRef = useRef(null);
  
  const [timeLeft, setTimeLeft] = useState('');
  const [stream, setStream] = useState(null);
  const [originalStream, setOriginalStream] = useState(null);
  const [micLevel, setMicLevel] = useState(0);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [hasVideoDevice, setHasVideoDevice] = useState(true);
  const [isAudioTestActive, setIsAudioTestActive] = useState(false);
  const [isSpeakerTestPlaying, setIsSpeakerTestPlaying] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
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
  const [isLoading, setIsLoading] = useState(true);
  
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


  // Update background settings effect
  useEffect(() => {
    if (backgroundProcessorRef.current && isVideoReady) {
      backgroundProcessorRef.current.updateSettings(backgroundSettings).catch((err) => {
        logger.error('[WaitingRoom] Failed to update background settings', {
          error: err.message,
        });
      });
    }
  }, [backgroundSettings, isVideoReady]);

  // Initialize devices
  useEffect(() => {
    const initializeDevices = async () => {
      logger.info('[WaitingRoom] Starting device initialization', { timestamp: new Date().toISOString() });
      try {
        logger.info('[WaitingRoom] Requesting media permissions');
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        logger.info('[WaitingRoom] Media permissions granted');
  
        logger.info('[WaitingRoom] Enumerating devices');
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevicesList = devices.filter(d => d.kind === 'videoinput');
        const audioDevicesList = devices.filter(d => d.kind === 'audioinput');
        setVideoDevices(videoDevicesList);
        setAudioDevices(audioDevicesList);
        setHasVideoDevice(videoDevicesList.length > 0);
        logger.info('[WaitingRoom] Device enumeration completed', { 
          videoDevices: videoDevicesList.map(d => ({ label: d.label, id: d.deviceId })),
          audioDevices: audioDevicesList.map(d => ({ label: d.label, id: d.deviceId })),
        });
  
        const defaultVideoDevice = videoDevicesList[0]?.deviceId || '';
        const defaultAudioDevice = audioDevicesList[0]?.deviceId || '';
        setSelectedVideoDevice(defaultVideoDevice);
        setSelectedAudioDevice(defaultAudioDevice);
  
        if (defaultVideoDevice || defaultAudioDevice) {
          logger.info('[WaitingRoom] Updating stream with default devices', { videoDeviceId: defaultVideoDevice, audioDeviceId: defaultAudioDevice });
          await updateStream(defaultVideoDevice, defaultAudioDevice);
          logger.info('[WaitingRoom] Stream setup complete');
        } else {
          logger.warn('[WaitingRoom] No default devices available', { 
            videoDevicesCount: videoDevicesList.length, 
            audioDevicesCount: audioDevicesList.length 
          });
        }
      } catch (err) {
        logger.error('[WaitingRoom] Device setup error', { error: err.message, stack: err.stack });
        toast.error(t('deviceCheck.error', { message: err.message }));
      } finally {
        logger.info('[WaitingRoom] Device initialization finished', { isLoading: false });
        setIsLoading(false);
      }
    };
  
    logger.info('[WaitingRoom] Starting initialization', { isLoading: true });
    initializeDevices();
  
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
    const interval = setInterval(updateTimer, 1000);
  
    return () => {
      logger.info('[WaitingRoom] Cleaning up initialization effect');
      clearInterval(interval);
      cleanupResources();
    };
  }, [sessionStartTime, t]);

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

  // Update stream when devices change
  const updateStream = async (videoDeviceId, audioDeviceId) => {
    try {
      // Clean up any existing background processor
      if (backgroundProcessorRef.current) {
        backgroundProcessorRef.current.cleanup();
        backgroundProcessorRef.current = null;
      }
      
      // Clean up existing streams
      if (stream && stream !== originalStream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      
      if (originalStream) {
        originalStream.getTracks().forEach(track => track.stop());
        setOriginalStream(null);
      }
      
      // Reset video readiness state
      setIsVideoReady(false);
      setBackgroundState({ status: BACKGROUND_STATUS.IDLE, error: null });
      
      // Determine optimal video constraints for performance
      const getOptimalVideoConstraints = () => {
        const baseConstraints = videoDeviceId ? { deviceId: { exact: videoDeviceId } } : false;
        
        if (!baseConstraints) return false;
        
        return {
          ...baseConstraints,
          width: { ideal: 1280 },  // Match canvas intrinsic size
          height: { ideal: 720 }   // Match canvas intrinsic size
        };
      };
      
      // Create constraints based on selected devices
      const constraints = {
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : false,
        video: getOptimalVideoConstraints()
      };
      
      // Get new media stream
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      logger.info('[WaitingRoom] Stream initialized', {
        streamId: newStream.id,
        videoTracks: newStream.getVideoTracks().length,
        audioTracks: newStream.getAudioTracks().length,
      });
      
      // Store original stream
      setOriginalStream(newStream);
      
      // Set up video element with the new stream
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(err => {
            logger.error('[WaitingRoom] Video play failed', { error: err.message });
          });
          // Sync canvas dimensions after metadata is loaded
          if (hiddenCanvasRef.current && outputCanvasRef.current) {
            hiddenCanvasRef.current.width = videoRef.current.videoWidth || 1280;
            hiddenCanvasRef.current.height = videoRef.current.videoHeight || 720;
            outputCanvasRef.current.width = videoRef.current.videoWidth || 1280;
            outputCanvasRef.current.height = videoRef.current.videoHeight || 720;
            logger.info('[WaitingRoom] Canvas dimensions synced with video', {
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight
            });
          }
        };
        
        // When using the none background mode, we also want to set this as the main stream
        if (backgroundSettings.mode === BACKGROUND_MODES.NONE) {
          setStream(newStream);
        }
      }
      
      // Set up audio analysis for mic level visualization
      setupAudioAnalysis(newStream);
      
    } catch (err) {
      logger.error('[WaitingRoom] Stream update error', { error: err.message });
      toast.error(t('deviceCheck.error', { message: err.message }));
    }
  };

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
    }
  };

  // Delete a saved background
  const handleDeleteBackground = async (publicId) => {
    try {
      await axios.delete('/api/users/background', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        data: { publicId },
      });
      
      // Update saved backgrounds
      setSavedBackgrounds(prev => prev.filter(bg => bg.publicId !== publicId));
      
      // If current background is being deleted, switch to none mode
      if (backgroundSettings.customBackground === savedBackgrounds.find(bg => bg.publicId === publicId)?.url) {
        setBackgroundSettings({ mode: BACKGROUND_MODES.NONE, customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL });
      }
      
      toast.success(t('background.deleteSuccess'));
    } catch (error) {
      logger.error('[WaitingRoom] Failed to delete background', { error: error.message });
      toast.error(t('background.deleteError'));
    }
  };

  // Toggle video and audio
  const toggleVideo = () => {
    if (stream && hasVideoDevice) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsAudioEnabled(!isAudioEnabled);
    }
  };

  // Handle join session
  const handleJoin = () => {
    if (!isJoinEnabled) {
      toast.error(t('deviceCheck.joinDisabled'));
      logger.warn('[WaitingRoom] Join attempt failed: Join not enabled');
      return;
    }
  
    // Make sure we have a valid stream to pass along
    let streamToUse = stream;
    
    // If stream is falsy or doesn't have active tracks, use original stream as fallback
    if (!streamToUse || !streamToUse.getTracks().some(track => track.readyState === 'live')) {
      logger.warn('[WaitingRoom] Processed stream invalid, falling back to original stream', {
        processedStreamId: streamToUse?.id,
        hasOriginalStream: !!originalStream
      });
      
      // Fall back to original stream if available
      if (originalStream && originalStream.getTracks().some(track => track.readyState === 'live')) {
        streamToUse = originalStream;
        logger.info('[WaitingRoom] Using original stream as fallback', { streamId: originalStream.id });
      } else {
        logger.error('[WaitingRoom] No valid stream available for joining');
        toast.error(t('deviceCheck.noValidStream', 'No valid media stream available'));
        return;
      }
    }
    
    const config = { 
      video: hasVideoDevice && isVideoEnabled, 
      audio: isAudioEnabled,
      videoDeviceId: selectedVideoDevice,
      audioDeviceId: selectedAudioDevice,
      backgroundSettings,
      stream: streamToUse,
    };
  
    logger.info('[WaitingRoom] Joining with config', { 
      config: {
        ...config,
        stream: config.stream ? {
          id: config.stream.id,
          videoTracks: config.stream.getVideoTracks().length,
          audioTracks: config.stream.getAudioTracks().length
        } : null
      },
      streamId: streamToUse?.id
    });
    
    onJoin(config);
  };

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

  // Handle blur level change
  const handleBlurLevelChange = (e) => {
    const newValue = parseInt(e.target.value);
    setBackgroundSettings(prev => ({ ...prev, blurLevel: newValue }));
  };

  // Determine status text for background processing
  const getBackgroundStatusText = () => {
    switch (backgroundState.status) {
      case BACKGROUND_STATUS.LOADING:
        return t('background.loading') || 'Loading...';
      case BACKGROUND_STATUS.APPLYING:
        return t('background.applying') || 'Applying...';
      case BACKGROUND_STATUS.ERROR:
        return backgroundState.error || t('background.error') || 'Error';
      default:
        return null;
    }
  };

  // Add translation fallbacks
  const getTranslatedText = (key, fallback) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  return (
    <div className="bg-[var(--background-light)] p-6 rounded-[var(--border-radius)] shadow-lg max-w-lg w-full" role="dialog" aria-label={t('session.waitingRoom')}>
      
      <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2 justify-between">
        <span className="flex items-center gap-2">
          <Clock size={24} aria-hidden="true" /> {t('session.waitingRoom')}
        </span>
        <span className="text-[var(--text-secondary)] text-base font-normal text-right">{timeLeft}</span>
      </h2>
      
      {timeLeft.includes('late') && (
        <p className="text-[var(--warning-color)] flex items-center gap-2 mb-4">
          <AlertCircle size={16} aria-hidden="true" /> {t('session.joinLateWarning')}
        </p>
      )}
      

  <div className="mb-4 text-white bg-gray-800 p-3 rounded-lg shadow-md">
    <p>{t('deviceCheck.coach', { name: sessionDetails?.coach?.name || t('session.loading') })}</p>
    <p>{sessionDetails?.start ? new Date(sessionDetails.start).toLocaleString() : t('session.loading')}</p>
  </div>
      
      <div className="mb-6">
      <div className="relative aspect-video w-full">
  {/* Main video element */}
  <video
  ref={videoRef}
  autoPlay
  muted
  playsInline
  className="w-full h-full rounded-lg bg-gray-800 shadow-md object-cover"
  aria-label={t('deviceCheck.videoPreview')}
  onLoadedMetadata={() => {
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        logger.error('[WaitingRoom] Video play error:', err.message);
      });
    }
  }}
  onCanPlay={() => {
    setIsVideoReady(true);
  }}
  width="1280"
  height="720"
  disablePictureInPicture={true}
  disableRemotePlayback={true}
/>
          
         {/* Hidden canvas for processing - not visible but needs to be in the DOM */}
  <canvas ref={hiddenCanvasRef} className="hidden" width="1280" height="720" />
  
  {/* Output canvas for displaying the processed video */}
  <canvas
    ref={outputCanvasRef}
    className={backgroundSettings.mode !== BACKGROUND_MODES.NONE ? "absolute inset-0 w-full h-full object-cover rounded-lg" : "hidden"}
    style={{ transform: 'translateZ(0)', willChange: 'transform', imageRendering: 'auto' }}
    width="1280"
    height="720"
  />
          
         {/* Loading overlay */}
  {backgroundState.status === BACKGROUND_STATUS.LOADING && (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-50 rounded-lg">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mb-2"></div>
      <p className="text-white text-sm">{getTranslatedText('background.loading', 'Loading...')}</p>
    </div>
  )}
  
  {/* Error overlay */}
  {backgroundState.status === BACKGROUND_STATUS.ERROR && (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500 bg-opacity-75 rounded-lg text-white p-2">
      <p className="text-center mb-2">{backgroundState.error || getTranslatedText('background.error', 'Error')}</p>
      <button
        onClick={() => {
          setBackgroundSettings({ mode: BACKGROUND_MODES.NONE, customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL });
        }}
        className="px-3 py-1 bg-white text-red-500 rounded-full text-sm font-medium"
      >
        {getTranslatedText('background.tryAgain', 'Try Again')}
      </button>
    </div>
  )}
          
        {/* Status text */}
  {getBackgroundStatusText() && backgroundState.status !== BACKGROUND_STATUS.ERROR && (
    <div className="absolute bottom-2 left-2 right-2 bg-black bg-opacity-60 text-white text-xs p-1 rounded text-center">
      {getBackgroundStatusText()}
    </div>
  )}
  
  {/* Video/Audio control buttons */}
  <div className="absolute top-2 right-2 flex gap-2">
    <button
      onClick={toggleVideo}
      className={`p-2 rounded-full ${hasVideoDevice && isVideoEnabled ? 'bg-[var(--primary-color)]' : 'bg-gray-600'} hover:bg-[var(--primary-hover)] text-white transition-colors shadow-md`}
      disabled={!hasVideoDevice}
      aria-label={isVideoEnabled ? t('deviceCheck.disableVideo') : t('deviceCheck.enableVideo')}
    >
      {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
    </button>
    <button
      onClick={toggleAudio}
      className={`p-2 rounded-full ${isAudioEnabled ? 'bg-[var(--primary-color)]' : 'bg-gray-600'} hover:bg-[var(--primary-hover)] text-white transition-colors shadow-md`}
      aria-label={isAudioEnabled ? t('deviceCheck.muteAudio') : t('deviceCheck.unmuteAudio')}
    >
      {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
    </button>
  </div>
</div>
        
        <div className="mt-4 flex flex-wrap gap-2 items-center justify-between">
          {/* Video device selector */}
          <div className="relative">
            <select
              value={selectedVideoDevice}
              onChange={(e) => { setSelectedVideoDevice(e.target.value); updateStream(e.target.value, selectedAudioDevice); }}
              disabled={!hasVideoDevice}
              className="w-12 p-2 pr-6 bg-[var(--background-hover)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all text-sm appearance-none flex items-center justify-center cursor-pointer"
              aria-label={t('deviceCheck.selectVideoDevice')}
              style={{ paddingLeft: '1.5rem' }}
            >
              {videoDevices.length === 0 ? (
                <option value="">{t('deviceCheck.noVideoDevices')}</option>
              ) : (
                videoDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                  </option>
                ))
              )}
            </select>
            <Video size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-[var(--text-primary)] pointer-events-none" />
            <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 text-[var(--text-primary)] pointer-events-none" />
          </div>
          
          {/* Audio device selector */}
          <div className="relative">
            <select
              value={selectedAudioDevice}
              onChange={(e) => { setSelectedAudioDevice(e.target.value); updateStream(selectedVideoDevice, e.target.value); }}
              className="w-12 p-2 pr-6 bg-[var(--background-hover)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all text-sm appearance-none flex items-center justify-center cursor-pointer"
              aria-label={t('deviceCheck.selectAudioDevice')}
              style={{ paddingLeft: '1.5rem' }}
            >
              {audioDevices.length === 0 ? (
                <option value="">{t('deviceCheck.noAudioDevices')}</option>
              ) : (
                audioDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Mic ${device.deviceId.slice(0, 5)}`}
                  </option>
                ))
              )}
            </select>
            <Mic size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-[var(--text-primary)] pointer-events-none" />
            <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 text-[var(--text-primary)] pointer-events-none" />
          </div>
          
          {/* Background selector */}
          <div className="relative">
            <select
              value={backgroundSettings.mode}
              onChange={(e) => handleBackgroundChange(e.target.value)}
              className="w-12 p-2 pr-6 bg-[var(--background-hover)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all text-sm appearance-none flex items-center justify-center cursor-pointer"
              aria-label={getTranslatedText('deviceCheck.backgroundSettings', 'Background Settings')}
              style={{ paddingLeft: '1.5rem' }}
              disabled={backgroundState.status === BACKGROUND_STATUS.LOADING || backgroundState.status === BACKGROUND_STATUS.APPLYING}
            >
              <option value={BACKGROUND_MODES.NONE}>{getTranslatedText('session.noBackground', 'None')}</option>
              <option value={BACKGROUND_MODES.BLUR}>{getTranslatedText('session.blur', 'Blur')}</option>
              <option value={BACKGROUND_MODES.CUSTOM}>{getTranslatedText('session.customBackground', 'Custom')}</option>
            </select>
            <ImageIcon size={16} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-[var(--text-primary)] pointer-events-none" />
            <ChevronDown size={12} className="absolute right-1 top-1/2 transform -translate-y-1/2 text-[var(--text-primary)] pointer-events-none" />
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          
          {/* Blur level slider */}
          {backgroundSettings.mode === BACKGROUND_MODES.BLUR && (
  <div className="flex items-center gap-2">
    <label className="text-sm text-[var(--text-primary)]">{getTranslatedText('background.blurLevel', 'Blur')}</label>
    <input
      type="range"
      min="5"
      max="20"
      step="1"
      value={backgroundSettings.blurLevel}
      onChange={handleBlurLevelChange}
      className="w-24"
    />
  </div>
          )}
        </div>
      </div>
      
      {/* Background Selection Modal */}
      {isBackgroundModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[var(--background-light)] p-6 rounded-lg shadow-lg w-full max-w-md">
            <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <ImageIcon size={20} /> {getTranslatedText('background.manageBackgrounds', 'Manage Backgrounds')}
            </h3>
            <div className="grid grid-cols-2 gap-4 max-h-64 overflow-y-auto">
              {/* Default No Background Option */}
              <div className="relative group">
                <div
                  className="w-full h-24 bg-gray-200 rounded cursor-pointer flex items-center justify-center text-[var(--text-secondary)]"
                  onClick={() => handleBackgroundChange(BACKGROUND_MODES.NONE)}
                >
                  {getTranslatedText('session.noBackground', 'None')}
                </div>
              </div>
              {savedBackgrounds.map((bg, index) => (
                <div key={index} className="relative group">
                  <img
                    src={bg.url}
                    alt={getTranslatedText('background.preview', 'Background preview')}
                    className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleSelectCustomBackground(bg.url)}
                    onError={(e) => {
                      e.target.src = '/placeholder-image.jpg'; // Fallback image
                      logger.warn('[WaitingRoom] Background image failed to load', { url: bg.url });
                    }}
                  />
                  <button
                    onClick={() => handleDeleteBackground(bg.publicId)}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={getTranslatedText('background.delete', 'Delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => fileInputRef.current.click()}
                className="px-4 py-2 bg-[var(--primary-color)] text-white rounded hover:bg-[var(--primary-hover)] flex items-center gap-2 disabled:opacity-50"
                disabled={backgroundState.status === BACKGROUND_STATUS.LOADING}
              >
                <Upload size={16} /> {getTranslatedText('background.uploadNew', 'Upload New')}
              </button>
              <button
                onClick={() => setIsBackgroundModalOpen(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                {getTranslatedText('background.close', 'Close')}
              </button>
            </div>
            {backgroundState.status === BACKGROUND_STATUS.LOADING && (
              <div className="mt-2 flex items-center gap-2">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-[var(--primary-color)]"></div>
                <span>{getTranslatedText('background.loading', 'Loading...')}</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Microphone level meter */}
      <div className="mb-4 flex items-center gap-2">
        <p className="text-sm font-medium text-[var(--text-primary)] whitespace-nowrap">
          {t('deviceCheck.micLevel')}
        </p>
        <div className="flex-1 bg-gray-700 h-2 rounded-full overflow-hidden">
          <div
            className="bg-green-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(micLevel * 100, 100)}%` }}
          />
        </div>
        {!isSpeakerTestPlaying ? (
          <button
            onClick={testSpeaker}
            className="px-2 py-1 text-xs bg-[var(--primary-color)] text-white rounded hover:bg-[var(--primary-hover)] transition-colors flex items-center gap-1"
            aria-label={t('deviceCheck.testSpeaker')}
          >
            <Volume2 size={12} /> {t('deviceCheck.test')}
          </button>
        ) : (
          <button
            onClick={stopSpeakerTest}
            className="px-2 py-1 text-xs bg-[var(--danger-color)] text-white rounded hover:bg-red-700 transition-colors"
            aria-label={t('deviceCheck.stopSpeakerTest')}
          >
            <StopCircle size={12} />
          </button>
        )}
      </div>
      
      {/* Join session button */}
      <button
  onClick={handleJoin}
  disabled={!isJoinEnabled || isLoading}
  className={`w-full p-2 rounded-[var(--border-radius)] ${isJoinEnabled && !isLoading ? 'bg-[var(--success-color)] hover:bg-[var(--primary-hover)]' : 'bg-gray-600 cursor-not-allowed'} text-white font-semibold transition-colors`}
  aria-label={t('deviceCheck.joinSession')}
>
  {t('deviceCheck.joinSession')}
</button>
      
      {/* Session link */}
      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          value={sessionUrl}
          readOnly
          className="flex-1 p-2 bg-[var(--background-hover)] rounded-[var(--border-radius)] text-[var(--text-primary)] border border-[var(--border-color)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] transition-all"
          aria-label={t('session.sessionLink')}
        />
        <button
          onClick={() => { 
            navigator.clipboard.writeText(sessionUrl); 
            toast.success(t('session.linkCopied')); 
          }}
          className="p-2 bg-[var(--primary-color)] text-white rounded-[var(--border-radius)] hover:bg-[var(--primary-hover)] transition-colors"
          aria-label={t('session.copyLink')}
        >
          <Copy size={20} />
        </button>
      </div>
    </div>
  );
};

export default WaitingRoom;