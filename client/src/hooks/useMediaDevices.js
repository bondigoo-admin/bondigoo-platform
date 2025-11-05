import { useReducer, useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { logger } from '../utils/logger';
import { createMediaPipeProcessor, isBrowserSupported } from '../utils/MediaPipeProcessor';
import { toast } from 'react-toastify';

const mediaDeviceReducer = (state, action) => {
  switch (action.type) {
    case 'INITIALIZE_START':
      return { ...state, status: 'initializing' };
    case 'INITIALIZE_SUCCESS':
      return {
        ...state,
        status: 'ready',
        stream: action.payload.stream,
        devices: action.payload.devices,
        selectedDevices: action.payload.selectedDevices,
      };
    case 'DEVICE_CHANGE_START':
        return { ...state, status: 'changing_device' };
    case 'STREAM_UPDATED':
      return { ...state, status: 'ready', stream: action.payload.stream };
    case 'SET_ERROR':
      return { ...state, status: 'error', error: action.payload.error, stream: null };
    case 'TOGGLE_AUDIO': {
      const isAudioEnabled = !state.mediaState.isAudioEnabled;
      if (state.stream) {
        state.stream.getAudioTracks().forEach(track => track.enabled = isAudioEnabled);
      }
      return { ...state, mediaState: { ...state.mediaState, isAudioEnabled } };
    }
    case 'TOGGLE_VIDEO': {
      const isVideoEnabled = !state.mediaState.isVideoEnabled;
      if (state.stream) {
        state.stream.getVideoTracks().forEach(track => track.enabled = isVideoEnabled);
      }
      return { ...state, mediaState: { ...state.mediaState, isVideoEnabled } };
    }
    case 'SELECT_DEVICE':
        return { ...state, selectedDevices: { ...state.selectedDevices, [action.payload.type]: action.payload.id } };
    case 'SET_BACKGROUND_SETTINGS':
        return { ...state, backgroundSettings: action.payload };
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
};

export const useMediaDevices = () => {
  const [state, dispatch] = useReducer(mediaDeviceReducer, {
    status: 'initializing',
    error: null,
    stream: null,
    devices: { video: [], audio: [] },
    selectedDevices: { video: '', audio: '' },
    mediaState: { isVideoEnabled: true, isAudioEnabled: true },
    backgroundSettings: { mode: 'none', imageUrl: null, blurAmount: 10 },
  });
  const isInitialMount = useRef(true);
  const processorRef = useRef(null);
  const [processedStream, setProcessedStream] = useState(null);

  const cleanupStream = useCallback((stream) => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  }, []);
  
  useEffect(() => {
    let isCancelled = false;
    const initialize = async () => {
      dispatch({ type: 'INITIALIZE_START' });
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        if (isCancelled) return;

        const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
        const audioDevices = allDevices.filter(d => d.kind === 'audioinput');
        const defaultVideo = videoDevices[0]?.deviceId || '';
        const defaultAudio = audioDevices[0]?.deviceId || '';

        const constraints = {
          audio: defaultAudio ? { deviceId: { exact: defaultAudio } } : true,
          video: defaultVideo ? { deviceId: { exact: defaultVideo }, width: { ideal: 1280 }, height: { ideal: 720 } } : true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          cleanupStream(stream);
          return;
        }

        dispatch({
          type: 'INITIALIZE_SUCCESS',
          payload: {
            stream,
            devices: { video: videoDevices, audio: audioDevices },
            selectedDevices: { video: defaultVideo, audio: defaultAudio },
          },
        });
      } catch (err) {
        logger.error('[useMediaDevices] Initialization failed! See error details below.', { 
            errorName: err.name, 
            errorMessage: err.message,
            stack: err.stack
        });
        if (!isCancelled) dispatch({ type: 'SET_ERROR', payload: { error: `${err.name}: ${err.message}` } });
      }
    };
    
    initialize();

    return () => {
      isCancelled = true;
      if (state.stream) {
        cleanupStream(state.stream);
      }
    };
  }, [cleanupStream]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (state.status === 'initializing') {
      return;
    }

    let isCancelled = false;
    const updateStream = async () => {
        dispatch({ type: 'DEVICE_CHANGE_START' });
        try {
            const constraints = {
                audio: { deviceId: { exact: state.selectedDevices.audio } },
                video: { deviceId: { exact: state.selectedDevices.video }, width: { ideal: 1280 }, height: { ideal: 720 } },
            };
            
            cleanupStream(state.stream);

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (isCancelled) {
                cleanupStream(newStream);
                return;
            }
            dispatch({ type: 'STREAM_UPDATED', payload: { stream: newStream } });
        } catch (err) {
            logger.error('[useMediaDevices] (UPDATE) Stream update failed! See error details below.', { 
                errorName: err.name, 
                errorMessage: err.message,
                stack: err.stack
            });
            if (!isCancelled) dispatch({ type: 'SET_ERROR', payload: { error: `${err.name}: ${err.message}` } });
        }
    };

    updateStream();

    return () => { isCancelled = true };
  }, [state.selectedDevices.video, state.selectedDevices.audio, cleanupStream]);

  const videoTrackId = state.stream?.getVideoTracks()[0]?.id;

  useEffect(() => {
    let isCancelled = false;

    const cleanupProcessor = () => {
        if (processorRef.current) {
            processorRef.current.destroy();
            processorRef.current = null;
        }
        if (!isCancelled) {
            setProcessedStream(null);
        }
    };

    const initializeProcessor = async () => {
        if (!state.stream || !videoTrackId || state.backgroundSettings.mode === 'none') {
            cleanupProcessor();
            return;
        }

        if (!isBrowserSupported()) {
            toast.warn("Background effects are not supported on this browser.");
            dispatch({ type: 'SET_BACKGROUND_SETTINGS', payload: { ...state.backgroundSettings, mode: 'none' } });
            return;
        }

        try {
            const processor = await createMediaPipeProcessor(state.stream, state.backgroundSettings);
            if (isCancelled) {
                processor.destroy();
                return;
            }
            processorRef.current = processor;
            setProcessedStream(processor.processedStream);
        } catch (error) {
            logger.error('[useMediaDevices] Failed to init BG processor', { error: error.message });
            dispatch({ type: 'SET_BACKGROUND_SETTINGS', payload: { ...state.backgroundSettings, mode: 'none' } });
        }
    };

    initializeProcessor();

    return () => {
        isCancelled = true;
        cleanupProcessor();
    };
  }, [videoTrackId, state.backgroundSettings.mode]);

  useEffect(() => {
    if (processorRef.current) {
        processorRef.current.updateSettings(state.backgroundSettings);
    }
  }, [state.backgroundSettings.imageUrl, state.backgroundSettings.blurAmount]);
  
  const displayStream = useMemo(() => {
    return state.backgroundSettings.mode !== 'none' && processedStream ? processedStream : state.stream;
  }, [state.backgroundSettings.mode, processedStream, state.stream]);

  return { state: { ...state, displayStream }, dispatch };
};