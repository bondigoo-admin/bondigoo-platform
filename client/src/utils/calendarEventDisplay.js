// utils/calendarEventDisplay.js

import React, { useMemo } from 'react';
import { 
  CALENDAR_VISIBILITY, 
  SESSION_TYPE_COLORS,
  EVENT_DISPLAY_STATES 
} from './calendarConstants';

export const EVENT_INTERACTION_RULES = {
  '66ec551a4a8965b22af33fe3': { // Availability
    clickable: true,
    expandable: true,
    bookable: true,
    visibilityRules: 'inherited',
    defaultColor: SESSION_TYPE_COLORS['66ec551a4a8965b22af33fe3']
  },
  '66ec4ea477bec414bf2b8859': { // 1-on-1
    clickable: false,
    expandable: false,
    bookable: false,
    visibilityRules: 'private',
    defaultColor: SESSION_TYPE_COLORS['66ec4ea477bec414bf2b8859']
  },
  '66ec54f44a8965b22af33fd5': { // Group
    clickable: true,
    expandable: true,
    bookable: true,
    visibilityRules: 'inherited',
    defaultColor: SESSION_TYPE_COLORS['66ec54f44a8965b22af33fd5']
  },
  '66ec54fe4a8965b22af33fdd': { // Workshop
    clickable: true,
    expandable: true,
    bookable: true,
    visibilityRules: 'public',
    defaultColor: SESSION_TYPE_COLORS['66ec54fe4a8965b22af33fdd']
  },
  '66ec54f94a8965b22af33fd9': { // Webinar
    clickable: true,
    expandable: true,
    bookable: true,
    visibilityRules: 'public',
    defaultColor: SESSION_TYPE_COLORS['66ec54f94a8965b22af33fd9']
  }
};

const CalendarEventDisplay = ({
  event,
  isCoach,
  isConnected,
  calendarVisibility,
  onEventClick,
  showDetails = true,
  timeFormat = 'short',
  customDisplayRules = {}
}) => {
  const sessionTypeId = event.sessionType?._id || event.sessionTypeId || event.type;
  const interactionRules = EVENT_INTERACTION_RULES[sessionTypeId] || {
    clickable: false,
    expandable: false,
    bookable: false,
    visibilityRules: 'private',
    defaultColor: '#9E9E9E'
  };

  const displayRules = useMemo(() => ({
    ...EVENT_INTERACTION_RULES[sessionTypeId],
    ...customDisplayRules[sessionTypeId]
  }), [sessionTypeId, customDisplayRules]);

  const getEventPermissions = () => {
    if (isCoach) {
      return {
        isVisible: true,
        isClickable: true,
        isExpandable: true,
        showDetails: true
      };
    }

    const basePermissions = {
      isVisible: false,
      isClickable: false,
      isExpandable: false,
      showDetails: false
    };

    switch (interactionRules.visibilityRules) {
      case 'public':
        basePermissions.isVisible = calendarVisibility !== CALENDAR_VISIBILITY.PRIVATE;
        break;
      case 'inherited':
        basePermissions.isVisible = 
          calendarVisibility === CALENDAR_VISIBILITY.PUBLIC ||
          (calendarVisibility === CALENDAR_VISIBILITY.CONNECTED && isConnected);
        break;
      case 'private':
        basePermissions.isVisible = false;
        break;
    }

    if (basePermissions.isVisible) {
      basePermissions.isClickable = interactionRules.clickable;
      basePermissions.isExpandable = interactionRules.expandable;
      basePermissions.showDetails = showDetails;
    }

    return basePermissions;
  };

  const getEventDisplay = () => {
    const permissions = getEventPermissions();
    
    if (!permissions.isVisible) {
      return EVENT_DISPLAY_STATES.PRIVATE;
    }

    if (isCoach) {
      return {
        label: event.title || `${event.sessionType?.name || 'Session'}`,
        color: event.color || interactionRules.defaultColor,
        opacity: 0.8,
        showTime: true
      };
    }

    if (event.isFull && event.allowWaitlist) {
      return EVENT_DISPLAY_STATES.WAITLIST;
    } else if (event.isFull) {
      return EVENT_DISPLAY_STATES.FULL;
    }

    return permissions.showDetails
      ? {
          label: event.title || event.sessionType?.name,
          color: interactionRules.defaultColor,
          opacity: 0.8,
          showTime: true
        }
      : EVENT_DISPLAY_STATES.BOOKED;
  };

  const eventDisplay = getEventDisplay();
  const permissions = getEventPermissions();

  const handleClick = (e) => {
    if (!permissions.isClickable) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onEventClick?.(event, permissions);
  };

  const formatTime = (date) => {
    if (!date) return '';
    const options = timeFormat === 'full'
      ? { hour: '2-digit', minute: '2-digit', hour12: true }
      : { hour: 'numeric', minute: '2-digit' };
    return new Date(date).toLocaleTimeString([], options);
  };

  return (
    <div 
      className={`w-full h-full p-1 cursor-${permissions.isClickable ? 'pointer' : 'default'}`}
      style={{ 
        backgroundColor: eventDisplay.color,
        opacity: eventDisplay.opacity,
        color: 'white',
        borderRadius: '3px'
      }}
      onClick={handleClick}
      role={permissions.isClickable ? 'button' : 'presentation'}
      aria-expanded={permissions.isExpandable}
    >
      <div className="text-sm font-medium">
        {eventDisplay.label}
      </div>
      {eventDisplay.showTime && (
        <div className="text-xs mt-1">
          {formatTime(event.start)} - {formatTime(event.end)}
        </div>
      )}
      {permissions.showDetails && event.currentParticipants && (
        <div className="text-xs">
          {event.currentParticipants}/{event.maxParticipants} participants
        </div>
      )}
    </div>
  );
};

export default CalendarEventDisplay;