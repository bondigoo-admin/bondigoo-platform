import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog.tsx';
import { Label } from '../ui/label.tsx';
import { Input } from '../ui/input.tsx';
import { Button } from '../ui/button.tsx';
import { Textarea } from '../ui/textarea.tsx';
import { Separator } from '../ui/separator.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible.jsx';
import { ScrollArea } from '../ui/scroll-area.jsx';
import { useRespondToRefundRequest } from '../../hooks/useRefunds';
import { toast } from 'react-hot-toast';
import { Loader2, Check, X, Info, ChevronDown, CheckCircle, Clock } from 'lucide-react';

const RefundResponseModal = ({ booking, isOpen, onClose }) => {
    const { t } = useTranslation(['bookings', 'common']);
    const [clientMessage, setClientMessage] = useState('');
    const [adminNote, setAdminNote] = useState('');
    const [approvedAmount, setApprovedAmount] = useState('0');
    const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
    const respondMutation = useRespondToRefundRequest();

    const ticket = booking?.disputeTicket;
    const ticketId = ticket?._id || ticket;
    const isActionable = ticket?.status === 'awaiting_coach_response';

    const requestedAmount = ticket?.requestedRefundAmount?.amount || 0;
    const currency = ticket?.requestedRefundAmount?.currency || booking?.price?.currency || 'CHF';
    const clientReason = ticket?.messages?.[0]?.content || t('refunds.noReasonProvided', 'No reason was provided.');
    const totalPaidByClient = booking?.price?.final?.amount?.amount || 0;
   const platformFee = booking?.price?.platformFee?.amount || 0;

    const paymentRecord = booking?.payment?.paymentRecord;
    const alreadyRefunded = useMemo(() => {
        if (paymentRecord?.refunds && Array.isArray(paymentRecord.refunds)) {
            return paymentRecord.refunds.reduce((acc, refund) => {
                if (refund.status === 'succeeded') {
                    return acc + (refund.amount || 0);
                }
                return acc;
            }, 0);
        }
        return paymentRecord?.amount?.refunded || 0;
    }, [paymentRecord]);

    const maxRefundable = totalPaidByClient - alreadyRefunded;
    const irrecoverableStripeFee = booking?.payment?.paymentRecord?.processingFee || 0;
    
    const originalCoachEarning = totalPaidByClient - platformFee - irrecoverableStripeFee;

    const currencyFormatter = useMemo(() => new Intl.NumberFormat('de-CH', { style: 'currency', currency }), [currency]);

    useEffect(() => {
        if (isOpen && ticket) {
            setClientMessage('');
            setAdminNote('');
            setIsBreakdownOpen(false);
            setApprovedAmount(String(Math.min(requestedAmount, maxRefundable)));
        }
    }, [isOpen, ticket, requestedAmount, maxRefundable]);

    const financialImpact = useMemo(() => {
        const amount = parseFloat(approvedAmount);
        if (isNaN(amount) || amount <= 0 || amount > maxRefundable || totalPaidByClient <= 0) {
            return null;
        }

        const coachGrossEarning = totalPaidByClient - platformFee;
        const refundPortion = amount / totalPaidByClient;
        const refundedCoachEarnings = coachGrossEarning * refundPortion;
        const coachShareOfStripeFee = irrecoverableStripeFee * refundPortion;
        const totalDeductionFromCoach = refundedCoachEarnings + coachShareOfStripeFee;
        
        return {
            totalDeductionFromCoach,
            refundedCoachEarnings,
            coachShareOfStripeFee,
        };
    }, [approvedAmount, maxRefundable, totalPaidByClient, platformFee, irrecoverableStripeFee]);

    if (!ticket) return null;

    const handleResponse = (decision) => {
        const payload = {
            ticketId: ticketId,
            decision,
            clientMessage,
            adminNote,
            approvedAmount: decision === 'approve' ? parseFloat(approvedAmount) : undefined,
        };

        respondMutation.mutate(payload, {
            onSuccess: () => {
                toast.success(t('refunds.responseSubmitted'));
                onClose();
            },
            onError: (err) => {
                toast.error(err.response?.data?.message || t('common:errors.actionFailed'));
            },
        });
    };
    
    const isApproveDisabled = respondMutation.isLoading || !clientMessage.trim() || parseFloat(approvedAmount) <= 0 || parseFloat(approvedAmount) > maxRefundable;
    const isDeclineDisabled = respondMutation.isLoading || !clientMessage.trim();
    const approvedAmountNum = parseFloat(approvedAmount) || 0;
    const percentageOfMax = maxRefundable > 0 ? ((approvedAmountNum / maxRefundable) * 100).toFixed(0) : 0;

    const StatusDisplay = () => {
        let statusText = '';
        let Icon = Info;
        let colorClass = 'text-muted-foreground';
        let resolutionDetails = null;

        switch (ticket.status) {
             case 'closed':
                statusText = t('refunds.status.closed', 'This request has been resolved and is closed.');
                Icon = CheckCircle;
                colorClass = 'text-green-600';
                if (ticket.resolution) {
                    const finalAmount = ticket.resolution.finalRefundAmount;
                    const resolvedDate = ticket.resolution.resolvedAt;
                    const resolverId = ticket.resolution.resolvedBy?.toString();
                    const coachMessage = ticket.messages?.slice().reverse().find(m => m.sender.toString() === resolverId)?.content;

                    resolutionDetails = (
                        <div className="mt-4 space-y-2 text-sm border-t pt-4">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('refunds.resolution.finalAmount', 'Final Amount Refunded:')}</span>
                                <span className="font-semibold">{currencyFormatter.format(finalAmount)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('refunds.resolution.resolvedOn', 'Resolved On:')}</span>
                                <span className="font-semibold">{resolvedDate ? new Date(resolvedDate).toLocaleDateString() : 'N/A'}</span>
                            </div>
                            {coachMessage && (
                                <div className="space-y-1 pt-2">
                                    <span className="text-muted-foreground">{t('refunds.resolution.yourMessage', 'Your Message to Client:')}</span>
                                    <p className="p-2 bg-muted/30 rounded-md text-muted-foreground italic">{coachMessage}</p>
                                </div>
                            )}
                        </div>
                    );
                }
                break;
            case 'escalated_to_admin':
                statusText = t('refunds.status.escalated', 'This request has been escalated to platform support for review.');
                Icon = Clock;
                colorClass = 'text-amber-600';
                break;
            default:
                return null;
        }

        return (
            <Card className="border-l-4 border-primary/50 bg-primary/5">
                <CardHeader>
                    <CardTitle className="text-base flex items-center">
                        <Icon className={`mr-2 h-5 w-5 ${colorClass}`} />
                        {t('refunds.status.title', 'Request Status')}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">{statusText}</p>
                    {resolutionDetails}
                </CardContent>
            </Card>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-3xl lg:max-w-5xl p-0 grid grid-rows-[auto_1fr_auto] max-h-[95vh]">
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle>{t('refunds.reviewRequestTitle', 'Review Refund Request')}</DialogTitle>
                    <DialogDescription>{t('refunds.forBookingWith', 'For booking with {{firstName}} {{lastName}}', { firstName: booking?.user?.firstName, lastName: booking?.user?.lastName })}</DialogDescription>
                </DialogHeader>

                <ScrollArea>
                    <div className="px-6 pb-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="flex flex-col">
                                <CardHeader>
                                    <CardTitle className="text-base">{t('refunds.clientReason', 'Client\'s Reason:')}</CardTitle>
                                </CardHeader>
                                <CardContent className="flex-grow space-y-3">
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap p-3 bg-muted/50 dark:bg-muted/30 rounded-md flex-grow">{clientReason}</p>
                                    <div className="flex justify-between items-center bg-muted/50 dark:bg-muted/30 p-3 rounded-md">
                                        <span className="text-sm font-semibold">{t('refunds.requestedAmount', 'Requested Amount:')}</span>
                                        <span className="text-lg font-bold text-primary">{currencyFormatter.format(requestedAmount)}</span>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="space-y-4">
                                {isActionable ? (
                                    <>
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-base">{t('refunds.approveAmount', 'Amount to Refund (Full or Partial)')}</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="relative">
                                                    <Input
                                                        id="approved-amount"
                                                        type="number"
                                                        value={approvedAmount}
                                                        onChange={(e) => setApprovedAmount(e.target.value)}
                                                        max={maxRefundable}
                                                        min="0"
                                                        step="0.01"
                                                        className="pr-24 text-2xl h-14"
                                                    />
                                                    <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                                                        <span className="text-muted-foreground text-base">({percentageOfMax}%)</span>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-muted-foreground text-right mt-2">{t('refunds.maxRefundable', 'Max refundable: {{amount}}', { amount: currencyFormatter.format(maxRefundable) })}</p>
                                            </CardContent>
                                        </Card>
                                        <Collapsible open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
                                            <CollapsibleTrigger asChild>
                                                <Button variant="ghost" className="w-full text-muted-foreground data-[state=open]:text-primary">
                                                    {t('refunds.showFinancialDetails', 'Show Financial Details')}
                                                    <ChevronDown className={`ml-2 h-4 w-4 transition-transform duration-200 ${isBreakdownOpen ? 'rotate-180' : ''}`} />
                                                </Button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="space-y-2 animate-in fade-in-0 slide-in-from-top-2">
                                                <Card className={financialImpact ? 'border-destructive/50' : ''}>
                                                    <CardHeader className="flex flex-row items-center justify-between p-3">
                                                        <CardTitle className="text-base">{t('refunds.financialImpactTitle', 'Your Financial Breakdown')}</CardTitle>
                                                        <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><Info className="h-4 w-4 text-muted-foreground cursor-pointer"/></TooltipTrigger><TooltipContent><p className="max-w-xs">{t('refunds.policyTooltip', 'Under the standard policy, you cover the refunded earnings plus a share of the non-refundable payment processing fee.')}</p></TooltipContent></Tooltip></TooltipProvider>
                                                    </CardHeader>
                                                    <CardContent className="p-3 pt-0 text-sm">
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between"><span>{t('refunds.originalEarning', 'Original Net Earning')}</span> <span className="font-mono text-muted-foreground">{currencyFormatter.format(originalCoachEarning)}</span></div>
                                                            <Separator className="my-2"/>
                                                            {financialImpact ? (
                                                                <>
                                                                    <div className="flex justify-between"><span>{t('refunds.earningsRefunded', '(-) Earnings Refunded')}</span> <span className="font-mono">{currencyFormatter.format(financialImpact.refundedCoachEarnings)}</span></div>
                                                                    <div className="flex justify-between"><span>{t('refunds.feeShare', '(-) Processing Fee Share')}</span> <span className="font-mono">{currencyFormatter.format(financialImpact.coachShareOfStripeFee)}</span></div>
                                                                    <Separator className="my-2 border-dashed"/>
                                                                    <div className="flex justify-between font-bold text-base text-destructive"><span>{t('refunds.totalDeduction', 'Total Deduction')}</span> <span className="font-mono">{currencyFormatter.format(financialImpact.totalDeductionFromCoach)}</span></div>
                                                                </>
                                                            ) : <div className="text-center text-muted-foreground py-4">{t('refunds.enterAmountToCalculate', 'Enter an amount to see the impact.')}</div>}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    </>
                                ) : (
                                    <StatusDisplay />
                                )}
                            </div>
                        </div>
                        {isActionable && (
                            <div className="space-y-4 pt-6 border-t">
                                <div>
                                    <Label htmlFor="coach-comments" className="font-semibold">{t('refunds.messageToClient', 'Your Message to {{clientName}}', { clientName: booking.user.firstName })} <span className="text-destructive">*</span></Label>
                                    <p className="text-xs text-muted-foreground mb-2">{t('refunds.messageToClientHelp', 'This is required. Explain your decision clearly and professionally.')}</p>
                                    <Textarea id="coach-comments" value={clientMessage} onChange={(e) => setClientMessage(e.target.value)} placeholder={t('refunds.commentsPlaceholder', 'Explain your decision to the client...')} className="min-h-[100px]" />
                                </div>
                                <div>
                                    <Label htmlFor="admin-note" className="font-semibold">{t('refunds.privateNoteLabel', 'Private Note for Platform Support')}</Label>
                                    <p className="text-xs text-muted-foreground mb-2">{t('refunds.privateNoteHelp', 'Visible only to admins. Provide confidential context if needed.')}</p>
                                    <Textarea id="admin-note" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder={t('refunds.privateNotePlaceholder', 'e.g., The client missed the session without notice...')} className="min-h-[100px]" />
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {isActionable && (
                    <DialogFooter className="p-6 pt-4 border-t">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
                            <Button variant="outline" size="lg" onClick={() => handleResponse('decline')} disabled={isDeclineDisabled}>
                                {respondMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <X className="mr-2 h-4 w-4" />}
                                {t('refunds.disagreeAndEscalate', 'Disagree & Escalate')}
                            </Button>
                            <Button size="lg" onClick={() => handleResponse('approve')} disabled={isApproveDisabled}>
                                {respondMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                {t('refunds.approveAndRefund', 'Approve & Refund {{amount}}', { amount: currencyFormatter.format(approvedAmountNum) })}
                            </Button>
                        </div>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default RefundResponseModal;