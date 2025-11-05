import moment from 'moment-timezone';
import { SESSION_TYPE_COLORS, CALENDAR_VISIBILITY, BOOKING_STATUS_INDICATORS } from './calendarConstants';

export const eventStyleGetter = (event, coachSettings, isConnected, existingBookings) => {
  const baseStyle = {
    border: 'none',
    color: 'white',
  };

  let sessionTypeId = null;
  const objectIdPattern = /^[0-9a-fA-F]{24}$/;

  if (typeof event.sessionType === 'string') {
    sessionTypeId = event.sessionType;
  } else if (event.sessionType && typeof event.sessionType === 'object') {
    sessionTypeId = event.sessionType._id || event.sessionType.id;
  } else if (typeof event.type === 'string' && objectIdPattern.test(event.type)) {
    sessionTypeId = event.type;
  }

  const customColor = sessionTypeId ? coachSettings?.sessionTypeColors?.[sessionTypeId] : null;
  const systemColors = sessionTypeId && SESSION_TYPE_COLORS[sessionTypeId]
    ? SESSION_TYPE_COLORS[sessionTypeId]
    : SESSION_TYPE_COLORS['66ec551a4a8965b22af33fe3'];

  if (event.status === 'confirmed' && !event.isAvailability) {
    return {
      style: {
        ...baseStyle,
        backgroundColor: customColor || systemColors.hasConfirmed,
        opacity: 0.9
      }
    };
  }

  if (event.status === 'requested') {
    return {
      style: {
        ...baseStyle,
        backgroundColor: SESSION_TYPE_COLORS['66ec551a4a8965b22af33fe3'].hasRequested,
        opacity: 0.9
      }
    };
  }

  if (event.isAvailability) {
    return {
      style: {
        ...baseStyle,
        backgroundColor: SESSION_TYPE_COLORS['66ec551a4a8965b22af33fe3'].default,
        opacity: 0.9
      }
    };
  }

  return {
    style: {
      ...baseStyle,
      backgroundColor: customColor || (event.slotIndex !== undefined ? SESSION_TYPE_COLORS['66ec54f94a8965b22af33fd9'].default : systemColors.default),
      opacity: 0.9
    }
  };
};

export const generateRecurringSessions = (session) => {
  const { start, end, recurringPattern, recurringEndDate } = session;
  const sessions = [];
  let currentStart = moment(start);
  let currentEnd = moment(end);

  while (currentStart.isSameOrBefore(recurringEndDate)) {
    sessions.push({
      ...session,
      start: currentStart.toDate(),
      end: currentEnd.toDate(),
    });

    switch (recurringPattern) {
      case 'daily':
        currentStart.add(1, 'day');
        currentEnd.add(1, 'day');
        break;
      case 'weekly':
        currentStart.add(1, 'week');
        currentEnd.add(1, 'week');
        break;
      case 'monthly':
        currentStart.add(1, 'month');
        currentEnd.add(1, 'month');
        break;
      default:
        break;
    }
  }

  return sessions;
};

export const isOverlapping = (session1, session2) => {
  const start1 = new Date(session1.start);
  const end1 = new Date(session1.end);
  const start2 = new Date(session2.start);
  const end2 = new Date(session2.end);

  /*console.log('[isOverlapping] Checking overlap:', {
    session1: { start: start1, end: end1 },
    session2: { start: start2, end: end2 }
  });*/

  const overlap = start1 < end2 && start2 < end1;
  //console.log('[isOverlapping] Overlap result:', overlap);

  return overlap;
};

export const handleConflicts = (sessions) => {
  const conflicts = [];
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      if (moment(sessions[i].start).isBefore(sessions[j].end) && 
          moment(sessions[i].end).isAfter(sessions[j].start)) {
        conflicts.push([sessions[i], sessions[j]]);
      }
    }
  }
  return conflicts;
};

export const checkAvailability = (slot, availability) => {
  const slotStart = new Date(slot.start);
  const slotEnd = new Date(slot.end);

  for (const availableSlot of availability) {
    const availableStart = new Date(availableSlot.start);
    const availableEnd = new Date(availableSlot.end);

    if (slotStart >= availableStart && slotEnd <= availableEnd) {
      return true;
    }
  }

  return false;
};

export const filterVisibleEvents = (events, calendarVisibility, isConnected, currentUserId, coachId) => {


  if (currentUserId === coachId) {
    //console.log('[filterVisibleEvents] User is the coach, filtering events');
    const filtered = events.filter(event => {
      const isDeclined = event.status === 'declined';
      const sessionTypeId = event.sessionType?._id || event.sessionTypeId || event.type;
      const isVisible = sessionTypeId !== '66ec4ea477bec414bf2b8859' && !isDeclined;
     /* console.log('[filterVisibleEvents] Event:', {
        id: event._id,
        sessionTypeId,
        status: event.status,
        isVisible
      });*/
      return isVisible;
    });
    /*console.log('[filterVisibleEvents] Filtered events for coach:', {
      before: events.length,
      after: filtered.length
    });*/
    return filtered;
  }

  if (calendarVisibility === CALENDAR_VISIBILITY.PRIVATE) {
    console.log('[filterVisibleEvents] Calendar is private, showing no events');
    return [];
  }

  if (calendarVisibility === CALENDAR_VISIBILITY.CONNECTED && !isConnected) {
    console.log('[filterVisibleEvents] Calendar visible to connections only, user not connected');
    return [];
  }

  const filteredEvents = events.filter(event => {
    const isDeclined = event.status === 'declined';
    const sessionTypeId = event.sessionType?._id || event.sessionTypeId || event.type;
    const isVisible = sessionTypeId !== '66ec4ea477bec414bf2b8859' && !isDeclined;
   
    return isVisible;
  });

  console.log('[filterVisibleEvents] Filtered events:', {
    before: events.length,
    after: filteredEvents.length
  });
  return filteredEvents;
};

export const getBookingTypeForSlot = (slot, coachSettings, isConnected) => {
  /*console.log('[getBookingTypeForSlot] Checking slot:', {
    slot,
    settings: coachSettings,
    isConnected
  });*/

  // Validate slot is an availability slot
  if (!slot.isAvailability) {
    //console.log('[getBookingTypeForSlot] Not an availability slot');
    return null;
  }

  const startTime = moment(slot.start);
  const threshold = moment().add(coachSettings?.firmBookingThreshold || 24, 'hours');

  // Check if slot allows instant booking
  const allowsFirmBooking = slot.availableForInstantBooking !== false && 
                           coachSettings?.allowFirmBooking;

  const canFirmBook = (
    allowsFirmBooking && 
    (!coachSettings?.requireApprovalNonConnected || isConnected) &&
    startTime.isAfter(threshold)
  );

  /*console.log('[getBookingTypeForSlot] Booking type determination:', {
    canFirmBook,
    allowsFirmBooking,
    requireApprovalNonConnected: coachSettings?.requireApprovalNonConnected,
    isConnected,
    isAfterThreshold: startTime.isAfter(threshold),
    startTime: startTime.format(),
    threshold: threshold.format()
  });*/

  return canFirmBook ? 'FIRM' : 'REQUEST';
};