import { logger } from '../utils/logger';

export const emitEvent = (socket, eventName, data) => {
  if (socket && socket.connected) {
    socket.emit(eventName, data);
  } else {
    logger.warn(`[emitEvent] Socket not connected. Cannot emit event '${eventName}'.`);
  }
};