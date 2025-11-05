export const PAYMENT_STATES = {
  INITIALIZING: 'initializing',
  PROCESSING: 'processing',
  REQUIRES_PAYMENT_METHOD: 'requires_payment_method',
  REQUIRES_CONFIRMATION: 'requires_confirmation',
  REQUIRES_ACTION: 'requires_action',
  SUCCEEDED: 'succeeded',
  MOUNTING: 'mounting',
  FAILED: 'failed',
  READY: 'ready',
  CANCELLED: 'cancelled',
  TIMEOUT: 'timeout',
  REQUIRES_RETRY: 'requires_retry',
  ERROR: 'error'
};

export const PAYMENT_FLOW_STATES = {
  INITIAL: 'initial',
  CREATING_BOOKING: 'creating_booking',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_PROCESSING: 'payment_processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const PAYMENT_STEPS = {
  SESSION: 'session',
  METHOD: 'method',
  REVIEW: 'review',
  PROCESSING: 'processing',
  CONFIRMATION: 'confirmation'
};

export const PAYMENT_ERROR_TYPES = {
  VALIDATION: 'validation',
  NETWORK: 'network',
  CARD: 'card',
  PROCESSING: 'processing',
  AUTHENTICATION: 'authentication',
  SERVER: 'server'
};

export const PAYMENT_TIMING = {
  IMMEDIATE: {
    id: 'immediate',
    label: 'Pay Now'
  },
  DEFERRED: {
    id: 'deferred',
    label: 'Pay Later'
  }
};

export const VISIBILITY_STATES = {
  HIDDEN: 'hidden',
  MOUNTING: 'mounting',
  VISIBLE: 'visible',
  UNMOUNTING: 'unmounting'
};

export const MODAL_STATES = {
  BOOKING: 'booking',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_ACTIVE: 'payment_active',
  PAYMENT_COMPLETE: 'payment_complete',
  PAYMENT_FAILED: 'payment_failed'
};

export const FLOW_STATES = {
  INITIAL: 'initial',
  CREATING_BOOKING: 'creating_booking',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_PROCESSING: 'payment_processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const FLOW_LIFECYCLE_STATES = {
  INIT: 'initialization',
  ACTIVE: 'active',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error'
};

export const FLOW_LIFECYCLE = {
  INIT: 'initialization',
  SOCKET_CONNECT: 'socket_connection',
  INTENT_CREATION: 'intent_creation',
  PROCESSING: 'processing',
  CONFIRMATION: 'confirmation',
  COMPLETION: 'completion',
  CLEANUP: 'cleanup'
};

export const FLOW_STATUS = {
  INITIALIZING: 'initializing',
  ACTIVE: 'active',
  TRANSITIONING: 'transitioning',
  PRESERVED: 'preserved',
  ERROR: 'error',
  COMPLETED: 'completed'
};

export const LIFECYCLE_STATES = {
  // Initial States
  INITIALIZING: 'initializing',
  PREPARING: 'preparing',
  
  // Mount States
  MOUNTING: 'mounting',
  SOCKET_CONNECTING: 'socket_connecting',
  
  // Payment States
  PAYMENT_CREATING: 'payment_creating',
  PAYMENT_READY: 'payment_ready',
  PAYMENT_PROCESSING: 'payment_processing',
  
  // Visibility States
  VISIBLE: 'visible',
  HIDDEN: 'hidden',
  
  // Terminal States
  UNMOUNTING: 'unmounting',
  ERROR: 'error',
  COMPLETED: 'completed'
}

export const PAYMENT_TIMEOUT_DURATION = 60000; // 1 minute
export const PAYMENT_POLLING_INTERVAL = 3000; // 3 seconds
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_BASE = 2000; // Base retry delay in milliseconds

export const PAYMENT_ERROR_MESSAGES = {
  TIMEOUT: 'The payment process took too long. Please try again.',
  NETWORK: 'Network error occurred. Please check your connection and try again.',
  SERVER: 'Server error occurred. Please try again later.',
  CARD_DECLINED: 'Your card was declined. Please try another card.',
  AUTHENTICATION_REQUIRED: 'Additional authentication is required.',
  PROCESSING_ERROR: 'An error occurred while processing your payment.'
};

export const getRetryDelay = (attempt) => {
  return Math.min(RETRY_BACKOFF_BASE * Math.pow(2, attempt), 16000);
};