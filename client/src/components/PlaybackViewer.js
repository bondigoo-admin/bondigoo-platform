import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { logger } from '../utils/logger';
import { FaPlay, FaPause, FaVolumeUp, FaVolumeMute, FaExpand, FaCompress, FaBackward, FaForward } from 'react-icons/fa';

const PlaybackViewer = () => {
  const { bookingId, recordingId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('bookings');
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  const { data, isLoading, error } = useQuery(
    ['recording', bookingId, recordingId],
    async () => {
      logger.info('[PlaybackViewer] Fetching recording data', { bookingId, recordingId });
      const response = await axios.get(`/api/recordings/${bookingId}/${recordingId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      logger.info('[PlaybackViewer] Recording data fetched successfully', {
        bookingId,
        recordingId,
        status: response.data.status,
        hasUrl: !!response.data.url,
      });
      return response.data;
    },
    {
      retry: 1,
      refetchInterval: (data) => (data?.status === 'pending' ? 5000 : false),
      onError: (err) => {
        logger.error('[PlaybackViewer] Failed to fetch recording', {
          bookingId,
          recordingId,
          error: err.message,
          status: err.response?.status,
        });
      },
    }
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !data?.url) {
      if (!data?.url) {
        logger.warn('[PlaybackViewer] No video URL available', { bookingId, recordingId, data });
      }
      return;
    }

    const updateTime = () => setCurrentTime(video.currentTime);
    const setVideoDuration = () => {
      const dur = video.duration;
      logger.debug('[PlaybackViewer] Loaded duration:', dur);
      if (!isNaN(dur) && dur !== Infinity) {
        setDuration(dur);
      } else {
        logger.warn('[PlaybackViewer] Invalid duration', { duration: dur });
        setDuration(0);
      }
    };
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', setVideoDuration);
    video.addEventListener('canplay', setVideoDuration);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', setVideoDuration);
      video.removeEventListener('canplay', setVideoDuration);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
    };
  }, [data]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = isMuted ? 0 : volume;
      video.playbackRate = playbackSpeed;
      logger.debug('[PlaybackViewer] Set playbackRate to', playbackSpeed);
    }
  }, [volume, isMuted, playbackSpeed]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        skip(10);
      } else if (e.code === 'ArrowLeft') {
        skip(-10);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().catch((err) => logger.error('[PlaybackViewer] Play error', { error: err.message }));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = parseFloat(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
    logger.debug('[PlaybackViewer] Seek to', newTime);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const skip = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleFullscreen = () => {
    const player = playerRef.current;
    if (!player) return;
    if (!isFullscreen) {
      player.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const handlePlaybackSpeed = (speed) => {
    logger.debug('[PlaybackViewer] Setting playback speed to', speed);
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds) || seconds === Infinity) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500"></div>
        <span className="ml-4">{t('loading')}</span>
      </div>
    );
  }

  if (error || data?.status === 'error' || !data?.url) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-red-400">
        <span>{t('error')}: {error?.message || t('recordingFailed')}</span>
      </div>
    );
  }

  if (data.status === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <span>{t('recordingProcessing')}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6 flex flex-col items-center">
      <div className={`w-full max-w-4xl ${isFullscreen ? 'fixed inset-0 p-0' : ''}`} ref={playerRef}>
        {/* Session Details moved to the top, visible only when not in fullscreen */}
        {!isFullscreen && (
          <div className="mb-6">
          
            <p className="text-sm text-gray-300">
              {t('recorded')}: {new Date(data.startTime).toLocaleString()} - {new Date(data.endTime).toLocaleString()}
            </p>
          </div>
        )}
        <div
          className={`relative rounded-lg overflow-hidden shadow-lg ${isFullscreen ? 'h-full' : ''}`}
          onMouseEnter={() => setShowControls(true)}
          onMouseLeave={() => setShowControls(isPlaying ? false : true)}
        >
          <video
            ref={videoRef}
            src={data.url}
            className={`w-full ${isFullscreen ? 'h-full object-cover' : 'h-auto'} bg-black`}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
          {isBuffering && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-white"></div>
            </div>
          )}
          <div
            className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4 transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-4">
                <button onClick={togglePlay} className="text-white hover:text-blue-400" aria-label={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? <FaPause size={20} /> : <FaPlay size={20} />}
                </button>
                <button onClick={() => skip(-10)} className="text-white hover:text-blue-400" aria-label="Rewind 10 seconds">
                  <FaBackward size={18} />
                </button>
                <button onClick={() => skip(10)} className="text-white hover:text-blue-400" aria-label="Fast forward 10 seconds">
                  <FaForward size={18} />
                </button>
                <div className="flex items-center space-x-2">
                  <button onClick={toggleMute} className="text-white hover:text-blue-400" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted || volume === 0 ? <FaVolumeMute size={18} /> : <FaVolumeUp size={18} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1 bg-gray-600 rounded-full cursor-pointer volume-slider"
                    aria-label="Volume control"
                  />
                </div>
                <span className="text-white text-sm">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
              <div className="flex items-center space-x-4">
              <div className="relative">
  <button
    onClick={() => setShowSpeedMenu(!showSpeedMenu)}
    className="text-white hover:text-blue-400"
    aria-label="Playback speed"
  >
    {playbackSpeed.toFixed(1)}x
  </button>
  {showSpeedMenu && (
    <div className="absolute bottom-10 right-0 bg-gray-800 rounded-lg shadow-lg p-2 max-h-48 overflow-y-auto">
      {Array.from({ length: 16 }, (_, i) => 0.5 + i * 0.1).map((speed) => (
        <button
          key={speed}
          onClick={() => handlePlaybackSpeed(speed)}
          className={`block w-full text-left px-2 py-1 text-sm text-white hover:bg-gray-700 rounded ${
            playbackSpeed === speed ? 'bg-gray-700' : ''
          }`}
        >
          {speed.toFixed(1)}x
        </button>
      ))}
    </div>
  )}
</div>
                <button onClick={toggleFullscreen} className="text-white hover:text-blue-400" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  {isFullscreen ? <FaCompress size={18} /> : <FaExpand size={18} />}
                </button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max={duration || 1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-gray-600 rounded-full cursor-pointer seek-bar"
              style={{
                background: `linear-gradient(to right, #3b82f6 ${(currentTime / (duration || 1)) * 100}%, #4b5563 ${(currentTime / (duration || 1)) * 100}%)`,
              }}
              aria-label="Seek bar"
            />
          </div>
        </div>
        {/* Styled Back Button, visible only when not in fullscreen */}
        {!isFullscreen && (
          <button
            onClick={() => navigate(-1)}
            className="mt-6 bg-gradient-to-r from-blue-500 to-blue-700 text-white px-8 py-3 rounded-lg shadow-lg hover:from-blue-600 hover:to-blue-800 transition-all duration-300"
          >
            {t('back')}
          </button>
        )}
      </div>
    </div>
  );
};

export default PlaybackViewer;