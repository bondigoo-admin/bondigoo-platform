import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import axios from 'axios';
import Draggable from 'react-draggable';
import {
  Video as VideoIcon,
  VideoOff,
  Mic as MicIcon,
  MicOff,
  X,
  Image as ImageIcon,
  Upload,
  Trash2,
  Settings,
  Check,
} from 'lucide-react';
import { logger } from '../utils/logger';
import {
  BACKGROUND_MODES,
  BACKGROUND_STATUS,
  DEFAULT_BLUR_LEVEL,
  MAX_FILE_SIZE_MB,
  SUPPORTED_IMAGE_TYPES,
  compressImage,
  setupBackgroundEffect,
  checkVideoReady,
} from '../utils/BackgroundEffectUtility';

import { Button } from './ui/button.tsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Slider } from './ui/slider.tsx';
import { Label } from './ui/label.tsx';

const VideoSettings = ({
  localStream,
  onClose,
  onBackgroundChange,
  videoDevices = [],
  audioDevices = [],
  selectedVideoDevice,
  setSelectedVideoDevice,
  selectedAudioDevice,
  setSelectedAudioDevice,
  setLocalStream,
  onSettingsChange = (settings) => logger.info('[VideoSettings] Settings change not handled', { settings }), // Default with logging
  currentBackgroundSettings = { mode: BACKGROUND_MODES.NONE, customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL },
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const backgroundProcessorRef = useRef(null);
  const nodeRef = useRef(null);

  const [backgroundSettings, setBackgroundSettings] = useState(currentBackgroundSettings);
  const [savedBackgrounds, setSavedBackgrounds] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [backgroundState, setBackgroundState] = useState({ status: BACKGROUND_STATUS.IDLE, error: null });
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [pendingVideoDevice, setPendingVideoDevice] = useState(selectedVideoDevice);
  const [pendingAudioDevice, setPendingAudioDevice] = useState(selectedAudioDevice);
  const [previewStream, setPreviewStream] = useState(localStream);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const initializeStream = useCallback(async (videoDeviceId, audioDeviceId) => {
    try {
      const constraints = {
        video: videoDeviceId ? { 
          deviceId: { exact: videoDeviceId }, 
          width: { ideal: 1280 }, // Match WaitingRoom
          height: { ideal: 720 }  // Match WaitingRoom
        } : false,
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : false,
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      logger.info('[VideoSettings] Stream initialized', {
        streamId: newStream.id,
        videoWidth: newStream.getVideoTracks()[0]?.getSettings().width,
        videoHeight: newStream.getVideoTracks()[0]?.getSettings().height,
      });
      return newStream;
    } catch (error) {
      logger.error('[VideoSettings] Failed to initialize stream', { error: error.message });
      toast.error(t('deviceCheck.error', { message: error.message }));
      throw error;
    }
  }, [t]);

  useEffect(() => {
    const setupInitialStream = async () => {
      if (localStream) {
        setPreviewStream(localStream);
        logger.info('[VideoSettings] Using provided localStream', { streamId: localStream.id });
      } else if (videoDevices.length > 0 || audioDevices.length > 0) {
        const newStream = await initializeStream(
          selectedVideoDevice || videoDevices[0]?.deviceId,
          selectedAudioDevice || audioDevices[0]?.deviceId
        );
        setPreviewStream(newStream);
        if (setLocalStream) setLocalStream(newStream); // Set initial stream for parent
        logger.info('[VideoSettings] Initialized new preview stream', { streamId: newStream.id });
      }
    };
  
    setupInitialStream();
    const fetchSavedBackgrounds = async () => {
      try {
        const response = await axios.get('/api/users/backgrounds', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        });
        setSavedBackgrounds(response.data.backgrounds || []);
      } catch (error) {
        logger.error('[VideoSettings] Failed to fetch saved backgrounds', { error: error.message });
        if (error.response?.status === 404) {
          setSavedBackgrounds([]);
        } else {
          toast.error(t('background.fetchError'));
        }
      }
    };
    fetchSavedBackgrounds();
  }, []);

  useEffect(() => {
    setPendingVideoDevice(selectedVideoDevice);
    setPendingAudioDevice(selectedAudioDevice);
    setBackgroundSettings(currentBackgroundSettings);
    logger.info('[VideoSettings] Synced pending states with current settings', {
      videoDeviceId: selectedVideoDevice,
      audioDeviceId: selectedAudioDevice,
      backgroundSettings: currentBackgroundSettings,
    });
  }, [selectedVideoDevice, selectedAudioDevice, currentBackgroundSettings]);

  useEffect(() => {
    if (!videoRef.current || !previewStream) {
      logger.warn('[VideoSettings] Video preview setup skipped', {
        hasVideoRef: !!videoRef.current,
        hasStream: !!previewStream,
      });
      return;
    }

    const video = videoRef.current;
    video.srcObject = previewStream;

    const handleLoadedMetadata = () => {
      video.play().catch((err) => {
        logger.error('[VideoSettings] Video playback failed', { error: err.message });
        setBackgroundState({ status: BACKGROUND_STATUS.ERROR, error: 'Video playback failed' });
      });
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    const checkAndSetVideoReady = () => {
      if (checkVideoReady(video)) {
        setIsVideoReady(true);
        logger.info('[VideoSettings] Video is ready', { videoWidth: video.videoWidth, videoHeight: video.videoHeight });
        return true;
      }
      return false;
    };

    if (!checkAndSetVideoReady()) {
      const intervalId = setInterval(() => {
        if (checkAndSetVideoReady()) clearInterval(intervalId);
      }, 100);
      return () => {
        clearInterval(intervalId);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }

    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [previewStream]);

  useEffect(() => {
    if (!isVideoReady || !previewStream || !videoRef.current || !canvasRef.current || !outputCanvasRef.current) {
      logger.warn('[VideoSettings] Skipping processor init - resources not ready', {
        isVideoReady,
        hasStream: !!previewStream,
        hasVideo: !!videoRef.current,
        hasCanvas: !!canvasRef.current,
        hasOutputCanvas: !!outputCanvasRef.current,
      });
      return;
    }
  
    const initBackgroundProcessor = async () => {
      if (backgroundProcessorRef.current) {
        backgroundProcessorRef.current.cleanup();
        logger.info('[VideoSettings] Cleaned up existing processor before reinitialization');
      }
  
      try {
        const processor = await setupBackgroundEffect({
          videoElement: videoRef.current,
          hiddenCanvas: canvasRef.current,
          outputCanvas: outputCanvasRef.current,
          stream: previewStream,
          backgroundSettings, // Initial settings
          onStatusChange: (status) => setBackgroundState(status),
        });
  
        backgroundProcessorRef.current = processor;
        logger.info('[VideoSettings] Background processor initialized', {
          streamId: previewStream.id,
          mode: backgroundSettings.mode,
        });
      } catch (error) {
        logger.error('[VideoSettings] Failed to initialize background processor', { error: error.message });
        setBackgroundState({ status: BACKGROUND_STATUS.ERROR, error: 'Processor initialization failed' });
      }
    };
  
    initBackgroundProcessor();
  
    return () => {
      if (backgroundProcessorRef.current) {
        backgroundProcessorRef.current.cleanup();
        backgroundProcessorRef.current = null;
        logger.info('[VideoSettings] Processor cleaned up on unmount or dependency change');
      }
    };
  }, [isVideoReady, previewStream]);

  useEffect(() => {
    if (!backgroundProcessorRef.current) {
      logger.warn('[VideoSettings] No processor available to update settings');
      return;
    }
  
    const updateProcessorSettings = async () => {
      try {
        await backgroundProcessorRef.current.updateSettings(backgroundSettings);
        logger.info('[VideoSettings] Background settings updated', {
          mode: backgroundSettings.mode,
          customBackground: backgroundSettings.customBackground,
          blurLevel: backgroundSettings.blurLevel,
        });
      } catch (error) {
        logger.error('[VideoSettings] Failed to update background settings', { error: error.message });
        setBackgroundState({ status: BACKGROUND_STATUS.ERROR, error: 'Settings update failed' });
      }
    };
  
    updateProcessorSettings();
  }, [backgroundSettings]);

  useEffect(() => {
    if (previewStream) {
      const videoTrack = previewStream.getVideoTracks()[0];
      const audioTrack = previewStream.getAudioTracks()[0];
      setIsVideoEnabled(videoTrack?.enabled ?? true);
      setIsAudioEnabled(audioTrack?.enabled ?? true);
    }
  }, [previewStream]);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !outputCanvasRef.current || !isVideoReady) return;
  
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const outputCanvas = outputCanvasRef.current;
  
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
  
    canvas.width = width;
    canvas.height = height;
    outputCanvas.width = width;
    outputCanvas.height = height;
  
    const hiddenContext = canvas.getContext('2d', { willReadFrequently: true });
    const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true });
  
    if (!hiddenContext || !outputContext) {
      logger.error('[VideoSettings] Failed to get canvas contexts after dimension update');
      return;
    }
  
    hiddenContext.clearRect(0, 0, width, height);
    outputContext.clearRect(0, 0, width, height);
  
    logger.info('[VideoSettings] Canvas dimensions dynamically set', { width, height });
  }, [isVideoReady]);

  const handleVideoDeviceChange = async (newDeviceId) => {
    setPendingVideoDevice(newDeviceId);
    try {
      const newStream = await initializeStream(newDeviceId, pendingAudioDevice);
      setPreviewStream(newStream);
    } catch (error) {
      toast.error(t('deviceCheck.videoError'));
      logger.error('[VideoSettings] Failed to update preview stream for video device', { error: error.message });
    }
  };

  useEffect(() => {
    const handleMediaStateChange = (event) => {
      if (previewStream) {
        const { isAudioEnabled: newAudio, isVideoEnabled: newVideo } = event.detail;
        if (typeof newAudio !== 'undefined') {
          previewStream.getAudioTracks().forEach(track => track.enabled = newAudio);
          setIsAudioEnabled(newAudio);
        }
        if (typeof newVideo !== 'undefined') {
          previewStream.getVideoTracks().forEach(track => track.enabled = newVideo);
          setIsVideoEnabled(newVideo);
        }
      }
    };

    window.addEventListener('media-state-changed', handleMediaStateChange);
    return () => window.removeEventListener('media-state-changed', handleMediaStateChange);
  }, [previewStream]);

  const handleAudioDeviceChange = async (newDeviceId) => {
    setPendingAudioDevice(newDeviceId);
    try {
      const newStream = await initializeStream(pendingVideoDevice, newDeviceId);
      setPreviewStream(newStream);
    } catch (error) {
      toast.error(t('deviceCheck.audioError'));
      logger.error('[VideoSettings] Failed to update preview stream for audio device', { error: error.message });
    }
  };

  const handleBackgroundChange = (mode, customBackground = null) => {
    const newSettings = {
      mode,
      customBackground: mode === BACKGROUND_MODES.CUSTOM ? customBackground || savedBackgrounds[0]?.url : null,
      blurLevel: mode === BACKGROUND_MODES.BLUR ? backgroundSettings.blurLevel : DEFAULT_BLUR_LEVEL,
    };
    setBackgroundSettings(newSettings);
  };

  const handleBlurLevelChange = (value) => {
    setBackgroundSettings((prev) => ({ ...prev, blurLevel: value[0] }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      logger.warn('[VideoSettings] No file selected for upload');
      return;
    }
  
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast.error(t('background.invalidFileType'));
      logger.error('[VideoSettings] Invalid file type', { type: file.type });
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(t('background.fileTooLarge', { maxSize: MAX_FILE_SIZE_MB }));
      logger.error('[VideoSettings] File too large', { size: file.size });
      return;
    }
  
    setIsUploading(true);
    setBackgroundState({ status: BACKGROUND_STATUS.LOADING, error: null });
    logger.info('[VideoSettings] Starting background upload', { fileName: file.name, size: file.size });
  
    try {
      const compressedImage = await compressImage(file);
      const blob = await (await fetch(compressedImage)).blob();
      const formData = new FormData();
      formData.append('file', blob, file.name);
      const response = await axios.post('/api/users/background', formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart-form-data',
        },
      });
      const { background } = response.data;
      setSavedBackgrounds((prev) => [...prev, background]);
      handleBackgroundChange(BACKGROUND_MODES.CUSTOM, background.url);
      toast.success(t('background.uploadSuccess'));
      logger.info('[VideoSettings] Background uploaded successfully', { url: background.url });
    } catch (error) {
      logger.error('[VideoSettings] Failed to upload background', { error: error.message });
      toast.error(t('background.uploadError'));
      setBackgroundState({ status: BACKGROUND_STATUS.ERROR, error: 'Upload failed' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteBackground = async (publicId) => {
    try {
      await axios.delete('/api/users/background', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        data: { publicId },
      });
      setSavedBackgrounds((prev) => prev.filter((bg) => bg.publicId !== publicId));
      if (backgroundSettings.customBackground === savedBackgrounds.find((bg) => bg.publicId === publicId)?.url) {
        handleBackgroundChange(BACKGROUND_MODES.NONE);
      }
      toast.success(t('background.deleteSuccess'));
    } catch (error) {
      toast.error(t('background.deleteError'));
    }
  };

  const toggleVideoPreview = () => {
    if (previewStream) {
      previewStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      const newVideoState = !isVideoEnabled;
      setIsVideoEnabled(newVideoState);
      window.dispatchEvent(new CustomEvent('media-state-changed', { 
        detail: { isVideoEnabled: newVideoState }
      }));
    }
  };
  
  const toggleAudioPreview = () => {
    if (previewStream) {
      previewStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      const newAudioState = !isAudioEnabled;
      setIsAudioEnabled(newAudioState);
      window.dispatchEvent(new CustomEvent('media-state-changed', { 
        detail: { isAudioEnabled: newAudioState }
      }));
    }
  };

  const handleConfirmSettings = useCallback(() => {
    logger.info('[VideoSettings] Confirming settings', {
      videoDevice: pendingVideoDevice,
      audioDevice: pendingAudioDevice,
      backgroundMode: backgroundSettings.mode,
    });
  
    initializeStream(pendingVideoDevice, pendingAudioDevice)
      .then((newStream) => {
        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
        }
  
        setLocalStream(newStream);
        setPreviewStream(newStream);
        setSelectedVideoDevice(pendingVideoDevice);
        setSelectedAudioDevice(pendingAudioDevice);
  
        onSettingsChange({
          videoDeviceId: pendingVideoDevice,
          audioDeviceId: pendingAudioDevice,
          backgroundSettings,
          stream: newStream,
        });
  
        window.dispatchEvent(new CustomEvent('stream-changed', { 
          detail: { 
            stream: newStream, 
            backgroundSettings: { ...backgroundSettings }
          } 
        }));
  
        logger.info('[VideoSettings] Settings confirmed successfully', {
          newStreamId: newStream.id,
          backgroundSettings,
        });
  
        onClose();
      })
      .catch((err) => {
        logger.error('[VideoSettings] Failed to confirm settings', {
          error: err.message,
          stack: err.stack,
        });
        setBackgroundState({ status: BACKGROUND_STATUS.ERROR, error: err.message });
        toast.error('Failed to apply settings');
      });
  }, [pendingVideoDevice, pendingAudioDevice, backgroundSettings, localStream, setLocalStream, 
    setSelectedVideoDevice, setSelectedAudioDevice, onSettingsChange, onClose, initializeStream]);

  return (
    <Draggable handle=".drag-handle" bounds="parent" nodeRef={nodeRef}>
      <Card ref={nodeRef} className="w-full max-w-md shadow-lg z-[1000] pointer-events-auto overflow-hidden dark:bg-gray-800 dark:text-gray-100">
        <CardHeader className="drag-handle flex flex-row items-center justify-between p-4 cursor-move">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings size={20} />
            {t('session.videoSettings')}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('close')}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="relative aspect-video w-full">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full rounded-lg bg-black object-cover"
            />
            <canvas
              ref={outputCanvasRef}
              className={backgroundSettings.mode !== BACKGROUND_MODES.NONE ? "absolute inset-0 w-full h-full object-cover rounded-lg" : "hidden"}
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                size="icon"
                variant={isVideoEnabled ? 'secondary' : 'destructive'}
                onClick={toggleVideoPreview}
                aria-label={isVideoEnabled ? t('deviceCheck.disableVideo') : t('deviceCheck.enableVideo')}
              >
                {isVideoEnabled ? <VideoIcon size={20} /> : <VideoOff size={20} />}
              </Button>
              <Button
                size="icon"
                variant={isAudioEnabled ? 'secondary' : 'destructive'}
                onClick={toggleAudioPreview}
                aria-label={isAudioEnabled ? t('deviceCheck.muteAudio') : t('deviceCheck.unmuteAudio')}
              >
                {isAudioEnabled ? <MicIcon size={20} /> : <MicOff size={20} />}
              </Button>
            </div>
            {backgroundState.status === BACKGROUND_STATUS.LOADING && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
              </div>
            )}
            {backgroundState.status === BACKGROUND_STATUS.ERROR && (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/75 text-destructive-foreground p-2 text-center rounded-lg">
                <p>{backgroundState.error || t('background.error')}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="video-device-select">{t('deviceCheck.videoDevice')}</Label>
            <Select id="video-device-select" value={pendingVideoDevice || ''} onValueChange={handleVideoDeviceChange}>
              <SelectTrigger>
                <SelectValue placeholder={t('deviceCheck.selectDevice')} />
              </SelectTrigger>
              <SelectContent>
                {videoDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="audio-device-select">{t('deviceCheck.audioDevice')}</Label>
            <Select id="audio-device-select" value={pendingAudioDevice || ''} onValueChange={handleAudioDeviceChange}>
              <SelectTrigger>
                <SelectValue placeholder={t('deviceCheck.selectDevice')} />
              </SelectTrigger>
              <SelectContent>
                {audioDevices.map((device) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || `Mic ${device.deviceId.slice(0, 5)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="background-select">{t('deviceCheck.backgroundSettings')}</Label>
            <Select id="background-select" value={backgroundSettings.mode} onValueChange={(mode) => handleBackgroundChange(mode)}>
              <SelectTrigger>
                <SelectValue placeholder={t('session.selectBackground')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BACKGROUND_MODES.NONE}>{t('session.noBackground')}</SelectItem>
                <SelectItem value={BACKGROUND_MODES.BLUR}>{t('session.blur')}</SelectItem>
                <SelectItem value={BACKGROUND_MODES.CUSTOM}>{t('session.customBackground')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {backgroundSettings.mode === BACKGROUND_MODES.BLUR && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="blur-level">{t('background.blurLevel')}</Label>
              <Slider
                id="blur-level"
                min={5}
                max={20}
                step={1}
                value={[backgroundSettings.blurLevel]}
                onValueChange={handleBlurLevelChange}
              />
            </div>
          )}

          {backgroundSettings.mode === BACKGROUND_MODES.CUSTOM && (
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-3 gap-2">
                {savedBackgrounds.map((bg) => (
                  <div key={bg.publicId} className="relative group">
                    <img
                      src={bg.url}
                      alt="Background"
                      className={`w-full h-16 object-cover rounded-md cursor-pointer ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${backgroundSettings.customBackground === bg.url ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => handleBackgroundChange(BACKGROUND_MODES.CUSTOM, bg.url)}
                      tabIndex={0}
                      onKeyPress={(e) => e.key === 'Enter' && handleBackgroundChange(BACKGROUND_MODES.CUSTOM, bg.url)}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDeleteBackground(bg.publicId)}
                      className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current.click()}
                className="w-full"
                disabled={isUploading}
              >
                <Upload size={16} className="mr-2" /> {t('background.uploadNew')}
              </Button>
              <input
                type="file"
                accept={SUPPORTED_IMAGE_TYPES.join(',')}
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="p-4 flex justify-end">
          <Button onClick={handleConfirmSettings} aria-label={t('session.confirmSettings')}>
            <Check size={20} className="mr-2" />
            {t('session.confirmSettings')}
          </Button>
        </CardFooter>
      </Card>
    </Draggable>
  );
};

export default VideoSettings;