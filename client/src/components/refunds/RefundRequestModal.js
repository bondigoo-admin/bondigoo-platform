// src/components/refunds/RefundRequestModal.js
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog.tsx';
import { Label } from '../ui/label.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Button } from '../ui/button.tsx';
import { useCreateRefundRequest, useEscalateDisputeByClient } from '../../hooks/useRefunds';
import { toast } from 'react-hot-toast';
import { Loader2, MessageSquareWarning, ShieldQuestion, Clock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert.tsx';
import ContextualMessageInput from '../messaging/ContextualMessageInput';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';

const getInitialView = (booking) => {
    const ticket = booking?.disputeTicket;
    if (ticket && ['awaiting_coach_response', 'escalated_to_admin'].includes(ticket.status)) {
        return 'pending';
    }
    if (ticket?.status === 'resolved_by_coach') {
        return 'escalate_choice';
    }
    return 'initial';
};

const RefundRequestModal = ({ booking, isOpen, onClose }) => {
    const { t } = useTranslation(['bookings', 'common']);
    const [reason, setReason] = useState('');
    const [view, setView] = useState(() => getInitialView(booking));
    const [showChatInput, setShowChatInput] = useState(false);
    const createRefundRequestMutation = useCreateRefundRequest();
    const escalateDisputeMutation = useEscalateDisputeByClient();

    const ticket = booking?.disputeTicket;
    
    const remainingRefundableAmount = useMemo(() => {
        if (!booking?.price?.final?.amount?.amount) return 0;
        const totalPaid = booking.price.final.amount.amount;
        const totalRefunded = booking.payment?.paymentRecord?.amount?.refunded || 0;
        return totalPaid - totalRefunded;
    }, [booking]);

    const currencyFormatter = useMemo(() => 
        new Intl.NumberFormat(navigator.language || 'en-US', { 
            style: 'currency', 
            currency: booking?.price?.currency || 'CHF' 
        }), 
    [booking?.price?.currency]);

    useEffect(() => {
        if (isOpen) {
            setReason('');
            setShowChatInput(false);
            setView(getInitialView(booking));
        }
    }, [isOpen, booking]);

    if (!booking) return null;

    const coachId = typeof booking.coach === 'object' ? booking.coach._id : booking.coach;

    const handleSubmit = (escalate = false) => {
        if (!reason.trim()) {
            toast.error(t('refunds.reasonRequired'));
            return;
        }

        const mutationToUse = escalate ? escalateDisputeMutation : createRefundRequestMutation;
        const payload = escalate 
            ? { ticketId: ticket._id, reason }
            : {
                bookingId: booking._id,
                reason: reason,
                requestedAmount: remainingRefundableAmount,
                currency: booking.price.currency,
                escalate: false,
              };

        mutationToUse.mutate(payload, {
            onSuccess: () => {
                toast.success(t('refunds.requestSubmitted'));
                onClose();
            },
            onError: (err) => {
                toast.error(err.response?.data?.message || t('common:errors.actionFailed'));
            }
        });
    };

    const renderPendingView = () => {
        const clientMessage = ticket.messages?.find(m => m.sender.toString() === booking.user._id.toString());
        return (
            <div className="py-4 space-y-4">
                <Card className="border-l-4 border-amber-500 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center text-amber-800 dark:text-amber-300">
                            <Clock className="mr-2 h-5 w-5" />
                            {t('refunds.pending.title', 'Your Request is Pending')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                            {ticket.status === 'awaiting_coach_response' 
                                ? t('refunds.pending.awaitingCoach', 'Your request has been sent to the coach for review. You will be notified of their decision.')
                                : t('refunds.pending.escalated', 'Your request has been escalated to support. Our team will review it and get back to you.')
                            }
                        </p>
                        {clientMessage && (
                            <div className="space-y-1 pt-2 border-t border-amber-200 dark:border-amber-800">
                                <div className="flex justify-between text-xs text-amber-600 dark:text-amber-500 font-semibold">
                                    <span>{t('refunds.pending.yourReason', 'The reason you provided:')}</span>
                                    <span>{new Date(clientMessage.createdAt).toLocaleDateString()}</span>
                                </div>
                                <p className="p-2 bg-amber-100/50 dark:bg-amber-900/30 rounded-md text-amber-800 dark:text-amber-300 text-sm italic">{clientMessage.content}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    };

    const renderInitialView = () => (
        <div className="py-4 space-y-4">
            <Alert>
                <MessageSquareWarning className="h-4 w-4" />
                <AlertTitle>{t('refunds.deescalationTitle', 'Have you tried messaging the coach?')}</AlertTitle>
                <AlertDescription>{t('refunds.deescalationBody', 'Often, a quick message can resolve issues directly without a formal dispute. This is usually the fastest path to a solution.')}</AlertDescription>
            </Alert>
            {showChatInput && coachId && (
                <ContextualMessageInput
                    contextId={booking._id}
                    contextType="booking"
                    recipientId={coachId}
                    placeholderText={t('bookings:sendMessageTo', { name: booking.coach?.firstName || t('bookings:theCoach') })}
                />
            )}
            <div className="flex justify-end gap-2">
                {!showChatInput && coachId && <Button variant="outline" onClick={() => setShowChatInput(true)}>{t('refunds.messageCoach', 'Message Coach')}</Button>}
                <Button onClick={() => setView('form')}>{t('refunds.proceedWithRequest', 'Proceed with Request')}</Button>
            </div>
        </div>
    );
    
    const renderEscalateChoiceView = () => (
         <div className="py-4 space-y-4">
            <Alert variant="default" className="border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                <ShieldQuestion className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-900 dark:text-blue-200">{t('refunds.escalate.title', 'How do you want to proceed?')}</AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-400">
                    {t('refunds.escalate.description', 'A partial refund has already been processed. If you are not satisfied, you can escalate the original request to our support team for a final review.')}
                    {ticket?.resolution?.finalRefundAmount && (
                        <span className="block mt-2 font-semibold">
                            {t('refunds.escalate.lastAction', 'Last action: {{amount}} refunded on {{date}}.', {
                                amount: currencyFormatter.format(ticket.resolution.finalRefundAmount),
                                date: new Date(ticket.resolution.resolvedAt).toLocaleDateString()
                            })}
                        </span>
                    )}
                </AlertDescription>
            </Alert>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                 <Button variant="secondary" onClick={() => setView('form')}>
                    {t('refunds.escalate.requestRemaining', 'Request Remaining Balance')}
                </Button>
                <Button variant="destructive" onClick={() => setView('escalate_form')}>
                    {t('refunds.escalate.escalateToSupport', 'Escalate to Support')}
                </Button>
            </div>
        </div>
    );
    
    const renderFormView = (isEscalation = false) => (
         <div className="py-4 space-y-4">
            <div>
                <Label htmlFor="refund-reason">
                    {isEscalation 
                        ? t('refunds.escalate.reasonLabel', 'Please explain why you are escalating this request to support.') 
                        : t('refunds.reasonLabel', 'Please explain why you are requesting a refund.')
                    }
                </Label>
                <Textarea
                    id="refund-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                        isEscalation
                        ? t('refunds.escalate.reasonPlaceholder', 'e.g., The partial refund is insufficient because...')
                        : t('refunds.reasonPlaceholder', 'Describe the issue with the session...')
                    }
                    className="min-h-[120px] mt-1"
                />
            </div>
            <DialogFooter>
                <Button variant="ghost" onClick={onClose} disabled={createRefundRequestMutation.isLoading || escalateDisputeMutation.isLoading}>{t('common:cancel')}</Button>
                <Button onClick={() => handleSubmit(isEscalation)} disabled={createRefundRequestMutation.isLoading || escalateDisputeMutation.isLoading}>
                    {(createRefundRequestMutation.isLoading || escalateDisputeMutation.isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('refunds.submitRequest', 'Submit Request')}
                </Button>
            </DialogFooter>
        </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('refunds.requestTitle')}</DialogTitle>
                    <DialogDescription>{t('refunds.requestSubtitle', { sessionTitle: booking.title || booking.sessionType?.name })}</DialogDescription>
                </DialogHeader>
                {view === 'pending' && renderPendingView()}
                {view === 'initial' && renderInitialView()}
                {view === 'escalate_choice' && renderEscalateChoiceView()}
                {view === 'form' && renderFormView(false)}
                {view === 'escalate_form' && renderFormView(true)}
            </DialogContent>
        </Dialog>
    );
};

export default RefundRequestModal;