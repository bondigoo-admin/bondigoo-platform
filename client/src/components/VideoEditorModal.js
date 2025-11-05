import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-hot-toast';
import { Upload, Film, Scissors, Play, Pause, Image as ImageIcon } from 'lucide-react';
import ReactPlayer from 'react-player/lazy';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog.tsx';
import { Button } from './ui/button.tsx';
import { logger } from '../utils/logger';

// --- Helper components (formatTime, generateVideoFrames, Timeline, TimeInput) remain exactly the same as in your original file. ---
// --- They are omitted here for brevity but should be kept in your actual file. ---

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '00:00.0';
  const date = new Date(seconds * 1000);
  const mm = date.getUTCMinutes().toString().padStart(2, '0');
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  const ms = Math.floor(date.getUTCMilliseconds() / 100).toString();
  return `${mm}:${ss}.${ms}`;
};

const generateVideoFrames = (videoFile, frameCount = 10) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const frames = [];
    const url = URL.createObjectURL(videoFile);
    video.src = url;
    video.muted = true;
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const duration = video.duration;
      let framesExtracted = 0;
      const extractFrame = (time) => { video.currentTime = time; };
      video.onseeked = () => {
        if (framesExtracted < frameCount) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg'));
          framesExtracted++;
          if (framesExtracted < frameCount) {
            extractFrame(framesExtracted * (duration / frameCount));
          } else {
            URL.revokeObjectURL(url);
            resolve(frames);
          }
        }
      };
      video.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error("Error loading video for frame extraction.")); };
      extractFrame(0);
    };
  });
};

const Timeline = ({ duration, trim, onTrimChange, playbackTime, onSeek, localFrames = [], isGeneratingFrames }) => {
  const timelineRef = useRef(null);
  const [draggingHandle, setDraggingHandle] = useState(null);
  const handleInteraction = useCallback((e) => {
    if (!timelineRef.current || duration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rawPosition = (clientX - rect.left) / rect.width;
    const position = Math.max(0, Math.min(1, rawPosition));
    return position * duration;
  }, [duration]);
  useEffect(() => {
    const handleMove = (e) => {
      if (!draggingHandle) return;
      const newTime = handleInteraction(e);
      const [start, end] = trim;
      if (draggingHandle === 'start') onTrimChange([Math.max(0, Math.min(newTime, end - 0.1)), end]);
      else if (draggingHandle === 'end') onTrimChange([start, Math.min(duration, Math.max(newTime, start + 0.1))]);
    };
    const handleRelease = () => setDraggingHandle(null);
    if (draggingHandle) {
      document.addEventListener('mousemove', handleMove); document.addEventListener('mouseup', handleRelease);
      document.addEventListener('touchmove', handleMove); document.addEventListener('touchend', handleRelease);
    }
    return () => {
      document.removeEventListener('mousemove', handleMove); document.removeEventListener('mouseup', handleRelease);
      document.removeEventListener('touchmove', handleMove); document.removeEventListener('touchend', handleRelease);
    };
  }, [draggingHandle, handleInteraction, onTrimChange, trim, duration]);
  const handleTimelineClick = (e) => { if (e.target.closest('[data-handle]')) return; onSeek(handleInteraction(e)); };
  const timeToPercent = (time) => (duration > 0 ? (time / duration) * 100 : 0);
  const startPercent = timeToPercent(trim[0]); const endPercent = timeToPercent(trim[1]); const playbackPercent = timeToPercent(playbackTime);
  return (
    <div ref={timelineRef} className="relative w-full h-14 flex items-center cursor-pointer select-none touch-none rounded-lg bg-muted dark:bg-muted/50 overflow-hidden" onMouseDown={handleTimelineClick} onTouchStart={handleTimelineClick}>
      <div className="absolute inset-0 w-full h-full flex items-center justify-center">
        {isGeneratingFrames && <div className="w-full h-full bg-muted dark:bg-muted/50 animate-pulse" />}
        {!isGeneratingFrames && localFrames.length === 0 && <ImageIcon className="w-6 h-6 text-muted-foreground/50" />}
        {localFrames.length > 0 && <div className="absolute inset-0 flex w-full h-full">{localFrames.map((frame, index) => (<img key={index} src={frame} className="h-full object-cover" style={{ width: `${100 / localFrames.length}%` }} alt={`Video frame ${index + 1}`} />))}</div>}
      </div>
      <div className="absolute inset-y-0 left-0 h-full bg-background/70 backdrop-blur-sm" style={{ width: `${startPercent}%` }} />
      <div className="absolute inset-y-0 right-0 h-full bg-background/70 backdrop-blur-sm" style={{ width: `${100 - endPercent}%` }} />
      <div className="absolute h-full border-y-4 border-primary/70" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }} >
        <div data-handle="start" className="absolute -left-2 top-1/2 -translate-y-1/2 w-5 h-20 rounded-lg bg-primary shadow-lg cursor-ew-resize flex items-center justify-center z-20" onMouseDown={(e) => { e.stopPropagation(); setDraggingHandle('start'); }} onTouchStart={(e) => { e.stopPropagation(); setDraggingHandle('start'); }} ><div className="space-y-1.5">{[...Array(4)].map((_, i) => <div key={i} className="w-1 h-2 bg-primary-foreground/60 rounded-full" />)}</div></div>
        <div data-handle="end" className="absolute -right-2 top-1/2 -translate-y-1/2 w-5 h-20 rounded-lg bg-primary shadow-lg cursor-ew-resize flex items-center justify-center z-20" onMouseDown={(e) => { e.stopPropagation(); setDraggingHandle('end'); }} onTouchStart={(e) => { e.stopPropagation(); setDraggingHandle('end'); }} ><div className="space-y-1.5">{[...Array(4)].map((_, i) => <div key={i} className="w-1 h-2 bg-primary-foreground/60 rounded-full" />)}</div></div>
      </div>
      <div className="absolute top-0 h-full w-px bg-red-500 pointer-events-none z-10" style={{ left: `${playbackPercent}%` }}><div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background" /></div>
    </div>
  );
};

