import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
// We only need the lazy player now, as we're removing the static method call.
import ReactPlayer from 'react-player/lazy';
import {
  Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize, PlayCircle, Loader2, AlertTriangle, Settings, ChevronRight, Check, ChevronLeft, PictureInPicture2
} from 'lucide-react';
import { cn } from '../../lib/utils';

// Helper to format time from seconds to MM:SS
const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '00:00'; // Guard against invalid values
  const date = new Date(seconds * 1000);
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  if (hh) {
    return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
  }
  return `${mm}:${ss}`;
};

const CustomVideoPlayer = ({ videoFile, onLessonComplete, previewMode = false, onEnablePip, onDisablePip, ...divProps }) => {
  const { url: videoUrl, thumbnail: thumbnailUrl, trimStart = 0, trimEnd, width, height } = videoFile || {};
  // Refs for player and container elements
  const playerRef = useRef(null);
  const playerContainerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const lessonCompletedRef = useRef(false);
  const settingsMenuRef = useRef(null);
  const hasSeekedToStartRef = useRef(false);

  // Core player state
  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [played, setPlayed] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [error, setError] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  // UI state
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volumeSliderVisible, setVolumeSliderVisible] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState(null);
  const [isPip, setIsPip] = useState(false);
  const [isChangingVolume, setIsChangingVolume] = useState(false);

   const playerWrapperStyle = useMemo(() => {
    if (width && height && height > 0) {
      return {
        aspectRatio: `${width} / ${height}`,
        maxWidth: `${width}px`,
      };
    }
    // Fallback for videos without dimensions (e.g., old videos before migration)
    return {
      aspectRatio: '16 / 9',
    };
  }, [width, height]);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleReady = () => {
      setIsReady(true);
      const sourceDuration = playerRef.current.getDuration();
      if (sourceDuration) {
        const effectiveTrimEnd = trimEnd ?? sourceDuration;
        const newTrimmedDuration = effectiveTrimEnd - trimStart;
        setDuration(newTrimmedDuration > 0 ? newTrimmedDuration : 0);
      }
    };

  const handleDuration = (d) => {
    if (trimEnd !== undefined) return;
    if (d > 0) setDuration(d);
};

  const handleProgress = (state) => {
    const { playedSeconds } = state;

    if (trimEnd !== undefined && playedSeconds >= trimEnd && isPlaying) {
      playerRef.current.seekTo(trimStart, 'seconds');
      setIsPlaying(false);
      setPlayed(0);
      return;
    }

    if (!isSeeking) {
      if (duration > 0 && playedSeconds >= trimStart) {
        const playedInTrimmedSegment = playedSeconds - trimStart;
        const newPlayedFraction = playedInTrimmedSegment / duration;
        setPlayed(newPlayedFraction);
      } else if (playedSeconds < trimStart) {
        setPlayed(0);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (onLessonComplete && !lessonCompletedRef.current) {
      onLessonComplete();
      lessonCompletedRef.current = true;
    }
  };

  const handleError = (e) => {
    console.error("Video player error:", e);
    setError("There was an error loading the video.");
  };
  
  const handleVolumeMouseDown = () => {
    setIsChangingVolume(true);
  };
  
  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (isChangingVolume) {
        setIsChangingVolume(false);
      }
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isChangingVolume]);

  // --- UI INTERACTION HANDLERS ---

  const handlePlayPause = () => {
    if (!hasStarted) {
      setHasStarted(true);
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeekMouseDown = () => setIsSeeking(true);

  const handleSeekMouseUp = (e) => {
    setIsSeeking(false);
    const seekFraction = parseFloat(e.target.value);
    const seekToTime = trimStart + (seekFraction * duration);
    playerRef.current.seekTo(seekToTime, 'seconds');
  };

  const handleSeekChange = (e) => setPlayed(parseFloat(e.target.value));

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleToggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (!newMuted && volume === 0) {
      setVolume(0.5);
    }
  };

  const handleToggleFullscreen = () => {
    const container = playerContainerRef.current;
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };
  
  const handleToggleSettings = (e) => {
    e.stopPropagation();
    setIsSettingsOpen(!isSettingsOpen);
    setActiveSubMenu(null);
  };

  const handlePlaybackRateChange = (rate) => {
    setPlaybackRate(rate);
    setActiveSubMenu(null);
    setIsSettingsOpen(false);
  };

  const handlePlaybackRateSliderChange = (e) => {
    setPlaybackRate(parseFloat(e.target.value));
  };

  const handleEnablePip = () => setIsPip(true);
  const handleDisablePip = () => setIsPip(false);
  const handleTogglePip = () => setIsPip(!isPip);

  // --- CONTROL VISIBILITY LOGIC ---

  const showControls = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setControlsVisible(true);
    if (isPlaying && !isSettingsOpen && !isChangingVolume) {
      controlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, [isPlaying, isSettingsOpen, isChangingVolume]);

  const handleMouseMove = () => {
    showControls();
  };

const handleMouseLeave = () => {
    if (isSettingsOpen || isChangingVolume) return;
    setControlsVisible(false);
  };

  // --- EFFECTS ---

  useEffect(() => {
    if (played > 0.9 && onLessonComplete && !lessonCompletedRef.current) {
      onLessonComplete();
      lessonCompletedRef.current = true;
    }
  }, [played, onLessonComplete]);

  useEffect(() => {
    // Reset the seek flag if the video URL changes
    hasSeekedToStartRef.current = false;
  }, [videoUrl]);

  useEffect(() => {
    // On the first play, seek to the designated start time
    if (isPlaying && trimStart > 0 && !hasSeekedToStartRef.current && playerRef.current?.seekTo) {
      playerRef.current.seekTo(trimStart, 'seconds');
      hasSeekedToStartRef.current = true;
    }
  }, [isPlaying, trimStart]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    }
  }, []);

  useEffect(() => {
    if (hasStarted && (!isPlaying || isSeeking || isChangingVolume || isSettingsOpen)) {
      showControls();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
  }, [isPlaying, isSeeking, hasStarted, showControls, isChangingVolume, isSettingsOpen]);

  useEffect(() => {
    if (previewMode) return; // Disable keyboard shortcuts in preview mode
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const player = playerRef.current;
      if (!player || !hasStarted) return;
      switch (e.key) {
        case ' ': e.preventDefault(); handlePlayPause(); break;
        case 'm': case 'M': handleToggleMute(); break;
        case 'f': case 'F': handleToggleFullscreen(); break;
        case 'ArrowRight': e.preventDefault(); player.seekTo(player.getCurrentTime() + 5); break;
        case 'ArrowLeft': e.preventDefault(); player.seekTo(player.getCurrentTime() - 5); break;
        default: break;
      }
    };
    const container = playerContainerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [hasStarted, previewMode]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      const player = playerRef.current;
      if (!player || !hasStarted) return;
      switch (e.key) {
        case ' ': e.preventDefault(); handlePlayPause(); break;
        case 'm': case 'M': handleToggleMute(); break;
        case 'f': case 'F': handleToggleFullscreen(); break;
        case 'ArrowRight': e.preventDefault(); player.seekTo(player.getCurrentTime() + 5); break;
        case 'ArrowLeft': e.preventDefault(); player.seekTo(player.getCurrentTime() - 5); break;
        default: break;
      }
    };
    const container = playerContainerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [hasStarted]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isSettingsOpen && settingsMenuRef.current && !settingsMenuRef.current.contains(event.target)) {
        setIsSettingsOpen(false);
        setActiveSubMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSettingsOpen]);

  // --- RENDER ---

  const playedSeconds = duration * played;
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const shouldShowControls = !previewMode && !error && (controlsVisible || isSeeking || isChangingVolume || isSettingsOpen);

