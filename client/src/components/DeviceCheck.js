import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { Video, VideoOff, Mic, MicOff, Volume2, AlertTriangle, Clock } from 'lucide-react';
import { logger } from '../utils/logger';

const DeviceCheck = ({ sessionData, onComplete }) => {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [micLevel, setMicLevel] = useState(0);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [hasVideoDevice, setHasVideoDevice] = useState(true); // Track camera availability
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const [isAudioContextOpen, setIsAudioContextOpen] = useState(false);

  const initializeDevices = useCallback(async () => {
    let mediaStream = null;

    try {
      console.log('[DeviceCheck] Enumerating devices at:', new Date().toISOString());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setHasVideoDevice(videoDevices.length > 0);
      logger.info('[DeviceCheck] Device enumeration', { videoDevices: videoDevices.length, audioDevices: devices.filter(d => d.kind === 'audioinput').length });

      // Attempt audio first (mandatory for mic level, optional for video)
      const audioConstraints = { audio: true };
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        console.log('[DeviceCheck] Audio stream obtained', { streamId: mediaStream.id, audioTracks: mediaStream.getAudioTracks().map(t => t.label) });
      } catch (audioErr) {
        console.warn('[DeviceCheck] Audio access failed, proceeding without audio', { error: audioErr.message });
        setError(t('deviceCheck.noAudio', { message: 'No microphone detected. You can still join with video only or no media.' }));
      }

      // Attempt video if available (non-mandatory)
      if (videoDevices.length > 0) {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' } });
          mediaStream = new MediaStream([...(mediaStream?.getAudioTracks() || []), ...videoStream.getVideoTracks()]);
          console.log('[DeviceCheck] Video added to stream', { streamId: mediaStream.id, videoTracks: mediaStream.getVideoTracks().map(t => t.label) });
        } catch (videoErr) {
          console.warn('[DeviceCheck] Video access failed, continuing with audio', { error: videoErr.message });
          setHasVideoDevice(false); // Adjust if video fails despite detection
        }
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream && mediaStream.getVideoTracks().length > 0 ? mediaStream : null;
      }

      // Audio context for mic level (if audio available)
      if (mediaStream && mediaStream.getAudioTracks().length > 0) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(mediaStream);
        source.connect(analyser);
        analyser.fftSize = 256;
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        setIsAudioContextOpen(true);

        const updateMicLevel = () => {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
          setMicLevel(average / 255);
          if (mediaStream.active) requestAnimationFrame(updateMicLevel);
        };
        updateMicLevel();
      } else {
        setMicLevel(0);
      }
    } catch (err) {
      console.error('[DeviceCheck] Unexpected error', { name: err.name, message: err.message });
      setError(t('deviceCheck.error', { message: `${err.message} (Code: ${err.name})` }));
      setStream(null); // Allow proceeding without media
    }
  }, [t]);

  useEffect(() => {
    initializeDevices();

    const updateTimer = () => {
      const now = new Date();
      const start = new Date(sessionData?.start || Date.now());
      const diff = start - now;
      if (diff > 0) {
        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${t('session.startsIn')} ${minutes}:${seconds.toString().padStart(2, '0')}`);
      } else if (diff > -300000) { // Within 5 minutes late
        setTimeLeft(t('session.startedRecently'));
      } else {
        setTimeLeft(t('session.startedLate'));
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => {
      clearInterval(interval);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      if (audioContextRef.current && isAudioContextOpen) {
        audioContextRef.current.close().then(() => {
          setIsAudioContextOpen(false);
          audioContextRef.current = null;
        }).catch(err => logger.warn('[DeviceCheck] AudioContext cleanup error', { error: err.message }));
      }
    };
  }, [initializeDevices, sessionData?.start, t, stream, isAudioContextOpen]);

  const toggleVideo = () => {
    if (stream && stream.getVideoTracks().length > 0) {
      stream.getVideoTracks().forEach(track => (track.enabled = !track.enabled));
      setIsVideoEnabled(!isVideoEnabled);
      logger.info('[DeviceCheck] Video toggled', { enabled: !isVideoEnabled });
    } else if (!hasVideoDevice) {
      setError(t('deviceCheck.noCamera'));
    }
  };

  const toggleAudio = () => {
    if (stream && stream.getAudioTracks().length > 0) {
      stream.getAudioTracks().forEach(track => (track.enabled = !track.enabled));
      setIsAudioEnabled(!isAudioEnabled);
      logger.info('[DeviceCheck] Audio toggled', { enabled: !isAudioEnabled });
    } else {
      setError(t('deviceCheck.noAudio'));
    }
  };

  const testSpeaker = () => {
    const audio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
    audio.play()
      .then(() => logger.info('[DeviceCheck] Speaker test successful'))
      .catch(err => {
        setError(t('deviceCheck.speakerError', { message: err.message }));
        logger.warn('[DeviceCheck] Speaker test failed', { error: err.message });
      });
  };

  const handleComplete = () => {
    console.log('[DeviceCheck] Join Session clicked', { time: new Date().toISOString() });
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (audioContextRef.current && isAudioContextOpen) {
      audioContextRef.current.close().then(() => {
        setIsAudioContextOpen(false);
        audioContextRef.current = null;
        logger.info('[DeviceCheck] AudioContext closed');
      });
    }
    const config = { 
      video: hasVideoDevice && isVideoEnabled, 
      audio: isAudioEnabled 
    };
    logger.info('[DeviceCheck] Completing with config', config);
    onComplete(config);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white p-4">
      <h2 className="text-2xl font-semibold mb-6 text-[var(--text-primary)]">{t('deviceCheck.title')}</h2>
      <div className="text-[var(--text-secondary)] mb-4 flex items-center gap-2">
        <Clock size={20} /> {timeLeft}
      </div>
      {timeLeft.includes('late') && (
        <div className="flex items-center text-[var(--warning-color)] mb-4">
          <AlertTriangle className="mr-2" size={16} />
          <p>{t('session.joinLateWarning')}</p>
        </div>
      )}
      {error && (
        <div className="flex items-center text-red-500 mb-4">
          <AlertTriangle className="mr-2" size={16} />
          <p>{error}</p>
        </div>
      )}
      <div className="w-full max-w-md mb-6">
        <video
          ref={videoRef}
          autoPlay
          muted
          className="w-full rounded-lg bg-gray-800 shadow-md"
        />
        <div className="mt-2 flex justify-between">
          <button
            onClick={toggleVideo}
            className={`p-2 rounded-full ${hasVideoDevice ? (isVideoEnabled ? 'bg-[var(--primary-color)]' : 'bg-[var(--text-secondary)]') : 'bg-gray-600 cursor-not-allowed'} text-white hover:bg-[var(--primary-hover)]`}
            aria-label={isVideoEnabled ? t('session.disableVideo') : t('session.enableVideo')}
            disabled={!hasVideoDevice}
          >
            {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button
            onClick={toggleAudio}
            className={`p-2 rounded-full ${isAudioEnabled ? 'bg-[var(--primary-color)]' : 'bg-[var(--text-secondary)]'} text-white hover:bg-[var(--primary-hover)]`}
            aria-label={isAudioEnabled ? t('session.disableAudio') : t('session.enableAudio')}
          >
            {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
        </div>
      </div>
      <div className="w-full max-w-md mb-6">
        <p className="mb-2 text-[var(--text-primary)]">{t('deviceCheck.micLevel')}</p>
        <div className="w-full bg-gray-700 h-4 rounded shadow-inner">
          <div className="bg-green-500 h-full rounded" style={{ width: `${micLevel * 100}%` }} />
        </div>
      </div>
      <div className="w-full max-w-md mb-6">
        <button
          onClick={testSpeaker}
          className="w-full p-2 bg-[var(--primary-color)] text-white rounded-[var(--border-radius)] hover:bg-[var(--primary-hover)] flex items-center justify-center shadow-md"
          aria-label={t('deviceCheck.testSpeaker')}
        >
          <Volume2 className="mr-2" size={20} />
          {t('deviceCheck.testSpeaker')}
        </button>
      </div>
      <button
        onClick={handleComplete}
        className="w-full max-w-md p-2 bg-[var(--success-color)] text-white rounded-[var(--border-radius)] hover:bg-[var(--primary-hover)] shadow-md"
        aria-label={t('deviceCheck.joinSession')}
      >
        {t('deviceCheck.joinSession')}
      </button>
      {sessionData && (
        <div className="mt-6 text-center text-[var(--text-secondary)]">
          <p>{t('deviceCheck.sessionInfo', { title: sessionData?.sessionType?.name || 'Default Session' })}</p>
          <p>{t('deviceCheck.coach', { name: sessionData?.coach?.name || 'Unknown Coach' })}</p>
          <p>{new Date(sessionData?.start || new Date()).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
};

DeviceCheck.propTypes = {
  sessionData: PropTypes.shape({
    sessionType: PropTypes.shape({ name: PropTypes.string }),
    coach: PropTypes.shape({ name: PropTypes.string }),
    start: PropTypes.string,
  }),
  onComplete: PropTypes.func.isRequired,
};

export default DeviceCheck;