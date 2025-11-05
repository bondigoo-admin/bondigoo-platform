import React, { useMemo }  from 'react';
import { useTranslation } from 'react-i18next';
import { format, isToday, differenceInMinutes, isFuture } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';
import {
  CheckCircle,
  Clock,
  XCircle,
  ArrowRightLeft,
  Timer,
  Video,
  MoreHorizontal,
  CalendarPlus,
  Trash2,
  Undo,
  FileText
} from 'lucide-react';
import { Badge } from './ui/badge.tsx';
import { Avatar, AvatarImage, AvatarFallback } from './ui/avatar.tsx';
import { Button } from './ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx';
import { cn } from '../lib/utils';

const localeMap = {
  en: enUS,
  de,
  fr,
};

const SessionJourneyItemComponent = ({ booking, coach, onSelect, isSelected, onCancelRequest, onRescheduleRequest, onRefundRequest }) => {
  console.log('SessionJourneyItem booking object:', booking);
  const { t, i18n } = useTranslation(['bookings', 'common']);
  const currentLocale = localeMap[i18n.language] || enUS;
  const hasExistingDisputeTicket = useMemo(() => !!booking.disputeTicket, [booking.disputeTicket]);
  const invoiceUrl = useMemo(() => booking.payment?.invoiceUrl, [booking.payment]);

  const getStatusConfig = (status, paymentStatus) => {
    if (paymentStatus === 'partially_refunded') {
        return { icon: Undo, className: 'border-transparent bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400' };
    }
    switch (status) {
      case 'confirmed':
      case 'scheduled':
      case 'firm_booked':
        return { icon: CheckCircle, className: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
      case 'completed':
        return { icon: CheckCircle, className: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' };
      case 'requested':
      case 'pending_payment':
        return { icon: Clock, className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' };
      case 'cancelled_by_client':
      case 'cancelled_by_coach':
      case 'declined':
        return { icon: XCircle, className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' };
      default:
        return { icon: Clock, className: 'border-transparent bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' };
    }
  };

  const config = getStatusConfig(booking.status, booking.payment?.status);
  const startDate = new Date(booking.start);
  const endDate = new Date(booking.end);
  const duration = differenceInMinutes(endDate, startDate);

  const isActionable = isFuture(startDate) && !['cancelled_by_client', 'cancelled_by_coach', 'completed', 'declined'].includes(booking.status);
  const isJoinable = booking.sessionLink?.url && (isFuture(startDate) || isToday(startDate)) && ['confirmed', 'firm_booked'].includes(booking.status);

  const canRequestRefund = useMemo(() => {
    const isEffectivelyCompleted = booking.status === 'completed' || (booking.status === 'confirmed' && new Date(booking.end) < new Date());
    const hasPaid = booking.price?.final?.amount?.amount > 0 && (booking.payment?.status === 'completed' || booking.payment?.status === 'partially_refunded');

    if (!isEffectivelyCompleted || !hasPaid) return false;
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const isWithinWindow = new Date(booking.end) > sevenDaysAgo;
    
    const totalPaid = booking.price.final.amount.amount;
    const totalRefunded = booking.payment.paymentRecord?.amount?.refunded || 0;
    const hasRemainingBalance = totalPaid > totalRefunded;

    const disputeTicket = booking.disputeTicket;
    const isDisputeActionable = !disputeTicket || ['closed', 'resolved_by_coach'].includes(disputeTicket.status);

    return isWithinWindow && hasRemainingBalance && isDisputeActionable;
  }, [booking]);

  const participant = coach || booking.coach;
  const participantName = participant ? `${participant.firstName} ${participant.lastName}` : t('common:yourCoach');
  const participantInitials = participant ? `${participant.firstName?.[0] || ''}${participant.lastName?.[0] || ''}` : '..';

  const UrgencyBadge = () => {
    const now = new Date();
    if (isToday(startDate)) {
        if (now >= startDate && now <= endDate) {
            return <Badge className="border-transparent bg-blue-600 text-primary-foreground hover:bg-blue-600/90">{t('common:inProgress', 'IN PROGRESS')}</Badge>;
        }
        return <Badge variant="secondary">{t('common:today', 'TODAY')}</Badge>;
    }
    return null;
  };

  return (
    <div
      className={cn(
        "flex items-center space-x-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg",
        isSelected ? 'bg-primary/10 ring-2 ring-primary/30 p-2' : 'p-2 -m-2'
      )}
      onClick={() => onSelect(booking)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(booking)}
    >
      <div className="flex flex-col items-center justify-center bg-muted dark:bg-muted/50 p-2 rounded-lg w-16 h-16 text-center shrink-0">
        <span className="text-xs font-bold uppercase text-muted-foreground">{format(startDate, 'MMM', { locale: currentLocale })}</span>
        <span className="text-2xl font-bold text-foreground">{format(startDate, 'd')}</span>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground truncate">{booking.sessionType?.name || t('common:defaultSessionTitle', 'Session')}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5">
                    <Avatar className="h-5 w-5">
                        <AvatarImage src={participant?.coachProfilePicture?.url || participant?.profilePicture?.url} alt={participantName} />
                        <AvatarFallback className="text-xs">{participantInitials}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">{participantName}</span>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-start md:justify-end gap-x-4 gap-y-2 shrink-0 mt-2 md:mt-0 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground" title={format(startDate, 'p', { locale: currentLocale })}>
                    <Clock className="h-4 w-4" />
                    <span>{format(startDate, 'p', { locale: currentLocale })}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Timer className="h-4 w-4" />
                    <span>{t('common:minutesUnit', '{{count}} min', { count: duration })}</span>
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 text-xs', config.className)}>
                        <config.icon className="h-3 w-3" />
                        <span className="font-medium">
                            {booking.payment?.status === 'partially_refunded' ? t('refunds.status.partially_refunded', {ns: 'bookings'}) : t(`status.${booking.status}`, { ns: 'bookings', defaultValue: booking.status })}
                        </span>
                    </Badge>
                    <UrgencyBadge />
                </div>
                
                <div className="flex items-center gap-2">
                  {isJoinable && (
                      <Button asChild variant="secondary" size="sm" className="h-8 px-3" onClick={(e) => e.stopPropagation()}>
                          <a href={booking.sessionLink.url} target="_blank" rel="noopener noreferrer">
                              <Video className="h-4 w-4 md:mr-2" />
                              <span className="hidden md:inline">{t('common:join', 'Join')}</span>
                          </a>
                      </Button>
                  )}
                  {(isActionable && (onCancelRequest || onRescheduleRequest)) || canRequestRefund || hasExistingDisputeTicket || invoiceUrl ? ( 
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            {invoiceUrl && (
                                <DropdownMenuItem onSelect={() => window.open(invoiceUrl, '_blank')}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    <span>{t('downloadInvoice', { ns: 'bookings' })}</span>
                                </DropdownMenuItem>
                            )}
                            {onRescheduleRequest && isActionable && <DropdownMenuItem onSelect={() => onRescheduleRequest(booking)}>
                                <CalendarPlus className="mr-2 h-4 w-4" />
                                <span>{t('rescheduleSession', { ns: 'bookings' })}</span>
                            </DropdownMenuItem>}
                            {onCancelRequest && isActionable && <DropdownMenuItem onSelect={() => onCancelRequest(booking)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>{t('cancelSession', { ns: 'bookings' })}</span>
                            </DropdownMenuItem>}
                            {(canRequestRefund || hasExistingDisputeTicket) && <DropdownMenuItem onSelect={() => onRefundRequest(booking)}>
                                <Undo className="mr-2 h-4 w-4" />
                                <span>
                                  {hasExistingDisputeTicket 
                                    ? t('refunds.viewRequestDetails', { ns: 'bookings' }) 
                                    : t('refunds.requestRefundButton', { ns: 'bookings' })}
                                </span>
                            </DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                  ) : null}
                </div>
            </div>
        </div>
     </div>
 </div>
  );
};

const SessionJourneyItem = React.memo(({ booking, coach, onSelect, isSelected, onCancelRequest, onRescheduleRequest, onRefundRequest }) => {
    return <SessionJourneyItemComponent 
        booking={booking} 
        coach={coach}
        onSelect={onSelect} 
        isSelected={isSelected}
        onCancelRequest={onCancelRequest}
        onRescheduleRequest={onRescheduleRequest}
        onRefundRequest={onRefundRequest}
    />;
});

export default SessionJourneyItem;