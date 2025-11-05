// utils/calendarConstants.js

export const SESSION_TYPE_COLORS = {
  '66ec551a4a8965b22af33fe3': {  // Availability
    default: '#4CAF50',     // Default green
    hasRequested: '#FFA726', // Orange to indicate pending request
    hasConfirmed: '#9E9E9E', // Grey to indicate partially booked
    fullyBooked: '#E0E0E0'  // Light grey to indicate no more bookings possible
  },
  '66ec4ea477bec414bf2b8859': {
    default: '#3B82F6', // Blue
    hasRequested: '#F59E0B',
    hasConfirmed: '#3B82F6'
  },
  // Group sessions
  '66ec54f44a8965b22af33fd5': {
    default: '#8B5CF6', // Purple
    hasRequested: '#F59E0B',
    hasConfirmed: '#8B5CF6'
  },
  // Workshop
  '66ec54fe4a8965b22af33fdd': {
    default: '#EC4899', // Pink
    hasRequested: '#F59E0B',
    hasConfirmed: '#EC4899'
  },
  // Webinar
  '66ec54f94a8965b22af33fd9': {
    default: '#14B8A6', // Teal
    hasRequested: '#F59E0B',
    hasConfirmed: '#14B8A6'
  }
};

export const BOOKING_STATUS_INDICATORS = {
  PENDING: {
    icon: '⌛', // Unicode character for hourglass
    color: '#FFA726',
    tooltip: 'Pending request for this slot'
  },
  CONFIRMED: {
    icon: '✓', // Unicode checkmark
    color: '#4CAF50',
    tooltip: 'Confirmed booking'
  },
  PARTIAL: {
    icon: '◑', // Unicode half circle
    color: '#9E9E9E',
    tooltip: 'Partially booked'
  }
};

export const CALENDAR_VISIBILITY = {
  PUBLIC: 'public',
  CONNECTED: 'connected',
  PRIVATE: 'private'
};

export const CALENDAR_VISIBILITY_DESCRIPTIONS = {
  [CALENDAR_VISIBILITY.PUBLIC]: 'Visible to all users',
  [CALENDAR_VISIBILITY.CONNECTED]: 'Visible only to connected users',
  [CALENDAR_VISIBILITY.PRIVATE]: 'Visible only to the coach'
};

export const EVENT_DISPLAY_STATES = {
  PRIVATE: {
    label: 'Unavailable',
    color: '#9E9E9E',
    opacity: 0.8,
    showTime: false
  },
  BOOKED: {
    label: 'Booked',
    color: '#9E9E9E',
    opacity: 0.8,
    showTime: true
  },
  AVAILABLE: {
    label: 'Available',
    color: '#4CAF50',
    opacity: 0.8,
    showTime: true
  },
  FULL: {
    label: 'Full',
    color: '#FF9800',
    opacity: 0.8,
    showTime: true
  },
  WAITLIST: {
    label: 'Waitlist Available',
    color: '#FFC107',
    opacity: 0.8,
    showTime: true
  }
};