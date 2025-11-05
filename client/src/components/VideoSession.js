import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import io from 'socket.io-client';
import { logger } from '../utils/logger';
import {
  BACKGROUND_MODES,
  BACKGROUND_STATUS,
  DEFAULT_BLUR_LEVEL,
  setupBackgroundEffect
} from '../utils/BackgroundEffectUtility';

// Enhanced VideoPlayer with robust stream handling
const VideoPlayer = React.memo(function VideoPlayer({ stream, peerId, isLocal, localVideoRef, sessionId }) {
  const videoRef = useRef(null);
  const playAttemptsRef = useRef(0);
  const currentStreamIdRef = useRef(null);
  const rafRef = useRef(null);

  const attachStreamAndPlay = useCallback(async (videoEl, mediaStream) => {
    if (!videoEl) {
      logger.warn('[VideoPlayer] Cannot attach stream - no video element', { peerId, sessionId, hasStream: !!mediaStream });
      return;
    }
    
    if (!mediaStream) {
      logger.warn('[VideoPlayer] Cannot attach stream - no media stream', { peerId, sessionId });
      return;
    }
  
    const streamId = mediaStream.id;
    if (currentStreamIdRef.current === streamId && videoEl.srcObject && !videoEl.paused && videoEl.videoWidth > 0) {
      logger.info('[VideoPlayer] Stream already playing', { streamId, peerId, sessionId });
      return;
    }
  
    const videoTracks = mediaStream.getVideoTracks();
    if (videoTracks.length === 0) {
      logger.warn('[VideoPlayer] Media stream has no video tracks', { 
        streamId, 
        peerId, 
        sessionId,
        audioTracks: mediaStream.getAudioTracks().length
      });
    }
  
    try {
      videoEl.srcObject = null;
      videoEl.srcObject = mediaStream;
      videoEl.muted = isLocal;
      videoEl.playsInline = true;
    } catch (err) {
      logger.error('[VideoPlayer] Error setting srcObject', { error: err.message, streamId });
      return;
    }
  
    const waitForFrames = () => {
      if (videoEl.videoWidth > 0) {
        videoEl.play()
          .then(() => {
            logger.info('[VideoPlayer] Playback started successfully', {
              streamId,
              videoWidth: videoEl.videoWidth,
              videoHeight: videoEl.videoHeight,
              playAttempts: playAttemptsRef.current,
              peerId,
              sessionId,
            });
            currentStreamIdRef.current = streamId;
            playAttemptsRef.current = 0;
          })
          .catch(err => {
            logger.warn('[VideoPlayer] Playback attempt failed', {
              error: err.message,
              attempt: playAttemptsRef.current + 1,
              streamId,
              videoReadyState: videoEl.readyState,
              peerId,
              sessionId,
            });
            
            if (playAttemptsRef.current < 3) {
              playAttemptsRef.current++;
              setTimeout(() => {
                videoEl.muted = true;
                waitForFrames();
              }, playAttemptsRef.current * 200);
            }
          });
      } else if (playAttemptsRef.current < 10) {
        playAttemptsRef.current++;
        rafRef.current = requestAnimationFrame(waitForFrames);
      } else {
        logger.error('[VideoPlayer] Timeout waiting for frames', { streamId, peerId, sessionId });
      }
    };
  
    rafRef.current = requestAnimationFrame(waitForFrames);
  }, [isLocal, peerId, sessionId]);

  useEffect(() => {
    const videoEl = isLocal ? localVideoRef.current : videoRef.current;
    if (!stream || !videoEl) return;

    attachStreamAndPlay(videoEl, stream);

    return () => {
      if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      playAttemptsRef.current = 0;
    };
  }, [stream, isLocal, localVideoRef, attachStreamAndPlay, sessionId]);

  return (
    <video
      ref={isLocal ? localVideoRef : videoRef}
      muted={isLocal}
      autoPlay
      playsInline
      className="w-full h-full object-contain"
      style={{ width: '100%', height: '100%' }}
    />
  );
});

