import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button.tsx';

const VideoPlayer = ({ videoUrl, subtitlesUrl }) => {
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useTranslation(['common', 'coachprofile']);

  const handleError = (e) => {
    console.error('Video playback error:', e);
    setError(t('coachprofile:videoPlaybackError'));
  };

  if (error) {
    return <div className="text-destructive font-medium p-4 bg-destructive/10 rounded-md">{error}</div>;
  }

  return (
    <div>
      <video
        src={videoUrl}
        controls
        className="w-full rounded-lg aspect-video"
        onError={handleError}
      >
        {subtitlesUrl && showSubtitles && (
          <track kind="captions" src={subtitlesUrl} srcLang="en" label="English" default />
        )}
      </video>
      {subtitlesUrl && (
        <Button 
          onClick={() => setShowSubtitles(!showSubtitles)}
          variant="outline"
          size="sm"
          className="mt-2"
        >
          {showSubtitles ? t('coachprofile:hideSubtitles') : t('coachprofile:showSubtitles')}
        </Button>
      )}
    </div>
  );
};

export default VideoPlayer;