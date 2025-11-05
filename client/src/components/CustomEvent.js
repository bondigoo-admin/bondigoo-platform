import React from 'react';
import { useTranslation } from 'react-i18next';
import moment from 'moment';
import { eventStyleGetter } from '../utils/calendarHelpers';
import { Badge } from './ui/badge.tsx';
import { Users, Video, Clock } from 'lucide-react';

const CustomEvent = ({ event, coachSettings, isConnected, sessionsData }) => {
  const { t } = useTranslation(['managesessions']);
  const styleInfo = eventStyleGetter(event, coachSettings, isConnected, sessionsData?.regularBookings);
  const borderColor = styleInfo.style.backgroundColor;

  if (styleInfo.style.display === 'none') {
    return null;
  }

  const startTime = moment(event.start).format('HH:mm');
  const endTime = moment(event.end).format('HH:mm');
  const isShortEvent = moment(event.end).diff(moment(event.start), 'minutes') < 45;

  return (
    <div
      className="group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-md bg-card shadow-sm transition-all duration-200 ease-in-out hover:shadow-md"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center text-center text-card-foreground">
        
        <div className="flex items-center gap-1.5">
           <span className="font-semibold text-sm leading-tight transition-colors group-hover:text-primary truncate">{event.title}</span>
           {event.status === 'requested' && !isShortEvent && (
              <Badge variant="outline" className="h-5 shrink-0 border-amber-500/50 bg-amber-500/10 px-1.5 text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap">{t('managesessions:requested')}</Badge>
            )}
        </div>
        
        {isShortEvent ? (
          <span className="text-xs text-muted-foreground">{startTime}</span>
        ) : (
          <>
            <div className="flex items-center text-muted-foreground">
                <Clock className="h-3 w-3 mr-1.5 shrink-0" />
                <span className="text-xs">{startTime} - {endTime}</span>
            </div>

            {event.client && (
              <div className="flex items-center text-muted-foreground">
                <Users className="h-3 w-3 mr-1.5 shrink-0" />
                <span className="text-xs truncate">{event.client.name}</span>
              </div>
            )}
          </>
        )}
        
        {event.slotIndex !== undefined && !isShortEvent && (
            <Badge variant="outline" className="w-fit text-xs font-normal">
              <Video className="h-3 w-3 mr-1.5" />
              Slot {event.slotIndex + 1}
            </Badge>
        )}
      </div>
    </div>
  );
};

export default CustomEvent;