VideoPlayer.propTypes = {
  stream: PropTypes.object.isRequired,
  peerId: PropTypes.string.isRequired,
  isLocal: PropTypes.bool,
  localVideoRef: PropTypes.object,
  sessionId: PropTypes.string.isRequired,
};

// New component for screen share preview
const ScreenSharePreview = React.memo(({ stream, sessionId }) => {
  const previewVideoRef = useRef(null);
  const [isMounted, setIsMounted] = useState(true);
  const playTimeoutRef = useRef(null);
  const currentStreamIdRef = useRef(null);  // Track the current stream ID

  useEffect(() => {
    logger.info('[ScreenSharePreview] Component mounted', { sessionId });
    setIsMounted(true);
    return () => {
      logger.info('[ScreenSharePreview] Component unmounting', { sessionId });
      setIsMounted(false);
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }
    };
  }, [sessionId]);

  useEffect(() => {
    const videoEl = previewVideoRef.current;
    if (!videoEl || !stream || !isMounted) {
      logger.warn('[ScreenSharePreview] Skipping stream attachment', { 
        hasVideo: !!videoEl, 
        hasStream: !!stream, 
        isMounted, 
        sessionId 
      });
      return;
    }

    const streamId = stream.id;
    if (currentStreamIdRef.current === streamId) {
      logger.info('[ScreenSharePreview] Stream already attached', { streamId, sessionId });
      return;
    }

    videoEl.srcObject = stream;
    currentStreamIdRef.current = streamId;

    const playVideo = () => {
      if (!isMounted || !videoEl.srcObject) {
        logger.warn('[ScreenSharePreview] Aborting play due to unmount or no stream', { sessionId });
        return;
      }
      videoEl.play()
        .then(() => {
          logger.info('[ScreenSharePreview] Preview playback started', { streamId, sessionId });
        })
        .catch((err) => {
          if (isMounted) {
            logger.error('[ScreenSharePreview] Preview video playback failed', { 
              error: err.message, 
              streamId, 
              sessionId 
            });
          } else {
            logger.info('[ScreenSharePreview] Playback error ignored due to unmount', { 
              error: err.message, 
              streamId, 
              sessionId 
            });
          }
        });
    };

    // Increase debounce to 300ms to give more time for stream stabilization
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
    }
    playTimeoutRef.current = setTimeout(playVideo, 300);

    return () => {
      if (videoEl) {
        videoEl.pause();
        videoEl.srcObject = null;
        logger.info('[ScreenSharePreview] Cleaned up video element', { streamId, sessionId });
      }
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }
      currentStreamIdRef.current = null;
    };
  }, [stream, sessionId, isMounted]);

  return (
    <div className="absolute bottom-2 right-2 w-32 h-24 bg-gray-900 rounded-lg overflow-hidden border-2 border-gray-700">
      <video
        ref={previewVideoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />
    </div>
  );
});

ScreenSharePreview.displayName = 'ScreenSharePreview';
ScreenSharePreview.propTypes = {
  stream: PropTypes.object.isRequired,
  sessionId: PropTypes.string.isRequired,
};

