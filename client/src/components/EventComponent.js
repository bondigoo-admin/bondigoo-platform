import React, { useContext, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import moment from 'moment';
import { AuthContext } from '../contexts/AuthContext';
import { Users, Clock } from 'lucide-react';
import { logger } from '../utils/logger';

export const SESSION_TYPE_IDS = {
  ONE_ON_ONE: '66ec4ea477bec414bf2b8859',
  AVAILABILITY: '66ec551a4a8965b22af33fe3'
};

// A safe helper function to format participant names, preventing errors.
const getParticipantName = (participant) => {
  if (!participant || typeof participant !== 'object') {
    return null;
  }
  const firstName = participant.firstName || participant.name;
  const lastName = participant.lastName;
  if (!firstName) {
    return null;
  }
  return `${firstName}${lastName ? ` ${lastName[0]}.` : ''}`;
};

const EventComponent = ({ event }) => {
  const { t } = useTranslation(['bookingcalendar', 'managesessions']);
  const { user: loggedInUser } = useContext(AuthContext);

  const eventRef = useRef(null);
  const [height, setHeight] = useState(0);

  // Measure the component's height to adapt the content density.
  useLayoutEffect(() => {
    if (eventRef.current) {
      setHeight(eventRef.current.offsetHeight);
    }
  }, [event.start, event.end]); // Rerun only when the event's time changes

  const isPast = moment(event.end).isBefore(moment());

const { title, secondaryInfo, theme } = useMemo(() => {
    const calendarOwnerId = event.coachId || event.coach?._id || event.coach;
    const isMyCalendar = loggedInUser?.id === calendarOwnerId;
    const amICoach = loggedInUser?.role === 'coach';
    const sessionTypeId = event.sessionType?._id || event.sessionType;

    let computedTitle = event.sessionType?.name || event.title || 'Session';
    let computedSecondaryInfo = null;
    let computedTheme = {
      base: 'bg-slate-100 text-slate-700 border-slate-400 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
      hover: 'hover:bg-slate-200 dark:hover:bg-slate-700',
      indicator: null,
    };

    if (event.isAvailability || sessionTypeId === SESSION_TYPE_IDS.AVAILABILITY) {
      computedTheme.base = 'bg-green-100 text-green-800 border-green-500 dark:bg-green-900 dark:text-green-200 dark:border-green-700';
      computedTheme.hover = 'hover:bg-green-200 dark:hover:bg-green-800';
      computedTitle = t('bookingcalendar:availabilitySlot');
    } 
    else if (event.isPublicView) {
        computedTitle = t('bookingcalendar:busy');
        computedSecondaryInfo = null;
        computedTheme.base = 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
        computedTheme.hover = 'cursor-default';
    }
    else if (event.status === 'requested') {
      computedTheme.base = 'bg-amber-100 text-amber-800 border-amber-500 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-700';
      computedTheme.hover = 'hover:bg-amber-200 dark:hover:bg-amber-800';
      computedTheme.indicator = <div className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500 animate-pulse" title={t('managesessions:status_requested')}></div>;
      computedSecondaryInfo = (
        <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            <span>{t('managesessions:status_requested')}</span>
        </div>
      );
    } 
    else if (sessionTypeId === SESSION_TYPE_IDS.ONE_ON_ONE) {
      computedTheme.base = 'bg-blue-100 text-blue-800 border-blue-500 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700';
      computedTheme.hover = 'hover:bg-blue-200 dark:hover:bg-blue-800';
      
      let otherParticipant = (amICoach && isMyCalendar) ? event.user : event.coach;
      const otherParticipantName = getParticipantName(otherParticipant);

      if (otherParticipantName) {
        computedTitle = otherParticipantName;
        computedSecondaryInfo = event.sessionType?.name || '';
      } else {
        if (event.user || event.coach) {
          logger.warn(`[EventComponent] Participant name was expected but could not be formatted.`, { eventId: event._id, eventUser: event.user, eventCoach: event.coach });
        }
      }
    } 
    else if (event.maxAttendees > 1) {
      computedTheme.base = 'bg-violet-100 text-violet-800 border-violet-500 dark:bg-violet-900 dark:text-violet-200 dark:border-violet-700';
      computedTheme.hover = 'hover:bg-violet-200 dark:hover:bg-violet-800';
      
      const confirmedAttendees = event.attendees?.filter(a => a.status === 'confirmed').length || 0;
      computedSecondaryInfo = (
        <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            <span>{`${confirmedAttendees} / ${event.maxAttendees}`}</span>
        </div>
      );
    }
    
    return { title: computedTitle, secondaryInfo: computedSecondaryInfo, theme: computedTheme };
  }, [event, loggedInUser, t]);

  // --- 2. Adapt Display based on Calculated Height ---
  const isVeryShort = height < 28;
  const isShort = height < 48;

  return (
    <div
      ref={eventRef}
      className={`
        relative h-full w-full flex flex-col justify-start
        overflow-hidden cursor-pointer
        p-1 pl-2 border-l-4
        transition-colors duration-200 ease-in-out
        ${theme.base}
        ${isPast 
          // --- CHANGE HERE: Less aggressive styling for past events ---
          ? 'opacity-80 brightness-95 cursor-default' 
          : `${theme.hover}`
        }
      `}
    >
      {theme.indicator}
      <p 
        className={`
          font-semibold truncate leading-tight
          ${isVeryShort ? 'text-[11px]' : 'text-xs'}
        `}
      >
        {title}
      </p>
      
      {!isShort && secondaryInfo && (
        <div className="pt-0.5 opacity-90 text-xs">
          {typeof secondaryInfo === 'string' 
            ? <p className="truncate leading-tight">{secondaryInfo}</p>
            : <div>{secondaryInfo}</div>
          }
        </div>
      )}
    </div>
  );
};

export default EventComponent;