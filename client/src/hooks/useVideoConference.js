import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import adapter from 'webrtc-adapter';
import axios from 'axios';
import * as mediasoupClient from 'mediasoup-client';
import { logger } from '../utils/logger';

const peerConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: `turn:${process.env.REACT_APP_TURN_HOST || '172.17.153.237'}:${process.env.REACT_APP_TURN_PORT || '3474'}`,
      username: process.env.REACT_APP_TURN_USER || 'testuser',
      credential: process.env.REACT_APP_TURN_PASS || 'testpass',
    },
  ],
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10,
};



const useVideoConference = (sessionId, token, config = {}, socket, callbacks = {}) => {
  logger.info('[useVideoConference] Hook initialized', {
    sessionId,
    hasToken: !!token,
    configPassed: config,
    socketPassedIn: socket ? { id: socket.id, connected: socket.connected, nsp: socket.nsp?.name } : 'Not Passed In',
    callbacksProvided: Object.keys(callbacks),
    timestamp: new Date().toISOString(),
  });


  const defaultCallbacks = {
    onOvertimePrompt: (data) => logger.info('[useVideoConference] Default onOvertimePrompt called', { sessionId, data }),
    onPaymentFailure: (data) => logger.info('[useVideoConference] Default onPaymentFailure called', { sessionId, data }),
    onSessionContinued: (data) => logger.info('[useVideoConference] Default onSessionContinued called', { sessionId, data }),
    onOvertimeResponse: (data) => logger.info('[useVideoConference] Default onOvertimeResponse called', { sessionId, data }),
    onSessionEndedWithReason: (data) => logger.info('[useVideoConference] Default onSessionEndedWithReason called', { sessionId, data }),
    onAuthorizationConfirmed: (data) => logger.info('[useVideoConference] Default onAuthorizationConfirmed called', { sessionId, data }),
  };

  const mergedCallbacks = { ...defaultCallbacks, ...callbacks };

  const {
    onOvertimePrompt,
    onPaymentFailure,
    onSessionContinued,
    onOvertimeResponse,
    onSessionEndedWithReason,
    onAuthorizationConfirmed,
  } = mergedCallbacks;
  const [localStream, setLocalStream] = useState(config.stream || null);
  const [participants, setParticipants] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [networkQuality, setNetworkQuality] = useState('good');
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [error, setError] = useState(null);
  const [isGroupSession, setIsGroupSession] = useState(false);
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportsRef = useRef(new Map());
  const producersRef = useRef(new Map());
  const consumersRef = useRef(new Map());
  const [raisedHands, setRaisedHands] = useState([]);
  const [breakoutRoom, setBreakoutRoom] = useState(null);
  const hasStarted = useRef(false);
  const [audioEnabled, setAudioEnabled] = useState(config.audio !== false);
  const [videoEnabled, setVideoEnabled] = useState(config.video !== false);
  const [pendingMessages, setPendingMessages] = useState({});
  const socketRef = useRef();
  const peersRef = useRef({});
  const localVideoRef = useRef();

  const initializeMediaStream = useCallback(async () => {
    logger.info('[useVideoConference] initializeMediaStream called with config', {
      hasStream: !!config.stream,
      streamId: config.stream?.id || 'none',
      video: config.video,
      audio: config.audio,
      videoDeviceId: config.videoDeviceId,
      audioDeviceId: config.audioDeviceId,
      sessionId,
      configSource: config.source || 'unknown'
    });
  
    // If we have a valid stream from WaitingRoom, use it directly
    if (config.stream && config.stream.getTracks().some(t => t.readyState === 'live')) {
      logger.info('[useVideoConference] Using provided stream', { 
        streamId: config.stream.id,
        tracks: config.stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
          deviceId: t.getSettings()?.deviceId || 'unknown'
        }))
      });
      
      // CRITICAL: Check if there's a mismatch between the stream's device IDs and the requested device IDs
      const videoTrack = config.stream.getVideoTracks()[0];
      const audioTrack = config.stream.getAudioTracks()[0];
      
      const streamVideoDeviceId = videoTrack?.getSettings()?.deviceId;
      const streamAudioDeviceId = audioTrack?.getSettings()?.deviceId;
      
      const videoMismatch = config.videoDeviceId && streamVideoDeviceId !== config.videoDeviceId;
      const audioMismatch = config.audioDeviceId && streamAudioDeviceId !== config.audioDeviceId;
      
      // If there's a device mismatch, we need to create a new stream with the correct devices
      if (videoMismatch || audioMismatch) {
        logger.info('[useVideoConference] Device mismatch detected, creating new stream', {
          requested: {
            videoDeviceId: config.videoDeviceId,
            audioDeviceId: config.audioDeviceId
          },
          actual: {
            videoDeviceId: streamVideoDeviceId,
            audioDeviceId: streamAudioDeviceId
          }
        });
        
        // We'll fall through to the normal stream creation code
      } else {
        // No mismatch, use the provided stream directly
        // IMPORTANT: Using existing stream directly prevents freezing
        setLocalStream(config.stream);
        
        if (audioTrack) setAudioEnabled(audioTrack.enabled);
        if (videoTrack) setVideoEnabled(videoTrack.enabled);
        
        return config.stream;
      }
    }
    
    try {
      // Explicitly use the exact device IDs if provided, with optimal constraints
      const constraints = {
        video: config.video !== false ? 
          (config.videoDeviceId ? { 
            deviceId: { exact: config.videoDeviceId },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 }
          } : true) : 
          false,
        audio: config.audio !== false ? 
          (config.audioDeviceId ? { 
            deviceId: { exact: config.audioDeviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } : true) : 
          false
      };
      
      logger.info('[useVideoConference] Creating new stream with constraints', { 
        constraints, 
        sessionId 
      });
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      logger.info('[useVideoConference] New stream created', {
        streamId: stream.id,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          deviceId: t.getSettings()?.deviceId || 'unknown'
        })),
        sessionId
      });
      
      // Get any enabled/disabled state from the previous stream
      if (config.stream) {
        const prevVideoTrack = config.stream.getVideoTracks()[0];
        const prevAudioTrack = config.stream.getAudioTracks()[0];
        
        const newVideoTrack = stream.getVideoTracks()[0];
        const newAudioTrack = stream.getAudioTracks()[0];
        
        // Copy enabled states
        if (prevVideoTrack && newVideoTrack) {
          newVideoTrack.enabled = prevVideoTrack.enabled;
        }
        
        if (prevAudioTrack && newAudioTrack) {
          newAudioTrack.enabled = prevAudioTrack.enabled;
        }
      }
      
      setLocalStream(stream);
    
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];
      
      if (audioTrack) setAudioEnabled(audioTrack.enabled);
      if (videoTrack) setVideoEnabled(videoTrack.enabled);
      
      return stream;
    } catch (err) {
      // Enhanced error handling with fallback...
      logger.error('[useVideoConference] Failed to create stream', {
        error: err.message,
        stack: err.stack,
        name: err.name,
        constraints: {
          video: config.video,
          audio: config.audio,
          videoDeviceId: config.videoDeviceId,
          audioDeviceId: config.audioDeviceId
        }
      });
      
      // Provide specific error messages based on the error type
      let errorMessage = 'Could not access camera or microphone. Please check your device settings.';
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMessage = 'Permission denied. Please allow access to your camera and microphone.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = 'The selected camera or microphone was not found. It may have been disconnected.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = 'Could not access your camera or microphone. It might be in use by another application.';
      }
      
      // Try fallback to default devices with progressively reduced constraints
      try {
        logger.warn('[useVideoConference] Trying fallback to default devices');
        
        // First try with moderate constraints
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: config.video !== false ? {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15 }
            } : false,
            audio: config.audio !== false
          });
          
          logger.info('[useVideoConference] Fallback succeeded with moderate constraints');
          setLocalStream(fallbackStream);
          return fallbackStream;
        } catch (moderateErr) {
          // Try with minimal constraints
          logger.warn('[useVideoConference] Trying minimal constraints fallback');
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: config.video !== false,
            audio: config.audio !== false
          });
          
          logger.info('[useVideoConference] Fallback succeeded with minimal constraints');
          setLocalStream(fallbackStream);
          return fallbackStream;
        }
      } catch (fallbackErr) {
        logger.error('[useVideoConference] All fallbacks failed', { 
          original: err.message, 
          fallback: fallbackErr.message 
        });
        setError(errorMessage);
        throw err; // Throw the original error
      }
    }
  }, [config.stream, config.video, config.audio, config.videoDeviceId, config.audioDeviceId, sessionId]);

  const trackEngagement = useCallback((action) => {
    if (socketRef.current) {
      logger.info('[useVideoConference] Emitting engagement event', {
        action,
        sessionId,
        socketId: socketRef.current.id,
        timestamp: new Date().toISOString()
      });
      socketRef.current.emit('engagement', { sessionId, action }); 
    } else {
      logger.warn('[useVideoConference] Socket not available for engagement event', { sessionId, action });
    }
  }, [sessionId]);

  const raiseHand = useCallback(() => {
    logger.info('[useVideoConference] Attempting to raise hand', { 
      sessionId, 
      socketExists: !!socketRef.current,
      userId: config.userId 
    });
    if (socketRef.current) {
      socketRef.current.emit('raise-hand', { 
        sessionId, 
        peerId: socketRef.current.id 
      });
      trackEngagement('raise-hand');
      logger.info('[useVideoConference] Raise hand tracked as engagement', { 
        sessionId, 
        peerId: socketRef.current.id 
      });
    } else {
      logger.warn('[useVideoConference] Socket not available for raise-hand', { sessionId });
    }
  }, [sessionId, trackEngagement, config.userId]);

  const lowerHand = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('lower-hand', { sessionId, peerId: socketRef.current.id });
    }
  }, [sessionId]);

  const confirmHand = useCallback((userIdToConfirm) => {
    if (socketRef.current && config.isCoach) {
      logger.info('[useVideoConference] Emitting confirm-hand', { sessionId, userIdToConfirm, socketId: socketRef.current.id });
      socketRef.current.emit('confirm-hand', { sessionId, userIdToConfirm });
    } else {
      logger.warn('[useVideoConference] Cannot confirm hand', { 
        sessionId, 
        isCoach: config.isCoach, 
        socketExists: !!socketRef.current 
      });
    }
  }, [sessionId, config.isCoach]);

  const createBreakoutRooms = useCallback((roomAssignments) => {
    if (socketRef.current && config.isCoach) {
      socketRef.current.emit('create-breakout-rooms', { sessionId, roomAssignments });
    }
  }, [sessionId, config.isCoach]);

  const endBreakoutRooms = useCallback(() => {
    if (socketRef.current && config.isCoach) {
      socketRef.current.emit('end-breakout-rooms', { sessionId });
    }
  }, [sessionId]);

  const setupPeerConnection = useCallback((stream, socket) => {
    logger.info('[useVideoConference] Setting up peer connection', { 
      sessionId, 
      socketId: socket.id,
      streamId: stream.id,
      videoTrackState: stream.getVideoTracks()[0]?.readyState,
      audioTrackState: stream.getAudioTracks()[0]?.readyState,
      timestamp: new Date().toISOString()
    });
  
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
      config: peerConfiguration,
    });
  
    peer.on('signal', (signal) => {
      logger.info('[useVideoConference] Peer signal generated', {
        sessionId,
        signalType: signal.type,
        peerId: socket.id,
      });
      socket.emit('signal', {
        to: config.isCoach ? 'participants' : 'coach',
        from: socket.id,
        signal,
      });
    });

    peer.on('stream', (remoteStream) => {
      logger.info('[useVideoConference] Peer stream received', {
        sessionId,
        streamId: remoteStream.id,
        peerId: socket.id,
      });
      setParticipants((prev) => [
        ...prev,
        { peerId: socket.id, stream: remoteStream, displayName: config.displayName },
      ]);
    });

    peer.on('connect', () => {
      logger.info('[useVideoConference] Peer connected', { sessionId, peerId: socket.id });
      // Send any pending messages once the channel is open
      const peerId = socket.id;
      if (pendingMessages[peerId] && pendingMessages[peerId].length > 0) {
        pendingMessages[peerId].forEach((message) => {
          try {
            peer.send(JSON.stringify(message));
            logger.info('[useVideoConference] Sent queued message', { peerId, message, sessionId });
          } catch (err) {
            logger.error('[useVideoConference] Failed to send queued message', { peerId, error: err.message, sessionId });
          }
        });
        setPendingMessages((prev) => {
          const newPending = { ...prev };
          delete newPending[peerId];
          return newPending;
        });
      }
    });

    peer.on('error', (err) => {
      logger.error('[useVideoConference] Peer error', {
        error: err.message,
        stack: err.stack,
        sessionId,
        peerId: socket.id,
      });
      setError(`Peer error: ${err.message}`);
    });

    peersRef.current[socket.id] = peer;
  }, [sessionId, config.displayName, config.isCoach]);

  const initializeConference = useCallback(async (existingStream = null) => {
    let stream;

    logger.info('[useVideoConference] Initializing conference', {
      hasExistingStream: !!existingStream,
      streamId: existingStream?.id,
      tracks: existingStream?.getTracks().map(t => ({
        kind: t.kind,
        readyState: t.readyState,
        enabled: t.enabled,
      })),
      sessionId,
    });

    if (existingStream && existingStream.getTracks().some(t => t.readyState === 'live')) {
      stream = existingStream;
      setLocalStream(stream);
      logger.info('[useVideoConference] Local stream set with existing stream', {
        streamId: stream.id,
        tracks: stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })),
        sessionId,
      });
    } else {
      stream = await initializeMediaStream();
      if (!stream) {
        logger.warn('[useVideoConference] Stream initialization failed in initializeConference', { sessionId });
        return;
      }
    }

    try {
      if (!socket || !socket.connected) {
        logger.warn('[useVideoConference] Socket not connected in initializeConference', { sessionId });
        setError('Socket not available or not connected');
        return;
      }

      logger.info('[useVideoConference] Using provided socket for conference', {
        socketId: socket.id,
        sessionId,
        timestamp: new Date().toISOString(),
      });
      setupPeerConnection(stream, socket);

      socket.on('connect', () => {
        logger.info('[useVideoConference] Socket connected successfully', {
          socketId: socket.id,
          namespace: socket.nsp,
          sessionId,
          timestamp: new Date().toISOString(),
        });
        socket.emit('join-session', {
          sessionId,
          token,
          displayName: config.displayName || 'User',
          isCoach: config.isCoach || false,
          peerId: socket.id,
        });
      });

      socket.on('connect_error', (err) => {
        logger.error('[useVideoConference] Socket connection error', {
          error: err.message,
          sessionId,
          timestamp: new Date().toISOString(),
        });
        setError(`Socket connection failed: ${err.message}`);
      });
    } catch (err) {
      logger.error('[useVideoConference] Failed to initialize conference', {
        error: err.message,
        sessionId,
        timestamp: new Date().toISOString(),
      });
      setError(`Failed to initialize conference: ${err.message}`);
    }
  }, [sessionId, token, config, initializeMediaStream, setupPeerConnection, socket]);

  const cleanupPeers = useCallback(() => {
    Object.values(peersRef.current).forEach(peer => {
      try {
        peer.destroy();
      } catch (err) {
        console.warn('[useVideoConference] Peer cleanup error:', err.message);
      }
    });
    peersRef.current = {};
  }, []);


  const startSession = useCallback(async (passedConfig = {}) => {
    logger.info('[useVideoConference] Starting session attempt', {
      sessionId,
      token,
      isCoach: config.isCoach,
      isConnected,
      hasStarted: hasStarted.current,
      timestamp: new Date().toISOString()
    });

    if (isConnected || hasStarted.current) {
      logger.warn('[useVideoConference] Session start skipped', {
        reason: isConnected ? 'Already connected' : 'Already started',
        sessionId,
        isConnected,
        hasStarted: hasStarted.current
      });
      return;
    }

    const mergedConfig = { ...config, ...passedConfig };
    let streamToUse = mergedConfig.stream;
    if (streamToUse && streamToUse.getTracks().some(t => t.readyState === 'live')) {
      setLocalStream(streamToUse);
    } else {
      streamToUse = await initializeMediaStream();
      if (!streamToUse) {
        logger.error('[useVideoConference] Failed to initialize stream, aborting start', { sessionId });
        return;
      }
      setLocalStream(streamToUse);
    }

    const audioTrack = streamToUse.getAudioTracks()[0];
    const videoTrack = streamToUse.getVideoTracks()[0];
    if (audioTrack) setAudioEnabled(audioTrack.enabled);
    if (videoTrack) setVideoEnabled(videoTrack.enabled);

    try {
      if (!socket || !socket.connected) {
        logger.warn('[useVideoConference] Socket not connected in startSession', { sessionId });
        setError('Socket not available or not connected');
        return;
      }

      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await axios.post(
        `${apiUrl}/api/sessions/start/${sessionId}`,
        { token, displayName: mergedConfig.displayName || 'User', isCoach: mergedConfig.isCoach || false },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to start session');
      }

      const sessionResponse = await axios.get(`${apiUrl}/api/sessions/validate/${sessionId}/${token}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const sessionDetails = sessionResponse.data.sessionDetails || {};
      const isGroup = (sessionDetails.sessionType?.format === 'group' || sessionDetails.maxParticipants > 2) || false;
      setIsGroupSession(isGroup);

      if (isGroup) {
        deviceRef.current = new mediasoupClient.Device();
        socket.emit('join-session', {
          sessionId,
          token,
          displayName: mergedConfig.displayName || 'User',
          isCoach: mergedConfig.isCoach || false,
          peerId: socket.id,
        });
      } else {
        await initializeConference(streamToUse);
        if (mergedConfig.isCoach) {
          socket.emit('session-started', { sessionId });
        }
      }

      hasStarted.current = true;
      setIsConnected(true);
    } catch (err) {
      logger.error('[useVideoConference] Failed to start session', {
        error: err.message,
        sessionId,
        timestamp: new Date().toISOString()
      });
      setError(`Failed to start session: ${err.message}`);
      hasStarted.current = false;
    }
  }, [sessionId, token, config, initializeMediaStream, initializeConference, isConnected, isGroupSession, socket]);

  const createConsumerTransport = async () => {
    return new Promise((resolve) => {
      socketRef.current.emit('create-transport', { sessionId });
      socketRef.current.once('transport-created', ({ id, iceParameters, iceCandidates, dtlsParameters }) => {
        const transport = deviceRef.current.createRecvTransport({
          id,
          iceParameters,
          iceCandidates,
          dtlsParameters,
        });

        transport.on('connect', ({ dtlsParameters }, callback) => {
          socketRef.current.emit('connect-transport', { sessionId, transportId: id, dtlsParameters });
          socketRef.current.once('transport-connected', callback);
        });

        consumerTransportsRef.current.set(socketRef.current.id, { transport, socketId: socketRef.current.id });
        resolve({ transport, socketId: socketRef.current.id });
      });
    });
  };
  
  const produceStream = async (stream) => {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (videoTrack) {
      const producer = await producerTransportRef.current.produce({ track: videoTrack });
      producersRef.current.set('video', producer);
    }
    if (audioTrack) {
      const producer = await producerTransportRef.current.produce({ track: audioTrack });
      producersRef.current.set('audio', producer);
    }
  };

  const consumeStream = async (transport, producerId, rtpParameters, kind, id) => {
    const consumer = await transport.consume({ id, producerId, rtpParameters });
    consumersRef.current.set(id, consumer);
    const stream = new MediaStream();
    stream.addTrack(consumer.track);
    setParticipants(prev => 
      prev.map(p => 
        p.peerId === transport.socketId && !p.stream ? { ...p, stream } : p
      )
    );
  };
  
  const initializeGroupSession = async (stream) => {
    socketRef.current.emit('create-transport', { sessionId });
    produceStream(stream);
  };

  const endSession = useCallback(() => {
    logger.info('[useVideoConference] endSession invoked', {
      sessionId,
      isConnected,
      timestamp: new Date().toISOString()
    });

    if (socket) {
      socket.emit('end-session', { sessionId });
      socket.disconnect();
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        if (track.enabled) {
          track.stop();
        }
      });
      setLocalStream(null);
    }
    if (isGroupSession) {
      // ... group session cleanup remains unchanged
    } else {
      cleanupPeers();
    }
    setIsConnected(false);
    logger.info('[useVideoConference] isConnected set to false by endSession', { sessionId, timestamp: new Date().toISOString() });
  }, [sessionId, localStream, isGroupSession, socket]);

  const retryEmit = (event, data, retries = 3, delay = 1000) => {
    let attempts = 0;
    const logContext = { event: 'leave_session_client_v1', sessionId, userId: config.userId, attempt: attempts + 1 };
    const attempt = () => {
      if (!socketRef.current || !socketRef.current.connected) {
        if (attempts < retries) {
          attempts++;
          logger.warn('[useVideoConference] Socket not connected, retrying emission', { ...logContext, attempt: attempts });
          setTimeout(attempt, delay);
        } else {
          logger.error('[useVideoConference] Failed to emit after retries', { ...logContext, retries });
        }
        return;
      }
      try {
        socketRef.current.emit(event, data);
        logger.info('[useVideoConference] Emitted event on attempt', { ...logContext, event });
      } catch (error) {
        if (attempts < retries) {
          attempts++;
          logger.warn('[useVideoConference] Emission failed, retrying', { ...logContext, attempt: attempts, error: error.message });
          setTimeout(attempt, delay);
        } else {
          logger.error('[useVideoConference] Failed to emit after retries', { ...logContext, retries, error: error.message });
        }
      }
    };
    attempt();
  };
  
  const leaveSession = useCallback(() => {
    const logContext = { 
      event: 'leave_session_client_v1',
      sessionId, 
      userId: config.userId, 
      isCoach: config.isCoach,
      socketId: socketRef.current?.id,
      timestamp: new Date().toISOString()
    };
    logger.info('[useVideoConference] leaveSession invoked', logContext);
  
    if (config.isCoach) {
      logger.warn('[useVideoConference] Coach attempting to leave, redirecting to endSession', logContext);
      endSession(); // Coaches should end the session, not leave
      return;
    }
  
    if (!socketRef.current || !socketRef.current.connected) {
      logger.warn('[useVideoConference] Socket not connected, proceeding with cleanup', logContext);
    } else {
      // Emit the leave-session event with retry logic
      retryEmit('leave-session', { 
        sessionId, 
        userId: config.userId, 
        isCoach: config.isCoach 
      });
    }
  
    // Stop local media tracks
    if (localStream) {
      logger.debug('[useVideoConference] Stopping local stream tracks', { 
        ...logContext, 
        streamId: localStream.id 
      });
      localStream.getTracks().forEach((track) => {
        track.stop();
        logger.debug(`[useVideoConference] Stopped track: ${track.kind} (ID: ${track.id})`, logContext);
      });
      setLocalStream(null);
    } else {
      logger.warn('[useVideoConference] No local stream to stop', logContext);
    }
  
    // Clean up peer connections
    cleanupPeers();
    logger.info('[useVideoConference] Cleaned up peer connections', logContext);
  
    // Disconnect socket
    if (socketRef.current) {
      logger.info('[useVideoConference] Disconnecting socket', { 
        ...logContext, 
        socketId: socketRef.current.id 
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  
    // Reset state
    setIsConnected(false);
    hasStarted.current = false;
    setParticipants([]);
    logger.info('[useVideoConference] Local state reset', logContext);
  }, [sessionId, config.userId, config.isCoach, localStream, cleanupPeers, endSession]);

  const toggleAudio = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        if (audioTrack.enabled) {
          trackEngagement('unmute-audio');
          logger.info('[useVideoConference] Audio unmuted tracked as engagement', { sessionId });
        }
        logger.info('[useVideoConference] Audio toggled', {
          enabled: audioTrack.enabled,
          sessionId,
          trackId: audioTrack.id,
          streamId: localStream.id,
          trackReadyState: audioTrack.readyState
        });
        if (socket && socket.connected) {
          const message = {
            type: 'track-enabled-state',
            kind: 'audio',
            enabled: audioTrack.enabled
          };
          Object.entries(peersRef.current).forEach(([peerId, peer]) => {
            if (peer && peer.send) {
              const channelState = peer._channel?.readyState;
              if (channelState === 'open') {
                try {
                  peer.send(JSON.stringify(message));
                  logger.info('[useVideoConference] Sent audio toggle message', { peerId, sessionId });
                } catch (err) {
                  logger.error('[useVideoConference] Failed to send audio toggle message', { peerId, error: err.message, sessionId });
                }
              } else {
                logger.warn('[useVideoConference] RTCDataChannel not open, queuing message', { peerId, channelState, sessionId });
                setPendingMessages((prev) => ({
                  ...prev,
                  [peerId]: [...(prev[peerId] || []), message]
                }));
              }
            }
          });
        }
      }
    }
  }, [localStream, sessionId, socket, trackEngagement]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
        if (videoTrack.enabled) {
          trackEngagement('unmute-video');
          logger.info('[useVideoConference] Video unmuted tracked as engagement', { sessionId });
        }
        logger.info('[useVideoConference] Video toggled', {
          enabled: videoTrack.enabled,
          sessionId,
          trackId: videoTrack.id,
          streamId: localStream.id,
          trackReadyState: videoTrack.readyState
        });
        if (socket && socket.connected) {
          const message = {
            type: 'track-enabled-state',
            kind: 'video',
            enabled: videoTrack.enabled
          };
          Object.entries(peersRef.current).forEach(([peerId, peer]) => {
            if (peer && peer.send) {
              const channelState = peer._channel?.readyState;
              if (channelState === 'open') {
                try {
                  peer.send(JSON.stringify(message));
                  logger.info('[useVideoConference] Sent video toggle message', { peerId, sessionId });
                } catch (err) {
                  logger.error('[useVideoConference] Failed to send video toggle message', { peerId, error: err.message, sessionId });
                }
              } else {
                logger.warn('[useVideoConference] RTCDataChannel not open, queuing message', { peerId, channelState, sessionId });
                setPendingMessages((prev) => ({
                  ...prev,
                  [peerId]: [...(prev[peerId] || []), message]
                }));
              }
            }
          });
        }
      }
    }
  }, [localStream, sessionId, socket, trackEngagement]);

  const shareScreen = useCallback(async (setScreenSharingCallback) => {
    try {
      logger.info('[useVideoConference] Initiating screen sharing', { sessionId });
      const screenConstraints = {
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 15, max: 30 }, // Adjustable for performance
        },
        audio: true, // Optional: enable system audio if supported
      };
      const screenStream = await navigator.mediaDevices.getDisplayMedia(screenConstraints);
      const screenVideoTrack = screenStream.getVideoTracks()[0];
  
      logger.info('[useVideoConference] Screen stream obtained', {
        sessionId,
        streamId: screenStream.id,
        trackId: screenVideoTrack.id,
      });
  
      // Add screen stream to all peers without replacing camera stream
      Object.values(peersRef.current).forEach((peer) => {
        if (peer && !peer._destroyed) {
          peer.addStream(screenStream);
          logger.info('[useVideoConference] Added screen stream to peer', {
            peerId: peer._id,
            sessionId,
            streamId: screenStream.id,
          });
        }
      });
  
      socketRef.current?.emit('screen-sharing-started', { sessionId, peerId: socketRef.current.id });
  
      screenVideoTrack.onended = () => {
        logger.info('[useVideoConference] Screen sharing ended', { sessionId });
        Object.values(peersRef.current).forEach((peer) => {
          if (peer && !peer._destroyed) {
            peer.removeStream(screenStream);
          }
        });
        socketRef.current?.emit('screen-sharing-stopped', { sessionId, peerId: socketRef.current.id });
        if (setScreenSharingCallback) setScreenSharingCallback(false);
      };
  
      if (setScreenSharingCallback) setScreenSharingCallback(true);
      return screenStream;
    } catch (err) {
      logger.error('[useVideoConference] Screen sharing failed', {
        sessionId,
        error: err.message,
        stack: err.stack,
      });
      setError(`Screen sharing failed: ${err.message}`);
      return null;
    }
  }, [localStream, sessionId]);
  
  const trackToolUsage = useCallback((tool) => {
    if (socketRef.current) {
      logger.info('[useVideoConference] Emitting tool-used event with sessionId', { sessionId, tool });
      socketRef.current.emit('tool-used', { sessionId, tool });
    } else {
      logger.warn('[useVideoConference] Socket not available for tool-used event', { sessionId, tool });
    }
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      cleanupPeers();
      // Do NOT stop tracks here; let endSession handle it
    };
  }, [sessionId]);

  useEffect(() => {
    if (localStream) {
      const tracks = localStream.getTracks();
      const handleTrackEnded = (track) => () => {
        logger.warn('[useVideoConference] Track ended unexpectedly', { 
          kind: track.kind, 
          enabled: track.enabled, 
          readyState: track.readyState, 
          sessionId 
        });
      };
      const listeners = tracks.map(track => {
        const handler = handleTrackEnded(track);
        track.addEventListener('ended', handler);
        return { track, handler };
      });
      return () => {
        listeners.forEach(({ track, handler }) => {
          track.removeEventListener('ended', handler);
        });
      };
    }
  }, [localStream, sessionId]);

  useEffect(() => {
    if (!socket) {
      logger.warn('[useVideoConference] Socket not available when setting up listeners', {
        sessionId,
        timestamp: new Date().toISOString(),
      });
      return;
    }
  
    socketRef.current = socket; // Assign the passed socket to socketRef
    logger.info('[useVideoConference] Socket assigned to socketRef', {
      socketId: socket.id,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  
    logger.info('[useVideoConference] Setting up socket listeners', {
      socketId: socket.id,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  
    socket.on('session-started', () => {
      logger.info('[useVideoConference] Session started by coach, connecting participants', { sessionId, isConnected });
      setIsConnected(true);
      initializeConference();
    });
  
    socket.on('raised-hands-update', (updatedRaisedHands) => {
      logger.info('[useVideoConference] Raw raised-hands-update payload', { 
        sessionId, 
        rawPayload: JSON.stringify(updatedRaisedHands), 
        timestamp: new Date().toISOString() 
      });
      setRaisedHands(updatedRaisedHands || []);
      logger.info('[useVideoConference] Received raised-hands-update', { 
        sessionId, 
        raisedHandsCount: updatedRaisedHands.length,
        hands: updatedRaisedHands.map(h => ({ userId: h.userId, peerId: h.peerId, confirmed: h.confirmed }))
      });
    });
  
    socket.on('create-breakout-rooms', ({ roomAssignments }) => {
      const room = roomAssignments.find((room) => room.includes(config.userId));
      setBreakoutRoom(room || null);
    });
  
    socket.on('end-breakout-rooms', () => {
      setBreakoutRoom(null);
    });
  
    socket.on('active-speaker', ({ peerId }) => {
      setActiveSpeaker(peerId);
    });
  
    socket.on('participant-joined', ({ peerId, displayName }) => {
      setParticipants((prev) => [
        ...prev,
        { peerId, displayName, stream: null },
      ]);
    });
  
    socket.on('participant-left', ({ peerId }) => {
      setParticipants((prev) => prev.filter((p) => p.peerId !== peerId));
      delete peersRef.current[peerId];
    });

    socket.on('screen-sharing-started', ({ peerId }) => {
      logger.info('[useVideoConference] Screen sharing started by peer', { sessionId, peerId });
      setParticipants(prev => prev.map(p => 
        p.peerId === peerId ? { ...p, screenSharing: true } : p
      ));
    });
    
    socket.on('screen-sharing-stopped', ({ peerId }) => {
      logger.info('[useVideoConference] Screen sharing stopped by peer', { sessionId, peerId });
      setParticipants(prev => prev.map(p => 
        p.peerId === peerId ? { ...p, screenSharing: false } : p
      ));
    });
  
    socket.on('signal', ({ from, signal }) => {
      if (peersRef.current[from]) {
        peersRef.current[from].signal(signal);
      } else {
        const peer = new Peer({
          initiator: false,
          trickle: false,
          stream: localStream,
          config: peerConfiguration,
        });
  
        peer.on('signal', (data) => {
          socket.emit('signal', { to: from, from: socket.id, signal: data });
        });
  
        peer.on('stream', (remoteStream) => {
          setParticipants((prev) => [
            ...prev,
            { peerId: from, stream: remoteStream, displayName: config.displayName },
          ]);
        });
  
        peer.signal(signal);
        peersRef.current[from] = peer;
      }
    });
  
    socket.on('network-quality', (quality) => {
      setNetworkQuality(quality);
    });

    socket.on('overtime-prompt', (data) => {
      logger.info('[useVideoConference] Received overtime-prompt event', {
        sessionId,
        data: {
          bookingId: data?.metadata?.bookingId,
          overtimeOptions: data?.metadata?.overtimeOptions,
        },
        timestamp: new Date().toISOString(),
      });
      if (data && typeof onOvertimePrompt === 'function') {
        onOvertimePrompt(data);
      } else {
        logger.warn('[useVideoConference] Invalid overtime-prompt data or callback missing', {
          sessionId,
          hasData: !!data,
          hasCallback: typeof onOvertimePrompt === 'function',
        });
      }
    });

    socket.on('payment-failure', (data) => {
      logger.info('[useVideoConference] Received payment-failure event', {
        sessionId,
        data: {
          bookingId: data?.metadata?.bookingId,
          sessionId: data?.metadata?.sessionId,
        },
        timestamp: new Date().toISOString(),
      });
      if (data && typeof onPaymentFailure === 'function') {
        onPaymentFailure(data);
      } else {
        logger.warn('[useVideoConference] Invalid payment-failure data or callback missing', {
          sessionId,
          hasData: !!data,
          hasCallback: typeof onPaymentFailure === 'function',
        });
      }
    });

    socket.on('session-continued', (data) => {
      logger.info('[useVideoConference] Received session-continued event', {
        sessionId,
        data: {
          newEndTime: data?.newEndTime,
        },
        timestamp: new Date().toISOString(),
      });
      if (data && typeof onSessionContinued === 'function') {
        onSessionContinued(data);
      } else {
        logger.warn('[useVideoConference] Invalid session-continued data or callback missing', {
          sessionId,
          hasData: !!data,
          hasCallback: typeof onSessionContinued === 'function',
        });
      }
    });

    socket.on('overtime-response', (data) => {
      logger.info('[useVideoConference] Received overtime-response event', {
        sessionId,
        data: {
          choice: data?.choice,
          actualEndTime: data?.actualEndTime,
        },
        timestamp: new Date().toISOString(),
      });
      if (data && typeof onOvertimeResponse === 'function') {
        onOvertimeResponse(data);
      } else {
        logger.warn('[useVideoConference] Invalid overtime-response data or callback missing', {
          sessionId,
          hasData: !!data,
          hasCallback: typeof onOvertimeResponse === 'function',
        });
      }
    });

    socket.on('authorization_confirmed', onAuthorizationConfirmed);

    socket.on('session-ended', (data) => {
      logger.info('[useVideoConference] Received session-ended event', {
        sessionId,
        reason: data?.reason,
        timestamp: new Date().toISOString(),
      });
      setIsConnected(false);
      if (typeof onSessionEndedWithReason === 'function') {
        onSessionEndedWithReason(data || {});
      } else {
        logger.warn('[useVideoConference] session-ended callback missing', {
          sessionId,
          hasCallback: typeof onSessionEndedWithReason === 'function',
        });
      }
    });
  
    return () => {
      if (socket) {
        logger.info('[useVideoConference] Cleaning up socket listeners', {
          socketId: socket.id,
          sessionId,
          timestamp: new Date().toISOString(),
        });
        socket.off('connect');
        socket.off('connect_error');
        socket.off('disconnect'); // Added missing disconnect cleanup
        socket.off('reconnect_attempt'); // Added missing reconnect attempt cleanup
        socket.off('raised-hands-update');
        socket.off('create-breakout-rooms');
        socket.off('end-breakout-rooms');
        socket.off('active-speaker');
        socket.off('participant-joined');
        socket.off('participant-left');
        socket.off('signal');
        socket.off('network-quality');
        socket.off('screen-sharing-started'); // Added missing cleanup
        socket.off('screen-sharing-stopped'); // Added missing cleanup
        socket.off('session-started');

        // Detach Payment/Overtime listeners correctly
        socket.off('overtime-prompt');
        socket.off('payment-failure');
        socket.off('session-continued');
        socket.off('overtime-response');
        socket.off('session-ended');
        socket.off('authorization_confirmed');
      } else {
        logger.warn('[useVideoConference] Socket not available during cleanup', {
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    };
  }, [sessionId, localStream, config.displayName, config.userId, socket, initializeConference]);

  useEffect(() => {
    const handleStreamUpdate = (event) => {
      const newStream = event.detail?.stream;
      if (!newStream || newStream.id === localStream?.id) {
        return;
      }
    
      logger.info('[useVideoConference] Updating local stream from event', {
        newStreamId: newStream.id,
        oldStreamId: localStream?.id,
        tracks: newStream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          readyState: t.readyState,
        })),
        sessionId,
      });
    
      // Important: Update local state first to ensure UI updates
      setLocalStream(newStream);
      
      // Now handle peer connections more carefully
      if (socketRef.current && socketRef.current.connected) {
        Object.entries(peersRef.current).forEach(([peerId, peer]) => {
          if (!peer || peer._destroyed) return;
          
          try {
            // IMPORTANT: Check if the peer is fully established before attempting updates
            if (!peer._channel || peer._channel.readyState !== 'open') {
              logger.info('[useVideoConference] Peer connection not ready for stream update', {
                peerId,
                channelState: peer._channel?.readyState || 'no channel',
                sessionId
              });
              return; // Skip this peer until connection is ready
            }
            
            // Simple-peer uses addTrack and removeTrack for this - not replaceTrack
            const newVideoTrack = newStream.getVideoTracks()[0];
            const newAudioTrack = newStream.getAudioTracks()[0];
            
            // Get all tracks already on the peer
            const existingTracks = [];
            
            // If peer has _localStreams, check those for tracks
            if (peer._localStreams && peer._localStreams.length > 0) {
              peer._localStreams.forEach(stream => {
                stream.getTracks().forEach(track => {
                  existingTracks.push(track);
                });
              });
            }
            
            // For each existing track of type video, remove it
            const existingVideoTracks = existingTracks.filter(t => t.kind === 'video');
            if (existingVideoTracks.length > 0 && newVideoTrack) {
              existingVideoTracks.forEach(oldTrack => {
                try {
                  // First try with simple-peer's direct removeTrack
                  if (peer.removeTrack) {
                    logger.info('[useVideoConference] Removing existing video track', {
                      trackId: oldTrack.id,
                      peerId,
                      sessionId
                    });
                    peer.removeTrack(oldTrack);
                  }
                } catch (err) {
                  logger.warn('[useVideoConference] Error removing video track', {
                    error: err.message,
                    trackId: oldTrack.id,
                    peerId
                  });
                }
              });
            }
            
            // Add the new video track if available
            if (newVideoTrack && peer.addTrack) {
              try {
                logger.info('[useVideoConference] Adding new video track', {
                  trackId: newVideoTrack.id,
                  peerId,
                  sessionId
                });
                peer.addTrack(newVideoTrack, newStream);
              } catch (err) {
                // Track might already exist or other issue
                logger.error('[useVideoConference] Failed to add video track', {
                  error: err.message,
                  trackId: newVideoTrack.id,
                  peerId,
                  sessionId
                });
                
                // Special case: if we can't add the track, try to notify about stream update
                if (peer._channel && peer._channel.readyState === 'open') {
                  try {
                    peer.send(JSON.stringify({
                      type: 'stream-changed',
                      streamId: newStream.id
                    }));
                    logger.info('[useVideoConference] Notified peer of stream change', {
                      peerId,
                      sessionId
                    });
                  } catch (sendErr) {
                    // Just log if this fails too
                    logger.warn('[useVideoConference] Failed to notify peer of stream change', {
                      error: sendErr.message,
                      peerId
                    });
                  }
                }
              }
            }
            
            // Similarly handle audio tracks if needed
            // (This follows the same pattern as video tracks)
            
          } catch (err) {
            logger.error('[useVideoConference] Error updating peer stream', {
              peerId,
              error: err.message,
              sessionId
            });
          }
        });
      }
    };
    
    // Listen for both event types
    window.addEventListener('webrtc-stream-update', handleStreamUpdate);
    window.addEventListener('stream-changed', handleStreamUpdate);
    
    return () => {
      window.removeEventListener('webrtc-stream-update', handleStreamUpdate);
      window.removeEventListener('stream-changed', handleStreamUpdate);
    };
  }, [localStream, sessionId]);

  useEffect(() => {
    const handleSimplePeerStreamUpdate = (event) => {
      const newStream = event.detail?.stream;
      if (!newStream) return;
      
      logger.info('[useVideoConference] Received simple-peer stream update', {
        streamId: newStream.id,
        sessionId,
        trackCount: newStream.getTracks().length
      });
      
      // Update local stream state
      setLocalStream(newStream);
      
      // Handle simple-peer connections specifically
      if (socketRef.current && socketRef.current.connected) {
        Object.entries(peersRef.current).forEach(([peerId, peer]) => {
          if (!peer || peer._destroyed) return;
          
          try {
            // Make sure peer is ready for operations
            if (!peer._channel || peer._channel.readyState !== 'open') {
              logger.info('[useVideoConference] Peer not ready for update in simple-peer handler', {
                peerId,
                channelState: peer._channel?.readyState || 'no channel',
                sessionId
              });
              return;
            }
            
            // Simple-peer doesn't support direct replaceTrack
            // Instead, we need to remove existing tracks and add new ones
            
            // Handle video track
            const newVideoTrack = newStream.getVideoTracks()[0];
            if (newVideoTrack) {
              // First, attempt to get existing stream
              let existingStream = null;
              if (peer._senders && peer._senders.length > 0) {
                // Find video sender
                const videoSender = peer._senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                  logger.info('[useVideoConference] Found existing video sender', {
                    trackId: videoSender.track?.id,
                    peerId
                  });
                  
                  // Remove this track if possible
                  try {
                    peer.removeTrack(videoSender.track);
                  } catch (err) {
                    logger.warn('[useVideoConference] Could not remove sender track', {
                      error: err.message,
                      peerId
                    });
                  }
                }
              }
              
              // Add the new video track
              try {
                peer.addTrack(newVideoTrack, newStream);
                logger.info('[useVideoConference] Added new video track via simple-peer', {
                  trackId: newVideoTrack.id,
                  peerId,
                  sessionId
                });
              } catch (err) {
                logger.error('[useVideoConference] Could not add video track via simple-peer', {
                  error: err.message,
                  peerId,
                  sessionId
                });
              }
            }
            
            // Similarly handle audio (follow same pattern)
            
            // Notify peer about stream change (as backup)
            try {
              if (peer.send) {
                peer.send(JSON.stringify({
                  type: 'stream-changed',
                  streamId: newStream.id,
                  timestamp: new Date().toISOString()
                }));
              }
            } catch (err) {
              // Log but continue even if notification fails
              logger.warn('[useVideoConference] Failed to notify peer about stream', {
                error: err.message,
                peerId
              });
            }
          } catch (err) {
            logger.error('[useVideoConference] Error in simple-peer update handler', {
              error: err.message,
              peerId,
              sessionId
            });
          }
        });
      }
    };
    
    window.addEventListener('simple-peer-stream-update', handleSimplePeerStreamUpdate);
    return () => {
      window.removeEventListener('simple-peer-stream-update', handleSimplePeerStreamUpdate);
    };
  }, [sessionId]);

  return {
    localStream,
    participants,
    isConnected,
    startSession,
    endSession,
    leaveSession,
    toggleAudio,
    toggleVideo,
    shareScreen,
    error,
    networkQuality,
    activeSpeaker,
    raiseHand,
    lowerHand,
    raisedHands,
    createBreakoutRooms,
    endBreakoutRooms,
    breakoutRoom,
    audioEnabled,
    videoEnabled,
    trackEngagement,
    trackToolUsage,
    confirmHand,
  };
};

export default useVideoConference;