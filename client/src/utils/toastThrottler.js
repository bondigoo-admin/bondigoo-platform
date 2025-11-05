import { logger } from '../utils/logger'; 

const shownToasts = new Map();
const TOAST_COOLDOWN = 5000; // 5 seconds cooldown for duplicate toasts

/**
 * Throttle toast messages to prevent duplicates
 * @param {Function} toastFn - The original toast function to call
 * @param {string} message - The toast message
 * @param {Object} options - Any additional options for the toast
 * @returns {any} The result of the toast function or null if throttled
 */
export const throttleToast = (toastFn, message, options = {}) => {
  if (typeof toastFn !== 'function') {
    logger.error('[toastThrottler] toastFn is not a function', { toastFn, message, options });
    return null;
  }
  // Rest of the function remains unchanged
  const key = `${message}`;
  const now = Date.now();
  
  if (shownToasts.has(key)) {
    const lastShown = shownToasts.get(key);
    if (now - lastShown < TOAST_COOLDOWN) {
      logger.info('[toastThrottler] Toast throttled', { message, lastShown });
      return null;
    }
  }
  
  shownToasts.set(key, now);
  setTimeout(() => {
    if (shownToasts.has(key) && shownToasts.get(key) <= now) {
      shownToasts.delete(key);
    }
  }, TOAST_COOLDOWN + 1000);
  
  //logger.info('[toastThrottler] Displaying toast', { message });
  return toastFn(message, options);
};