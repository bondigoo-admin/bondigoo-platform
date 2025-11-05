import React from 'react';
import { useQuery, useMutation } from 'react-query'; 
import { fetchTransactions, getStatementDownload, getB2bDocumentUrl, fetchAdjustments } from '../../services/earningsAPI'; 
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { Button } from '../ui/button.tsx';
import { Badge } from '../ui/badge.tsx';
import { Skeleton } from '../ui/skeleton.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx';
import { Undo2, FileText, AlertCircle, Loader2, FileSignature, FileMinus, ChevronDown, Copy } from 'lucide-react';
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from '../ui/pagination.jsx';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { enUS, de, fr } from 'date-fns/locale';
import { CoachRefundModal } from '../refunds/CoachRefundModal';

const localeMap = {
  en: enUS,
  de,
  fr,
};

const PendingDeductions = () => {
    const { t } = useTranslation(['coach_dashboard', 'common']);
    const { data: adjustments, isLoading } = useQuery('coachAdjustments', fetchAdjustments);

    if (isLoading || !adjustments || adjustments.length === 0) {
        return null;
    }

    return (
        <Card className="mb-6 border-amber-500/50 dark:bg-amber-900/20">
            <CardHeader>
                <CardTitle className="flex items-center text-amber-600 dark:text-amber-400">
                    <AlertCircle className="mr-2 h-5 w-5" />
                    {t('earnings.pendingDeductionsTitle', 'Pending Deductions')}
                </CardTitle>
                <CardDescription>
                    {t('earnings.pendingDeductionsDesc', 'The following amounts will be deducted from your upcoming payouts to cover post-payout refunds.')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('earnings.deductionFor', 'Deduction For')}</TableHead>
                            <TableHead className="text-right">{t('common:amount', 'Amount')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {adjustments.map(adj => (
                            <TableRow key={adj._id}>
                                <TableCell>
                                    <div className="font-medium">{adj.originalPaymentInfo?.bookingInfo?.title || t('earnings.refundedSession', 'Refunded Session')}</div>
                                    <div className="text-sm text-muted-foreground">
                                        {t('earnings.originalSaleOn', 'Original sale on {{date}}', { date: format(new Date(adj.originalPaymentInfo?.createdAt || adj.createdAt), 'PP') })}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right font-medium text-destructive">
                                    {adj.amount.total.toFixed(2)} {adj.amount.currency}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
};

const TransactionDetail = ({ transaction }) => {
    const { t, i18n } = useTranslation(['coach_dashboard', 'common']);
    const { amount, calculated } = transaction;

    const adviceMutation = useMutation(getStatementDownload, {
        onSuccess: (result) => {
            const { data: blobData, filename } = result;
            if (!blobData) {
                toast.error(t('earnings.downloadFailedEmpty', 'Download failed: The server returned an empty file.'));
                return;
            }
            try {
                const blob = new Blob([blobData], { type: 'application/pdf' });
                if (blob.size === 0) {
                    toast.error(t('earnings.downloadFailedEmpty', 'Download failed: The server returned an empty file.'));
                    return;
                }
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                link.parentNode.removeChild(link);
                window.URL.revokeObjectURL(url);
                toast.success(t('earnings.downloadStarted', 'Your download has started.'));
            } catch (e) {
                toast.error(t('common:error_generic', 'An error occurred while preparing your download.'));
            }
        },
        onError: (error) => {
            toast.error(t('common:error_generic', 'An error occurred while preparing your download.'));
        },
    });

    const b2bDocMutation = useMutation(getB2bDocumentUrl, {
        onSuccess: (data) => {
            if (data.pdfUrl) {
                window.open(data.pdfUrl, '_blank');
            } else {
                toast.error(t('common:error_generic', 'An error occurred while preparing your download.'));
            }
        },
        onError: (error) => {
            toast.error(error.response?.data?.message || t('common:error_generic', 'An error occurred while preparing your download.'));
        }
    });

    const { gross, refundedAmount, platformFee, vatWithheld, processingFee, netEarning, finalPayout, totalDeductions, rates = {} } = calculated;
    
    const maxRefundable = gross - refundedAmount;
    const isRefundable = (transaction.status === 'completed' || transaction.status === 'succeeded') && maxRefundable > 0;

    const handleCopyId = () => {
        navigator.clipboard.writeText(transaction._id);
        toast.success(t('common:copiedToClipboard', 'Copied to clipboard'));
    };

    return (
        <div className="p-4 md:p-6 bg-muted/30 dark:bg-slate-900/50">
            <div className="grid gap-6 md:grid-cols-5 md:gap-8">
                <div className="md:col-span-3">
                    <h4 className="font-semibold mb-3 text-base">{t('earnings.breakdown', 'Financial Breakdown')}</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{t('earnings.grossSale', 'Gross Sale')}</span>
                            <span className="font-medium">{gross.toFixed(2)} {amount.currency}</span>
                        </div>
                        {refundedAmount > 0 && (
                            <div className="flex justify-between items-center text-destructive">
                                <span className="text-destructive/80">{t('earnings.refunded', 'Refunded')}</span>
                                <span className="font-medium">-{refundedAmount.toFixed(2)} {amount.currency}</span>
                            </div>
                        )}
                        <div className="border-t my-2 dark:border-slate-700/60"></div>

                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{t('earnings.deductions', 'Total Deductions')}</span>
                            <span className="text-muted-foreground">-{totalDeductions.toFixed(2)}</span>
                        </div>
                        <div className="pl-4 text-xs space-y-1">
                            <div className="flex justify-between items-center text-muted-foreground/80">
                                <span>
                                    {t('earnings.platformFee', 'Platform Fee')}
                                    {rates.platformFee > 0 && <span className="ml-1.5 text-xs text-muted-foreground/80">({rates.platformFee}%)</span>}
                                </span>
                                <span>-{platformFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-muted-foreground/80">
                                <span>
                                    {t('earnings.vatWithheld', 'VAT Withheld')}
                                    {rates.vatWithheld > 0 && <span className="ml-1.5 text-xs text-muted-foreground/80">({rates.vatWithheld}%)</span>}
                                </span>
                                <span>-{vatWithheld.toFixed(2)}</span>
                            </div>
                             {processingFee > 0 && (
                                <div className="flex justify-between items-center text-muted-foreground/80">
                                    <span>
                                        {t('earnings.paymentProcessingFee', 'Processing Fee')}
                                        {rates.processingFee > 0 && <span className="ml-1.5 text-xs text-muted-foreground/80">({rates.processingFee}%)</span>}
                                    </span>
                                    <span>-{processingFee.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                        <div className="border-t my-2 dark:border-slate-700/60"></div>
                        <div className="flex justify-between items-center font-medium">
                            <span className="">{t('earnings.netEarning', 'Net Earning')}</span>
                            <span className="">{netEarning.toFixed(2)}</span>
                        </div>
                         <div className="border-t-2 border-dashed my-3 dark:border-slate-600"></div>
                         <div className="flex justify-between items-center text-base">
                            <span className="font-semibold">{t('earnings.finalPayout', 'Final Payout')}</span>
                            <span className="font-semibold text-green-600 dark:text-green-500">{finalPayout.toFixed(2)} {amount.currency}</span>
                        </div>
                    </div>
                </div>
                <div className="md:col-span-2">
                    <h4 className="font-semibold mb-3 text-base">{t('earnings.actionsAndInfo', 'Actions & Info')}</h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                        <TooltipProvider>
                            {transaction.b2bDocument?.type === 'invoice' && <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={() => b2bDocMutation.mutate({ invoiceId: transaction.b2bDocument._id })} disabled={b2bDocMutation.isLoading}><FileSignature className="h-4 w-4 mr-2"/>{t('earnings.b2bInvoice', 'B2B Invoice')}</Button></TooltipTrigger><TooltipContent><p>{t('earnings.downloadB2BInvoice', 'Download B2B Invoice')}</p></TooltipContent></Tooltip>}
                            {transaction.b2bDocument?.type === 'credit_note' && <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={() => b2bDocMutation.mutate({ invoiceId: transaction.b2bDocument._id })} disabled={b2bDocMutation.isLoading}><FileMinus className="h-4 w-4 mr-2"/>{t('earnings.creditNote', 'Credit Note')}</Button></TooltipTrigger><TooltipContent><p>{t('earnings.downloadB2BCreditNote', 'Download B2B Credit Note')}</p></TooltipContent></Tooltip>}
                            <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={() => adviceMutation.mutate({ paymentId: transaction._id, language: i18n.language })} disabled={adviceMutation.isLoading}>{adviceMutation.isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <FileText className="h-4 w-4 mr-2" />}{t('earnings.statement', 'Statement')}</Button></TooltipTrigger><TooltipContent><p>{t('earnings.downloadStatement', 'Download Earning Statement')}</p></TooltipContent></Tooltip>
                            {isRefundable && <Tooltip><TooltipTrigger asChild><CoachRefundModal payment={transaction} maxRefundable={maxRefundable}><Button variant="outline" size="sm"><Undo2 className="h-4 w-4 mr-2" />{t('earnings.issueRefund', 'Refund')}</Button></CoachRefundModal></TooltipTrigger><TooltipContent><p>{t('earnings.issueRefund', 'Issue Refund')}</p></TooltipContent></Tooltip>}
                        </TooltipProvider>
                    </div>
                    <div className="space-y-2 text-sm border-t pt-4 dark:border-slate-700/60">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{t('common:status', 'Status')}</span>
                            <Badge variant={transaction.status === 'succeeded' || transaction.status === 'completed' ? 'success' : 'secondary'}>{t(`financials.statuses.${transaction.status}`, transaction.status)}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">{t('earnings.transactionId', 'Transaction ID')}</span>
                            <span onClick={handleCopyId} className="font-mono text-xs flex items-center gap-1 cursor-pointer hover:text-primary">{transaction._id} <Copy className="h-3 w-3" /></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TransactionRow = ({ transaction, isExpanded, onToggle }) => {
    const { t, i18n } = useTranslation(['coach_dashboard', 'common']);
    const { amount, calculated } = transaction;
    const locale = localeMap[i18n.language] || enUS;
    
    if (!calculated) return null;
    const { gross, finalPayout } = calculated;

    return (
        <React.Fragment>
            <TableRow
                onClick={onToggle}
                className="cursor-pointer hover:bg-muted/50 data-[state=open]:bg-muted"
                data-state={isExpanded ? 'open' : 'closed'}
            >
                {/* Mobile View Cell */}
                <TableCell colSpan={5} className="p-4 md:hidden">
                    <div className="flex justify-between items-center gap-3">
                        <div className="flex-1 overflow-hidden">
                            <p className="font-medium truncate">{transaction.booking?.title || transaction.program?.title || 'Coaching Service'}</p>
                            <p className="text-sm text-muted-foreground">{format(new Date(transaction.createdAt), 'PP', { locale })}</p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="font-semibold text-green-600 dark:text-green-500">{finalPayout.toFixed(2)} {amount.currency}</p>
                            <Badge variant="outline" className="mt-1 font-normal">{t(`financials.statuses.${transaction.status}`, transaction.status)}</Badge>
                        </div>
                        <ChevronDown className={`ml-1 h-5 w-5 shrink-0 transition-transform duration-200 text-muted-foreground ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                </TableCell>
                
                {/* Desktop View Cells */}
                <TableCell className="hidden md:table-cell">
                    <div className="font-medium">{transaction.booking?.title || transaction.program?.title || 'Coaching Service'}</div>
                    <div className="text-sm text-muted-foreground">{format(new Date(transaction.createdAt), 'P', { locale })}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{transaction.payer?.firstName || 'N/A'} {transaction.payer?.lastName || ''}</TableCell>
                <TableCell className="hidden md:table-cell text-right">{gross.toFixed(2)}</TableCell>
                <TableCell className="hidden md:table-cell text-right font-semibold text-base text-green-600 dark:text-green-500">{finalPayout.toFixed(2)}</TableCell>
                <TableCell className="hidden md:table-cell text-right pr-4">
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </TableCell>
            </TableRow>
            {isExpanded && (
                <TableRow className="border-b-0 bg-muted/20 dark:bg-black/20" data-state={isExpanded ? 'open' : 'closed'}>
                    <TableCell colSpan={5} className="p-0">
                        <TransactionDetail transaction={transaction} />
                    </TableCell>
                </TableRow>
            )}
        </React.Fragment>
    );
};


export const TransactionHistory = () => {
    const { t } = useTranslation('coach_dashboard');
    const [page, setPage] = React.useState(1);
    const [expandedRowId, setExpandedRowId] = React.useState(null);
    
    const { data, isLoading, isError } = useQuery(
        ['coachTransactions', { page, limit: 10 }], 
        fetchTransactions,
        { keepPreviousData: true }
    );

    const { docs: transactions = [], totalPages = 1 } = data || {};

    const toggleRow = (id) => {
        setExpandedRowId(prevId => (prevId === id ? null : id));
    };
    
    return (
        <>
            <PendingDeductions />
            <Card className="dark:bg-slate-900/50">
                <CardHeader>
                    <CardTitle>{t('earnings.transactionHistory', 'Transaction History')}</CardTitle>
                    <CardDescription>{t('earnings.transactionHistoryDesc', 'A detailed list of all your completed sales.')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="w-full overflow-x-auto border rounded-lg">
                        <Table>
                            <TableHeader className="hidden md:table-header-group bg-muted/50">
                                <TableRow>
                                    <TableHead className="w-[35%]">{t('earnings.description', 'Description')}</TableHead>
                                    <TableHead className="w-[25%]">{t('earnings.client', 'Client')}</TableHead>
                                    <TableHead className="w-[15%] text-right">{t('earnings.grossSale', 'Gross Sale')}</TableHead>
                                    <TableHead className="w-[15%] text-right font-semibold">{t('earnings.payout', 'Payout')}</TableHead>
                                    <TableHead className="w-[10%] text-right pr-4"><span className="sr-only">Expand</span></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-16 w-full rounded-md" /></TableCell></TableRow>
                                    ))
                                ) : isError ? (
                                    <TableRow><TableCell colSpan={5} className="text-center h-24 text-destructive"><AlertCircle className="inline-block mr-2 h-5 w-5"/> {t('common:error_generic', 'An error occurred.')}</TableCell></TableRow>
                                ) : transactions.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">{t('earnings.noTransactions', 'No transactions found.')}</TableCell></TableRow>
                                ) : (
                                    transactions.map(transaction => (
                                        <TransactionRow 
                                            key={transaction._id} 
                                            transaction={transaction}
                                            isExpanded={expandedRowId === transaction._id}
                                            onToggle={() => toggleRow(transaction._id)}
                                        />
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
                {totalPages > 1 && (
                    <CardFooter className="flex justify-center">
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => { e.preventDefault(); setPage(prev => Math.max(1, prev - 1)); }}
                                        aria-disabled={page <= 1}
                                        className={cn(page <= 1 && 'pointer-events-none opacity-50')}
                                    />
                                </PaginationItem>
                                <PaginationItem>
                                    <span className="p-2 text-sm font-medium">Page {page} of {totalPages}</span>
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => { e.preventDefault(); setPage(prev => Math.min(totalPages, prev + 1)); }}
                                        aria-disabled={page >= totalPages}
                                        className={cn(page >= totalPages && 'pointer-events-none opacity-50')}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </CardFooter>
                )}
            </Card>
        </>
    );
};