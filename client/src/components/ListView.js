import React, { useMemo, useEffect, useRef, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';
import { Clock, CheckCircle, User, Zap, CalendarDays, X, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar.tsx';
import { Badge } from './ui/badge.tsx';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from 'react-query';

const localeMap = {
  en: enUS,
  de,
  fr,
};

const statusConfig = {
  confirmed: { icon: CheckCircle, className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', textKey: 'status.confirmed' },
  requested: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'status.requested' },
  completed: { icon: CheckCircle, className: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', textKey: 'status.completed' },
  cancelled: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', textKey: 'status.cancelled' },
  pending_payment: { icon: CreditCard, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'status.pending_payment' },
  pending_reschedule_coach_request: { icon: Clock, className: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400', textKey: 'status.pending_reschedule_coach_request' },
  pending_reschedule_client_request: { icon: Clock, className: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400', textKey: 'status.pending_reschedule_client_request' },
  rescheduled: { icon: CheckCircle, className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', textKey: 'status.rescheduled' },
};

const paymentStatusConfig = {
  completed: { icon: CheckCircle, className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', textKey: 'paymentStatus.completed' },
  pending: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'paymentStatus.pending' },
  payment_required: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'paymentStatus.pending' },
  payment_processing: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'paymentStatus.pending' },
  failed: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', textKey: 'paymentStatus.failed' },
};

// --- Helper functions for participant display ---
const getInitials = (p) => {
    if (!p) return '--';
    const firstName = p.firstName || '';
    const lastName = p.lastName || '';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

const getProfilePictureUrl = (p, fetchedCoachPicture) => {
    if (!p) return '';
    // Prioritize the coach-specific picture from the DTO, then the fetched one, then the general user picture.
    return p.coachProfilePicture?.url || fetchedCoachPicture?.url || p.profilePicture?.url || '';
};


const SessionItem = forwardRef(({ item, onEditSession, currentLocale }, ref) => {
  const { t } = useTranslation(['managesessions', 'common', 'bookings']);
  const { user: loggedInUser } = useAuth();

  const isAvailability = item.isAvailability;
  
  const isCurrentUserCoachOfSession = loggedInUser?.id === (item.coach?._id || item.coach);

  const coachForDisplay = !isCurrentUserCoachOfSession ? item.coach : null;

  // Fetch the coach-specific profile picture if it's not already provided in the item data.
  // This mirrors the robust data handling in BookingDetailsModal by ensuring the data is available.
  const { data: fetchedCoachPicture } = useQuery(
    ['coachProfilePicture', coachForDisplay?._id],
    async () => {
      // This service is used in AuthContext, so it's a known part of the system.
      const { getCoachProfile } = await import('../services/coachAPI');
      const coachProfile = await getCoachProfile(coachForDisplay._id);
      // The `profilePicture` field on the Coach model schema holds the coach-specific picture.
      return coachProfile?.profilePicture;
    },
    {
      enabled: !!coachForDisplay?._id && !coachForDisplay?.coachProfilePicture,
      staleTime: 15 * 60 * 1000, // Cache for 15 minutes
      refetchOnWindowFocus: false,
    }
  );

  const otherParties = useMemo(() => {
    if (isAvailability || !loggedInUser?.id || !item) {
      return [];
    }

    const allParticipants = new Map();

    const addParticipant = (p) => {
      // Ensure participant is a populated object with an ID
      if (p && (p._id || p.id)) {
        const participantId = p._id || p.id;
        if (!allParticipants.has(participantId)) {
          allParticipants.set(participantId, p);
        }
      }
    };

    addParticipant(item.coach);
    addParticipant(item.user);
    if (Array.isArray(item.attendees)) {
      item.attendees.forEach(att => {
        if (att.status === 'confirmed') {
          addParticipant(att.user);
        }
      });
    }

    // Filter out the current logged-in user
    allParticipants.delete(loggedInUser.id);
    
    return Array.from(allParticipants.values());
  }, [item, isAvailability, loggedInUser]);
  
  const timeFormat = 'p';
  const timeRange = `${format(new Date(item.start), timeFormat, { locale: currentLocale })} - ${format(new Date(item.end), timeFormat, { locale: currentLocale })}`;

  const status = item.status || (isAvailability ? 'confirmed' : 'unknown');
  const config = statusConfig[status] || { icon: Clock, className: 'bg-muted text-muted-foreground', textKey: 'status.unknown' };

  let sessionTitle;
  if (isAvailability) {
    sessionTitle = item.title || t('managesessions:availabilitySlot');
  } else {
    sessionTitle = item.sessionType?.name || item.title || t('managesessions:session');
  }

  const paymentStatus = item.payment?.status;
  const finalAmount = item.price?.final?.amount?.amount;
  const showPaymentBadge = !isAvailability && finalAmount > 0 && paymentStatus;
  const paymentConfig = showPaymentBadge ? (paymentStatusConfig[paymentStatus] || { icon: CreditCard, className: 'bg-muted text-muted-foreground', textKey: `paymentStatus.${paymentStatus}` }) : null;

  return (
    <div
      ref={ref}
      className="flex items-center space-x-4 px-4 py-4 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onEditSession(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onEditSession(item)}
    >
      <div className="flex flex-col items-center justify-center bg-muted dark:bg-muted/50 p-2 rounded-lg w-16 h-16 text-center shrink-0">
        <span className="text-xs font-bold uppercase text-muted-foreground">{format(new Date(item.start), 'MMM', { locale: currentLocale })}</span>
        <span className="text-2xl font-bold text-foreground">{format(new Date(item.start), 'd')}</span>
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-semibold text-foreground truncate">{sessionTitle}</p>
          <div className="flex items-center gap-2">
            {isAvailability ? (
              <Badge variant="outline" className="flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 text-xs border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Zap className="h-3 w-3" />
                <span>{t('managesessions:availability')}</span>
              </Badge>
            ) : (
              <>
                <Badge variant="outline" className={cn('flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 text-xs', config.className)}>
                  <config.icon className="h-3 w-3" />
                  <span className="font-medium">{t(config.textKey, { ns: 'bookings', defaultValue: item.status })}</span>
                </Badge>
                {showPaymentBadge && paymentConfig && (
                   <Badge variant="outline" className={cn('flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 text-xs', paymentConfig.className)}>
                     <paymentConfig.icon className="h-3 w-3" />
                     <span className="font-medium">{t(paymentConfig.textKey, { ns: 'bookings', defaultValue: paymentStatus })}</span>
                   </Badge>
                )}
              </>
            )}
          </div>
        </div>

        {!isAvailability && otherParties.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isCurrentUserCoachOfSession ? (
              // Coach's View: Show avatar stack of attendees
              <div className="flex items-center">
                <div className="flex -space-x-2 pr-2">
                  {otherParties.slice(0, 3).map(p => (
                    <Avatar key={p._id || p.id} className="h-5 w-5 border border-background dark:border-muted">
                      <AvatarImage src={getProfilePictureUrl(p)} alt={`${p.firstName} ${p.lastName}`} />
                      <AvatarFallback className="text-[10px]">{getInitials(p)}</AvatarFallback>
                    </Avatar>
                  ))}
                </div>
                {otherParties.length > 0 && (
                  <span className="truncate">
                    {otherParties.length === 1 
                      ? `${otherParties[0].firstName} ${otherParties[0].lastName}`
                      : t('managesessions:attendeesCount', { count: otherParties.length })
                    }
                  </span>
                )}
              </div>
            ) : (
              // Client's View: Show the coach
              (() => {
                const coach = item.coach;
                if (!coach || typeof coach !== 'object') return null;
                const displayName = `${coach.firstName || ''} ${coach.lastName || ''}`;
                return (
                  <>
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={getProfilePictureUrl(coach, fetchedCoachPicture)} alt={displayName} />
                      <AvatarFallback className="text-[10px]">{getInitials(coach)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{displayName}</span>
                  </>
                );
              })()
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{timeRange}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

SessionItem.displayName = 'SessionItem';

const ListView = ({ sessions, onEditSession }) => {
  const { t, i18n } = useTranslation(['managesessions']);
  const currentLocale = localeMap[i18n.language] || enUS;
  const itemRefs = useRef([]);
  const scrollContainerRef = useRef(null);

  const sortedSessions = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    return [...sessions].sort((a, b) => new Date(b.start) - new Date(a.start));
  }, [sessions]);

  useEffect(() => {
    if (sortedSessions.length > 0 && scrollContainerRef.current) {
      const now = new Date();
      let targetIndex = sortedSessions.findLastIndex(session => new Date(session.start) > now);

      if (targetIndex === -1) {
        targetIndex = 0;
      }
      
      const targetElement = itemRefs.current[targetIndex];
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'auto',
          block: 'center',
        });
      }
    }
  }, [sortedSessions]);

  const hasSessions = sortedSessions && sortedSessions.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          {t('managesessions:sessionList')}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={scrollContainerRef} className="max-h-[70vh] overflow-y-auto divide-y divide-border">
          {!hasSessions && (
            <div className="text-center text-sm text-muted-foreground py-10 px-4">
              <p>{t('managesessions:noSessionsFound')}</p>
            </div>
          )}
          {hasSessions && sortedSessions.map((item, index) => (
            <SessionItem
              ref={(el) => (itemRefs.current[index] = el)}
              key={item._id}
              item={item}
              onEditSession={onEditSession}
              currentLocale={currentLocale}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ListView;