const VideoSession = ({ 
  localStream, 
  participants, 
  layout = 'grid', 
  activeSpeaker, 
  sessionId,
  backgroundSettings = { mode: BACKGROUND_MODES.NONE, customBackground: null, blurLevel: DEFAULT_BLUR_LEVEL },
  screenStream, 
  isScreenSharing 
}) => {
  logger.info('[VideoSession] Component props received', {
    sessionId,
    localStreamId: localStream?.id,
    screenStreamId: screenStream?.id,
    isScreenSharing,
    participantsCount: participants?.length || 0
  });
  const { t } = useTranslation();
  const localVideoRef = useRef(null);
  const [spotlightPeerId, setSpotlightPeerId] = useState(null);
  const socketRef = useRef(null);
  const currentStreamIdRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const outputCanvasRef = useRef(null);
  const backgroundProcessorRef = useRef(null);
  const [backgroundState, setBackgroundState] = useState({ 
    status: BACKGROUND_STATUS.IDLE, 
    error: null 
  });

  // Socket setup
  useEffect(() => {
    socketRef.current = io.connect(`${process.env.REACT_APP_API_URL}/video`, {
      query: { sessionId },
    });
    socketRef.current.on('spotlight', ({ peerId }) => {
      setSpotlightPeerId(peerId);
      logger.info('[VideoSession] Spotlight updated', { peerId, sessionId });
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, [sessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      currentStreamIdRef.current = null;
      if (backgroundProcessorRef.current) {
        backgroundProcessorRef.current.cleanup();
        backgroundProcessorRef.current = null;
      }
    };
  }, []);

  // Background processor initialization
  useEffect(() => {
    if (localStream && localVideoRef.current && hiddenCanvasRef.current && outputCanvasRef.current &&
        backgroundSettings?.mode !== BACKGROUND_MODES.NONE) {
      const initProcessor = async () => {
        try {
          logger.info('[VideoSession] Initializing background processor', {
            streamId: localStream.id,
            backgroundMode: backgroundSettings.mode,
            sessionId
          });

          const processor = await setupBackgroundEffect({
            videoElement: localVideoRef.current,
            hiddenCanvas: hiddenCanvasRef.current,
            outputCanvas: outputCanvasRef.current,
            stream: localStream,
            backgroundSettings,
            onStatusChange: setBackgroundState,
            onStreamChange: (newStream) => {
              if (newStream && newStream.id !== localStream.id) {
                window.dispatchEvent(new CustomEvent('stream-changed', { detail: { stream: newStream } }));
              }
            }
          });

          backgroundProcessorRef.current = processor;
          logger.info('[VideoSession] Background processor initialized', { mode: backgroundSettings.mode, sessionId });
        } catch (error) {
          logger.error('[VideoSession] Failed to initialize background processor', { error: error.message, sessionId });
          setBackgroundState({ status: BACKGROUND_STATUS.ERROR, error: error.message });
        }
      };

      initProcessor();
    }
  }, [localStream, backgroundSettings, sessionId]);

  // Canvas initialization
  useEffect(() => {
    const hiddenCanvas = hiddenCanvasRef.current;
    const outputCanvas = outputCanvasRef.current;
    if (hiddenCanvas && outputCanvas) {
      const hiddenContext = hiddenCanvas.getContext('2d', { willReadFrequently: true });
      const outputContext = outputCanvas.getContext('2d', { willReadFrequently: true });
      if (!hiddenContext || !outputContext) {
        logger.error('[VideoSession] Failed to get canvas contexts');
      } else {
        hiddenCanvas.width = 640;
        hiddenCanvas.height = 480;
        outputCanvas.width = 640;
        outputCanvas.height = 480;
        hiddenContext.clearRect(0, 0, 640, 480);
        outputContext.clearRect(0, 0, 640, 480);
      }
    }
  }, []);

  // Stream attachment logic
  const attachStreamToVideo = useCallback((stream, videoEl) => {
    if (!stream || !videoEl) return false;

    currentStreamIdRef.current = stream.id;
    logger.info('[VideoSession] Stream attachment completed', {
      streamId: stream.id,
      videoReadyState: videoEl.readyState,
      tracks: stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })),
      sessionId,
    });

    return true;
  }, [sessionId]);

  useEffect(() => {
    if (localStream && localVideoRef.current && backgroundSettings?.mode === BACKGROUND_MODES.NONE) {
      attachStreamToVideo(localStream, localVideoRef.current);
    }
  }, [localStream, attachStreamToVideo, backgroundSettings, sessionId]);

  // Handle stream changes from background processor
  useEffect(() => {
    const handleStreamChanged = (event) => {
      const { stream } = event.detail;
      if (!stream || !localVideoRef.current) return;

      logger.info('[VideoSession] Processing stream-changed event', {
        newStreamId: stream.id,
        currentStreamId: currentStreamIdRef.current,
        sessionId,
      });

      if (backgroundSettings?.mode === BACKGROUND_MODES.NONE) {
        attachStreamToVideo(stream, localVideoRef.current);
      }
    };

    window.addEventListener('stream-changed', handleStreamChanged);
    return () => window.removeEventListener('stream-changed', handleStreamChanged);
  }, [attachStreamToVideo, backgroundSettings, sessionId]);

  // Render video function
  const renderVideo = (stream, peerId, displayName, isLocal = false, isScreen = false) => {
    if (!stream) {
      return (
        <div
          key={peerId}
          className={`relative ${layout === 'grid' || !spotlightPeerId ? 'aspect-video' : peerId === spotlightPeerId ? 'w-1/2 mx-auto' : 'w-1/4'} bg-gray-800 rounded-lg overflow-hidden`}
          style={{ height: layout === 'grid' ? '100%' : undefined, width: layout === 'grid' ? '100%' : undefined, minHeight: '200px' }}
        >
          <p className="text-white">{t('session.noVideoStream')}</p>
        </div>
      );
    }

    logger.info('[VideoSession] Rendering video', {
      peerId,
      isLocal,
      displayName,
      streamId: stream.id,
      videoTrackEnabled: stream.getVideoTracks()[0]?.enabled ?? false,
      isScreenSharing: isScreen,
      backgroundMode: isLocal && !isScreen ? backgroundSettings?.mode : 'none',
      sessionId,
    });

    return (
      <div
        key={peerId}
        className={`relative ${layout === 'grid' || !spotlightPeerId ? 'aspect-video' : peerId === spotlightPeerId ? 'w-1/2 mx-auto' : 'w-1/4'} bg-gray-800 rounded-lg overflow-hidden video-container-wrapper ${isScreen && isLocal ? 'border-4 border-red-500' : ''}`}
        style={{ maxHeight: '100%' }}
      >
        {isLocal && backgroundSettings?.mode !== BACKGROUND_MODES.NONE && !isScreen ? (
          <>
            <video ref={localVideoRef} muted autoPlay playsInline className="hidden" />
            <canvas ref={hiddenCanvasRef} className="hidden" />
            <canvas
              ref={outputCanvasRef}
              className="w-full h-full object-contain"
              style={{ transform: 'translateZ(0)', willChange: 'transform', imageRendering: 'auto', position: 'absolute', inset: 0 }}
            />
          </>
        ) : (
          <VideoPlayer stream={stream} peerId={peerId} isLocal={isLocal} localVideoRef={localVideoRef} sessionId={sessionId} />
        )}
        {isScreen && isLocal && (
          <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-1 rounded text-sm">
            {t('session.sharingScreen')}
          </div>
        )}
        {isScreen && isLocal && <ScreenSharePreview stream={stream} sessionId={sessionId} />}
        <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white p-1 rounded">
          {displayName || 'Unknown'}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`h-full flex-1 p-4 ${layout === 'grid' || !spotlightPeerId ? 'grid' : 'flex flex-wrap'} gap-4`}
      style={{
        gridTemplateColumns: layout === 'grid' ? 'repeat(auto-fit, minmax(300px, 1fr))' : '',
        gridAutoRows: layout === 'grid' ? '1fr' : '',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {screenStream ? (
        renderVideo(screenStream, 'screen', t('session.screenShare'), true, true)
      ) : (
        <>
          {localStream && renderVideo(localStream, 'local', t('session.you'), true)}
          {participants.map((participant) => renderVideo(participant.stream, participant.peerId, participant.displayName))}
        </>
      )}
    </div>
  );
};

VideoSession.propTypes = {
  localStream: PropTypes.object,
  participants: PropTypes.arrayOf(
    PropTypes.shape({
      peerId: PropTypes.string.isRequired,
      stream: PropTypes.object.isRequired,
      displayName: PropTypes.string,
    })
  ).isRequired,
  layout: PropTypes.oneOf(['grid', 'speaker']),
  activeSpeaker: PropTypes.string,
  sessionId: PropTypes.string.isRequired,
  backgroundSettings: PropTypes.shape({
    mode: PropTypes.string,
    customBackground: PropTypes.string,
    blurLevel: PropTypes.number
  }),
  screenStream: PropTypes.object,
  isScreenSharing: PropTypes.bool
};

export default VideoSession;