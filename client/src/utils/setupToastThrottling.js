import { toast } from 'react-hot-toast';
import { throttleToast } from './toastThrottler';
import { logger } from '../utils/logger'; // Ensure logger is imported

// Define info and warning methods if they don't exist
if (!toast.info) {
  toast.info = (message, options) => toast(message, { ...options, icon: 'ℹ️' });
}
if (!toast.warning) {
  toast.warning = (message, options) => toast(message, { ...options, icon: '⚠️' });
}

// Store the original functions
const originalToast = toast;
const originalSuccess = toast.success;
const originalError = toast.error;
const originalWarning = toast.warning;
const originalInfo = toast.info;

// Override the toast functions with throttled versions
toast.success = (message, options) => throttleToast(originalSuccess, message, options);
toast.error = (message, options) => throttleToast(originalError, message, options);
toast.warning = (message, options) => throttleToast(originalWarning, message, options);
toast.info = (message, options) => throttleToast(originalInfo, message, options);

// Log to verify overrides
/*logger.info('[setupToastThrottling] Toast overrides applied', {
  hasSuccess: typeof toast.success === 'function',
  hasError: typeof toast.error === 'function',
  hasWarning: typeof toast.warning === 'function',
  hasInfo: typeof toast.info === 'function',
});*/

export default toast;