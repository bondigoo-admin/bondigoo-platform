import { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import { logger } from '../utils/logger';

const peerConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  iceTransportPolicy: 'all',
};

const useLiveSessionCall = (socket, sessionId, token, config = {}) => {
  logger.info('[useLiveSessionCall] Hook initialized', {
    sessionId,
    hasToken: !!token,
    socketPassedIn: socket ? { id: socket.id, connected: socket.connected } : 'Not Passed In',
  });

  const [localStream, setLocalStream] = useState(config.stream || null);
  const localStreamRef = useRef(config.stream || null);
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState(null);
  const peersRef = useRef({});
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const cameraStreamRef = useRef(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const cleanupPeers = useCallback(() => {
    logger.info('[useLiveSessionCall] Cleaning up all peer connections.', { sessionId });
    Object.values(peersRef.current).forEach(peer => {
      if (peer && !peer.destroyed) {
        peer.destroy();
      }
    });
    peersRef.current = {};
  }, [sessionId]);

  const updateLocalStream = useCallback((newStream) => {
    if (!newStream) return;
    
    const oldStream = localStreamRef.current;
    
    const newVideoTrack = newStream.getVideoTracks()[0];
    const newAudioTrack = newStream.getAudioTracks()[0];

    Object.values(peersRef.current).forEach(peer => {
      if (peer && !peer.destroyed && peer._pc) {
        peer._pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'video' && newVideoTrack) {
            sender.replaceTrack(newVideoTrack).catch(err => logger.error('[useLiveSessionCall] Video track replacement failed', { err }));
          }
          if (sender.track && sender.track.kind === 'audio' && newAudioTrack) {
            sender.replaceTrack(newAudioTrack).catch(err => logger.error('[useLiveSessionCall] Audio track replacement failed', { err }));
          }
        });
      }
    });
    
    setLocalStream(newStream);

    if (oldStream && oldStream.id !== newStream.id) {
      oldStream.getTracks().forEach(track => track.stop());
    }
    logger.info('[useLiveSessionCall] Local stream tracks updated mid-call.');
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
        if (cameraStreamRef.current) {
            updateLocalStream(cameraStreamRef.current);
            localStreamRef.current?.getTracks().forEach(track => track.stop());
            cameraStreamRef.current = null;
        }
        setIsScreenSharing(false);
        logger.info('[useLiveSessionCall] Screen sharing stopped.');
    } else {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            
            cameraStreamRef.current = localStreamRef.current;

            screenStream.getVideoTracks()[0].onended = () => {
                if (cameraStreamRef.current) {
                    updateLocalStream(cameraStreamRef.current);
                    cameraStreamRef.current = null;
                    setIsScreenSharing(false);
                    logger.info('[useLiveSessionCall] Screen sharing stopped via browser UI.');
                }
            };
            
            updateLocalStream(screenStream);
            setIsScreenSharing(true);
            logger.info('[useLiveSessionCall] Screen sharing started.');
        } catch (err) {
            logger.error('[useLiveSessionCall] Could not start screen sharing', { error: err.message });
            setError('Screen sharing failed. Please check browser permissions.');
        }
    }
  }, [isScreenSharing, updateLocalStream]);

  useEffect(() => {
    if (!socket || !socket.connected) {
      logger.warn('[useLSC-EFFECT] SKIPPING setup: socket not ready.', {
        socketId: socket?.id,
        socketConnected: socket?.connected,
      });
      return;
    }

    const createPeer = (peerId, displayName, isCoach, initiator) => {
        logger.info(`[useLiveSessionCall] Creating peer connection for ${peerId}`, { initiator });
        if (!localStreamRef.current) {
            logger.error('[useLiveSessionCall] Cannot create peer without a local stream.');
            return;
        }

        const peer = new Peer({
            initiator,
            trickle: false,
            stream: localStreamRef.current,
            config: peerConfiguration,
        });

        peer.on('signal', signal => {
            logger.info(`[useLiveSessionCall] > PEER SIGNAL GENERATED. Emitting 'signal' to server for peer ${peerId}.`, { type: signal.type });
            socket.emit('signal', { to: peerId, from: socket.id, signal });
        });
        
        peer.on('stream', remoteStream => {
            logger.info(`[useLiveSessionCall] << RCVD stream from peer ${peerId}`, { streamId: remoteStream.id });
            setParticipants(prev => {
                 if (prev.find(p => p.peerId === peerId)) return prev;
                 return [...prev, { peerId, displayName, isCoach, stream: remoteStream }];
            });
        });
        
        peer.on('error', err => {
            logger.error('[useLiveSessionCall] Peer connection error', { peerId, error: err.message });
            setError(`Connection error with ${displayName}.`);
        });

        peer.on('close', () => {
            logger.warn(`[useLiveSessionCall] Peer connection closed for ${peerId}. Notifying server.`);
            socket.emit('peer-disconnected', { sessionId, peerId });
        });

        peersRef.current[peerId] = peer;
    };

     const handleParticipantJoined = ({ peerId, displayName, isCoach }) => {
      logger.info(`[useLiveSessionCall] << RCVD participant-joined. A new user has entered. Creating non-initiator peer.`, { peerId, displayName });
      if (!peersRef.current[peerId]) {
        createPeer(peerId, displayName, isCoach, false);
      } else {
        logger.warn(`[useLiveSessionCall] Ignored participant-joined for already existing peer.`, { peerId });
      }
    };

    const handleSessionParticipants = (participantsList) => {
        logger.info(`[useLiveSessionCall] << RCVD session-participants list. Creating initiator peers.`, { count: participantsList.length });
        participantsList.forEach(participant => {
            if (!peersRef.current[participant.peerId]) {
                createPeer(participant.peerId, participant.displayName, participant.isCoach, true);
            }
        });
    };

    const handleSignalReceived = ({ from, signal, displayName, isCoach }) => {
        logger.info(`[useLiveSessionCall] << RCVD signal from peer ${from}`, { type: signal.type });
        let peer = peersRef.current[from];
        
        if (!peer) {
            logger.warn(`[useLiveSessionCall] Received signal but peer not found for ${from}. Creating receiver peer.`);
            createPeer(from, displayName || 'Peer', isCoach || false, false);
            peer = peersRef.current[from];
        }
        
        if (peer && !peer.destroyed) {
            peer.signal(signal);
        }
    };

    const handleParticipantLeft = ({ peerId }) => {
      logger.warn(`[useLiveSessionCall] << RCVD participant-left: ${peerId}`);
      setParticipants(prev => prev.filter(p => p.peerId !== peerId));
      if (peersRef.current[peerId]) {
        if (!peersRef.current[peerId].destroyed) {
          peersRef.current[peerId].destroy();
        }
        delete peersRef.current[peerId];
      }
    };
    
    const handleSessionReady = (data) => {
        logger.info(`[useLiveSessionCall] << RCVD 'session-ready'. The call can now begin.`, { data });
    };

    logger.info(`[useLSC-EFFECT] Conditions met. Emitting 'join-live-session-handshake' for session ${sessionId}`);
    socket.emit('join-live-session-handshake', {
        sessionId,
        token,
        userId: config.userId,
    });

    socket.on('session-participants', handleSessionParticipants);
    socket.on('participant-joined', handleParticipantJoined);
    socket.on('signal', handleSignalReceived);
    socket.on('participant-left', handleParticipantLeft);
    socket.on('session-ready', handleSessionReady);

    return () => {
      logger.info('[useLiveSessionCall] Cleaning up hook.', { sessionId });
      socket.off('session-participants', handleSessionParticipants);
      socket.off('participant-joined', handleParticipantJoined);
      socket.off('signal', handleSignalReceived);
      socket.off('participant-left', handleParticipantLeft);
      socket.off('session-ready', handleSessionReady);
      cleanupPeers();
    };
  }, [socket, config.userId, sessionId, token, cleanupPeers]);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        logger.info('[useLiveSessionCall] Audio toggled', { enabled: audioTrack.enabled });
      }
    }
  }, []);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
        logger.info('[useLiveSessionCall] Video toggled', { enabled: videoTrack.enabled });
      }
    }
  }, []);
  
  return {
    localStream,
    participants,
    error,
    audioEnabled,
    videoEnabled,
    toggleAudio,
    toggleVideo,
    isScreenSharing,
    toggleScreenShare,
    updateLocalStream,
  };
};

export default useLiveSessionCall;