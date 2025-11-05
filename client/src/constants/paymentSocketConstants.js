export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  FAILED: 'failed'
};

export const SUBSCRIPTION_STATES = {
  INACTIVE: 'inactive',
  SUBSCRIBING: 'subscribing',
  ACTIVE: 'active',
  FAILED: 'failed'
};

export const PAYMENT_EVENTS = {
  STATUS_UPDATE: 'payment_status_update',
  INTENT_CREATED: 'payment_intent_created',
  CONFIRMATION_RECEIVED: 'payment_confirmation_received',
  ACTION_REQUIRED: 'payment_action_required',
  ERROR_OCCURRED: 'payment_error',
  ROOM: {
    JOIN: 'join_payment',
    LEAVE: 'leave_payment'
  }
};

export const SUBSCRIPTION_EVENTS = {
  ...PAYMENT_EVENTS,
  SOCKET: {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    ERROR: 'connect_error'
  }
};

export const LIFECYCLE_TIMEOUTS = {
  TRANSITION: 15000,    // 15s for full flow transition
  VISIBILITY: 8000,     // 8s for visibility changes
  GUARD: 8000,         // 8s for connection guards
  LOCK: 12000          // 12s for lifecycle locks
};

export const SOCKET_CONFIG = {
  CONNECTION: {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: { type: 'payment' },
    autoConnect: false,
  },
  TIMEOUTS: {
    CONNECTION: 10000,
    EVENT: 5000,
    RETRY_BASE: 1000,
    TRANSITION: 10000,  // 10s for socket transitions
    VALIDATION: 5000    // 5s for connection validation
  },
  EVENTS: {
    PAYMENT: {
      STATUS_UPDATE: 'payment_status_update',
      INTENT_CREATED: 'payment_intent_created',
      CONFIRMATION_RECEIVED: 'payment_confirmation_received',
      ACTION_REQUIRED: 'payment_action_required',
      ERROR: 'payment_error'
    }
  }
};

export const SUBSCRIPTION_TIMEOUTS = {
  SUBSCRIBE: 10000,
  UNSUBSCRIBE: 5000,
  RETRY_INTERVAL: 2000
};