const TimeInput = ({ value, onChange, min, max, disabled, label }) => {
  const [inputValue, setInputValue] = useState(formatTime(value));
  const inputRef = useRef(null);
  useEffect(() => { if (document.activeElement !== inputRef.current) { setInputValue(formatTime(value)); } }, [value]);
  const parseTime = (timeStr) => {
    const parts = timeStr.replace(',', '.').split(':');
    if (parts.length === 2) { const minutes = parseFloat(parts[0]); const seconds = parseFloat(parts[1]); if (!isNaN(minutes) && !isNaN(seconds)) return minutes * 60 + seconds; }
    const singleValue = parseFloat(timeStr); return !isNaN(singleValue) ? singleValue : null;
  };
  const handleBlur = () => {
    const parsedTime = parseTime(inputValue);
    if (parsedTime !== null) { const clampedTime = Math.max(min, Math.min(parsedTime, max)); onChange(clampedTime); setInputValue(formatTime(clampedTime)); }
    else { setInputValue(formatTime(value)); }
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter') e.target.blur(); };
  const handleNudge = (amount) => { const newValue = value + amount; const clampedValue = Math.max(min, Math.min(newValue, max)); onChange(clampedValue); };
  return (
    <div className="flex flex-col items-center gap-1">
      <label htmlFor={`time-input-${label}`} className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => handleNudge(-0.1)} disabled={disabled || value <= min} className="h-8 w-8 text-lg flex-shrink-0">-</Button>
        <input ref={inputRef} id={`time-input-${label}`} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} disabled={disabled} className="w-20 text-center text-base font-semibold bg-transparent border border-border rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" />
        <Button variant="ghost" size="icon" onClick={() => handleNudge(0.1)} disabled={disabled || value >= max} className="h-8 w-8 text-lg flex-shrink-0">+</Button>
      </div>
    </div>
  );
};