return (
      <div
        ref={playerContainerRef}
        className="relative w-full h-full bg-black overflow-hidden font-sans antialiased cursor-pointer isolate flex items-center justify-center fullscreen:aspect-auto focus:outline-none"
        onMouseMove={!previewMode ? handleMouseMove : undefined}
        onMouseLeave={!previewMode ? handleMouseLeave : undefined}
        onClick={previewMode ? (e) => e.stopPropagation() : undefined}
        tabIndex={!previewMode ? 0 : -1}
        {...divProps}
      >
      <div className="relative w-full max-h-full" style={playerWrapperStyle}>
        <ReactPlayer
          ref={playerRef}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'contain' }}
          url={videoUrl}
          width="100%"
          height="100%"
          playing={hasStarted && isPlaying}
          volume={volume}
          muted={isMuted}
          controls={false}
          onReady={handleReady}
          onPlay={handlePlay}
          onPause={handlePause}
          onDuration={handleDuration}
          onProgress={handleProgress}
          onEnded={handleEnded}
          onError={handleError}
          playbackRate={playbackRate}
          pip={isPip}
          onEnablePip={handleEnablePip}
          onDisablePip={handleDisablePip}
          config={{ file: { attributes: { controlsList: 'nodownload' }, forceEnablePip: true } }}
        />

        {error && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center text-white">
            <div className="absolute inset-0 bg-black/70" />
            <AlertTriangle size={48} className="z-10 mb-4 text-red-400" />
            <p className="z-10 text-lg font-semibold">Video Error</p>
            <p className="z-10 text-sm text-gray-300">{error}</p>
          </div>
        )}

        {!hasStarted && !error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer" onClick={handlePlayPause}>
            {thumbnailUrl && <img src={thumbnailUrl} alt="Video preview" className="absolute inset-0 w-full h-full object-contain" />}
            <div className="absolute inset-0 bg-black/40" />
            <button className="relative p-0 text-white transition-transform duration-200 ease-out bg-black/80 rounded-full hover:scale-110 hover:bg-white/15" aria-label="Play video">
              <PlayCircle size={80} strokeWidth={1} />
            </button>
          </div>
        )}

        {hasStarted && !error && (
          <div className="absolute top-0 left-0 w-full h-[calc(100%-80px)] z-10 cursor-pointer" onClick={handlePlayPause} onDoubleClick={!previewMode ? handleToggleFullscreen : undefined} />
        )}

        {hasStarted && !isReady && !error && (
           <div className="absolute inset-0 z-20 flex items-center justify-center text-white">
            <Loader2 className="h-12 w-12 animate-spin" />
          </div>
        )}
      </div>
      
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 z-[21] text-white bg-gradient-to-t from-black/70 to-transparent px-3 cursor-auto',
          'opacity-0 invisible transition-all duration-250 ease-in-out',
          shouldShowControls && 'opacity-100 visible'
        )}
        onMouseMove={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full py-1.5 mb-0">
         <input
  type="range"
  min={0}
  max={0.999999}
  step="any"
  value={played}
  onMouseDown={handleSeekMouseDown}
  onChange={handleSeekChange}
  onMouseUp={handleSeekMouseUp}
  aria-label="Video progress"
  aria-valuetext={`${formatTime(playedSeconds)} of ${formatTime(duration)}`}
  style={{ '--played': `${played * 100}%` }}
  className="w-full h-0.5 appearance-none bg-transparent cursor-pointer outline-none group focus:outline-none
             [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:rounded-full 
             [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,white_var(--played),rgba(255,255,255,0.3)_var(--played))]
             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[13px] [&::-webkit-slider-thumb]:h-[13px]
             [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-none
             [&::-webkit-slider-thumb]:scale-0 [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150
             group-hover:[&::-webkit-slider-thumb]:scale-100
             [&::-webkit-slider-thumb]:-mt-[5px]"
/>
        </div>

        <div className="flex items-center justify-between w-full h-10">
          <div className="flex items-center gap-2">
            <button onClick={handlePlayPause} className="p-2 text-white transition-transform duration-100 ease-in bg-transparent border-none rounded-full cursor-pointer flex items-center hover:scale-110" aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <div
              className="relative flex items-center"
              onMouseEnter={() => setVolumeSliderVisible(true)}
              onMouseLeave={() => !isChangingVolume && setVolumeSliderVisible(false)}
            >
              <button onClick={handleToggleMute} className="p-2 text-white transition-transform duration-100 ease-in bg-transparent border-none rounded-full cursor-pointer flex items-center hover:scale-110" aria-label={isMuted ? 'Unmute (m)' : 'Mute (m)'}>
                <VolumeIcon size={24} />
              </button>
              <div className={cn(
                  'absolute bottom-[55px] left-1/2 bg-neutral-800/90 dark:bg-neutral-900/90 backdrop-blur-lg rounded-[20px] w-10 h-[120px] flex justify-center items-center',
                  'opacity-0 invisible -translate-x-1/2 translate-y-2.5 scale-90 transition-all duration-150',
                  (volumeSliderVisible || isChangingVolume) && 'opacity-100 visible translate-y-0 scale-100'
              )}>
                <input
  type="range"
  min={0} max={1} step="any"
  value={isMuted ? 0 : volume}
  onMouseDown={handleVolumeMouseDown}
  onChange={handleVolumeChange}
  aria-label="Volume control"
  aria-valuetext={`${Math.round((isMuted ? 0 : volume) * 100)}%`}
  style={{'--volume': `${(isMuted ? 0 : volume) * 100}%`}}
  className="w-20 h-1.5 appearance-none bg-transparent cursor-pointer -rotate-90 focus:outline-none
             [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:rounded-full 
             [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,white_var(--volume),rgba(255,255,255,0.3)_var(--volume))]
             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
             [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:-mt-[5px]"
                />
              </div>
            </div>

            <div className="ml-2 text-sm font-normal select-none tabular-nums">
              {formatTime(playedSeconds)} / {formatTime(duration)}
            </div>
          </div>
          
          <div className="flex items-center gap-1 md:gap-2">
            {/* FIX: Removed the unreliable ReactPlayer.canEnablePip check. */}
            <button onClick={handleTogglePip} className="p-2 text-white transition-transform duration-100 ease-in bg-transparent border-none rounded-full cursor-pointer flex items-center hover:scale-110" aria-label="Picture-in-Picture">
              <PictureInPicture2 size={22} />
            </button>
            <div className="relative flex" ref={settingsMenuRef}>
              <button onClick={handleToggleSettings} className="p-2 text-white transition-transform duration-100 ease-in bg-transparent border-none rounded-full cursor-pointer flex items-center hover:scale-110" aria-label="Settings">
                <Settings size={22} />
              </button>
              {isSettingsOpen && (
                <div className="absolute bottom-[50px] right-[-20px] w-[260px] bg-neutral-900/90 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden">
                  {!activeSubMenu && (
                    <div className="w-full">
                      <button className="flex items-center justify-between w-full px-4 py-3 text-sm text-left text-white transition-colors duration-150 bg-transparent border-none cursor-pointer hover:bg-white/10" onClick={() => setActiveSubMenu('speed')}>
                        <span className="flex-grow">Playback speed</span>
                        <span className="flex items-center gap-2 text-neutral-400">
                          {playbackRate === 1 ? 'Normal' : `${playbackRate}x`}
                          <ChevronRight size={20} className="-mr-2" />
                        </span>
                      </button>
                    </div>
                  )}
                  {activeSubMenu === 'speed' && (
                    <div className="w-full">
                      <div className="flex items-center px-2 py-1 border-b border-white/10">
                        <button className="p-2 text-white transition-colors duration-150 bg-transparent border-none rounded-full cursor-pointer flex items-center justify-center hover:bg-white/10" onClick={() => setActiveSubMenu(null)}>
                          <ChevronLeft size={22} />
                        </button>
                        <span className="ml-2 text-base font-medium">Playback speed</span>
                      </div>
                      <div className="py-2">
                        <div className="px-4 py-2 pb-4">
                          <span className="block mb-3 text-base font-medium text-center">{playbackRate.toFixed(2)}x</span>
                           <input
                              type="range" min="0.25" max="2" step="0.05"
                              value={playbackRate}
                              onChange={handlePlaybackRateSliderChange}
                              style={{ '--rate': `${((playbackRate - 0.25) / (2 - 0.25)) * 100}%` }}
                              className="w-full h-[3px] appearance-none bg-transparent cursor-pointer align-middle outline-none focus:outline-none
                                         [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-full [&::-webkit-slider-runnable-track]:rounded-sm
                                         [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,white_var(--rate),rgba(255,255,255,0.3)_var(--rate))]
                                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[13px] [&::-webkit-slider-thumb]:h-[13px]
                                         [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:-mt-[5px]"
                           />
                        </div>
                        <hr className="h-px m-0 border-0 bg-white/10" />
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                          <button key={rate} className="flex items-center justify-between w-full px-4 py-3 text-sm text-left text-white transition-colors duration-150 bg-transparent border-none cursor-pointer hover:bg-white/10" onClick={() => handlePlaybackRateChange(rate)}>
                            <span className="flex items-center w-8 pl-1">
                              {playbackRate === rate && <Check size={20} />}
                            </span>
                            <span className="flex-grow">{rate === 1 ? 'Normal' : rate}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button onClick={handleToggleFullscreen} className="p-2 text-white transition-transform duration-100 ease-in bg-transparent border-none rounded-full cursor-pointer flex items-center hover:scale-110" aria-label={isFullscreen ? 'Exit Fullscreen (f)' : 'Enter Fullscreen (f)'}>
              {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomVideoPlayer;