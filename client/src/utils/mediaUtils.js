import { logger } from './logger';

const createSilentAudioTrack = () => {
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const dst = oscillator.connect(ctx.createMediaStreamDestination());
  oscillator.start();
  const track = dst.stream.getAudioTracks()[0];
  return Object.assign(track, { enabled: true });
};

const createBlankVideoTrack = ({ width = 640, height = 480 } = {}) => {
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  canvas.getContext('2d').fillRect(0, 0, width, height);
  const stream = canvas.captureStream();
  const track = stream.getVideoTracks()[0];
  return Object.assign(track, { enabled: true });
};

export const createPlaceholderStream = () => {
  try {
    const audioTrack = createSilentAudioTrack();
    const videoTrack = createBlankVideoTrack();
    return new MediaStream([videoTrack, audioTrack]);
  } catch (e) {
    logger.error("[mediaUtils] Failed to create placeholder stream", e);
    return new MediaStream();
  }
};