import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog.tsx';
import { Button } from '../ui/button.tsx';
import { Textarea } from '../ui/textarea.tsx';
import LoadingSpinner from '../LoadingSpinner';
import { X, Trash2, AlertCircle, ChevronDown, ChevronUp, Loader2, Info, CheckCircle, AlertTriangle } from 'lucide-react';

const PolicyDetailRow = ({ label, children, icon: Icon, iconClassName }) => (
  <div className="flex items-start justify-between gap-4 py-2">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-sm font-semibold text-foreground text-right flex items-center gap-2">
      {Icon && <Icon className={`h-4 w-4 ${iconClassName}`} />}
      <span>{children}</span>
    </dd>
  </div>
);

const CancellationModal = ({
  isOpen,
  onClose,
  booking,
  cancellationDetails,
  isCalculating,
  isCancelling,
  onConfirm,
  sessionTitleForCancellationPrompt,
  isCoachOfBooking,
  isWebinarType,
}) => {
  const { t } = useTranslation(['bookings', 'common']);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isRefundDetailsExpanded, setIsRefundDetailsExpanded] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCancellationReason('');
      setIsRefundDetailsExpanded(false);
    }
  }, [isOpen]);

  const handleConfirmCancellation = () => {
    onConfirm(cancellationReason);
  };

  const isClientOfBooking = booking?.user?._id && !isCoachOfBooking;

  const getPolicyReasoning = () => {
    if (!cancellationDetails) return null;
    const hours = cancellationDetails.matchedTierHoursBefore ?? cancellationDetails.minimumNoticeHours;
    switch (cancellationDetails.reasonCode) {
      case 'ELIGIBLE_FOR_CANCELLATION':
        return t('bookings:cancellationReason.eligible', { hours });
      case 'MINIMUM_NOTICE_VIOLATED':
        return t('bookings:cancellationReason.minimumNoticeViolated', { hours });
      default:
        return null;
    }
  };

  const getPolicyStatus = () => {
    if (!cancellationDetails) return { text: '', Icon: null, className: '' };
    if (cancellationDetails.canCancel) {
      return { text: t('bookings:cancellationStatus.possible'), Icon: CheckCircle, className: 'text-green-500' };
    }
    if (!cancellationDetails.canCancel && cancellationDetails.reasonCode === 'MINIMUM_NOTICE_VIOLATED') {
      return { text: t('bookings:cancellationStatus.possibleNoRefund'), Icon: AlertTriangle, className: 'text-amber-500' };
    }
    return { text: 'N/A', Icon: null, className: '' };
  };

  const policyStatus = getPolicyStatus();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl p-0 flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>{t('bookings:confirmCancellationTitle')}</DialogTitle>
          <DialogDescription>
            {(() => {
              if (cancellationDetails?.isCoachCancellation) {
                return isWebinarType && booking
                  ? t('bookings:confirmCoachWebinarCancellationPrompt', { webinarTitle: booking.title || t('bookings:thisWebinar') })
                  : t('bookings:confirmCoachOneOnOneCancellationPrompt', { clientName: cancellationDetails.clientName || t('bookings:theClient') });
              } else if (isClientOfBooking && isWebinarType && booking) {
                return t('bookings:confirmWebinarRegistrationCancellationPrompt', {
                  sessionTitle: sessionTitleForCancellationPrompt,
                });
              } else if (booking) {
                return t('bookings:confirmCancellationPrompt', {
                  sessionTitle: sessionTitleForCancellationPrompt,
                  coachName: booking.coach?.firstName ? `${booking.coach.firstName} ${booking.coach.lastName}` : t('bookings:theCoach')
                });
              }
              return t('common:loadingDescription', 'Loading cancellation details...');
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          {isCalculating && (
            <div className="flex min-h-[150px] items-center justify-center p-4"><LoadingSpinner /></div>
          )}

          {!isCalculating && cancellationDetails && cancellationDetails.error && (
            <div className="space-y-3 py-4">
              <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span>{cancellationDetails.message || t('bookings:errors.fetchCancellationDetailsFailed')}</span>
              </div>
            </div>
          )}

          {!isCalculating && cancellationDetails && !cancellationDetails.error && (
            <div className="space-y-4 pt-2 pb-4">
              {cancellationDetails.isCoachCancellation ? (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/30 dark:bg-blue-900/20">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    {isWebinarType && booking ?
                      t('bookings:coachCancellationWebinarInfo', { attendeesCount: cancellationDetails.webinarAttendeesCount || 0 })
                      :
                      t('bookings:coachCancellationOneOnOneInfo', { refundAmount: cancellationDetails.grossRefundToClient?.toFixed(2) || '0.00', currency: cancellationDetails.currency })
                    }
                  </p>
                  <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">{t('bookings:coachCancellationClientNotified')}</p>
                </div>
              ) : (
                <>
                  {!cancellationDetails.canCancel && cancellationDetails.reasonCode === 'MINIMUM_NOTICE_VIOLATED' && (
                    <div className="flex items-start gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                      <Info className="h-5 w-5 flex-shrink-0" />
                      <span>{t('bookings:cancellationPastRefundWindowInfo')}</span>
                    </div>
                  )}
                  <div className="space-y-4">
                    <div className="rounded-md border bg-blue-50 dark:border-blue-500/30 dark:bg-blue-900/20">
                      <button
                        type="button"
                        onClick={() => setIsRefundDetailsExpanded(!isRefundDetailsExpanded)}
                        className="flex w-full items-center justify-between p-3 text-left"
                        aria-expanded={isRefundDetailsExpanded}
                      >
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                          {t('bookings:refundAmountDue')}: {cancellationDetails.grossRefundToClient?.toFixed(2) || '0.00'} {cancellationDetails.currency || ''}
                        </p>
                        <span className="text-blue-600 dark:text-blue-400">
                          {isRefundDetailsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {isRefundDetailsExpanded && (
                          <motion.div
                            key="refund-details-collapsible"
                            initial="collapsed"
                            animate="open"
                            exit="collapsed"
                            variants={{ open: { opacity: 1, height: "auto" }, collapsed: { opacity: 0, height: 0 } }}
                            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3">
                              <div className="pt-3 border-t border-blue-100 dark:border-blue-500/20">
                                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                                  {t('bookings:originalPricePaid')}: {(cancellationDetails?.originalPricePaid !== undefined ? cancellationDetails.originalPricePaid : (booking?.price?.final?.amount?.amount || 0)).toFixed(2)} {cancellationDetails?.currency || booking?.price?.currency || ''}
                                </p>
                                {cancellationDetails.grossRefundToClient > 0 && (
                                  <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">{t('bookings:refundProcessingTimeNote')}</p>
                                )}
                                {cancellationDetails.grossRefundToClient === 0 && cancellationDetails.refundPercentage < 100 && (
                                  <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">{t('bookings:noRefundDueNote')}</p>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="rounded-lg border bg-background p-4 dark:bg-muted/30">
                      <h3 className="text-sm font-semibold mb-2">{t('bookings:cancellationPolicyApplied')}</h3>
                      <dl className="divide-y dark:divide-border/50">
                        <PolicyDetailRow label={t('bookings:cancellationPolicyStatusTitle')} icon={policyStatus.Icon} iconClassName={policyStatus.className}>
                          {policyStatus.text}
                        </PolicyDetailRow>
                        <PolicyDetailRow label={t('bookings:cancellationPolicyRuleTitle')}>
                          {t(cancellationDetails.applicableTierDescriptionKey, {
                            percentage: cancellationDetails.refundPercentage,
                            hours: cancellationDetails.matchedTierHoursBefore ?? cancellationDetails.minimumNoticeHours
                          })}
                        </PolicyDetailRow>
                        <PolicyDetailRow label={t('bookings:cancellationPolicyReasonTitle')}>
                          {getPolicyReasoning()}
                        </PolicyDetailRow>
                      </dl>
                    </div>
                  </div>
                </>
              )}
              <div>
                <label htmlFor="cancellationReason" className="mb-1 block text-sm font-medium text-foreground">
                  {t('bookings:cancellationReasonLabel')} ({t('common:optional')})
                </label>
                <Textarea
                  id="cancellationReason"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder={cancellationDetails?.isCoachCancellation ? t('bookings:coachCancellationReasonPlaceholder') : t('bookings:cancellationReasonPlaceholder')}
                  className="w-full"
                  rows={3}
                />
              </div>
            </div>
          )}

          {!isCalculating && !cancellationDetails && (
            <p className="p-4 text-center text-sm text-muted-foreground">{t('bookings:errors.loadingCancellationInfo')}</p>
          )}
        </div>

        <DialogFooter className="p-6 pt-4 border-t dark:border-border/50">
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full"
            >
              <X className="mr-2 h-4 w-4" />
              {t('common:keepBooking')}
            </Button>
            {cancellationDetails && !cancellationDetails.error && (
              <Button
                type="button"
                variant="outline"
                onClick={handleConfirmCancellation}
                disabled={isCancelling || isCalculating}
                className="w-full"
              >
                {isCancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                {t('bookings:confirmCancellationButton')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CancellationModal;