export const SOCKET_EVENTS = {
   BOOKING_UPDATE: 'booking_update', 
  AVAILABILITY_UPDATE: 'availability_update',
  NOTIFICATION: 'notification', 
  NOTIFICATION_ACTION: 'notification_action', 
  PAYMENT: {
    STATUS_UPDATE: 'payment_status_update',
    INTENT_CREATED: 'payment_intent_created',
    CONFIRMATION_RECEIVED: 'payment_confirmation_received',
    ACTION_REQUIRED: 'payment_action_required',
    ERROR_OCCURRED: 'payment_error',
    REFUND_PROCESSED: 'payment_refunded',
    METHOD_UPDATED: 'payment_method_updated',
  },
  CONNECTION: {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    ERROR: 'connect_error',
    RECONNECT: 'reconnect',
    RECONNECT_ATTEMPT: 'reconnect_attempt',
  },
  ROOM: {
    JOIN: 'join_payment',
    LEAVE: 'leave_payment',
  },
  MESSAGING: {
    SEND_MESSAGE: 'send_message',
    NEW_MESSAGE: 'new_message',
    CONVERSATION_READ: 'conversation_read',
    START_TYPING: 'start_typing',
    STOP_TYPING: 'stop_typing',
    MESSAGE_DELETED: 'message_deleted',
    NEW_CONVERSATION: 'new_conversation',
  },
};

export const SOCKET_STATES = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
  RECONNECTING: 'reconnecting',
};

export const SOCKET_TIMEOUTS = {
  CONNECTION: 10000,
  OPERATION: 30000,
  RECONNECT: 5000,
  POLLING: 3000,
};