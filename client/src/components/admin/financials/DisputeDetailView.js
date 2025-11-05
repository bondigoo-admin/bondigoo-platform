import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminDisputeDetail, useAdminRefundPayment, useAdminResolveDispute } from '../../../hooks/useAdmin';
import { logger } from '../../../utils/logger';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { de, fr, es } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../ui/card.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Badge } from '../../ui/badge.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar.tsx';
import { Separator } from '../../ui/separator.jsx';
import { Button } from '../../ui/button.tsx';
import { Input } from '../../ui/input.tsx';
import { Textarea } from '../../ui/textarea.tsx';
import { Label } from '../../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { toast } from 'react-hot-toast';
import { ArrowRight, MessageSquare, User, Briefcase, Calendar, CreditCard, CheckCircle, XCircle, ArrowLeft, History } from 'lucide-react';
import { cn } from '../../../lib/utils';

const localeMap = {
  de,
  fr,
  es,
};

const DisputeDetailView = () => {
    const { ticketId } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data: ticket, isLoading, isError } = useAdminDisputeDetail(ticketId);
    
    const [refundAmount, setRefundAmount] = useState('');
    const [adminNotes, setAdminNotes] = useState('');
    const [policy, setPolicy] = useState('standard');
    
    const refundMutation = useAdminRefundPayment();
    const resolveDisputeMutation = useAdminResolveDispute();

    const currentLocale = localeMap[i18n.language];
    const isResolved = ticket?.status === 'closed';

    const maxRefundable = useMemo(() => {
        if (!ticket?.payment?.amount) return 0;
        return ticket.payment.amount.total - (ticket.payment.amount.refunded || 0);
    }, [ticket]);
    
    useEffect(() => {
        if (ticket && !isResolved) {
            logger.info('[DisputeDetailView] Loaded ticket data:', ticket);
            setRefundAmount(String(maxRefundable.toFixed(2)));
        }
    }, [ticket, maxRefundable, isResolved]);

    const isAmountInvalid = useMemo(() => {
        const amount = parseFloat(refundAmount);
        if (isNaN(amount) || refundAmount === '') return false; // Not invalid if empty or not a number yet
        return amount <= 0 || amount > maxRefundable;
    }, [refundAmount, maxRefundable]);

