import React, { useState, useEffect, forwardRef } from 'react';
import VideoSession from './VideoSession';
import { motion } from 'framer-motion';
import { Tooltip } from 'react-tooltip';
import { useTranslation } from 'react-i18next';
import { logger } from '../utils/logger';

const LayoutManager = forwardRef(({
  localStream,
  participants,
  screenStream,
  activeSpeaker,
  setLayout,
  layout: propLayout,
  sessionId,
  backgroundSettings
}, ref) => {
  const { t } = useTranslation();
  const [layout, setLocalLayout] = useState(propLayout || 'grid');

  useEffect(() => {
    if (setLayout) setLayout(layout);
    if (participants.length > 4 && layout === 'grid') {
      setLocalLayout('speaker');
      logger.info('[LayoutManager] Auto-switched to speaker view', { participantCount: participants.length, sessionId });
    } else if (participants.length <= 4 && layout === 'speaker' && !activeSpeaker) {
      setLocalLayout('grid');
      logger.info('[LayoutManager] Auto-switched to grid view', { participantCount: participants.length, sessionId });
    }
  }, [participants.length, activeSpeaker, layout, setLayout, sessionId]);

  useEffect(() => {
    logger.info('[LayoutManager] Received localStream', {
      streamId: localStream?.id,
      tracks: localStream?.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState })),
      hasBackgroundSettings: !!backgroundSettings,
      backgroundMode: backgroundSettings?.mode,
      sessionId
    });
  }, [localStream, backgroundSettings, sessionId]);

  const getGridStyles = () => {
    const count = participants.length + 1;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return {
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
    };
  };

  return (
    <div ref={ref} className="flex flex-col h-full max-h-full overflow-hidden">
      <motion.div
        key={layout}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className={`flex-1 overflow-hidden ${
          layout === 'grid'
            ? 'grid items-center justify-items-center p-2 gap-2'
            : 'flex items-center justify-center'
        }`}
        style={layout === 'grid' ? getGridStyles() : {}}
      >
        {screenStream ? (
          <VideoSession
            screenStream={screenStream}
            isScreenSharing={true}
            isLocal={true}
            sessionId={sessionId}
          />
        ) : (
          <VideoSession
            localStream={localStream}
            participants={participants}
            layout={layout}
            activeSpeaker={layout === 'speaker' ? activeSpeaker : null}
            sessionId={sessionId}
            backgroundSettings={backgroundSettings}
          />
        )}
      </motion.div>
    </div>
  );
});

LayoutManager.displayName = 'LayoutManager';

export default LayoutManager;