import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Calendar, Clock, CheckCircle, X, CreditCard, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';
import { logger } from '../../../utils/logger';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar.tsx';
import { Badge } from '../../ui/badge.tsx';
import { cn } from '../../../lib/utils';

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
  scheduled: { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400', textKey: 'status.scheduled' },
  rescheduled_pending_attendee_actions: { icon: Clock, className: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-400', textKey: 'status.rescheduled_pending_attendee_actions' },
};

const UpcomingSchedule = ({ schedule, isLoading, onSelectBooking }) => {
  const { t, i18n } = useTranslation(['coach_dashboard', 'common', 'bookings']);
  const currentLocale = localeMap[i18n.language] || enUS;

  const hasSchedule = schedule && Array.isArray(schedule) && schedule.length > 0;
  
  const formatCurrency = (amount, currencyCode = 'CHF') => {
    return new Intl.NumberFormat(i18n.language, { 
      style: 'currency', 
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  const SessionItem = ({ item }) => {
    const user = typeof item.user === 'object' ? item.user : null;
    const clientName = user ? `${user.firstName} ${user.lastName}` : t('common:unknownClient');
    const initials = user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` : '..';
    
    const timeFormat = 'p';
    const timeRange = `${format(new Date(item.start), timeFormat, { locale: currentLocale })} - ${format(new Date(item.end), timeFormat, { locale: currentLocale })}`;
    
    const price = item.price?.final?.amount?.amount;
    const currency = item.price?.currency;
    const formattedPrice = price > 0 ? formatCurrency(price, currency) : t('common:free');

    const config = statusConfig[item.status] || { icon: Clock, className: 'bg-muted text-muted-foreground', textKey: 'status.unknown' };
    
    const sessionTitle = (item.title && !item.title.toLowerCase().includes('verfügbarkeit') && !item.title.toLowerCase().includes('availability')) 
      ? item.title 
      : (item.sessionType?.name || t('common:session'));

    return (
      <div 
        className="flex items-center space-x-4 py-4 cursor-pointer hover:bg-muted/50 transition-colors rounded-md"
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
              <span className="font-medium">{t(config.textKey, { ns: 'bookings', defaultValue: t(config.textKey, { ns: 'common' }) })}</span>
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar className="h-5 w-5">
              <AvatarImage src={user?.profilePicture?.url} alt={clientName} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="truncate">{clientName}</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{timeRange}</span>
            </div>
            {price !== undefined && (
              <p className="font-semibold text-foreground">{formattedPrice}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t('schedule.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-0 divide-y divide-border">
          {isLoading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4 py-4">
              <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
          ))}
          {!isLoading && !hasSchedule && (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground py-10">
              <p>{t('schedule.noUpcomingSessions')}</p>
            </div>
          )}
          {!isLoading && hasSchedule && schedule.map((item) => (
            <SessionItem key={item._id} item={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default UpcomingSchedule;