const VideoEditorModal = ({ onUpload, onClose, existingVideo }) => {
  const { t } = useTranslation(['common', 'coachprofile']);

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState([0, 0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [localFrames, setLocalFrames] = useState([]);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  
  const playerRef = useRef(null);
  const intervalRef = useRef(null);

  const cleanupInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Effect for processing an existing video
  useEffect(() => {
    const processExistingVideo = async () => {
      if (!existingVideo?.url) return;
      handleReset(false); 
      setVideoUrl(existingVideo.url);
      setIsGeneratingFrames(true);
      try {
        const response = await fetch(existingVideo.url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();
        const fileName = existingVideo.fileName || 'video.mp4';
        const file = new File([blob], fileName, { type: blob.type || 'video/mp4' });
        setVideoFile(file); // Also set the file object for frame generation
        const frames = await generateVideoFrames(file);
        setLocalFrames(frames);
      } catch (error) {
        logger.error("[VideoEditorModal] Failed to process existing video.", { error: error.message, url: existingVideo.url });
        toast.error(t('coachprofile:errorGeneratingFrames'));
      } finally {
        setIsGeneratingFrames(false);
      }
    };
    processExistingVideo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingVideo]);
  
  useEffect(() => {
    return cleanupInterval;
  }, [cleanupInterval]);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (file && file.type.startsWith('video/')) {
      handleReset(false);
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setIsGeneratingFrames(true);
      try {
        const frames = await generateVideoFrames(file);
        setLocalFrames(frames);
      } catch (error) {
        toast.error(t('coachprofile:errorGeneratingFrames'));
      } finally {
        setIsGeneratingFrames(false);
      }
    } else {
      toast.error(t('coachprofile:errorInvalidVideoFile'));
    }
  }, [t]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'video/*': [] }, multiple: false });

  const handlePlayerReady = useCallback((player) => {
    playerRef.current = player;
    const videoDuration = player.getDuration();
    if (videoDuration && videoDuration > 0) {
        const isInitialLoad = duration === 0;
        setDuration(videoDuration);
        if (existingVideo?.trimStart != null && existingVideo?.trimEnd != null) {
            if (isInitialLoad) setTrim([existingVideo.trimStart, existingVideo.trimEnd]);
        } else if (isInitialLoad) {
            setTrim([0, videoDuration]);
        }
    }
  }, [duration, existingVideo]);

  const handleSeek = (time) => {
    if (playerRef.current) {
      playerRef.current.seekTo(time, 'seconds');
      setPlaybackTime(time);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      cleanupInterval();
      return;
    }
    const currentTime = playerRef.current ? playerRef.current.getCurrentTime() : 0;
    if (currentTime < trim[0] || currentTime >= trim[1]) handleSeek(trim[0]);
    setIsPlaying(true);
    cleanupInterval();
    intervalRef.current = setInterval(() => {
      if (playerRef.current) {
        const current = playerRef.current.getCurrentTime();
        if (current >= trim[1]) {
          setIsPlaying(false);
          playerRef.current.seekTo(trim[0]);
          setPlaybackTime(trim[0]);
          cleanupInterval();
        }
      }
    }, 100);
  };
  
  const handleProgress = ({ playedSeconds }) => setPlaybackTime(playedSeconds);

  const dataURLtoFile = (dataurl, filename) => {
    if (!dataurl) return null;
    const arr = dataurl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || mimeMatch.length < 2) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};
  
  const handleSave = () => {
    if (!videoFile && !existingVideo) {
      toast.error(t('coachprofile:noVideoFileSelected'));
      return;
    }

    onUpload({
      videoFile: videoFile,
      thumbnailFile: null,
      trimStart: trim[0],
      trimEnd: trim[1],
      existingVideo: existingVideo,
    });

    onClose();
  };

  const handleReset = (shouldCleanupUrl = true) => {
    setVideoFile(null);
    if (shouldCleanupUrl) setVideoUrl(null);
    setDuration(0);
    setTrim([0, 0]);
    setIsPlaying(false);
    cleanupInterval();
    setLocalFrames([]);
    setIsGeneratingFrames(false);
  };
  
  return (
    <Dialog open={true} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent 
            className="sm:max-w-3xl p-0"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Scissors className="w-5 h-5 text-primary" />
            {existingVideo ? t('coachprofile:editVideo') : t('coachprofile:uploadVideoIntroduction')}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6 bg-background sm:bg-muted/30 sm:dark:bg-black/20">
          {!videoUrl ? (
            <div {...getRootProps()} className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/80 transition-colors dark:border-gray-600 dark:hover:border-gray-500 ${isDragActive ? 'border-primary' : 'border-border'}`}>
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold text-primary">{t('common:clickToUpload')}</span> {t('common:orDragAndDrop')}</p>
                <p className="text-xs text-muted-foreground">{t('coachprofile:videoFileTypes')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden cursor-pointer" onClick={togglePlayPause}>
                <ReactPlayer ref={playerRef} url={videoUrl} width="100%" height="100%" playing={isPlaying} onReady={handlePlayerReady} onProgress={handleProgress} onPause={() => { setIsPlaying(false); cleanupInterval(); }} onEnded={() => { setIsPlaying(false); cleanupInterval(); handleSeek(trim[0]); }} progressInterval={100} config={{ file: { forceVideo: true } }} style={{ pointerEvents: 'none' }} />
              </div>
              {duration > 0 && (
                <div className="space-y-3">
                  <Timeline duration={duration} trim={trim} onTrimChange={setTrim} playbackTime={playbackTime} onSeek={handleSeek} localFrames={localFrames} isGeneratingFrames={isGeneratingFrames} />
                  <div className="flex items-center justify-between gap-2 sm:gap-4 py-2 px-1">
                    <Button variant="ghost" size="icon" onClick={togglePlayPause} className="h-12 w-12 flex-shrink-0">
                      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                    </Button>
                    <div className="flex items-center justify-around flex-grow gap-2 sm:gap-4">
                      <TimeInput label={t('common:start')} value={trim[0]} onChange={(newStart) => { setTrim([newStart, trim[1]]); handleSeek(newStart); }} min={0} max={trim[1] - 0.1} />
                      <div className="flex flex-col items-center text-center">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t('common:duration')}</span>
                        <div className="text-lg font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg whitespace-nowrap mt-1">
                           {formatTime(trim[1] - trim[0])}
                        </div>
                      </div>
                      <TimeInput label={t('common:end')} value={trim[1]} onChange={(newEnd) => setTrim([trim[0], newEnd])} min={trim[0] + 0.1} max={duration} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="p-6 pt-0 sm:pt-6 flex-col-reverse sm:flex-row sm:justify-between sm:items-center">
          <div />
          <div className="flex gap-2 justify-end w-full sm:w-auto">
              <Button variant="ghost" onClick={onClose}>{t('common:cancel')}</Button>
              <Button onClick={handleSave} disabled={!videoUrl || (trim[1] - trim[0] < 1)}>
                  <Film className="mr-2 h-4 w-4" />
                  {existingVideo ? t('common:saveChanges') : t('common:saveAndUpload')}
              </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VideoEditorModal;