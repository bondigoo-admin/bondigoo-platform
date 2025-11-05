import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Maximize2, Minimize2, Volume2, VolumeX, Edit } from 'lucide-react';
import { Button } from './ui/button.tsx';
import { Slider } from './ui/slider.tsx';

const VideoIntroduction = ({ videoUrl, onEdit, isOwnProfile }) => {
  const { t } = useTranslation(['common', 'coachprofile']);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLarge, setIsLarge] = useState(false);
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const timeUpdateHandler = () => setCurrentTime(video.currentTime);
      const loadedMetadataHandler = () => setDuration(video.duration);
      
      video.addEventListener('timeupdate', timeUpdateHandler);
      video.addEventListener('loadedmetadata', loadedMetadataHandler);
      
      return () => {
        video.removeEventListener('timeupdate', timeUpdateHandler);
        video.removeEventListener('loadedmetadata', loadedMetadataHandler);
      };
    }
  }, [videoUrl]);

  console.log("VideoIntroduction props:", { videoUrl, onEdit, isOwnProfile });
  
  const togglePlay = () => {
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    videoRef.current.volume = newVolume;
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    videoRef.current.volume = newMutedState ? 0 : volume;
  };

  const handleTimelineChange = (newTime) => {
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time) => {
    if (isNaN(time) || time === 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleFullScreen = () => {
    const elem = containerRef.current;
    if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(err => {
            alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
    setIsLarge(!isLarge); // Sync state, though browser controls it
  }

  return (
    <div ref={containerRef} className={`group relative w-full mx-auto bg-black rounded-lg overflow-hidden`}>
      <video
        ref={videoRef}
        className="w-full aspect-video"
        src={videoUrl}
        onClick={togglePlay}
      >
        {t('coachprofile:videoNotSupported')}
      </video>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 md:p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="w-full mb-2">
            <Slider
                min={0}
                max={duration}
                step={1}
                value={[currentTime]}
                onValueChange={(value) => handleTimelineChange(value[0])}
                className="w-full"
            />
        </div>
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Button onClick={togglePlay} variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white">
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <div className="flex items-center gap-2 group/volume">
                <Button onClick={toggleMute} variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white">
                {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
                <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={[isMuted ? 0 : volume]}
                    onValueChange={(value) => handleVolumeChange(value[0])}
                    className="w-24 hidden md:group-hover/volume:block"
                />
            </div>
            <span className="text-xs md:text-sm font-mono ml-2">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <Button onClick={handleFullScreen} variant="ghost" size="icon" className="text-white hover:bg-white/20 hover:text-white">
            {isLarge ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {isOwnProfile && (
        <Button
          onClick={onEdit}
          variant="secondary"
          size="sm"
          className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        >
          <Edit className="h-4 w-4 mr-2" />
          {t('common:edit')}
        </Button>
      )}
    </div>
  );
};

export default VideoIntroduction;