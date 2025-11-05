import React, { useState, useMemo, useEffect, forwardRef } from 'react';
import { useAdminPayments, useAdminRefundPayment, useAdminB2bDocumentUrl, useAdminDownloadSettlementAdvice } from '../../../hooks/useAdmin';
import { useDebounce } from 'use-debounce';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../../ui/table.tsx';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '../../ui/pagination.jsx';
import { Input } from '../../ui/input.tsx';
import { Button } from '../../ui/button.tsx';
import { Badge } from '../../ui/badge.tsx';
import { Skeleton } from '../../ui/skeleton.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '../../ui/dialog.tsx';
import { Label } from '../../ui/label.tsx';
import { ExternalLink, Undo2, ArrowRight, FileText, FileSignature, FileMinus, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Separator } from '../../ui/separator.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip.tsx';
import { cn } from '../../../lib/utils';

const formatCurrency = (value, currency) => {
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency: currency || 'CHF' }).format(value || 0);
}

const RefundModal = forwardRef(function RefundModal({ payment, children }, ref) {
    const [isOpen, setIsOpen] = useState(false);
    const [amount, setAmount] = useState(0);
    const [reason, setReason] = useState('');
    const [policy, setPolicy] = useState('standard');
    const { t } = useTranslation(['admin', 'common']);
    const refundMutation = useAdminRefundPayment();

   useEffect(() => {
        if (payment && isOpen) {
            const maxRefundable = payment.amount.total - (payment.amount.refunded || 0);
            setAmount(maxRefundable);
            setPolicy('standard');
            setReason('');
        }
    }, [payment, isOpen]);

    const handleRefundClick = () => {
        const maxRefundable = payment.amount.total - (payment.amount.refunded || 0);
        if (amount <= 0 || amount > maxRefundable) {
            toast.error(t('financials.invalidRefundAmount'));
            return;
        }
        refundMutation.mutate({
            paymentId: payment._id,
            amount: parseFloat(amount),
            reason: reason || 'Admin initiated refund',
            policyType: policy
        }, {
            onSuccess: () => {
                toast.success(t('financials.refundSuccess'));
                setIsOpen(false);
            },
            onError: (err) => {
                toast.error(t('financials.refundError', { message: err.response?.data?.message || err.message }));
            }
        });
    };

    if (!payment) return null;
    const maxRefundable = payment.amount.total - (payment.amount.refunded || 0);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild ref={ref}>{children}</DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('financials.initiateRefund', 'Initiate Refund')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount">{t('financials.refundAmount', 'Refund Amount')}</Label>
                        <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} max={maxRefundable} min="0.01" step="0.01" />
                        <p className="text-xs text-muted-foreground text-right">{t('financials.maxRefundable', { amount: formatCurrency(maxRefundable, payment.amount.currency), currency: '' })}</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="reason">{t('financials.refundReason', 'Reason for Refund')}</Label>
                        <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('financials.refundReasonPlaceholder', 'e.g., Customer request')} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="policy">{t('financials.financialPolicy', 'Financial Policy')}</Label>
                        <Select value={policy} onValueChange={setPolicy}>
                            <SelectTrigger id="policy">
                                <SelectValue placeholder={t('financials.selectPolicy', 'Select a policy')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="standard">{t('financials.policies.standard', 'Standard (Coach covers costs)')}</SelectItem>
                                <SelectItem value="platform_fault">{t('financials.policies.platform_fault', 'Platform Fault')}</SelectItem>
                                <SelectItem value="goodwill">{t('financials.policies.goodwill', 'Goodwill (Platform covers all)')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>{t('common:cancel', 'Cancel')}</Button>
                    <Button onClick={handleRefundClick} disabled={refundMutation.isLoading}>
                      {refundMutation.isLoading ? t('common:processing', 'Processing...') : t('financials.processRefund', 'Process Refund')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

const TransactionsLedger = () => {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);

  const { data, isLoading, isError } = useAdminPayments({
    page,
    limit: 10,
    search: debouncedSearch,
  });
  
  const adviceMutation = useAdminDownloadSettlementAdvice();
  const b2bDocMutation = useAdminB2bDocumentUrl();
  
  const handleDownloadAdvice = (paymentId) => {
    adviceMutation.mutate({ paymentId, language: i18n.language }, {
        onSuccess: (result) => {
            const { data: blobData, filename } = result;
            if (!blobData || blobData.size === 0) {
                 toast.error(t('common:error.downloadFailedEmpty', 'Download failed: The server returned an empty file.'));
                 return;
            }
            const url = window.URL.createObjectURL(new Blob([blobData], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success(t('common:downloadStarted', 'Your download has started.'));
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || t('common:error.generic'));
        }
    });
  };
    
  const handleDownloadB2bDoc = (invoiceId) => {
      b2bDocMutation.mutate(invoiceId, {
          onSuccess: (response) => {
              if(response.data.pdfUrl) {
                  window.open(response.data.pdfUrl, '_blank');
              } else {
                  toast.error(t('financials.pdfNotAvailable'));
              }
          },
          onError: (error) => {
              toast.error(error.response?.data?.message || t('common:error.generic'));
          }
      });
  };

  const getStatusVariant = (status) => {
    const statusMap = {
        completed: 'success',
        succeeded: 'success',
        refunded: 'secondary',
        partially_refunded: 'warning',
        disputed: 'destructive',
        failed: 'destructive',
        cancelled: 'outline',
    };
    return statusMap[status] || 'outline';
  };
  
const columns = useMemo(() => [
    { header: t('financials.columns.details'), id: 'details' },
    { header: t('financials.columns.status'), id: 'status' },
    { header: t('financials.columns.gross'), id: 'gross' },
    { header: t('financials.columns.stripeFee'), id: 'stripeFee' },
    { header: t('financials.columns.vat'), id: 'vat' },
    { header: t('financials.columns.platformFee'), id: 'platformFee' },
    { header: t('financials.columns.coachVat', 'Vorsteuer'), id: 'coachVat' },
    { header: t('financials.columns.netPayout'), id: 'net' },
    { header: t('financials.columns.actions'), id: 'actions' },
  ], [t]);

  if(isError) return <div className="text-destructive p-4">{t('common:error.generic')}</div>

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder={t('financials.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
           className="max-w-sm"
        />
      </div>
      <div className="rounded-md border flex-1 min-h-0 overflow-auto">
        <Table>
         <TableHeader className="hidden md:table-header-group">
            <TableRow>
              <TableHead>{t('financials.columns.details')}</TableHead>
              <TableHead>{t('financials.columns.status')}</TableHead>
              <TableHead className="text-right">{t('financials.columns.gross')}</TableHead>
              <TableHead className="text-right hidden lg:table-cell">{t('financials.columns.refunded', 'Refunded')}</TableHead>
              <TableHead className="text-right hidden xl:table-cell">{t('financials.columns.stripeFee')}</TableHead>
              <TableHead className="text-right hidden xl:table-cell">{t('financials.columns.vat')}</TableHead>
              <TableHead className="text-right hidden lg:table-cell">{t('financials.columns.platformFee')}</TableHead>
              <TableHead className="text-right hidden xl:table-cell">{t('financials.columns.coachVat', 'Vorsteuer')}</TableHead>
              <TableHead className="text-right">{t('financials.columns.netPayout')}</TableHead>
              <TableHead className="text-right">{t('financials.columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                    <TableCell colSpan={columns.length} className="p-4 md:hidden">
                        <div className="flex justify-between items-start gap-4">
                            <div className="space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-40" /></div>
                            <div className="flex flex-col items-end space-y-1.5"><Skeleton className="h-5 w-20" /><Skeleton className="h-5 w-16" /></div>
                        </div>
                    </TableCell>
                    {columns.map(col => <TableCell key={col.id} className="hidden md:table-cell"><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : data?.payments?.length > 0 ? (
                data.payments.map((payment) => {
                const processingFee = payment.amount.processingFee || 0;
                const vatAmount = payment.amount.vat?.amount || 0;
                const platformFee = payment.amount.platformFee || 0;
                const refundedAmount = payment.amount.refunded || 0;
                const coachB2bVat = payment.amount.coachB2bVat || 0;
                const netPayout = payment.amount.netPayout || 0;
                const netEarning = netPayout - coachB2bVat; // For mobile breakdown clarity
                const isRefundable = (payment.status === 'completed' || payment.status === 'succeeded' || payment.status === 'partially_refunded') && (payment.amount.total > refundedAmount);
                
                return (
                <TableRow key={payment._id} className={cn("border-b", (refundedAmount > 0 || payment.type === 'adjustment') && "bg-muted/40")}>
                  <TableCell colSpan={columns.length} className="p-4 md:hidden">
                      <div className="flex flex-col gap-3">
                          <div className="flex justify-between items-start">
                              <div className="flex-1 overflow-hidden">
                                  <p className="font-medium truncate">{payment.booking?.title || payment.program?.title || (payment.type === 'adjustment' ? t('financials.postPayoutDeduction', 'Post-Payout Deduction') : 'Direct Payment')}</p>
                                  {payment.type === 'adjustment' && payment.originalPayment?.stripe?.paymentIntentId && (
                                      <a href={`https://dashboard.stripe.com/payments/${payment.originalPayment.stripe.paymentIntentId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline">
                                          {t('financials.forSale', 'For Sale')} #{payment.originalPayment._id.slice(-6)}
                                      </a>
                                  )}
                                  <p className="text-sm text-muted-foreground">{format(new Date(payment.createdAt), 'PP p')}</p>
                              </div>
                              <Badge variant={getStatusVariant(payment.status)} className="ml-2 shrink-0">{t(`financials.statuses.${payment.status}`, payment.status)}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                              <span>{payment.payer ? `${payment.payer.firstName} ${payment.payer.lastName}` : 'N/A'}</span>
                              <ArrowRight className="h-3 w-3 shrink-0" />
                              <span>{payment.recipient ? `${payment.recipient.firstName} ${payment.recipient.lastName}` : 'N/A'}</span>
                          </div>
                            <div className="rounded-md border bg-muted/50 p-3 text-sm">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                <span>{t('financials.columns.gross')}</span><span className="text-right font-medium">{formatCurrency(payment.amount.total, payment.amount.currency)}</span>
                                {refundedAmount > 0 && <><span>(-) {t('financials.columns.refunded')}</span><span className="text-right text-destructive">{formatCurrency(refundedAmount, payment.amount.currency)}</span></>}
                                <span className="text-muted-foreground">(-) {t('financials.columns.stripeFee')}</span><span className="text-right text-muted-foreground">{formatCurrency(processingFee, payment.amount.currency)}</span>
                                <span className="text-muted-foreground">(-) {t('financials.columns.vat')}</span><span className="text-right text-muted-foreground">{formatCurrency(vatAmount, payment.amount.currency)}</span>
                                <span className="text-muted-foreground">(-) {t('financials.columns.platformFee')}</span><span className="text-right text-muted-foreground">{formatCurrency(platformFee, payment.amount.currency)}</span>
                                <Separator className="my-1 col-span-2" />
                                <span>{t('financials.netEarning', 'Net Earning')}</span><span className="text-right">{formatCurrency(netEarning, payment.amount.currency)}</span>
                                {coachB2bVat > 0 && <><span>(+) {t('financials.columns.coachVat', 'Vorsteuer')}</span><span className="text-right">{formatCurrency(coachB2bVat, payment.amount.currency)}</span></>}
                            </div>
                            <Separator className="my-2" />
                            <div className="grid grid-cols-2 gap-x-4">
                                <span className="font-semibold">{t('financials.columns.netPayout')}</span><span className="text-right font-semibold">{formatCurrency(netPayout, payment.amount.currency)}</span>
                            </div>
                          </div>
                          <div className="flex justify-end items-center gap-2">
                            {payment.b2cCreditNote?.stripeHostedUrl && (
                                <a href={payment.b2cCreditNote.stripeHostedUrl} target="_blank" rel="noopener noreferrer">
                                  <Button variant="outline" size="sm"><FileMinus className="mr-2 h-4 w-4" />{t('financials.b2cCreditNote', 'B2C Note')}</Button>
                                </a>
                            )}
                            {payment.stripe?.paymentIntentId && (
                                <a href={`https://dashboard.stripe.com/payments/${payment.stripe.paymentIntentId}`} target="_blank" rel="noopener noreferrer">
                                  <Button variant="outline" size="sm"><ExternalLink className="mr-2 h-4 w-4" />Stripe</Button>
                                </a>
                            )}
                            {isRefundable && (
                                <RefundModal payment={payment}>
                                  <Button variant="outline" size="sm" className="px-2"><Undo2 className="h-4 w-4" /></Button>
                                </RefundModal>
                            )}
                          </div>
                      </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="font-medium truncate">{payment.booking?.title || payment.program?.title || (payment.type === 'adjustment' ? t('financials.postPayoutDeduction', 'Post-Payout Deduction') : 'Direct Payment')}</div>
                    {payment.type === 'adjustment' && payment.originalPayment?._id ? (
                        <div className="text-xs text-muted-foreground">{t('financials.forSale', 'For Sale')} #{payment.originalPayment._id.slice(-6)}</div>
                    ) : (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <span>{payment.payer ? `${payment.payer.firstName.charAt(0)}. ${payment.payer.lastName}` : 'N/A'}</span>
                            <ArrowRight className="h-3 w-3 shrink-0" />
                            <span>{payment.recipient ? `${payment.recipient.firstName.charAt(0)}. ${payment.recipient.lastName}` : 'N/A'}</span>
                        </div>
                    )}
                     <div className="text-xs text-muted-foreground">{format(new Date(payment.createdAt), 'PP')}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant={getStatusVariant(payment.status)}>{t(`financials.statuses.${payment.status}`, payment.status)}</Badge>
                  </TableCell>
                 <TableCell className="hidden md:table-cell text-right font-medium">{formatCurrency(payment.amount.total, payment.amount.currency)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right text-destructive">{refundedAmount > 0 ? `-${formatCurrency(refundedAmount, payment.amount.currency)}` : null}</TableCell>
                  <TableCell className="hidden xl:table-cell text-right text-muted-foreground">{formatCurrency(processingFee, payment.amount.currency)}</TableCell>
                  <TableCell className="hidden xl:table-cell text-right text-muted-foreground">{formatCurrency(vatAmount, payment.amount.currency)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right text-muted-foreground">{formatCurrency(platformFee, payment.amount.currency)}</TableCell>
                  <TableCell className="hidden xl:table-cell text-right text-muted-foreground">{coachB2bVat > 0 ? `+${formatCurrency(coachB2bVat, payment.amount.currency)}` : null}</TableCell>
                  <TableCell className="hidden md:table-cell text-right font-semibold">{formatCurrency(netPayout, payment.amount.currency)}</TableCell>
                  <TableCell className="hidden md:table-cell text-right">
                    <TooltipProvider>
                      <div className="flex items-center justify-end gap-1">
                        {payment.b2cCreditNote?.stripeHostedUrl && (
                             <Tooltip>
                                <TooltipTrigger asChild>
                                  <a href={payment.b2cCreditNote.stripeHostedUrl} target="_blank" rel="noopener noreferrer">
                                    <Button variant="ghost" size="icon"><FileMinus className="h-4 w-4 text-red-500" /></Button>
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('financials.viewB2CCreditNote', 'View B2C Credit Note')}</p></TooltipContent>
                            </Tooltip>
                        )}
                        {payment.stripe?.paymentIntentId && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                  <a href={`https://dashboard.stripe.com/payments/${payment.stripe.paymentIntentId}`} target="_blank" rel="noopener noreferrer">
                                    <Button variant="ghost" size="icon"><ExternalLink className="h-4 w-4" /></Button>
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('financials.viewOnStripe', 'View on Stripe')}</p></TooltipContent>
                            </Tooltip>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleDownloadAdvice(payment._id)} disabled={adviceMutation.isLoading && adviceMutation.variables?.paymentId === payment._id}>
                                    {adviceMutation.isLoading && adviceMutation.variables?.paymentId === payment._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>{t('financials.downloadAdvice', 'Download Settlement Advice')}</p></TooltipContent>
                        </Tooltip>
                        {payment.b2bDocument?.type === 'invoice' && (
                             <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleDownloadB2bDoc(payment.b2bDocument._id)} disabled={b2bDocMutation.isLoading && b2bDocMutation.variables === payment.b2bDocument._id}>
                                        {b2bDocMutation.isLoading && b2bDocMutation.variables === payment.b2bDocument._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('financials.downloadB2BInvoice', 'Download B2B Invoice')}</p></TooltipContent>
                            </Tooltip>
                        )}
                        {payment.b2bDocument?.type === 'credit_note' && (
                             <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleDownloadB2bDoc(payment.b2bDocument._id)} disabled={b2bDocMutation.isLoading && b2bDocMutation.variables === payment.b2bDocument._id}>
                                        {b2bDocMutation.isLoading && b2bDocMutation.variables === payment.b2bDocument._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileMinus className="h-4 w-4" />}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('financials.downloadB2BCreditNote', 'Download B2B Credit Note')}</p></TooltipContent>
                            </Tooltip>
                        )}
                        {isRefundable && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                  <RefundModal payment={payment}>
                                    <Button variant="ghost" size="icon"><Undo2 className="h-4 w-4" /></Button>
                                  </RefundModal>
                                </TooltipTrigger>
                                <TooltipContent><p>{t('financials.initiateRefund', 'Initiate Refund')}</p></TooltipContent>
                            </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t('financials.noTransactions')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data?.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || isLoading} />
            </PaginationItem>
            <PaginationItem><span className="px-4 py-2 text-sm">{t('common:pageNumber', { current: data.currentPage, total: data.totalPages })}</span></PaginationItem>
            <PaginationItem>
              <PaginationNext onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages || isLoading} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
};

export default TransactionsLedger;