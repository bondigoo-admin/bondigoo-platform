import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { Calendar, Clock, Video, CheckCircle, X, CreditCard, Banknote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar.tsx';
import { Button } from '../ui/button.tsx';
import { Link } from 'react-router-dom';
import { Badge } from '../ui/badge.tsx';
import { cn } from '../../lib/utils';
import { logger } from '../../utils/logger';

const localeMap = {
  en: enUS,
  de,
  fr,
};

const statusConfig = {
  confirmed: { icon: CheckCircle, className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', textKey: 'status.confirmed' },
  requested: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'status.requested' },
  completed: { icon: CheckCircle, className: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', textKey: 'status.completed' },
  cancelled_by_client: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', textKey: 'status.cancelled_by_client' },
  cancelled_by_coach: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', textKey: 'status.cancelled_by_coach' },
  declined: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', textKey: 'status.declined' },
  pending_payment: { icon: CreditCard, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'status.pending_payment' },
  rescheduled_pending_attendee_actions: { icon: Clock, className: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400', textKey: 'status.rescheduled_pending_attendee_actions' },
  scheduled: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'status.scheduled' },
  firm_booked: { icon: CheckCircle, className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', textKey: 'status.firm_booked' },
};

const paymentStatusConfig = {
  payment_required: { icon: CreditCard, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'paymentStatus.required' },
  pending: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'paymentStatus.pending' },
  failed: { icon: X, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', textKey: 'paymentStatus.failed' },
  completed: { icon: CheckCircle, className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', textKey: 'paymentStatus.completed' },
};

const UpcomingSchedule = ({ schedule, isLoading, onSelectBooking, isUserDashboard = false }) => {
  const { t, i18n } = useTranslation(['userdashboard', 'common', 'bookings']);
  const currentLocale = localeMap[i18n.language] || enUS;
  
  const hasSchedule = schedule && Array.isArray(schedule) && schedule.length > 0;

const SessionItem = ({ item }) => {
    const participant = isUserDashboard ? item.coach : item.user;
    const participantName = participant 
      ? `${participant.user?.firstName || participant.firstName} ${participant.user?.lastName || participant.lastName}` 
      : (isUserDashboard ? t('common:yourCoach') : t('common:unknownClient'));
    
    const userForAvatar = participant?.user || participant;
    const participantInitials = userForAvatar ? `${userForAvatar.firstName?.[0] || ''}${userForAvatar.lastName?.[0] || ''}` : '..';
    const participantAvatarUrl = participant?.coachProfilePicture?.url || userForAvatar?.profilePicture?.url;

    const timeFormat = 'p';
    const timeRange = `${format(new Date(item.start), timeFormat, { locale: currentLocale })} - ${format(new Date(item.end), timeFormat, { locale: currentLocale })}`;
    
    const sessionTitle = item.sessionType?.name || t('common:defaultSessionTitle', 'Session');

    const isJoinable = item.sessionLink?.url && new Date(item.start) < new Date(Date.now() + 15 * 60 * 1000) && item.status === 'confirmed';

    const config = statusConfig[item.status] || { icon: Clock, className: 'bg-muted text-muted-foreground', textKey: 'status.unknown' };
    
    const paymentStatusValue = item.payment?.status || (item.price?.final?.amount?.amount > 0 ? 'payment_required' : 'not_applicable');
    const paymentConfig = paymentStatusConfig[paymentStatusValue];

    return (
      <div 
        className="flex items-center space-x-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-md p-2 -m-2"
        onClick={() => onSelectBooking(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectBooking(item)}
      >
        <div className="flex flex-col items-center justify-center bg-muted dark:bg-muted/50 p-2 rounded-lg w-16 h-16 text-center shrink-0">
          <span className="text-xs font-bold uppercase text-muted-foreground">{format(new Date(item.start), 'MMM', { locale: currentLocale })}</span>
          <span className="text-2xl font-bold text-foreground">{format(new Date(item.start), 'd')}</span>
        </div>
        
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground truncate">{sessionTitle}</p>
            <Badge variant="outline" className={cn('flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 text-xs', config.className)}>
              <config.icon className="h-3 w-3" />
              <span className="font-medium">{t(config.textKey, { ns: 'bookings', defaultValue: item.status })}</span>
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar className="h-5 w-5">
              <AvatarImage src={participantAvatarUrl} alt={participantName} />
              <AvatarFallback className="text-xs">{participantInitials}</AvatarFallback>
            </Avatar>
            <span className="truncate">{participantName}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{timeRange}</span>
            </div>
             {isJoinable ? (
                <Button asChild variant="secondary" size="sm" className="h-7 px-2" onClick={(e) => e.stopPropagation()}>
                    <a href={item.sessionLink.url} target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">{t('common:join')}</span>
                    </a>
                </Button>
             ) : paymentConfig ? (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge className={cn('flex items-center gap-1 px-1.5 py-0.5 text-xs', paymentConfig.className)}>
                      <Banknote className="h-3.5 w-3.5" />
                      <paymentConfig.icon className="h-3.5 w-3.5" />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t(paymentConfig.textKey, { ns: 'bookings' })}</p>
                  </TooltipContent>
                </Tooltip>
             ) : (
                null
             )}
          </div>
        </div>
      </div>
    );
  };
return (
    <TooltipProvider>
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {isUserDashboard ? t('upcomingSchedule.title', 'Your Next Session') : t('schedule.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-0 divide-y divide-border">
            {isLoading && <Skeleton className="h-24 w-full rounded-lg" />}
            {!isLoading && !hasSchedule && (
              <div className="flex flex-col h-full items-center justify-center text-center text-sm text-muted-foreground py-10">
                <p>{isUserDashboard ? t('upcomingSchedule.emptyMessage', 'You have no upcoming sessions.') : t('schedule.noUpcomingSessions')}</p>
                {isUserDashboard && <Button asChild size="sm" className="mt-4"><Link to="/coaches">{t('common:book_a_session', 'Book a Session')}</Link></Button>}
              </div>
            )}
            {!isLoading && hasSchedule && schedule.map((item) => (
              <SessionItem key={item._id} item={item} />
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};

export default UpcomingSchedule;