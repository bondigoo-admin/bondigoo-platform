import React, { useState, useEffect, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '../ui/dialog.tsx';
import { Label } from '../ui/label.tsx';
import { Input } from '../ui/input.tsx';
import { Button } from '../ui/button.tsx';
import { useInitiateCoachRefund } from '../../hooks/useRefunds';
import { toast } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

export const CoachRefundModal = forwardRef(({ payment, children, maxRefundable, isOpen, onClose }, ref) => {
    const [internalIsOpen, setInternalIsOpen] = useState(false);
    const [amount, setAmount] = useState(0);
    const [reason, setReason] = useState('');
    const { t } = useTranslation(['coach_dashboard', 'common']);
    const refundMutation = useInitiateCoachRefund();

    const isControlled = isOpen !== undefined;
    const open = isControlled ? isOpen : internalIsOpen;
    const setOpen = isControlled ? onClose : setInternalIsOpen;

    useEffect(() => {
        if (open) {
            setAmount(maxRefundable);
            setReason('');
        }
    }, [open, maxRefundable]);

   const handleRefund = () => {
        if (!amount || parseFloat(amount) <= 0 || parseFloat(amount) > maxRefundable) {
            toast.error(t('earnings.invalidRefundAmount'));
            return;
        }

        refundMutation.mutate({
            paymentId: payment._id,
            amount: parseFloat(amount),
            reason: reason || 'Proactive refund by coach',
        }, {
            onSuccess: () => {
                toast.success(t('earnings.refundSuccess'));
                setOpen(false);
            },
            onError: (err) => {
                toast.error(err.response?.data?.message || t('common:error_generic'));
            },
        });
    };

    const dialogContent = (
        <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>{t('earnings.issueRefundTitle', 'Issue a Refund')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="refund-amount">{t('earnings.refundAmount', 'Amount to Refund')}</Label>
                    <Input id="refund-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} max={maxRefundable} min="0.01" step="0.01" />
                    <p className="text-xs text-muted-foreground text-right mt-1">{t('earnings.maxRefundable', 'Max:')} {maxRefundable.toFixed(2)} {payment?.priceSnapshot?.currency || payment?.amount?.currency}</p>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="refund-reason">{t('earnings.refundReason', 'Reason (optional)')}</Label>
                    <Input id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('earnings.refundReasonPlaceholder', 'e.g., Session quality issue')} />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t('common:cancel')}</Button>
                <Button onClick={handleRefund} disabled={refundMutation.isLoading}>
                    {refundMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('earnings.confirmRefund', 'Confirm Refund')}
                </Button>
            </DialogFooter>
        </DialogContent>
    );

    if (isControlled) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                {dialogContent}
            </Dialog>
        );
    }
    
    return (
        <Dialog open={open} onOpenChange={setInternalIsOpen}>
            <DialogTrigger asChild ref={ref}>{children}</DialogTrigger>
            {dialogContent}
        </Dialog>
    );
});

CoachRefundModal.displayName = 'CoachRefundModal';