const handleResolveDispute = (action) => {
     const payload = {
        ticketId,
        decision: action,
        finalAmount: action === 'approve' ? parseFloat(refundAmount) || 0 : 0,
        policy: action === 'approve' ? policy : undefined,
        notes: adminNotes,
    };
    logger.info('[DisputeDetailView] Preparing to resolve dispute. Payload:', payload);
        const finalAmount = parseFloat(refundAmount) || 0;

        if (action === 'approve' && (finalAmount <= 0 || finalAmount > maxRefundable)) {
            toast.error(t('financials.invalidRefundAmount'));
            return;
        }
        
        resolveDisputeMutation.mutate({
            ticketId,
            decision: action,
            finalAmount: action === 'approve' ? finalAmount : 0,
            policy: action === 'approve' ? policy : undefined,
            notes: adminNotes,
        }, {
            onSuccess: () => {
                toast.success(t('financials.disputeResolvedSuccess'));
            },
            onError: (err) => {
                toast.error(err.response?.data?.message || t('common:errors.actionFailed'));
            }
        });
    };

    if (isLoading) return <DisputeDetailSkeleton />;
    if (isError || !ticket) return <div className="text-destructive p-4">{t('common:error.generic')}</div>;

    const getInitiatorName = (processor) => {
        if (!processor) return t('financials.systemInitiated', 'System');
        if (processor.role === 'admin') return t('userManagement.roles.admin', 'Admin');
        
        const roleText = ticket.booking.coach._id === processor._id 
            ? t('userManagement.roles.coach', 'Coach')
            : t('userManagement.roles.client', 'Client');

        if (ticket.booking.coach._id === processor._id || ticket.user._id === processor._id) {
            return `${processor.firstName} ${processor.lastName} (${roleText})`;
        }

        return `${processor.firstName} ${processor.lastName}`;
    };

  return (
        <div className="max-w-7xl mx-auto p-4 space-y-6">
            <header className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t('financials.disputeDetailTitle', 'Dispute Case File')} #{ticket._id.slice(-6)}</h1>
                    <p className="text-muted-foreground">{t('financials.disputeDetailSubtitle', 'Review all information and execute a final resolution.')}</p>
                </div>
            </header>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                         <CardHeader>
                            <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5" /> {t('financials.communicationHistory', 'Communication History')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {ticket.messages.map((msg, index) => {
                                const isUserSender = msg.sender === ticket.user._id;
                                const sender = isUserSender ? ticket.user : ticket.booking.coach;
                                const profilePictureUrl = isUserSender 
                                    ? sender.profilePicture?.url 
                                    : sender.coachProfilePicture?.url || sender.profilePicture?.url;

                                return (
                                <div key={index} className="flex items-start gap-3">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={profilePictureUrl} />
                                        <AvatarFallback>{sender.firstName?.[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 rounded-md bg-muted/50 p-3 text-sm">
                                        <p className="font-semibold">{`${sender.firstName} ${sender.lastName}`}</p>
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                        <p className="text-xs text-muted-foreground mt-1">{format(new Date(msg.createdAt), 'PP p', { locale: currentLocale })}</p>
                                    </div>
                                </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                         {isResolved ? (
                        (() => {
                            const isApproved = ticket.resolution.action === 'refund_approved';
                            return (
                                <Card className={cn(
                                    "border-l-4",
                                    isApproved ? "border-green-500 bg-green-500/5" : "border-destructive bg-destructive/5"
                                )}>
                                    <CardHeader>
                                        <CardTitle className={cn(
                                            "flex items-center gap-2",
                                            isApproved ? "text-green-700" : "text-destructive"
                                        )}>
                                            {isApproved ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                                            {t('financials.disputeResolvedTitle', 'Dispute Resolved')}
                                        </CardTitle>
                                        <CardDescription>
                                            {t('financials.resolvedOnBy', {
                                                date: format(new Date(ticket.resolution.resolvedAt), 'PPp', { locale: currentLocale }),
                                                adminName: 'Administrator'
                                            })}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-3 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">{t('financials.finalDecision', 'Final Decision:')}</span>
                                            <Badge variant={isApproved ? 'success' : 'destructive'}>
                                                {isApproved ? t('financials.refundApproved') : t('financials.refundDenied')}
                                            </Badge>
                                        </div>
                                        {isApproved && (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">{t('financials.finalRefundAmount', 'Final Refund Amount:')}</span>
                                                    <span className="font-semibold">{new Intl.NumberFormat('de-CH', { style: 'currency', currency: ticket.payment.amount.currency }).format(ticket.resolution.finalRefundAmount)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">{t('financials.financialPolicy', 'Financial Policy:')}</span>
                                                    <span className="font-semibold">{t(`financials.policies.${ticket.resolution.policyApplied}`, ticket.resolution.policyApplied)}</span>
                                                </div>
                                            </>
                                        )}
                                        {ticket.resolution.adminNotes && (
                                            <div className="space-y-1 pt-2 border-t">
                                                <span className="text-muted-foreground">{t('financials.resolutionNotes', 'Resolution Notes:')}</span>
                                                <p className="p-2 bg-muted/30 rounded-md italic">{ticket.resolution.adminNotes}</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })()
                    ) : (
                        <Card>
                            <CardHeader><CardTitle>{t('financials.adminActionPanel', 'Admin Action Panel')}</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <Label htmlFor="refundAmount">{t('financials.finalRefundAmount', 'Final Refund Amount')}</Label>
                                    <Input 
                                        id="refundAmount" 
                                        type="number" 
                                        placeholder="0.00" 
                                        value={refundAmount} 
                                        onChange={(e) => setRefundAmount(e.target.value)} 
                                        max={maxRefundable} 
                                        min="0.01" 
                                        step="0.01"
                                        className={cn(isAmountInvalid && "border-destructive focus-visible:ring-destructive")}
                                    />
                                    <div className="flex justify-between items-center mt-1">
                                        {isAmountInvalid && <p className="text-xs text-destructive">{t('financials.refundAmountExceedsMax')}</p>}
                                        <p className="text-xs text-muted-foreground ml-auto">{t('financials.maxRefundable', { amount: new Intl.NumberFormat('de-CH', { style: 'currency', currency: ticket.payment.amount.currency }).format(maxRefundable) })}</p>
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="policy">{t('financials.financialPolicy', 'Financial Policy')}</Label>
                                    <Select value={policy} onValueChange={setPolicy}>
                                        <SelectTrigger id="policy"><SelectValue placeholder="Select a policy" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="standard">{t('financials.policies.standard')}</SelectItem>
                                            <SelectItem value="platform_fault">{t('financials.policies.platform_fault')}</SelectItem>
                                            <SelectItem value="goodwill">{t('financials.policies.goodwill')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="adminNotes">{t('financials.internalNotes', 'Internal Notes (Reason for Decision)')}</Label>
                                    <Textarea id="adminNotes" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder={t('financials.internalNotesPlaceholder', 'Provide justification for the final decision...')}/>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="outline" onClick={() => handleResolveDispute('deny')} disabled={resolveDisputeMutation.isLoading || refundMutation.isLoading}>
                                        <XCircle className="mr-2 h-4 w-4"/>
                                        {t('financials.denyRefund', 'Deny Refund')}
                                    </Button>
                                    <Button onClick={() => handleResolveDispute('approve')} disabled={resolveDisputeMutation.isLoading || refundMutation.isLoading || isAmountInvalid || !refundAmount}>
                                        <CheckCircle className="mr-2 h-4 w-4"/>
                                        {t('financials.approveRefund', 'Approve & Issue Refund')}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

               <div className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />{t('financials.bookingDetails', 'Booking Details')}</CardTitle></CardHeader>
                        <CardContent className="text-sm space-y-2">
                            <p><strong>{t('financials.bookingTitle', 'Title')}:</strong> {ticket.booking.title}</p>
                            <p><strong>{t('financials.bookingDate', 'Date')}:</strong> {format(new Date(ticket.booking.start), 'PPp', { locale: currentLocale })}</p>
                            <div className="flex items-center"><strong>{t('financials.bookingStatus', 'Status')}:</strong> <Badge variant="outline" className="ml-2">{ticket.booking.status}</Badge></div>
                            <Separator className="my-3"/>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground"/><span>{ticket.user.firstName} {ticket.user.lastName}</span></div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground"/>
                                <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground"/><span>{ticket.booking.coach.firstName} {ticket.booking.coach.lastName}</span></div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{t('financials.paymentDetails', 'Payment Details')}</CardTitle></CardHeader>
                        <CardContent className="text-sm space-y-2">
                            <p><strong>{t('financials.paymentId', 'Payment ID')}:</strong> {ticket.payment._id}</p>
                            <p><strong>{t('financials.totalPaid', 'Total Paid')}:</strong> {new Intl.NumberFormat('de-CH', { style: 'currency', currency: ticket.payment.amount.currency }).format(ticket.payment.amount.total)}</p>
                            <p><strong>{t('financials.previouslyRefunded', 'Previously Refunded')}:</strong> {new Intl.NumberFormat('de-CH', { style: 'currency', currency: ticket.payment.amount.currency }).format(ticket.payment.amount.refunded || 0)}</p>
                            <div className="flex items-center"><strong>{t('financials.payoutStatus', 'Payout Status')}:</strong> <Badge variant={ticket.payment.payoutStatus === 'paid_out' ? 'success' : 'secondary'} className="ml-2">{t(`financials.payoutStatuses.${ticket.payment.payoutStatus}`, ticket.payment.payoutStatus)}</Badge></div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />{t('financials.refundHistory', 'Refund History')}</CardTitle></CardHeader>
                        <CardContent className="text-sm space-y-3">
                            {ticket.payment?.refunds && ticket.payment.refunds.length > 0 ? (
                                [...ticket.payment.refunds]
                                    .sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt))
                                    .map((refund, index) => (
                                        <div key={index}>
                                            <div className="flex justify-between items-center">
                                                <p className="font-semibold">{new Intl.NumberFormat('de-CH', { style: 'currency', currency: refund.currency || ticket.payment.amount.currency }).format(refund.amount)}</p>
                                                <p className="text-xs text-muted-foreground">{format(new Date(refund.processedAt), 'PPp', { locale: currentLocale })}</p>
                                            </div>
                                            <div className="text-xs text-muted-foreground">{t('financials.refundInitiatedBy', 'Initiated by: {{name}}', { name: getInitiatorName(refund.processedBy) })}</div>
                                            {index < ticket.payment.refunds.length - 1 && <Separator className="my-2" />}
                                        </div>
                                    ))
                            ) : (
                                <p className="text-muted-foreground">{t('financials.noRefundsIssued', 'No refunds have been issued for this payment yet.')}</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

const DisputeDetailSkeleton = () => (
     <div className="max-w-7xl mx-auto p-4 space-y-6">
        <header><Skeleton className="h-9 w-1/2" /><Skeleton className="h-4 w-3/4 mt-2" /></header>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6"><Card><CardHeader><Skeleton className="h-6 w-48" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></CardContent></Card></div>
            <div className="space-y-6"><Card><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></CardContent></Card></div>
        </div>
    </div>
);

export default DisputeDetailView;